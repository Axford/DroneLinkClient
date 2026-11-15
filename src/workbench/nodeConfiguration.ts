import type { GlobalState } from '../dronelink/DroneLinkState';
import type { ConfigurationParameter, ModuleSetting } from './moduleSettings';
import { probeModes } from '../components/probeResults';

export interface ConfigurationDiagnostic {
    line: number;
    severity: 'error' | 'warning';
    moduleChannel?: number;
    message: string;
}

interface DraftSubscription {
    line: number;
    input: string;
    source: string;
    valueStart: number;
    valueEnd: number;
    resolution: string;
    sourceChannel?: number;
    remote?: boolean;
    address: SubscriptionAddress;
}

interface DraftModule {
    line: number;
    channel: number;
    type: string;
    name?: string;
    subscriptions: DraftSubscription[];
}

const cloudStrings = new Set(['endpoint', 'domain', 'apiKey', 'subscriptions', 'relayPeers']);
const bytes = (text: string) => new Blob([text]).size;
// Firmware's generic CHAR parser removes spaces/tabs and accepts a single
// name of at most 16 bytes. Keep the original name for display.
const moduleLookupName = (name?: string) => {
    const value = name?.replace(/[ \t]/g, '');
    return value && !value.includes(',') && bytes(value) <= 16 ? value : undefined;
};
const decimal = (text: string, max: number) => /^\d+$/.test(text) && Number(text) > 0 && Number(text) <= max;

// Project the firmware's line syntax for diagnostics. The editor always uploads
// the draft, never this projection.
function splitLine(raw: string, escapes: boolean) {
    let valueStart = -1, valueEnd = -1;
    let name = '', value = '';
    let assignment = false, quoted = false, sawQuote = false, opened = false, closed = false, invalid = false;
    for (let i = 0; i < raw.length; i++) {
        const char = raw[i];
        if (quoted && escapes && char === '\\') {
            const next = raw[++i];
            if (next !== '"' && next !== '\\') { invalid = true; break; }
            if (assignment) value += next; else name += next;
            continue;
        }
        if (!quoted && (char === ';' || /^[ \t\r]$/.test(char))) {
            if (char === ';') break;
            continue;
        }
        if (closed) { invalid = true; break; }
        if (assignment && !opened) {
            if (valueStart === -1) valueStart = i;
            valueEnd = i + 1;
        }
        if (char === '"') { sawQuote = true; quoted = !quoted; continue; }
        if (!quoted && char === '[' && !name && !assignment && !opened) { opened = true; continue; }
        if (!quoted && char === ']' && opened) { closed = true; continue; }
        if (!quoted && char === '=' && !assignment) { assignment = true; continue; }
        if (assignment) value += char; else name += char;
    }
    const empty = !name && !value && !opened && !assignment && !sawQuote;
    return { name, value, valueStart, valueEnd, section: opened, empty, valid: !invalid && !quoted &&
        (empty || (!!name && !!value && assignment && opened === closed)) };
}

interface SubscriptionAddress { node: string; channel: string; parameter: string }

function parseSource(source: string): SubscriptionAddress | undefined {
    const address = /^([^>.]+)>([^>.]+)\.([^>.]+)$/.exec(source);
    const bounds = [254, 254, 63];
    if (!address || address.slice(1).some((part, i) =>
        bytes(part) > 19 || (/^\d/.test(part) && !decimal(part, bounds[i])))) return;
    return { node: address[1], channel: address[2], parameter: address[3] };
}

