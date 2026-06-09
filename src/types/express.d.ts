import type { Buffer } from 'node:buffer';

declare module 'express-serve-static-core' {
  interface Request {
    // Keep flexible since current codebase attaches decoded auth user object directly.
    user?: any;
    /**
     * Raw request body bytes (captured during JSON parsing).
     * Needed for verifying provider webhook signatures.
     */
    rawBody?: Buffer;
  }
}

export {};