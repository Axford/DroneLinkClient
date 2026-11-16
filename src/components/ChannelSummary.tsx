import React, { useState } from 'react';
import { ExclamationOctagon, ExclamationTriangle, InfoCircle } from 'react-bootstrap-icons';
import type { InspectorSummary, ObservedSummary } from '../dronelink/moduleVisualizations';
import { SummaryDetails } from './NodeSummary';
import IconButton from './ui/IconButton';
import { useCommandScope } from '../commands/session';
import SettingsDialog from './ui/SettingsDialog';
import Rfm69Signal from './Rfm69Signal';
import CellVoltageDial from './CellVoltageDial';
import HeadingCompass from './HeadingCompass';
import AnemometerInstrument from './AnemometerInstrument';
import WaterLevelGauge from './WaterLevelGauge';
import NeopixelScene from './NeopixelScene';
import JoystickPlot from './JoystickPlot';
import ReceiverInstrument from './ReceiverInstrument';
import MotorInstrument from './MotorInstrument';
import MagneticScatter, { useMagneticSamples } from './MagneticScatter';
import AttitudeDials from './AttitudeDials';
import Hmc5883lInstrument from './Hmc5883lInstrument';
import Mpu6050Instrument from './Mpu6050Instrument';
import PolarInstrument from './PolarInstrument';
import PolarActions from './PolarActions';
import KiteControllerInstrument from './KiteControllerInstrument';
import TankSteerInstrument from './TankSteerInstrument';
import TankSteerActions from './TankSteerActions';
import TurnRateInstrument from './TurnRateInstrument';
import ProaInstrument from './ProaInstrument';
import SailorInstrument from './SailorInstrument';
import WaypointInstrument from './WaypointInstrument';
import WaypointActions from './WaypointActions';
import NavInstrument from './NavInstrument';
import WindDials from './WindDials';
import DepthTrace from './DepthTrace';
import ServoInstrument from './ServoInstrument';

function Reading({ summary, primary, inlineSeverity, hideLabel }: { summary: ObservedSummary; primary?: boolean; inlineSeverity?: boolean; hideLabel?: boolean }) {
    const bearing = summary.bearing;
    const hasCompass = bearing !== undefined;
    const volts = summary.voltageDial;
    const severityIcon = summary.severity === 'warning' ? <ExclamationTriangle aria-hidden="true" />
        : summary.severity === 'danger' ? <ExclamationOctagon aria-hidden="true" /> : null;
    return <div className={primary ? 'dw-summary-primary' : 'dw-summary-supporting'}
        data-severity={summary.severity ?? 'neutral'} data-unavailable={summary.unavailable || undefined}
        data-graphic={volts !== undefined ? 'voltage' : hasCompass ? 'compass' : undefined}>
        <dt className={hasCompass || (hideLabel && !summary.unavailable) ? 'visually-hidden' : 'dw-meta'}>{summary.label}{inlineSeverity && severityIcon}</dt>
        <dd>
            {hasCompass && <HeadingCompass bearing={bearing} />}
            {!inlineSeverity && severityIcon}
            {volts !== undefined ? <CellVoltageDial volts={volts} text={summary.text} /> : summary.lines ? <span className="dw-summary-lines">
                {summary.lines.map(line => <span key={line}>{line}</span>)}
            </span> : <span>{summary.text}</span>}
            {summary.status && <span className="visually-hidden"> · {summary.status}</span>}
        </dd>
    </div>;
}

function PacketReading({ label, value }: { label: string; value?: string }) {
    return <dd data-unavailable={value === undefined || undefined}>
        <span className="visually-hidden">{label}: </span>
        {value === undefined ? <>
            <span aria-hidden="true">—</span><span className="visually-hidden">Unavailable</span>
        </> : <span>{value}</span>}
    </dd>;
}

