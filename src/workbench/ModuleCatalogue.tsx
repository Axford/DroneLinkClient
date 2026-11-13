import React, { useId, useState } from 'react';
import SettingsDialog from '../components/ui/SettingsDialog';
import type { ConfigurationOverview } from './nodeConfiguration';
import { i2cStarters } from './nodeConfiguration';
import type { Starter } from './nodeConfiguration';
import { hex } from './i2cDiscovery';
import { connectGpsLocation, gpsPort, setGpsPort } from './nodeConfiguration';

interface Parameter { name: string; address: number; type: string; count: number }
interface Entry {
    type: string;
    description: string;
    category: string;
    support: 'supported' | 'unsupported' | 'unknown';
    serialPort?: Parameter;
    locationOutput?: Parameter;
    locationInput?: Parameter;
}
export interface Catalogue {
    schemaVersion: 1;
    node: number;
    supportKnown: boolean;
    build?: string;
    metadataStatus: 'marker-match' | 'different-build' | 'unverified' | 'unavailable';
    entries: Entry[];
}
const labels: Record<Starter, string> = { NMEA: 'GPS', Nav: 'Pilot', Probe: 'Probe',
    INA219: 'INA219', INA3221: 'INA3221', BME280: 'BME280', QMC5883L: 'QMC5883L' };

function isStarter(type: string, i2cCandidates?: string[]): type is Starter {
    return type === 'NMEA' || type === 'Nav' || type === 'Probe' ||
        (i2cStarters.some(candidate => candidate === type) && !!i2cCandidates?.includes(type));
}
const supported = (catalogue: Catalogue | undefined, type: string) =>
    catalogue?.entries.find(entry => entry.type === type && entry.support === 'supported');
const matched = (catalogue: Catalogue | undefined, type: string) =>
    catalogue?.metadataStatus === 'marker-match' ? supported(catalogue, type) : undefined;

export function ModuleCatalogue({ initialSearch, gpsConnector, i2c, catalogue, loading, canAdd, onRetry, onClose, onAdd }: {
    catalogue?: Catalogue;
    initialSearch?: string;
    gpsConnector?: 1 | 2;
    i2c?: { channel: number; address: number; candidates: string[] };
    loading: boolean;
    canAdd: boolean;
    onRetry: () => void;
    onClose: () => void;
    onAdd: (type: Starter) => void;
}) {
    const id = useId();
    const [search, setSearch] = useState(initialSearch ?? '');
    const words = search.toLowerCase().trim().split(/\s+/);
    const entries = catalogue?.entries.filter(entry => {
        if (i2c && !i2c.candidates.includes(entry.type)) return false;
        const terms = `${entry.type} ${entry.category} ${entry.description} ${isStarter(entry.type, i2c?.candidates) ? labels[entry.type] : ''}`.toLowerCase();
        return words.every(word => terms.includes(word));
    });
    return <SettingsDialog title="Add module" show onHide={onClose}>
        <label htmlFor={id}>Search modules</label>
        <input id={id} className="form-control mb-2" type="search" autoFocus value={search}
            onChange={event => setSearch(event.target.value)} />
        {loading ? <p role="status">Checking the selected node…</p> : <>
            <p className="dw-meta">
                {catalogue?.supportKnown ? `Node build ${catalogue.build} reported its supported types at the last check.` : 'Module support on this node is unknown.'}
                {' '}{catalogue?.metadataStatus === 'marker-match' ? 'Catalogue and node build markers match.'
                    : catalogue?.metadataStatus === 'different-build' ? 'Catalogue metadata is from a different build.'
                    : catalogue?.metadataStatus === 'unverified' ? 'Catalogue metadata has not been matched to this node.'
                    : 'Release metadata is unavailable.'}
            </p>
            <button type="button" className="btn btn-outline-secondary mb-2" onClick={onRetry}>Refresh catalogue</button>
            {gpsConnector && <p className="dw-meta">A GPS added from this connector will use Serial {gpsConnector}.</p>}
            {i2c && <p className="dw-meta">Proposed assignment: I²C channel {i2c.channel} · {hex(i2c.address)}.</p>}
            {!canAdd && <p className="dw-meta">A free channel and a structurally valid draft are required to add a module.</p>}
            {!entries?.length && <p>{catalogue?.entries.length ? 'No modules match your search.' : 'No catalogue entries available.'}</p>}
            <ul className="list-unstyled">
                {entries?.map(entry => {
                    const type = entry.type;
                    const starter = isStarter(type, i2c?.candidates);
                    return <li key={type} className="dw-config-module">
                        <div><strong>{starter ? labels[type] === type ? type : `${labels[type]} · ${type}` : type}</strong>{entry.category && ` · ${entry.category}`}</div>
                        <div className="dw-meta">{entry.description}</div>
                        <div className="dw-toolbar">
                            <span className="dw-meta">{entry.support === 'supported' ? 'Supported by this node' :
                                entry.support === 'unsupported' ? 'Not reported by this node' : 'Support unknown'}</span>
                            {starter ? <button type="button" className="btn btn-outline-secondary"
                                disabled={!canAdd || entry.support !== 'supported'} onClick={() => onAdd(type)}>Add {labels[type]}</button>
                                : <span className="dw-meta">No reviewed starter template</span>}
                        </div>
                    </li>;
                })}
            </ul>
        </>}
    </SettingsDialog>;
}

