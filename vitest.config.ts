import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/features/security/risk-engine.ts',
        'src/features/security/correlation.ts',
        'src/features/security/state-machine.ts'
      ],
      thresholds: {
        lines: 80,
        functions: 90,
        branches: 70,
        statements: 80
      }
    }
  }
});
