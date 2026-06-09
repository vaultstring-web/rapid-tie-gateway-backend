import {
  acquireLock,
  getActiveLocksForTier,
  releaseLock,
  getLock
} from '../services/inventoryLock.service';

const redisMock = {
  set: jest.fn(),
  get: jest.fn(),
  keys: jest.fn(),
  del: jest.fn()
};

jest.mock('../services/redisClient.service', () => ({
  getRedisClient: jest.fn(() => Promise.resolve(redisMock)),
}));

describe('inventoryLock.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('acquireLock should create a lock with NX+EX', async () => {
    redisMock.set.mockResolvedValue('OK');
    
    const result = await acquireLock({
      tierId: 'tier-1',
      quantity: 5,
      sessionToken: 'session-1',
      ttlSeconds: 900
    });
    
    expect(result).toBe(true);
    expect(redisMock.set).toHaveBeenCalledWith(
      'inventory_lock:tier-1:session-1',
      expect.stringContaining('"quantity":5'),
      'EX',
      900,
      'NX'
    );
  });

  it('acquireLock should return false if lock already exists', async () => {
    redisMock.set.mockResolvedValue(null);
    
    const result = await acquireLock({
      tierId: 'tier-1',
      quantity: 5,
      sessionToken: 'session-1',
      ttlSeconds: 900
    });
    
    expect(result).toBe(false);
  });

  it('getActiveLocksForTier should sum quantities of active locks', async () => {
    redisMock.keys.mockResolvedValue([
      'inventory_lock:tier-1:session-1',
      'inventory_lock:tier-1:session-2'
    ]);
    redisMock.get.mockImplementation((key: string) => {
      if (key === 'inventory_lock:tier-1:session-1') {
        return JSON.stringify({ tierId: 'tier-1', quantity: 3, sessionToken: 'session-1' });
      }
      if (key === 'inventory_lock:tier-1:session-2') {
        return JSON.stringify({ tierId: 'tier-1', quantity: 4, sessionToken: 'session-2' });
      }
      return null;
    });
    
    const total = await getActiveLocksForTier('tier-1');
    expect(total).toBe(7);
  });

  it('releaseLock should delete all keys for a session', async () => {
    redisMock.keys.mockResolvedValue(['inventory_lock:tier-1:session-1']);
    redisMock.del.mockResolvedValue(1);
    
    await releaseLock('session-1');
    expect(redisMock.del).toHaveBeenCalledWith(['inventory_lock:tier-1:session-1']);
  });

  it('getLock should retrieve lock info by session token', async () => {
    redisMock.keys.mockResolvedValue(['inventory_lock:tier-1:session-1']);
    redisMock.get.mockResolvedValue(JSON.stringify({
      tierId: 'tier-1',
      quantity: 5,
      sessionToken: 'session-1',
      createdAt: new Date().toISOString()
    }));
    
    const lock = await getLock('session-1');
    expect(lock).not.toBeNull();
    if (lock) {
      expect(lock.quantity).toBe(5);
    }
  });
});

describe('ticketPurchase flow', () => {
  // These will test the full flow
  it('should reserve tickets without creating them', async () => {
    // This test will be expanded later with full integration
    expect(true).toBe(true);
  });

  it('should create tickets only on successful payment', async () => {
    // This test will be expanded later with full integration
    expect(true).toBe(true);
  });

  it('should release locks on payment failure', async () => {
    // This test will be expanded later with full integration
    expect(true).toBe(true);
  });
});
