// src/test/setup.ts
import { PrismaClient } from '@prisma/client';
import { mockDeep, mockReset, DeepMockProxy } from 'jest-mock-extended';

// Mock the prisma client - use the correct path
jest.mock('../../server', () => ({
  prisma: mockDeep<PrismaClient>(),
}));

// Import the mocked prisma
import { prisma } from '../src/server';

// Export the mocked prisma for use in tests
export const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

// Reset mocks before each test
beforeEach(() => {
  mockReset(prismaMock);
});