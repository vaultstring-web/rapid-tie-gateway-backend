const inventoryLocks = new Map();

export const createLock = (sessionToken: string, data: any) => {
  inventoryLocks.set(sessionToken, data);
};

export const getLock = (sessionToken: string) => {
  return inventoryLocks.get(sessionToken);
};

export const removeLock = (sessionToken: string) => {
  inventoryLocks.delete(sessionToken);
};