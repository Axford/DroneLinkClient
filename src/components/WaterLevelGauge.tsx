import React from 'react';
import './WaterLevelGauge.css';

// Retain the scale used by the legacy ADC gauge.
const scale = 4096;

export default function WaterLevelGauge({ level, threshold, triggered }: {
    level?: number;
    threshold?: number;
    triggered: boolean;
}) {
    const marker = threshold !== undefined && threshold > 0 ? threshold : undefined;
    const overScale = (level ?? 0) > scale || (marker ?? 0) > scale;
    const position = (value: number) => 76 - Math.min(value, scale) / scale * 72;
    const description = [
        level === undefined ? 'Raw level unavailable' : `Raw level ${level}`,
        threshold === undefined ? 'Threshold unavailable' : threshold === 0 ? 'Threshold zero' : `Threshold ${threshold}`,
        'Scale 0 to 4096',
        overScale ? 'Reading above scale' : undefined
    ].filter(Boolean).join('. ');

    return <div className="dw-water-gauge">
        <div className="dw-water-scale dw-meta" aria-hidden="true"><span>4096</span><span>0</span></div>
        <svg viewBox="0 0 70 80" role="img" aria-label={description} data-triggered={triggered || undefined}>
            <rect className="dw-water-track" x="6" y="4" width="58" height="72" rx="2" />
            {level !== undefined && <rect className="dw-water-fill" x="7" y={position(level)}
                width="56" height={76 - position(level)} />}
            {marker !== undefined && <line className="dw-water-threshold" x1="3" x2="67"
                y1={position(marker)} y2={position(marker)} />}
        </svg>
        {overScale && <span className="dw-meta">Above scale</span>}
    </div>;
}
