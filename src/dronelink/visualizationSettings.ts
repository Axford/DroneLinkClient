export interface VoltageThresholds {
    redBelow: number;
    amberBelow: number;
}

export interface VisualizationTarget {
    nodeAddress: number;
    channel: number;
    moduleType: string;
}

export interface VisualizationSetting extends VisualizationTarget {
    revision: number;
    thresholds: VoltageThresholds | null;
}

export interface VisualizationSettingsDefinition {
    moduleType: string;
    description: string;
    invalidMessage: string;
    fields: readonly { key: keyof VoltageThresholds; label: string }[];
    parse: (draft: Record<keyof VoltageThresholds, string>) => VoltageThresholds | null;
}

export function visualizationKey({ nodeAddress, channel, moduleType }: VisualizationTarget) {
    return `${nodeAddress}:${channel}:${moduleType}`;
}