export default function ChannelSummary({ nodeId, channelId, summary, sampleScope, generation }: { nodeId: number; channelId: number; summary: InspectorSummary; sampleScope?: string; generation?: number }) {
    const label = `Observed readings for channel ${channelId}`;
    if ('polarResponse' in summary) {
        return <>
            <PolarInstrument label={label} summary={summary} />
            <PolarActions key={JSON.stringify([nodeId, channelId, generation])} nodeId={nodeId} channelId={channelId} modeValue={summary.modeValue} />
        </>;
    }
    if ('kiteVector' in summary) {
        return <KiteControllerInstrument label={label} summary={summary} scope={sampleScope} />;
    }
    if ('drives' in summary) {
        return <>
            <TankSteerInstrument label={label} summary={summary} />
            <TankSteerActions key={JSON.stringify([nodeId, channelId, generation])} nodeId={nodeId} channelId={channelId} summary={summary} />
        </>;
    }
    if ('turnOutput' in summary) {
        return <TurnRateInstrument label={label} summary={summary} />;
    }
    if ('proaBearings' in summary) {
        return <ProaInstrument label={label} summary={summary} />;
    }
    if ('sailBearings' in summary) {
        return <SailorInstrument label={label} summary={summary} />;
    }
    if ('waypoint' in summary) {
        return <>
            <WaypointInstrument label={label} summary={summary} />
            <WaypointActions key={JSON.stringify([nodeId, channelId, generation])} nodeId={nodeId} channelId={channelId} summary={summary} />
        </>;
    }
    if ('navigationBearings' in summary) {
        return <NavInstrument nodeId={nodeId} label={label} summary={summary} />;
    }
    if ('worldWind' in summary) {
        return <WindDials key={summary.worldWind.parameterId} label={label} summary={summary} scope={sampleScope} />;
    }
    if ('measuredDepth' in summary) {
        return <DepthTrace label={label} summary={summary} scope={sampleScope} />;
    }
    if ('temperature' in summary) {
        return <Mpu6050Instrument key={sampleScope} nodeId={nodeId} label={label} summary={summary} />;
    }
    if ('magneticHeading' in summary) {
        return <Hmc5883lInstrument key={sampleScope} nodeId={nodeId} label={label} summary={summary} scope={sampleScope} />;
    }
    if ('servoPosition' in summary) {
        return <ServoInstrument label={label} summary={summary} />;
    }
    if ('motorSpeed' in summary) {
        return <MotorInstrument label={label} summary={summary} />;
    }
    if ('receiverOutputs' in summary) {
        return <ReceiverInstrument label={label} summary={summary} />;
    }
    if ('joystick' in summary) {
        return <dl className="dw-channel-summary dw-joystick-summary" aria-label={label}>
            <div className="dw-joystick-plot">
                <dt className="visually-hidden">Joystick position</dt>
                <dd><JoystickPlot {...summary.joystick} /></dd>
            </div>
            {summary.details.map(reading => <Reading key={reading.parameterId} summary={reading} />)}
        </dl>;
    }
    if ('sceneColours' in summary) {
        return <NeopixelScene label={label} colours={summary.sceneColours} />;
    }
    if ('waterLevel' in summary) {
        return <dl className="dw-channel-summary dw-water-sensor" aria-label={label}>
            <div className="dw-water-gauge-tile">
                <dt className="visually-hidden">Water level and threshold</dt>
                <dd className="mb-0">
                    <WaterLevelGauge level={summary.waterLevel} threshold={summary.threshold} triggered={summary.alarm.severity === 'danger'} />
                </dd>
            </div>
            <Reading summary={summary.rawReading} />
            <Reading summary={summary.thresholdReading} />
            <Reading summary={summary.alarm} />
        </dl>;
    }
    if ('windSpeed' in summary) {
        return <AnemometerInstrument key={sampleScope} label={label} summary={summary} scope={sampleScope} />;
    }
    if ('inputs' in summary) {
        return <section className="dw-power-inputs" aria-label={label}>
            {summary.inputs.map(input => <section className="dw-power-input" key={input.label} role="group" aria-label={input.label}>
                <dl className="dw-channel-summary dw-power-input-readings">
                    <Reading summary={input.voltage} primary hideLabel={input.voltage.voltageDial !== undefined} />
                    {input.readings.map(reading => <Reading key={reading.parameterId} summary={reading} hideLabel={reading.parameterId !== 16} />)}
                </dl>
            </section>)}
        </section>;
    }
    if ('columns' in summary) {
        return <>
            <dl className="dw-channel-summary" data-layout="columns" aria-label={label}>
                {summary.columns.map(column => <div key={column.label} className="dw-summary-primary">
                    <dt className="dw-meta">{column.label}</dt>
                    <PacketReading label="Count" value={column.count} />
                    <PacketReading label="Rate in packets per second" value={column.rate} />
                </div>)}
            </dl>
            {summary.signal && <Rfm69Signal key={sampleScope} signal={summary.signal} scope={sampleScope} />}
        </>;
    }
    if ('attitudeReading' in summary) {
        return <dl className="dw-channel-summary dw-attitude-summary" aria-label={label}>
            {summary.primary.map(reading => <Reading key={reading.parameterId} summary={reading} primary />)}
            <AttitudeDials key={sampleScope} scope={sampleScope} reading={summary.attitudeReading} attitude={summary.attitude} />
        </dl>;
    }
    const layout = summary.layout ?? (summary.primary.length === 1 && summary.supporting.length > 0 ? 'lead' : 'rows');
    const supportingRows = layout === 'compact' ? Math.ceil(summary.supporting.length / 2) : summary.supporting.length;
    const leadRows = { '--dw-summary-rows': Math.max(1, supportingRows) } as React.CSSProperties;
    return <dl className="dw-channel-summary" data-layout={layout} data-single-reading={(summary.supporting.length === 0 && summary.primary.length === 1) || undefined} style={leadRows} aria-label={label}>
        {summary.primary.map(reading => <Reading key={reading.parameterId} summary={reading} primary inlineSeverity={layout === 'compact'} />)}
        {summary.supporting.map(reading => <Reading key={reading.parameterId} summary={reading} />)}
    </dl>;
}

