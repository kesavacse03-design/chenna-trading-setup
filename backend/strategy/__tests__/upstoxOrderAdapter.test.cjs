const { UpstoxOrderAdapter } = require('../upstoxOrderAdapter.cjs');

// Mock fetch
global.fetch = jest.fn();

describe('UpstoxOrderAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new UpstoxOrderAdapter();
    adapter.accessToken = 'test-token';
    jest.clearAllMocks();
  });

  test('submit in dry-run mode', async () => {
    process.env.DRY_RUN = '1';
    const order = { side: 'buy', qty: 10, type: 'market', symbol: 'TEST', price: 100 };
    const fill = await adapter.submit(order, [], { close: 100 });
    expect(fill).toHaveProperty('orderId');
    expect(fill.status).toBe('filled');
    process.env.DRY_RUN = undefined;
  });

  test('submit real order success', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => ({ order_id: '123' })
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: () => ({ order_status: 'complete', average_price: 100 })
    });
    const order = { side: 'buy', qty: 10, type: 'market', symbol: 'TEST' };
    const fill = await adapter.submit(order, [], { close: 100 });
    expect(fill.orderId).toBe('123');
    expect(fill.price).toBe(100);
  });

  test('submit real order failure', async () => {
    fetch.mockResolvedValueOnce({ ok: false, text: () => 'Error' });
    const order = { side: 'buy', qty: 10, type: 'market', symbol: 'TEST' };
    await expect(adapter.submit(order)).rejects.toThrow('Order submit error');
  });

  test('cancel order', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const result = await adapter.cancel('123');
    expect(result.status).toBe('cancelled');
  });

  test('replace order', async () => {
    fetch.mockResolvedValueOnce({ ok: true });
    const result = await adapter.replace('123', { qty: 20 });
    expect(result.status).toBe('modified');
  });
});
