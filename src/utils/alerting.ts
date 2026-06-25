import { logger } from './logger';

// Slack webhook URL (set in environment variables)
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

/**
 * Send alert to Slack webhook
 */
export async function sendSlackAlert(message: string, severity: 'info' | 'warning' | 'error' = 'error') {
  if (!SLACK_WEBHOOK_URL) {
    logger.warn('SLACK_WEBHOOK_URL not configured - alerts will only be logged');
    return;
  }

  try {
    const emoji = severity === 'error' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
    const payload = {
      text: `${emoji} *${severity.toUpperCase()}*: ${message}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${severity.toUpperCase()}*: ${message}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `Environment: ${process.env.NODE_ENV || 'development'} • Time: ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    };

    const response = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logger.error('Failed to send Slack alert', { status: response.statusText });
    }
  } catch (error) {
    logger.error('Error sending Slack alert', { error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

/**
 * Log and alert on queue failure
 */
export async function notifyQueueFailure(
  queueName: string,
  jobId: string | number,
  error: Error,
  attempts: number,
  jobData?: any
) {
  const errorMessage = `Queue "${queueName}" job failed - Job ID: ${jobId}, Attempts: ${attempts}`;
  const details = `Error: ${error.message}\nStack: ${error.stack}\nData: ${JSON.stringify(jobData, null, 2)}`;
  
  // Log to file (with 2 arguments - message and metadata)
  logger.error(`🔴 ${errorMessage}`, { details, queueName, jobId, attempts });
  logger.error('Queue failure details', { details });

  // Send alert
  await sendSlackAlert(
    `${errorMessage}\n\`\`\`${error.message}\`\`\``,
    'error'
  );

  // Also log to console
  console.error(`[QUEUE ERROR] ${errorMessage}`);
  console.error(`[QUEUE ERROR] ${details}`);
}

/**
 * Alert on queue connection failure
 */
export async function notifyQueueConnectionFailure(queueName: string, error: Error) {
  const message = `Queue "${queueName}" connection failed: ${error.message}`;
  
  // Log to file
  logger.error(`🔴 ${message}`, { queueName, error: error.message });
  
  // Send alert
  await sendSlackAlert(
    `🚨 *Queue Connection Failure*\nQueue: ${queueName}\nError: ${error.message}`,
    'error'
  );
}