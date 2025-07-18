import React from 'react';
import { ParameterState } from '../dronelink/DroneLinkState';
import ParameterRow from './ParameterRow';

interface ParameterListProps {
    nodeId: number;
    channelId: number;
    parameters: { [paramId: number]: ParameterState };
}

const ParameterList: React.FC<ParameterListProps> = ({ nodeId, channelId, parameters }) => {
    const paramEntries = Object.entries(parameters).map(([paramId, param]) => ({
        id: parseInt(paramId),
        ...param
    }));

    // Sort parameters by ID for consistent display
    paramEntries.sort((a, b) => a.id - b.id);

    return (
        <div>
            {paramEntries.map(param => (
                <ParameterRow
                    key={param.id}
                    nodeId={nodeId}
                    channelId={channelId}
                    parameterId={param.id}
                    parameter={param}
                />
            ))}
        </div>
    );
};

export default ParameterList;