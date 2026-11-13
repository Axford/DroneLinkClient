import type { ParameterState } from './DroneLinkState';
import { DRONE_LINK_MSG_TYPE_FLOAT } from './DroneLinkMsg';

function floats(reading: ParameterState | undefined, length: number): number[] | undefined {
    if (!reading?.lastHeard || !Number.isFinite(reading.lastHeard) || reading.unavailable?.value ||
        reading.msgType !== DRONE_LINK_MSG_TYPE_FLOAT || reading.numValues !== length || reading.values.length !== length) return;
    const values = Array.from<number | string>(reading.values);
    if (values.every((value): value is number => typeof value === 'number' && Number.isFinite(value))) return values;
}

export function magneticVector(reading: ParameterState | undefined) {
    const values = floats(reading, 3);
    if (values) {
        const [x, y, z] = values;
        return { x, y, z };
    }
}

export function calibrationAxis(reading: ParameterState | undefined) {
    const values = floats(reading, 3);
    if (values) {
        const [min, centre, max] = values;
        if (min < max && min <= centre && centre <= max) return { min, centre, max };
    }
}

export function quadrantBounds(reading: ParameterState | undefined) {
    const values = floats(reading, 4);
    if (values) {
        // Firmware defaults and the legacy plot use +Y, +X, −Y, −X.
        const [maxY, maxX, minY, minX] = values;
        if (minX < maxX && minY < maxY) return { minX, maxX, minY, maxY };
    }
}

export type MagneticVector = NonNullable<ReturnType<typeof magneticVector>>;

export interface MagneticCalibration {
    reading?: ParameterState;
    vector?: MagneticVector;
    xAxis?: ReturnType<typeof calibrationAxis>;
    yAxis?: ReturnType<typeof calibrationAxis>;
    limits?: ReturnType<typeof quadrantBounds>;
}
