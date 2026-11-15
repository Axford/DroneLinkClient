import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ChannelCard from './ChannelCard';
import type { ParameterState } from '../dronelink/DroneLinkState';

function parameter(param: number, values: number[] | string[], msgType = 0): ParameterState {
    return { param, values, msgType, bytesPerValue: msgType === 2 || msgType === 3 ? 4 : 1,
        numValues: values.length, writable: false, lastHeard: 10000 };
}

test('shows observed digital, serial and analog results with pin identity in Modules', () => {
    render(<ChannelCard nodeId={7} channelId={3} now={12000} expanded systemOpen={false}
        showParameters={false} onShowParameters={() => {}} onToggleExpand={() => {}} onToggleSystem={() => {}}
        channel={{ channel: 3, lastHeard: 10000, params: {
            5: parameter(5, ['Probe'], 4),
            6: parameter(6, [500], 2),
            23: parameter(23, [0x61, 0x24, 0x47]),
            24: parameter(24, [0x15, 6]),
            42: parameter(42, [0x14, 1, 0x18, 0, 20, 0]),
            43: parameter(43, [625, 722, 673.125, 400], 3),
            44: parameter(44, [0x21, 0x08, 0x07]),
            45: parameter(45, [20, 5, 10], 3)
        } }} />);
    expect(within(screen.getByRole('article', { name: 'GPIO 13' })).getByText('Serial · 9600 baud · 8N1')).toBeVisible();
    expect(screen.getByText('24 47')).toBeVisible();
    expect(screen.getByText('Pin unavailable · owned by channel 6')).toBeVisible();
    expect(screen.getByText('High · 24 transitions in 20 ms · incomplete count')).toBeVisible();
    expect(screen.getByText('1800 ADC counts · voltage estimate unavailable')).toBeVisible();
    expect(screen.getByText('Min 625 · Max 722 · Avg 673.1 ADC counts over 20 ms · estimated 400 mV average')).toBeVisible();
    expect(screen.getByText('Analog statistics unavailable')).toBeVisible();
    expect(screen.getByText('Expected refresh per pin: about 2.5 s')).toBeVisible();
});

test('switches to raw parameters with fixed GPIO names, including a cleared pin and an observed firmware label', () => {
    const onShowParameters = jest.fn();
    const props = { nodeId: 7, channelId: 3, now: 12000, expanded: true, systemOpen: false,
        onShowParameters, onToggleExpand: jest.fn(), onToggleSystem: jest.fn(),
        channel: { channel: 3, lastHeard: 10000, params: {
            5: parameter(5, ['Probe'], 4),
            14: parameter(14, [0]),
            23: { ...parameter(23, [0x15, 6]), name: 'gpio13' },
            45: parameter(45, [0x10]),
        } },
    };
    const view = render(<ChannelCard {...props} showParameters={false} />);
    expect(screen.queryByRole('article', { name: 'GPIO 4' })).toBeNull();
    expect(screen.getByRole('article', { name: 'GPIO 35' })).toHaveTextContent('Waiting for sample');
    fireEvent.click(screen.getByRole('button', { name: 'Show Parameters' }));
    expect(onShowParameters).toHaveBeenCalledWith(true);

    view.rerender(<ChannelCard {...props} showParameters />);
    expect(screen.getByRole('button', { name: 'Parameter details: GPIO 4' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Parameter details: GPIO 13' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Parameter details: GPIO 35' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Probe pin results' })).toBeNull();
});
