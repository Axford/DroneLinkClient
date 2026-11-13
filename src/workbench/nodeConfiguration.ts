export interface ConfigurationDiagnostic {
    line: number;
    severity: 'error' | 'warning';
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
    const report = (line: number, severity: ConfigurationDiagnostic['severity'], message: string) =>
        diagnostics.push({ line, severity, message });
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
            report(line, 'warning', 'The firmware reads the node address before the first module.');
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
                    'More than one declaration matches this local source.' : 'The source module is not declared in this configuration.');
            } else {
                subscription.resolution = 'Remote source — unverified';
                report(subscription.line, 'warning', !/^\d+$/.test(channel) || !/^\d+$/.test(parameter) ?
                    'Use numeric channel and parameter IDs for a remote subscription.' :
                    'This remote source cannot be verified from the node’s file.');
            }
        }
    }
    return { diagnostics: diagnostics.sort((a, b) => a.line - b.line), modules: declarations };
}

export type ConfigurationOverview = ReturnType<typeof inspectNodeConfiguration>;

export function updateSubscriptionSource(text: string, subscription: DraftSubscription, input: string) {
    const source = input.trim();
    if (!/^[^\s;"[\]=>.]+>[^\s;"[\]=>.]+\.[^\s;"[\]=>.]+$/u.test(source) ||
        source === subscription.source) return;
    const address = parseSource(source);
    // The firmware uses atoi and treats a leading @ as local. Do not
    // introduce signed numbers that can wrap or ambiguous @ aliases.
    if (!address || [address.node, address.channel, address.parameter].some(part => /^[+-]\d/.test(part)) ||
        (address.node.startsWith('@') && address.node !== '@')) return;
    const lines = text.split('\n');
    const index = subscription.line - 1;
    const raw = lines[index];
    const { valueStart, valueEnd } = subscription;
    const original = raw.slice(valueStart, valueEnd);
    const replacement = original.startsWith('"') && original.endsWith('"') ? `"${source}"` : source;
    lines[index] = raw.slice(0, valueStart) + replacement + raw.slice(valueEnd);
    return lines.join('\n');
}
