/**
 * Manual test: Unauthenticated Socket.IO Room Join
 *
 * Verifies that:
 *  1. The old `join-notifications` event no longer allows room access.
 *  2. Authenticating with an invalid/missing token is rejected with `auth-error`.
 *  3. Only the `authenticate` event with a valid JWT grants room membership.
 *
 * Prerequisites:
 *   - The server must be running (`npm run dev`).
 *   - socket.io-client must be installed (`npm i -D socket.io-client`).
 *
 * Run:
 *   npx ts-node src/tests/socket-auth.test.ts
 */

import { io as ioClient, Socket } from 'socket.io-client';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3001';
const TIMEOUT_MS = 4000;

// ── helpers ──────────────────────────────────────────────────────────────

function connect(): Socket {
  return ioClient(SERVER_URL, {
    transports: ['websocket'],
    autoConnect: false,
  });
}

type TestResult = { name: string; passed: boolean; detail: string };
const results: TestResult[] = [];

// ── tests ────────────────────────────────────────────────────────────────

async function testJoinNotificationsRemoved(): Promise<TestResult> {
  const name = 'join-notifications event is removed (no room join)';
  const socket = connect();

  return new Promise((resolve) => {
    let receivedNotification = false;

    socket.on('connect', () => {
      // Attempt the old, now-deleted event
      socket.emit('join-notifications', 'test-user-id-12345');

      // Listen for any notification that would prove we joined the room
      socket.on('new-notification', () => {
        receivedNotification = true;
      });

      // Also check we don't get unread-count (that only comes from 'authenticate')
      socket.on('unread-count', () => {
        receivedNotification = true;
      });

      // Wait and then check
      setTimeout(() => {
        socket.disconnect();
        resolve({
          name,
          passed: !receivedNotification,
          detail: receivedNotification
            ? 'FAIL — received data after join-notifications (handler still exists?)'
            : 'OK — no room join occurred, event is gone',
        });
      }, TIMEOUT_MS);
    });

    socket.on('connect_error', (err) => {
      resolve({ name, passed: false, detail: `Connection error: ${err.message}` });
    });

    socket.connect();
  });
}

async function testAuthWithInvalidToken(): Promise<TestResult> {
  const name = 'authenticate with invalid token is rejected';
  const socket = connect();

  return new Promise((resolve) => {
    let gotAuthError = false;
    let gotUnreadCount = false;

    socket.on('connect', () => {
      socket.on('auth-error', () => {
        gotAuthError = true;
      });

      socket.on('unread-count', () => {
        gotUnreadCount = true;
      });

      // Send a garbage token
      socket.emit('authenticate', 'this-is-not-a-valid-jwt-token');

      setTimeout(() => {
        socket.disconnect();
        if (gotAuthError && !gotUnreadCount) {
          resolve({ name, passed: true, detail: 'OK — received auth-error, no room join' });
        } else if (gotUnreadCount) {
          resolve({ name, passed: false, detail: 'FAIL — received unread-count with invalid token' });
        } else {
          resolve({ name, passed: false, detail: 'FAIL — no auth-error received (handler may be broken)' });
        }
      }, TIMEOUT_MS);
    });

    socket.on('connect_error', (err) => {
      resolve({ name, passed: false, detail: `Connection error: ${err.message}` });
    });

    socket.connect();
  });
}

async function testAuthWithNoToken(): Promise<TestResult> {
  const name = 'authenticate with empty token is rejected';
  const socket = connect();

  return new Promise((resolve) => {
    let gotAuthError = false;
    let gotUnreadCount = false;

    socket.on('connect', () => {
      socket.on('auth-error', () => {
        gotAuthError = true;
      });

      socket.on('unread-count', () => {
        gotUnreadCount = true;
      });

      // Send an empty string as token
      socket.emit('authenticate', '');

      setTimeout(() => {
        socket.disconnect();
        if (gotAuthError && !gotUnreadCount) {
          resolve({ name, passed: true, detail: 'OK — received auth-error, no room join' });
        } else if (gotUnreadCount) {
          resolve({ name, passed: false, detail: 'FAIL — received unread-count with empty token' });
        } else {
          resolve({ name, passed: false, detail: 'FAIL — no auth-error received' });
        }
      }, TIMEOUT_MS);
    });

    socket.on('connect_error', (err) => {
      resolve({ name, passed: false, detail: `Connection error: ${err.message}` });
    });

    socket.connect();
  });
}

// ── runner ────────────────────────────────────────────────────────────────

async function run() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  Socket.IO Auth — Manual Security Test          ║');
  console.log(`║  Server: ${SERVER_URL.padEnd(39)} ║`);
  console.log('╚══════════════════════════════════════════════════╝\n');

  const tests = [
    testJoinNotificationsRemoved,
    testAuthWithInvalidToken,
    testAuthWithNoToken,
  ];

  for (const testFn of tests) {
    const result = await testFn();
    results.push(result);
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon}  ${result.name}`);
    console.log(`    ${result.detail}\n`);
  }

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log('──────────────────────────────────────────────────');
  console.log(`Results: ${passed}/${total} passed`);

  if (passed === total) {
    console.log('🎉  All checks passed — unauthenticated room join is fixed.\n');
    process.exit(0);
  } else {
    console.log('⚠️   Some checks failed — review output above.\n');
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
