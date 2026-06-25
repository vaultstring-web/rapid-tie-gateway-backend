// This is a standalone test that doesn't import server
import { Queue } from 'bullmq';

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
};

// Create a test queue
const testQueue = new Queue('test-queue', {
  connection: redisConfig,
});

async function testQueueFunction() {
  try {
    console.log('📦 Testing BullMQ queue...');
    
    // Add a job
    const job = await testQueue.add('test-job', {
      test: 'data',
      timestamp: new Date().toISOString(),
    });
    
    console.log('✅ Job added with ID:', job.id);
    
    // Get queue counts
    const counts = await testQueue.getJobCounts();
    console.log('📊 Queue counts:', counts);
    
    // Close the queue
    await testQueue.close();
    console.log('✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    console.error('Full error:', error);
  }
}

testQueueFunction();