export function ChannelSummaryDetails({ nodeId, channelId, summary, sampleScope, onShowParameters }: {
    nodeId: number; channelId: number; summary: InspectorSummary; sampleScope?: string; onShowParameters: () => void;
}) {
    const scope = useCommandScope();
    const [details, setDetails] = useState(false);
    const title = `Channel ${channelId} reading details`;
    const readings = 'waterLevel' in summary ? [summary.rawReading, summary.thresholdReading, summary.alarm]
        : 'windSpeed' in summary ? [summary.windSpeed]
        : 'details' in summary ? summary.details
        : 'primary' in summary ? [...summary.primary, ...summary.supporting, ...(summary.additionalDetails ?? [])] : [];
    const magnetic = 'primary' in summary ? summary.magneticCalibration : undefined;
    const samples = useMagneticSamples(magnetic ? sampleScope : undefined, magnetic?.reading);
    return <>
        <IconButton label={title} icon={<InfoCircle />} data-inspector-focus={`summary-details-${channelId}`} onClick={() => setDetails(true)} />
        <SettingsDialog title={title} show={details} onHide={() => setDetails(false)}>
            {'proaBearings' in summary && <p className="dw-meta">
                Profile values run clockwise in 11.25° sectors from live wind on a relative scale from 0 to 255.
                The polar mirrors its first half. Steering angles are relative to the vessel.
                The target frame adds the observed frame offset to the course.
            </p>}
            {'polarResponse' in summary && <p className="dw-meta">
                The 16 reported sectors run clockwise from wind in 11.25° steps and mirror onto the other tack.
                The inner trace shows sample counts. The outer trace uses the average speed-over-ground to wind-speed ratio per sampled sector, scaled so the peak sector is 255.
                The adjusted heading marker subtracts the reported wind bearing from the reported heading.
            </p>}
            {'sailBearings' in summary && <p className="dw-meta">
                Profile values run clockwise in 11.25° sectors from course wind. The polar profile mirrors the first 16 sectors.
                Speed uses the two reported halves in order. The relative scale is 0 to 255.
            </p>}
            {'waypoint' in summary && <p className="dw-meta">
                Estimated distance covered is the planned route length minus the reported remaining distance, with a minimum of zero.
                ETA divides the remaining distance by the reported route speed.
            </p>}
            {magnetic && <MagneticScatter calibration={magnetic} samples={samples} />}
            {'columns' in summary && summary.note && <p className="dw-meta">{summary.note}</p>}
            {'inputs' in summary ? summary.inputs.map(input => <section key={input.label} role="group" aria-label={input.label}>
                <h3 className="dw-meta mt-2">{input.label}</h3>
                <SummaryDetails nodeId={nodeId} summaries={[input.voltage, ...input.readings]} now={Date.now()} />
            </section>) : <SummaryDetails nodeId={nodeId}
                summaries={readings} now={Date.now()} />}
            {scope?.canSubmit && scope.canTarget?.(nodeId) !== false &&
                <button type="button" className="btn btn-outline-secondary" onClick={() => {
                    setDetails(false);
                    onShowParameters();
                }}>Open parameters for commands</button>}
        </SettingsDialog>
    </>;
}