export function inspectNodeConfiguration(text: string, selectedNode: number) {
    const diagnostics: ConfigurationDiagnostic[] = [];
    const report = (line: number, severity: ConfigurationDiagnostic['severity'], message: string, moduleChannel?: number) =>
        diagnostics.push({ line, severity, message, ...(moduleChannel === undefined ? {} : { moduleChannel }) });
    const modules = new Map<number, DraftModule>();
    const duplicateChannels = new Set<number>();
    let module: DraftModule | undefined;
    let inSections = false;
    let nodeId: number | undefined;
    text.split('\n').forEach((raw, index) => {
        const line = index + 1;
        let parsed = splitLine(raw, false);
        const longString = !parsed.section && module?.type === 'CloudTelemetry' && cloudStrings.has(parsed.name);
        if (longString) parsed = splitLine(raw, true);
        if (parsed.section) { inSections = true; module = undefined; }
        if (raw.includes('\0') || bytes(raw) > 2048) {
            report(line, 'error', 'Line contains a NUL or exceeds the firmware’s 2048-byte line limit.');
            return;
        }
        if (!parsed.valid) {
            report(line, 'error', parsed.section ? 'Use a complete module header: [Type = channel].' :
                'Use name = value with balanced quotes, or start a comment with a semicolon.');
            return;
        }
        if (parsed.empty) return;
        const { name, value, section } = parsed;
        if (bytes(name) > 19 || bytes(value) > 768 || (inSections && !section && !longString && bytes(value) >= 200)) {
            report(line, 'error', 'Setting name or value exceeds the firmware’s limit for this line.');
            return;
        }
        if (section) {
            if (!decimal(value, 254)) {
                report(line, 'error', 'Module channel must be a decimal address from 1 to 254.');
            } else if (modules.has(Number(value))) {
                duplicateChannels.add(Number(value));
                report(line, 'error', 'Another module already uses this channel.');
            } else {
                module = { line, channel: Number(value), type: name, subscriptions: [] };
                modules.set(Number(value), module);
            }
            return;
        }
        if (!inSections && name === 'node') {
            if (nodeId !== undefined) report(line, 'error', 'Declare the node address only once.');
            if (!decimal(value, 254)) report(line, 'error', 'Node address must be a decimal number from 1 to 254.');
            else {
                nodeId = Number(value);
                if (nodeId !== selectedNode) report(line, 'warning',
                    'This address differs from the selected node. Restart may make the node appear under another address.');
            }
        } else if (inSections && name === 'node') {
            report(line, 'warning', 'The firmware reads the node address before the first module.', module?.channel);
        } else if (module && name === 'interval' && (!/^\+?\d+$/.test(value) || Number(value) > 2147483647)) {
            report(line, 'error', 'Module interval must be a whole number of milliseconds from 0 to 2147483647.');
        } else if (module && name === 'name') {
            module.name = value;
        } else if (module && name.startsWith('$')) {
            const source = value.replace(/[ \t]/g, '');
            const address = parseSource(source);
            if (name === '$' || !address) {
                report(line, 'error', 'Use $input = node>channel.parameter with valid address parts.');
            } else {
                module.subscriptions.push({
                    line, input: name, source, address, valueStart: parsed.valueStart, valueEnd: parsed.valueEnd, resolution: '',
                });
            }
        }
    });
    if (nodeId === undefined) report(1, 'error', 'Declare a valid node address before the first module.');
    const declarations = Array.from(modules.values());
    for (const module of declarations) {
        for (const subscription of module.subscriptions) {
            const { node, channel, parameter } = subscription.address;
            if (node.startsWith('@') || (/^\d+$/.test(node) && Number(node) === nodeId)) {
                const numeric = /^\d+$/.test(channel);
                const named = numeric ? [] : declarations.filter(item => moduleLookupName(item.name) === channel);
                const ambiguous = numeric ? duplicateChannels.has(Number(channel)) :
                    named.length > 1 || named.some(item => duplicateChannels.has(item.channel));
                const source = ambiguous ? undefined : numeric ? modules.get(Number(channel)) : named[0];
                subscription.sourceChannel = source?.channel;
                subscription.resolution = source ? `Local: ${source.name || source.type} (channel ${source.channel})` :
                    ambiguous ? (numeric ? 'Local source channel is ambiguous' : 'Local source module name is ambiguous') : 'Local source module missing';
                if (!source) report(subscription.line, 'warning', ambiguous ?
                    'More than one declaration matches this local source.' : 'The source module is not declared in this configuration.', module.channel);
            } else {
                subscription.remote = true;
                subscription.resolution = 'Remote source — unverified';
                report(subscription.line, 'warning', !/^\d+$/.test(channel) || !/^\d+$/.test(parameter) ?
                    'Use numeric channel and parameter IDs for a remote subscription.' :
                    'This remote source cannot be verified from the node’s file.', module.channel);
            }
        }
    }
    return { diagnostics: diagnostics.sort((a, b) => a.line - b.line), modules: declarations };
}

export type ConfigurationOverview = ReturnType<typeof inspectNodeConfiguration>;

