import { DroneLinkState } from './DroneLinkState';

let state: DroneLinkState;
beforeEach(() => { state = new DroneLinkState(); jest.useFakeTimers(); });
afterEach(() => { state.destroy(); jest.useRealTimers(); jest.restoreAllMocks(); });
const response = (data: any[], cursor: string, nextCursor: string | null = null) => ({ ok: true, json: async () => ({ success: true, data, cursor, nextCursor }) });

test('loads every history page and passes the final cursor into live polling', async () => {
  const history = jest.spyOn(state, 'processHistoricalMessages').mockResolvedValue();
  global.fetch = jest.fn().mockResolvedValueOnce(response([{ _id: 'one' }], 'first', 'next'))
    .mockResolvedValueOnce(response([{ _id: 'two' }], 'final'))
    .mockImplementation(() => new Promise(() => {}));
  await state.loadHistory('fleet');
  expect(history.mock.calls.map(call => call[0][0]._id)).toEqual(['one', 'two']);
  expect(fetch).toHaveBeenNthCalledWith(2, '/api/domains/fleet/messages?cursor=next', expect.anything());
  expect(fetch).toHaveBeenNthCalledWith(3, '/api/domains/fleet/stream?cursor=final&timeout=30000', expect.anything());
});

test('empty history still starts live polling and stopping aborts the owned request', async () => {
  global.fetch = jest.fn().mockResolvedValueOnce(response([], 'empty')).mockImplementation(() => new Promise(() => {}));
  await state.loadHistory('fleet');
  const signal = (fetch as jest.Mock).mock.calls[1][1].signal;
  state.stopStreaming();
  expect(signal.aborted).toBe(true);
  jest.runOnlyPendingTimers();
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('a late history response from the previous domain cannot update the selected domain', async () => {
  let finish: (value: any) => void = () => {};
  const history = jest.spyOn(state, 'processHistoricalMessages').mockResolvedValue();
  global.fetch = jest.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockResolvedValueOnce(response([], 'current')).mockImplementation(() => new Promise(() => {}));
  const old = state.loadHistory('old');
  await state.loadHistory('current');
  finish(response([{ _id: 'old-packet' }], 'old-cursor'));
  await old;
  expect(history).toHaveBeenCalledTimes(1);
  expect(history).toHaveBeenCalledWith([]);
});
