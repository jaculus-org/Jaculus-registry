#!/usr/bin/env node

// Lightweight ESM launcher that forwards to the compiled CLI in `dist`.
// Uses dynamic import so this file stays small and works with `type: "module"`.

import('../dist/cli.js').catch(err => {
  console.error('Failed to run jaculus-registry CLI:', err);
  process.exit(1);
});
