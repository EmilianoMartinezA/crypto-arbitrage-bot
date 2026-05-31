import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@arbitrage/shared': './packages/shared/src/index.ts',
    },
  },
});
