import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { ensureSeedAdmin } from './services/users.js';
import { authRouter } from './routes/auth.js';
import { conversationsRouter } from './routes/conversations.js';
import { chatRouter } from './routes/chat.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
  });

  app.use('/api/auth', authRouter);
  app.use('/api', conversationsRouter);
  app.use('/api', chatRouter);
  app.use('/api/admin', adminRouter);

  app.use(express.static(publicDir));

  return app;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const admin = ensureSeedAdmin();
  if (admin) {
    console.log(`\n  Seed admin created: ${admin.email}`);
    console.log('  (set ADMIN_EMAIL / ADMIN_PASSWORD in .env before first boot)\n');
  }

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`  TeamGPT      →  http://localhost:${config.port}`);
    console.log(`  Gateway URL  →  ${config.gateway.url}`);
    console.log(`  Models       →  ${config.availableModels.join(', ')}\n`);
  });
}