export function resolveRemoteConfigurationSources(overview: ConfigurationOverview, snapshot?: GlobalState): ConfigurationOverview {
    if (!snapshot) return overview;
    const resolvedLines = new Set<number>();
    const modules = overview.modules.map(module => {
        const subscriptions = module.subscriptions.map(input => {
            if (!input.remote) return input;
            const { node, channel, parameter } = input.address;
            if (!decimal(node, 254) || !decimal(channel, 254) || !decimal(parameter, 63)) return input;
            const observedNode = snapshot[Number(node)];
            const observedChannel = observedNode?.channels[Number(channel)];
            const observedParameter = observedChannel?.params[Number(parameter)];
            if (!observedNode?.name?.trim() || !observedChannel?.name?.trim() ||
                !observedParameter?.name?.trim() || observedParameter.unavailable?.name) return input;
            resolvedLines.add(input.line);
            return { ...input, resolution: `${observedNode.name} > ${observedChannel.name}.${observedParameter.name}` };
        });
        return subscriptions.some((input, index) => input !== module.subscriptions[index]) ? { ...module, subscriptions } : module;
    });
    return resolvedLines.size ? { modules, diagnostics: overview.diagnostics.filter(item => !resolvedLines.has(item.line)) } : overview;
}


function safeSubscriptionSource(source: string) {
    if (!/^[^\s;"[\]=>.]+>[^\s;"[\]=>.]+\.[^\s;"[\]=>.]+$/u.test(source)) return false;
    const address = parseSource(source);
    // The firmware uses atoi and treats a leading @ as local. Do not
    // introduce signed numbers that can wrap or ambiguous @ aliases.
    if (!address || [address.node, address.channel, address.parameter].some(part => /^[+-]\d/.test(part)) ||
        (address.node.startsWith('@') && address.node !== '@')) return false;
    return true;
}

export function updateSubscriptionSource(text: string, subscription: DraftSubscription, input: string) {
    const source = input.trim();
    if (!safeSubscriptionSource(source) || source === subscription.source) return;
    const lines = text.split('\n');
    const index = subscription.line - 1;
    const raw = lines[index];
    const { valueStart, valueEnd } = subscription;
    const original = raw.slice(valueStart, valueEnd);
    const replacement = original.startsWith('"') && original.endsWith('"') ? `"${source}"` : source;
    lines[index] = raw.slice(0, valueStart) + replacement + raw.slice(valueEnd);
    return lines.join('\n');
}

type ModuleEdit = { text: string; changes: { before?: string; after: string }[] };
const maxNodeFileBytes = 8192;
const ending = (text: string) => text.includes('\r\n') ? '\r\n' : '\n';
const indentation = (raw: string) => /^[ \t]*/.exec(raw)![0];

function patchModuleLine(text: string, module: DraftModule, key: string, value: string,
    transform?: (original: string, parsed: string) => string | undefined): ModuleEdit | undefined {
    const newline = ending(text);
    const lines = text.split(newline);
    const matches: number[] = [];
    const first = module.line;
    let insertAt = first;
    for (let index = first; index < lines.length; index++) {
        const line = splitLine(lines[index], false);
        if (line.section) break;
        if (line.empty || !line.valid) continue;
        if (line.name === key) matches.push(index);
        insertAt = index + 1;
    }
    if (matches.length > 1) return;
    if (matches.length === 1) {
        const index = matches[0], before = lines[index], { valueStart, valueEnd, value: parsed } = splitLine(before, false);
        const original = before.slice(valueStart, valueEnd);
        const wrapped = original.startsWith('"') && original.endsWith('"');
        const replacement = transform ? transform(original, parsed) : wrapped ? `"${value}"` : value;
        if (replacement === undefined) return;
        const after = before.slice(0, valueStart) + replacement + before.slice(valueEnd);
        if (after === before) return { text, changes: [] };
        lines[index] = after;
        return { text: lines.join(newline), changes: [{ before, after }] };
    }
    const indent = insertAt > first ? indentation(lines[insertAt - 1]) : '  ';
    const after = `${indent}${key} = ${value}`;
    lines.splice(insertAt, 0, after);
    if (insertAt === lines.length - 1) lines.push('');
    return { text: lines.join(newline), changes: [{ after }] };
}

export function appendStarter(text: string, node: number, type: string, gpsConnector?: 1 | 2,
    i2c?: { channel: number; address: number }, settings: ModuleSetting[] = []) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,18}$/.test(type)) return;
    if (i2c && (!Number.isInteger(i2c.channel) || i2c.channel < 0 || i2c.channel > 7 ||
            !Number.isInteger(i2c.address) || i2c.address < 8 || i2c.address > 119)) return;
    const overview = inspectNodeConfiguration(text, node);
    if (overview.diagnostics.some(item => item.severity === 'error')) return;
    const occupied = new Set(overview.modules.map(module => module.channel));
    const channel = Array.from({ length: 253 }, (_, index) => index + 2).find(value => !occupied.has(value));
    if (channel === undefined) return;
    const newline = ending(text);
    const prefix = text + (text.endsWith(newline) ? newline : newline + newline);
    const base = (type === 'NMEA' ? 'GPS' : type === 'Nav' ? 'Pilot' : type).slice(0, 13);
    const names = new Set(overview.modules.map(module => moduleLookupName(module.name)));
    let name = base;
    for (let index = 2; names.has(name); index++) name = `${base}${index}`;
    const lines = [`[${type} = ${channel}]`, `  name = ${name}`];
    if (type === 'NMEA' && gpsConnector !== undefined) lines.push(`  port = ${gpsConnector}`);
    if (i2c) lines.push(`  bus = ${i2c.channel}`, `  addr = ${i2c.address}`);
    const active = new Set(['name', ...(i2c ? ['bus', 'addr'] : []), ...(type === 'NMEA' && gpsConnector !== undefined ? ['port'] : [])]);
    for (const { name, value } of settings) {
        if (!active.has(name)) lines.push(`  ; ${name} = ${value}`);
    }
    const draft = prefix + [...lines, ''].join(newline);
    if (bytes(draft) <= maxNodeFileBytes) return { text: draft, line: prefix.split(newline).length, channel };
}

