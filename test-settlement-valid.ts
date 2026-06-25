// Test with valid data
import { Queue } from 'bullmq';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

const settlementQueue = new Queue('settlement', {
  connection: redisConfig,
});

async function testValidSettlement() {
  try {
    console.log('📦 Testing Settlement Queue with valid data...');
    
    // Add a job with valid data
    const job = await settlementQueue.add('settlement-valid', {
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      entity: 'merchant',
    });
    
    console.log('✅ Job added with ID:', job.id);
    console.log('📊 Job data:', job.data);
    
    await settlementQueue.close();
    console.log('✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
  }
}

testValidSettlement();
