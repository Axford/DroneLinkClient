import { replayState, ReplayCache, ReplayWindow } from './history';

test('seeking across a channel reassignment preserves earlier state on a backward seek', () => {
    const window: ReplayWindow = {
        from: 0, until: 100, frame: { until: 0, channels: [{ nodeAddress: 11, channel: 7, moduleType: 'NMEA',
            params: { 8: { name: { payload: 'Vg==' }, value: { msgType: 0, payload: 'Cw==' } } } }] },
        samples: [
            { at: 20, node: 11, channel: 7, param: 8, msgType: 0, payload: 'DA==' },
            { at: 30, node: 11, channel: 7, param: 5, msgType: 4, payload: 'SU5BMjE5' },
            { at: 40, node: 11, channel: 7, param: 8, msgType: 0, payload: 'DQ==' }
        ]
    };
    expect(replayState(window, 29)[11].channels[7].params[8]).toMatchObject({ values: [12], name: 'V', lastHeard: 20 });
    expect(replayState(window, 30)[11].channels[7].params[8]).toBeUndefined();
    expect(replayState(window, 40)[11].channels[7].params[8]).toMatchObject({ values: [13] });
    expect(replayState(window, 10)[11].channels[7].params[8].values).toEqual([11]);
});

test('cache keeps the nearest loaded interval within its byte ceiling', () => {
    const cache = new ReplayCache(280);
    const data = (from: number) => ({ from, until: from + 10, frame: { until: from, channels: [] }, samples: [] });
    cache.add(data(0), 0);
    cache.add(data(10), 10);
    cache.add(data(100), 100);
    expect(cache.at(0)).toBeUndefined();
    expect(cache.at(15)?.from).toBe(10);
    expect(cache.at(105)?.from).toBe(100);
});
