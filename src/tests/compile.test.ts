import { execSync } from 'child_process';
import path from 'path';

describe('TypeScript compile (pnpm run dev prerequisite)', () => {
  it('compiles the backend without TypeScript errors', () => {
    const backendRoot = path.resolve(__dirname, '../..');
    expect(() => {
      execSync('npx tsc --noEmit', {
        cwd: backendRoot,
        stdio: 'pipe',
        encoding: 'utf-8',
      });
    }).not.toThrow();
  });
});
