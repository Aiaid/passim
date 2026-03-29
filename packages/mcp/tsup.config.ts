import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin/passim-mcp.ts'],
  format: ['esm'],
  target: 'node20',
  outDir: 'dist/bin',
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
});