export function moduleSettings(text: string, module: DraftModule) {
    const settings = new Map<string, string[]>();
    for (const raw of text.split('\n').slice(module.line)) {
        const line = splitLine(raw, false);
        if (line.section) break;
        if (!line.valid || line.empty) continue;
        const values = settings.get(line.name) ?? [];
        values.push(line.value);
        settings.set(line.name, values);
    }
    return settings;
}

function draftModuleEdit(text: string, node: number, channel: number, edit: (module: DraftModule) => string | undefined) {
    const overview = inspectNodeConfiguration(text, node);
    if (overview.diagnostics.some(item => item.severity === 'error')) return;
    const module = overview.modules.find(item => item.channel === channel);
    if (!module) return;
    const result = edit(module);
    if (result !== undefined && bytes(result) <= maxNodeFileBytes &&
        !inspectNodeConfiguration(result, node).diagnostics.some(item => item.severity === 'error')) return result;
}

function removeModuleAssignments(text: string, module: DraftModule, key: string) {
    const newline = ending(text);
    const lines = text.split(newline);
    const matches = [];
    for (let index = module.line; index < lines.length; index++) {
        const line = splitLine(lines[index], false);
        if (line.section) break;
        if (line.valid && line.name === key) matches.push(index);
    }
    if (matches.length > 1) return;
    for (const index of matches) {
        const raw = lines[index];
        const comment = raw.slice(splitLine(raw, false).valueEnd).match(/;.*$/)?.[0];
        lines.splice(index, 1, ...(comment ? [indentation(raw) + comment] : []));
    }
    return lines.join(newline);
}

function validParameterValue(parameter: ConfigurationParameter, value: string) {
    if (parameter.type === 'c') {
        const literal = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
        if (!literal || bytes(literal.replace(/[ \t]/g, '')) > parameter.count || /[",\r\n\0]/.test(literal)) return;
        return `"${literal}"`;
    }
    if (parameter.type === 'addr') return safeSubscriptionSource(value) ? value : undefined;
    const parts = value.split(',').map(part => part.trim());
    if (parts.length > Math.min(parameter.count, parameter.type === 'u8' ? 16 : 4)) return;
    const valid = parts.every(part => {
        if (part.length > 19) return false;
        if (parameter.type === 'f') return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+]?\d+)?$/.test(part) &&
            Number.isFinite(Math.fround(Number(part)));
        return /^\d+$/.test(part) && Number(part) <= (parameter.type === 'u8' ? 255 : 2147483647);
    });
    return valid ? parts.join(', ') : undefined;
}

