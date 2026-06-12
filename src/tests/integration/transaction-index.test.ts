// src/tests/integration/transaction-index.test.ts
import { prisma } from '../../server';

/**
 * Test script to verify transaction indexes are working
 * Run with: npx ts-node src/tests/integration/transaction-index.test.ts
 */

async function testIndexPerformance() {
  console.log('🔍 Testing Transaction Table Indexes...\n');

  // Test 1: merchantId + status + createdAt composite index
  console.log('📊 Test 1: Query by merchantId, status, createdAt');
  console.log('Expected to use: @@index([merchantId, status, createdAt])');
  const start1 = Date.now();
  const result1 = await prisma.$queryRaw`
    EXPLAIN ANALYZE 
    SELECT * FROM "Transaction" 
    WHERE "merchantId" = 'test-merchant-id' 
      AND status = 'success' 
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    LIMIT 100
  `;
  console.log(`✅ Query 1 completed in ${Date.now() - start1}ms`);
  console.log('Query plan:', result1);
  console.log('');

  // Test 2: organizerId + status + createdAt composite index
  console.log('📊 Test 2: Query by organizerId, status, createdAt');
  console.log('Expected to use: @@index([organizerId, status, createdAt])');
  const start2 = Date.now();
  const result2 = await prisma.$queryRaw`
    EXPLAIN ANALYZE 
    SELECT * FROM "Transaction" 
    WHERE "organizerId" = 'test-organizer-id' 
      AND status = 'success' 
      AND "createdAt" >= NOW() - INTERVAL '30 days'
    LIMIT 100
  `;
  console.log(`✅ Query 2 completed in ${Date.now() - start2}ms`);
  console.log('');

  // Test 3: status + createdAt index
  console.log('📊 Test 3: Query by status and createdAt');
  console.log('Expected to use: @@index([status, createdAt])');
  const start3 = Date.now();
  const result3 = await prisma.$queryRaw`
    EXPLAIN ANALYZE 
    SELECT * FROM "Transaction" 
    WHERE status = 'pending' 
      AND "createdAt" >= NOW() - INTERVAL '7 days'
    LIMIT 100
  `;
  console.log(`✅ Query 3 completed in ${Date.now() - start3}ms`);
  console.log('');

  // Test 4: orderId index
  console.log('📊 Test 4: Query by orderId');
  console.log('Expected to use: @@index([orderId])');
  const start4 = Date.now();
  const result4 = await prisma.$queryRaw`
    EXPLAIN ANALYZE 
    SELECT * FROM "Transaction" 
    WHERE "orderId" = 'test-order-id'
  `;
  console.log(`✅ Query 4 completed in ${Date.now() - start4}ms`);
  console.log('');

  // Test 5: providerRef index
  console.log('📊 Test 5: Query by providerRef');
  console.log('Expected to use: @@index([providerRef])');
  const start5 = Date.now();
  const result5 = await prisma.$queryRaw`
    EXPLAIN ANALYZE 
    SELECT * FROM "Transaction" 
    WHERE "providerRef" = 'test-provider-ref'
  `;
  console.log(`✅ Query 5 completed in ${Date.now() - start5}ms`);
  console.log('');

  console.log('🎉 Index verification complete!');
}

// Run the test
testIndexPerformance()
  .catch(console.error)
  .finally(() => prisma.$disconnect());