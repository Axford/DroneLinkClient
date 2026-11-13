export interface ConfigurationDiagnostic {
    line: number;
    severity: 'error' | 'warning';
    message: string;
}

const cloudStrings = new Set(['endpoint', 'domain', 'apiKey', 'subscriptions', 'relayPeers']);
const bytes = (text: string) => new Blob([text]).size;
const decimal = (text: string, max: number) => /^\d+$/.test(text) && Number(text) > 0 && Number(text) <= max;

// Project the firmware's line syntax for diagnostics. The editor always uploads
// the draft, never this projection.
function splitLine(raw: string, escapes: boolean) {
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
        if (char === '"') { sawQuote = true; quoted = !quoted; continue; }
        if (!quoted && char === '[' && !name && !assignment && !opened) { opened = true; continue; }
        if (!quoted && char === ']' && opened) { closed = true; continue; }
        if (!quoted && char === '=' && !assignment) { assignment = true; continue; }
        if (assignment) value += char; else name += char;
    }
    const empty = !name && !value && !opened && !assignment && !sawQuote;
    return { name, value, section: opened, empty, valid: !invalid && !quoted &&
        (empty || (!!name && !!value && assignment && opened === closed)) };
}

export function inspectNodeConfiguration(text: string, selectedNode: number): ConfigurationDiagnostic[] {
    const diagnostics: ConfigurationDiagnostic[] = [];
    const report = (line: number, severity: ConfigurationDiagnostic['severity'], message: string) =>
        diagnostics.push({ line, severity, message });
    const modules = new Map<number, { type: string; name?: string }>();
    const subscriptions: { line: number; node: string; channel: string; parameter: string }[] = [];
    let module: { type: string; name?: string } | undefined;
    let inSections = false;
    let nodeId: number | undefined;
    text.split('\n').forEach((raw, index) => {
        const line = index + 1;
        let parsed = splitLine(raw, false);
        const longString = !parsed.section && module?.type === 'CloudTelemetry' && cloudStrings.has(parsed.name);
        if (longString) parsed = splitLine(raw, true);
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
            inSections = true;
            module = undefined;
            if (!decimal(value, 254)) {
                report(line, 'error', 'Module channel must be a decimal address from 1 to 254.');
            } else if (modules.has(Number(value))) {
                report(line, 'error', 'Another module already uses this channel.');
            } else {
                module = { type: name };
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
            const address = /^([^>.]+)>([^>.]+)\.([^>.]+)$/.exec(value.replace(/[ \t]/g, ''));
            const bounds = [254, 254, 63];
            if (name === '$' || !address || address.slice(1).some((part, i) =>
                bytes(part) > 19 || (/^\d/.test(part) && !decimal(part, bounds[i])))) {
                report(line, 'error', 'Use $input = node>channel.parameter with valid address parts.');
            } else {
                subscriptions.push({ line, node: address[1], channel: address[2], parameter: address[3] });
            }
        }
    });
    if (nodeId === undefined) report(1, 'error', 'Declare a valid node address before the first module.');
    for (const { line, node, channel, parameter } of subscriptions) {
        if (node === '@' || (/^\d+$/.test(node) && Number(node) === nodeId)) {
            const matches = /^\d+$/.test(channel) ? Number(modules.has(Number(channel))) :
                Array.from(modules.values()).filter(item => item.name === channel).length;
            if (matches !== 1) report(line, 'warning', matches ?
                'More than one local module has this name.' : 'The source module is not declared in this configuration.');
        } else if (!/^\d+$/.test(channel) || !/^\d+$/.test(parameter)) {
            report(line, 'warning', 'Use numeric channel and parameter IDs for a remote subscription.');
        } else {
            report(line, 'warning', 'This remote source cannot be verified from the node’s file.');
        }
    }
    return diagnostics.sort((a, b) => a.line - b.line);
}