export function editDraftParameter(text: string, node: number, channel: number, parameter: ConfigurationParameter, input: string) {
    if (!parameter.configurable || parameter.runtimeOnly || !/^[A-Za-z][A-Za-z0-9_]{0,18}$/.test(parameter.name)) return;
    return draftModuleEdit(text, node, channel, module => {
        const value = input.trim();
        if (!value) return removeModuleAssignments(text, module, parameter.name);
        const configured = validParameterValue(parameter, value);
        if (configured !== undefined) return patchModuleLine(text, module, parameter.name, configured, () => configured)?.text;
    });
}

export function editDraftSource(text: string, node: number, channel: number, key: string, input: string) {
    if (!/^\$[A-Za-z][A-Za-z0-9_]{0,17}$/.test(key)) return;
    return draftModuleEdit(text, node, channel, module => {
        const source = input.trim();
        if (!source) return removeModuleAssignments(text, module, key);
        if (!safeSubscriptionSource(source)) return;
        return patchModuleLine(text, module, key, source)?.text;
    });
}

export function draftPublications(settings: Map<string, string[]>) {
    return new Set((settings.get('publish') ?? []).flatMap(value => value.split(',').map(name => name.trim()).filter(Boolean)));
}

export function toggleDraftPublication(text: string, node: number, channel: number, parameter: ConfigurationParameter, enabled: boolean) {
    const { name } = parameter;
    if (parameter.alwaysPublished || parameter.runtimeOnly || !/^[A-Za-z][A-Za-z0-9_]{0,18}$/.test(name)) return;
    return draftModuleEdit(text, node, channel, module => {
        const newline = ending(text);
        const lines = text.split(newline);
        const matches = [];
        for (let index = module.line; index < lines.length; index++) {
            const line = splitLine(lines[index], false);
            if (line.section) break;
            if (line.valid && line.name === 'publish') matches.push({ index, ...line });
        }
        const names = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
        if (enabled) {
            if (matches.some(line => names(line.value).includes(name))) return text;
            // A separate declaration keeps the firmware's per-line length bounded and preserves existing lists.
            const last = matches.at(-1);
            if (!last) return patchModuleLine(text, module, 'publish', name)?.text;
            lines.splice(last.index + 1, 0, `${indentation(lines[last.index])}publish = ${name}`);
        } else {
            for (const line of matches.reverse()) {
                if (!names(line.value).includes(name)) continue;
                const raw = lines[line.index];
                const list = raw.slice(line.valueStart, line.valueEnd);
                const quoted = list.startsWith('"') && list.endsWith('"');
                const tokens = (quoted ? list.slice(1, -1) : list).split(',');
                const kept = tokens.filter(token => token.trim() !== name);
                if (kept.some(token => token.trim())) {
                    const next = kept.join(',').trim();
                    lines[line.index] = raw.slice(0, line.valueStart) + (quoted ? `"${next}"` : next) + raw.slice(line.valueEnd);
                } else {
                    const comment = raw.slice(line.valueEnd).match(/;.*$/)?.[0];
                    lines.splice(line.index, 1, ...(comment ? [indentation(raw) + comment] : []));
                }
            }
        }
        return lines.join(newline);
    });
}

export function canWireDraftOutput(input: ConfigurationParameter, output: ConfigurationParameter) {
    return input.sourceAddress !== undefined && !input.runtimeOnly && !output.runtimeOnly && output.type !== 'addr' &&
        output.type === input.type && output.count === input.count &&
        Number.isInteger(output.address) && output.address > 0 && output.address <= 63 &&
        /^[A-Za-z][A-Za-z0-9_]{0,18}$/.test(output.name);
}

export function wireDraftSubscription(text: string, node: number,
    target: { channel: number; parameter: ConfigurationParameter },
    source: { channel: number; parameter: ConfigurationParameter }) {
    if (!canWireDraftOutput(target.parameter, source.parameter) ||
        (source.channel === target.channel && source.parameter.address === target.parameter.address)) return;
    const connected = editDraftSource(text, node, target.channel, '$' + target.parameter.name,
        `@>${source.channel}.${source.parameter.address}`);
    if (connected === undefined || source.parameter.alwaysPublished) return connected;
    return toggleDraftPublication(connected, node, source.channel, source.parameter, true);
}

