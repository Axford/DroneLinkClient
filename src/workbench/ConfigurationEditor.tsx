import { useEffect, useRef } from 'react';
import * as ace from 'ace-builds';
import 'ace-builds/src-noconflict/mode-json';
import 'ace-builds/src-noconflict/ext-language_tools';
import type { Catalogue } from './ModuleCatalogue';
import { moduleSettingsExamples } from './moduleSettings';
import { i2cDefaults } from './i2cDiscovery';
import 'ace-builds/src-noconflict/theme-dracula';
import type { ConfigurationDiagnostic } from './nodeConfiguration';

// Token rules and Dracula palette match the legacy Configuration editor.
const TextMode: new () => Exclude<Parameters<ace.Ace.EditSession['setMode']>[0], string> = ace.require('ace/mode/text').Mode;
const TextHighlightRules: InstanceType<typeof TextMode>['HighlightRules'] = ace.require('ace/mode/text_highlight_rules').TextHighlightRules;
const CstyleBehaviour = ace.require('ace/mode/behaviour/cstyle').CstyleBehaviour;
const FoldMode = ace.require('ace/mode/folding/cstyle').FoldMode;

class ConfigurationHighlightRules extends TextHighlightRules {
    constructor() {
        super();
        const keywords = this.createKeywordMapper({
            keyword: 'do until node',
            'constant.language': 'true false',
            'constant.other': 'OUT0_0 OUT0_1 OUT1_0 OUT1_1 OUT2_0 OUT2_1 DAC0_0 DAC0_1 IN0_0 IN0_1',
        }, 'text', true, ' ');
        Object.assign(this, { $rules: {
            start: [
                { token: 'entity.function.name', regex: /^\s*\w*\./ },
                { token: 'keyword', regex: /\$\w+/ },
                { token: 'string', regex: '"', next: 'string' },
                { token: 'comment.multiline', regex: /^\/\*.+/, next: 'comment' },
                { token: 'comment', regex: /;.+$/ },
                { token: 'support.class', regex: /\[/, next: 'section' },
                { token: 'constant.numeric', regex: /[+-]?\d+\b/ },
                { token: keywords, regex: /\b\w+\b/ },
            ],
            section: [{ token: 'support.class', regex: /\]/, next: 'start' }, { defaultToken: 'support.class' }],
            comment: [{ token: 'comment.multiline', regex: /\*\//, next: 'start' }, { defaultToken: 'comment.multiline' }],
            string: [{ token: 'string', regex: '"', next: 'start' }, { defaultToken: 'string' }],
        } });
        this.normalizeRules();
    }
}

class ConfigurationMode extends TextMode {
    HighlightRules = ConfigurationHighlightRules;
    $behaviour = new CstyleBehaviour();
    foldingRules = new FoldMode();
    $id = 'ace/mode/dronelink-config';
}

export default function ConfigurationEditor({ text, onChange, readOnly, label, diagnostics, editorRef, catalogue }: {
    text: string;
    onChange: (value: string) => void;
    readOnly: boolean;
    label: string;
    diagnostics: ConfigurationDiagnostic[];
    catalogue?: Catalogue;
    editorRef: React.MutableRefObject<ace.Ace.Editor | null>;
}) {
    const container = useRef<HTMLDivElement>(null);
    const syncing = useRef(false);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;
    const completionCatalogue = useRef(catalogue);
    completionCatalogue.current = catalogue;

    useEffect(() => {
        const editor = ace.edit(container.current!, {
            theme: 'ace/theme/dracula',
            fontSize: 14,
            showPrintMargin: false,
            tabSize: 2,
            useSoftTabs: true,
        });
        const settingsCompleter: ace.Ace.Completer = {
            identifierRegexps: [/[$A-Za-z0-9_]/],
            getCompletions(editor, session, position, _prefix, callback) {
                const before = session.getLine(position.row).slice(0, position.column);
                if (editor.getReadOnly() || !/^\s*(?:\$?[A-Za-z_0-9]*)$/.test(before)) {
                    callback(null, []);
                    return;
                }
                let type: string | undefined;
                for (let row = position.row - 1; row >= 0; row--) {
                    const line = session.getLine(row);
                    if (!/^\s*\[/.test(line)) continue;
                    type = /^\s*\[\s*([A-Za-z][A-Za-z0-9]*)\s*=/.exec(line)?.[1];
                    break;
                }
                const entry = completionCatalogue.current?.entries.find(entry => entry.type === type);
                const settings = type ? moduleSettingsExamples(type, entry?.settings, i2cDefaults[type]) : [];
                const suffix = session.getLine(position.row).slice(position.column);
                callback(null, settings.map(({ name, value }, index) => ({
                    caption: name, value: /^\s*=/.test(suffix) ? name : `${name} = ${value}`, meta: 'setting', score: 1000 - index,
                })));
            },
        };
        editor.setOptions({ enableBasicAutocompletion: [settingsCompleter], enableLiveAutocompletion: [settingsCompleter] });
        editor.session.setUseWorker(false);
        editor.session.setMode(new ConfigurationMode());
        editorRef.current = editor;
        const changed = () => { if (!syncing.current) onChangeRef.current(editor.getValue()); };
        editor.on('change', changed);
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => editor.resize());
        observer?.observe(container.current!);
        return () => {
            observer?.disconnect();
            editor.destroy();
            editorRef.current = null;
        };
    }, [editorRef]);

    useEffect(() => {
        const editor = editorRef.current!;
        if (editor.getValue() !== text) {
            syncing.current = true;
            editor.setValue(text, -1);
            syncing.current = false;
        }
        editor.setReadOnly(readOnly);
        const input = editor.textInput.getElement();
        input.setAttribute('aria-label', label);
        input.setAttribute('aria-readonly', String(readOnly));
    }, [editorRef, label, readOnly, text]);

    useEffect(() => {
        editorRef.current!.session.setAnnotations(diagnostics.map(item => ({
            row: item.line - 1, column: 0, type: item.severity, text: item.message,
        })));
    }, [diagnostics, editorRef]);

    return <div ref={container} className="dw-config-editor" />;
}
