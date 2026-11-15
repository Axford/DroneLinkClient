import v4Image from './DroneLinkV4PinOutSimple.png';
import v2Image from './DroneLinkV2PinOutSimple.jpeg';

export const boardWidth = 430;
export const boardHeight = boardWidth * 2096 / 2434;
const endpoint = (imageWidth: number) => (id: string, label: string, x: number, y: number, gpio?: number) =>
    ({ id, label, x: boardWidth * x / imageWidth, y: boardWidth * y / imageWidth, gpio });

// Connector positions come from the legacy V4 diagram. GPIO functions
// follow DroneNode's pinConfig.h. Only endpoints shown on this board are listed.
const v4 = endpoint(2434);
export const boardEndpoints = [
    v4('32', 'OUT1 · GPIO 32', 314, 762, 32),
    v4('33', 'OUT1 · GPIO 33', 410, 760, 33),
    v4('25', 'DAC1 · GPIO 25', 310, 1005, 25),
    v4('26', 'DAC1 · GPIO 26', 410, 1005, 26),
    v4('14', 'OUT3 · GPIO 14', 310, 1245, 14),
    v4('15', 'OUT3 · GPIO 15', 410, 1245, 15),
    v4('16', 'Serial 2 RX · GPIO 16', 310, 1485, 16),
    v4('17', 'Serial 2 TX · GPIO 17', 410, 1485, 17),
    v4('13', 'Serial 1 RX · GPIO 13', 310, 1720, 13),
    v4('12', 'Serial 1 TX · GPIO 12', 410, 1720, 12),
    v4('35', 'Power header · GPIO 35', 310, 1980, 35),
    v4('2', 'Status LED · GPIO 2', 1800, 1860, 2),
    ...[[2334, 1844], [2334, 1311], [2334, 782], [2334, 254], [1940, 883], [1940, 622], [1940, 372], [1940, 101]]
        .map(([x, y], bus) => v4(`i${bus}`, `I²C channel ${bus}`, x, y)),
];

const v2 = endpoint(1237);

const v2Endpoints = [
    v2('4', 'OUT2 · GPIO 4', 864, 646, 4),
    v2('13', 'Serial 1 RX · GPIO 13', 262, 685, 13),
    v2('14', 'GPIO 14', 262, 380, 14),
    v2('15', 'GPIO 15', 262, 339, 15),
    v2('16', 'Serial 2 RX · GPIO 16', 864, 390, 16),
    v2('25', 'DAC0 · GPIO 25', 156, 771, 25),
    v2('26', 'DAC0 · GPIO 26', 156, 731, 26),
    v2('32', 'OUT1 · GPIO 32', 156, 544, 32),
    v2('33', 'OUT1 · GPIO 33', 156, 505, 33),
    v2('34', 'Analog input · GPIO 34', 156, 318, 34),
    v2('35', 'Analog input · GPIO 35', 156, 279, 35),
];

export interface MotherboardDiagram {
    version: number;
    image: string;
    width: number;
    height: number;
    endpoints: readonly ReturnType<ReturnType<typeof endpoint>>[];
}

export const v4Board: MotherboardDiagram = {
    version: 4, image: v4Image, width: boardWidth, height: boardHeight, endpoints: boardEndpoints,
};
const v2Board: MotherboardDiagram = {
    version: 2, image: v2Image, width: boardWidth, height: boardWidth * 901 / 1237, endpoints: v2Endpoints,
};

export function motherboardDiagram(version?: number) {
    return version === 4 ? v4Board : version === 2 ? v2Board : undefined;
}

export function springPositions(devices: { id: string; connections: string[] }[], board = v4Board, spacing = 138) {
    const { width: boardWidth, height: boardHeight, endpoints: boardEndpoints } = board;
    // Work in columns outside the board. Each card is pulled toward its
    // connector height and pushed away from neighboring cards.
    const columns: { id: string; anchor: number; y: number }[][] = [[], []];
    for (const device of devices) {
        const points = boardEndpoints.filter(point => device.connections.includes(point.id));
        const side = points[0] && points[0].x > boardWidth / 2 ? 1 : 0;
        const anchor = points.length ? points.reduce((sum, point) => sum + point.y, 0) / points.length - 24 : boardHeight;
        columns[side].push({ id: device.id, anchor, y: anchor });
    }
    return new Map(columns.flatMap((column, side) => {
        column.sort((a, b) => a.anchor - b.anchor);
        column.forEach((card, index) => { card.y = card.anchor + index * spacing * 0.5; });
        for (let pass = 0; pass < 24; pass++) {
            for (const card of column) card.y += (card.anchor - card.y) * 0.2;
            for (let i = 1; i < column.length; i++) {
                const prior = column[i - 1], card = column[i];
                const correction = Math.max(0, spacing - (card.y - prior.y)) / 2;
                prior.y -= correction;
                card.y += correction;
            }
        }
        // Finish with a nonoverlapping layout around the relaxed positions.
        for (let i = 1; i < column.length; i++) column[i].y = Math.max(column[i].y, column[i - 1].y + spacing);
        return column.map(({ id, y }) => [id, { x: side ? boardWidth + 66 : -250, y }] as const);
    }));
}
