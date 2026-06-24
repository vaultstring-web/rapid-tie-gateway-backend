// This only tests the queue, not the worker
import { Queue } from 'bullmq';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

// Create the settlement queue
const settlementQueue = new Queue('settlement', {
  connection: redisConfig,
});

async function testSettlement() {
  try {
    console.log('📦 Testing Settlement Queue...');
    
    // Add a job with invalid data to trigger error
    const job = await settlementQueue.add('settlement-test', {
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-02'),
      entity: 'invalid',
    });
    
    console.log('✅ Job added with ID:', job.id);
    console.log('📊 Job data:', job.data);
    
    // Get queue counts
    const counts = await settlementQueue.getJobCounts();
    console.log('📊 Settlement Queue counts:', counts);
    
    // Close the queue
    await settlementQueue.close();
    console.log('✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

testSettlement();