export function gpsPort(text: string, module: DraftModule) {
    const values = moduleSettings(text, module).get('port')?.map(value => value.replace(/[ \t]/g, '')) ?? [];
    if (!values.length) return 'default';
    if (values.length !== 1 || !/^[12](?:,(?:[12]|255))?$/.test(values[0])) return undefined;
    return values[0][0];
}

export function setGpsPort(text: string, node: number, channel: number, port: string) {
    if (!/^[12]$/.test(port)) return;
    const overview = inspectNodeConfiguration(text, node);
    if (overview.diagnostics.some(item => item.severity === 'error')) return;
    const module = overview.modules.find(item => item.channel === channel && item.type === 'NMEA');
    if (!module || gpsPort(text, module) === undefined) return;
    const edit = patchModuleLine(text, module, 'port', port, (original, parsed) => {
        if (parsed.replace(/[ \t]/g, '').split(',')[1] === port) return;
        return original.replace(/[12]/, port);
    });
    if (edit && bytes(edit.text) <= maxNodeFileBytes && !inspectNodeConfiguration(edit.text, node).diagnostics.some(item => item.severity === 'error')) return edit;
}

export function connectGpsLocation(text: string, node: number, gps: number, pilot: number, output: number): ModuleEdit | undefined {
    if (!Number.isInteger(output) || output < 1 || output > 63) return;
    const overview = inspectNodeConfiguration(text, node);
    if (overview.diagnostics.some(item => item.severity === 'error')) return;
    const source = overview.modules.find(item => item.channel === gps && item.type === 'NMEA');
    const target = overview.modules.find(item => item.channel === pilot && item.type === 'Nav');
    if (!source || !target) return;
    const publication = patchModuleLine(text, source, 'publish', 'location', (original, parsed) => {
        if (parsed.replace(/[ \t]/g, '').split(',').includes('location')) return original;
        if (parsed.endsWith(',')) return;
        return original.endsWith('"') ? original.slice(0, -1) + ', location"' : original + ', location';
    });
    if (!publication) return;
    const updatedTarget = inspectNodeConfiguration(publication.text, node).modules.find(item => item.channel === pilot)!;
    const subscription = patchModuleLine(publication.text, updatedTarget, '$location', `@>${gps}.${output}`);
    if (!subscription || bytes(subscription.text) > maxNodeFileBytes || inspectNodeConfiguration(subscription.text, node).diagnostics.some(item => item.severity === 'error')) return;
    return { text: subscription.text, changes: [...publication.changes, ...subscription.changes] };
}

export function probePinSettings(text: string, module: DraftModule) {
    const pins = new Map<number, { key: string; values: string[] }>();
    for (const [key, values] of Array.from(moduleSettings(text, module))) {
        const match = /^pin(\d+)$/.exec(key);
        if (!match) continue;
        const gpio = Number(match[1]);
        if (!Number.isInteger(gpio) || gpio > 99) continue;
        const existing = pins.get(gpio);
        if (existing) existing.values.push(...values);
        else pins.set(gpio, { key, values: [...values] });
    }
    return pins;
}

export function setPhysicalSetting(text: string, node: number, channel: number, setting: { bus: number } | { gpio: number; mode: string }) {
    const overview = inspectNodeConfiguration(text, node);
    if (overview.diagnostics.some(item => item.severity === 'error')) return;
    const module = overview.modules.find(item => item.channel === channel);
    if (!module) return;
    let edit: ModuleEdit | undefined;
    if ('bus' in setting) {
        if (!Number.isInteger(setting.bus) || setting.bus < 0 || setting.bus > 7) return;
        edit = patchModuleLine(text, module, 'bus', String(setting.bus));
    } else {
        if (module.type !== 'Probe' || !probeModes(setting.gpio).includes(setting.mode)) return;
        const existing = probePinSettings(text, module).get(setting.gpio);
        if (existing && existing.values.length !== 1) return;
        edit = patchModuleLine(text, module, existing?.key ?? `pin${setting.gpio}`, setting.mode);
    }
    if (edit && bytes(edit.text) <= maxNodeFileBytes && !inspectNodeConfiguration(edit.text, node).diagnostics.some(item => item.severity === 'error')) return edit;
}
