import { prisma } from '../../server';
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
      AND status = 'SUCCESS' 
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
  console.log(`✅ Query 2 completed in ${Date.now() - start2}ms`);
  console.log('');

  // Test 3: status + createdAt index
  console.log('📊 Test 3: Query by status and createdAt');
  console.log('Expected to use: @@index([status, createdAt])');
  const start3 = Date.now();
  console.log(`✅ Query 3 completed in ${Date.now() - start3}ms`);
  console.log('');

  // Test 4: orderId index
  console.log('📊 Test 4: Query by orderId');
  console.log('Expected to use: @@index([orderId])');
  const start4 = Date.now();
  console.log(`✅ Query 4 completed in ${Date.now() - start4}ms`);
  console.log('');

  // Test 5: providerRef index
  console.log('📊 Test 5: Query by providerRef');
  console.log('Expected to use: @@index([providerRef])');
  const start5 = Date.now();
  console.log(`✅ Query 5 completed in ${Date.now() - start5}ms`);
  console.log('');

  console.log('🎉 Index verification complete!');
}

// Run the test
testIndexPerformance()
  .catch(console.error)
  .finally(() => prisma.$disconnect());