// Preloaded before each test file (via `node --import`).
// Points the JSON stores at a throwaway, per-process temp directory so tests
// never touch the repo's ./data folder, and start from a clean slate.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), `teamgpt-test-${process.pid}`);
try {
  fs.rmSync(dir, { recursive: true, force: true });
} catch {
  /* ignore */
}
fs.mkdirSync(dir, { recursive: true });

process.env.DATA_DIR = dir;
process.env.GATEWAY_URL = 'http://localhost:9';
process.env.GATEWAY_API_KEY = 'test-key';
process.env.DEFAULT_MODEL = 'mock-gpt';
process.env.AVAILABLE_MODELS = 'mock-gpt,gpt-4o-mini';
process.env.ADMIN_EMAIL = 'admin@example.com';
process.env.ADMIN_PASSWORD = 'change-me-now';

// Best-effort cleanup when the test process exits.
process.on('exit', () => {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});