export function GuidedModule({ catalogue, overview, channel, node, text, onCheck, onChange }: {
    catalogue?: Catalogue;
    overview: ConfigurationOverview;
    channel: number;
    node: number;
    text: string;
    onCheck: () => void;
    onChange: (text: string) => void;
}) {
    const id = useId();
    const [source, setSource] = useState('');
    const [preview, setPreview] = useState<{ original: string; catalogue?: Catalogue; edit: NonNullable<ReturnType<typeof connectGpsLocation>> }>();
    const gps = matched(catalogue, 'NMEA');
    const nav = matched(catalogue, 'Nav');
    const selected = overview.modules.find(module => module.channel === channel);
    if (!selected || (selected.type !== 'NMEA' && selected.type !== 'Nav')) return null;
    const output = gps?.locationOutput;
    const input = nav?.locationInput;
    const hasPort = gps?.serialPort?.address === 13 && gps.serialPort.type === 'u8' && gps.serialPort.count === 2;
    const canConnect = output?.address === 8 && output.type === 'f' && output.count === 3 &&
        input?.address === 10 && input.type === 'f' && input.count === 3;
    const port = selected.type === 'NMEA' && hasPort ? gpsPort(text, selected) : undefined;
    const sources = canConnect ? overview.modules.filter(module => module.type === 'NMEA') : [];
    const proposed = source && output && sources.some(module => module.channel === Number(source)) ?
        connectGpsLocation(text, node, Number(source), channel, output.address) : undefined;
    const active = preview?.original === text && preview.catalogue === catalogue ? preview.edit : undefined;
    return <section className="dw-config-module" aria-label="Guided module settings">
        <strong>{selected.name || selected.type} · Channel {channel}</strong>
        {selected.type === 'NMEA' && port !== undefined ? <div>
            <label htmlFor={id}>GPS serial port</label>
            <select id={id} className="form-select" value={port} onChange={event => {
                const edit = setGpsPort(text, node, channel, event.target.value);
                if (edit) onChange(edit.text);
            }}>
                {port === 'default' && <option value="default" disabled>Firmware default</option>}
                <option value="1" disabled={!setGpsPort(text, node, channel, '1')}>Serial 1</option>
                <option value="2" disabled={!setGpsPort(text, node, channel, '2')}>Serial 2</option>
            </select>
            <p className="dw-meta mb-0">Check the board pinout and port availability before uploading.</p>
        </div> : selected.type === 'Nav' && canConnect && sources.length ? <div>
            <label htmlFor={id}>Pilot location source</label>
            <select id={id} className="form-select" value={source} onChange={event => { setPreview(undefined); setSource(event.target.value); }}>
                <option value="">Choose a GPS output</option>
                {sources.map(module => <option key={module.channel} value={module.channel}>
                    {module.name || 'GPS'} · location (channel {module.channel})
                </option>)}
            </select>
            <button type="button" className="btn btn-outline-secondary mt-2" disabled={!proposed?.changes.length}
                onClick={() => proposed && setPreview({ original: text, catalogue, edit: proposed })}>Review connection</button>
            {source && !proposed && <p className="dw-meta">These declarations cannot be edited safely here. Review them in Code.</p>}
            {active && <div className="mt-2">
                <p>Proposed draft changes</p>
                <pre aria-label="Connection changes">{active.changes.map(change =>
                    `${change.before === undefined ? '' : `− ${change.before}\n`}+ ${change.after}`).join('\n')}</pre>
                <div className="dw-toolbar">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => { onChange(active.text); setPreview(undefined); }}>Apply connection to draft</button>
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setPreview(undefined)}>Cancel preview</button>
                </div>
            </div>}
        </div> : <p className="dw-meta mb-0">{catalogue?.metadataStatus === 'marker-match'
            ? 'No guided settings are available for these declarations. Use Code to edit them.'
            : 'Guided settings require the node’s supported types and matching catalogue build marker.'}</p>}
        {!catalogue && <button type="button" className="btn btn-outline-secondary mt-2" onClick={onCheck}>Check module catalogue</button>}
    </section>;
}
