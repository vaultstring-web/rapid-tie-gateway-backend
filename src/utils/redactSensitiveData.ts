/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'sessionToken',
  'providerRef',
  'customerPhone',
  'phone',
  'cardToken',
  'card_number',
  'cvv',
  'cvc',
  'expiry',
  'expiration',
  'secret',
  'apiKey',
  'api_key',
  'authorization',
  'refreshToken',
  'refresh_token',
  'twoFactorSecret',
  'twoFactorBackupCodes',
  'backupCodes',
  'resetToken',
  'verificationToken',
];

/**
 * Recursively redact sensitive fields from an object
 */
export function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item));
  }

  const redacted: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    // Check if this key is sensitive (case insensitive)
    const isSensitive = SENSITIVE_FIELDS.some(
      field => key.toLowerCase() === field.toLowerCase()
    );
    
    if (isSensitive && value) {
      redacted[key] = '***REDACTED***';
    } else if (value && typeof value === 'object') {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  
  return redacted;
}

/**
 * full body logging should be enabled
 */
export function shouldLogFullBody(): boolean {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  // Log full body only in development with debug log level
  return isDevelopment && logLevel === 'debug';
}

/**
 * Get safe log level for body logging
 */
export function getBodyLogLevel(): 'full' | 'redacted' | 'none' {
  const logLevel = process.env.LOG_LEVEL || 'info';
  const isProduction = process.env.NODE_ENV === 'production';
  
  if (isProduction) {
    return 'none'; 
  }
  
  if (logLevel === 'debug') {
    return 'full'; // Full body in debug mode (development)
  }
  
  return 'redacted'; // Redacted body by default
}