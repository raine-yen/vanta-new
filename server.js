// Vanta Paper Trader — Express entry point for Hostinger deployment.
// Starts the existing Next.js frontend on a private loopback port, then
// listens on the public PORT for /api/* and /v2/* Express routes.

const path = require('path');
const { exec } = require('child_process');

// ---- Run migrations first ----
// migrate.mjs is a standalone script; run it via child process
const migrateProc = exec(`node "${path.join(__dirname, 'scripts', 'migrate.mjs')}"`, {
  cwd: __dirname,
});

migrateProc.stdout.on('data', data => process.stdout.write(data));
migrateProc.stderr.on('data', data => process.stderr.write(data));

migrateProc.on('exit', code => {
  if (code !== 0) {
    console.error('Migration failed. Aborting.');
    process.exit(code);
  }
  console.log('Migrations complete. Starting Vanta...');
  startApp();
});

function startApp() {
  const express = require('express');
  const next = require('next');
  const { getPool, healthCheck } = require('./src/lib/mysql-client');

  // ---- Next.js dev/prod setup ----
  const dev = process.env.NODE_ENV !== 'production';
  const nextApp = next({ dev });
  const nextHandler = nextApp.getRequestHandler();

  // ---- Express app ----
  const app = express();

  // CORS middleware
  app.use((req, res, next) => {
    const origin = req.get('origin') || '';
    const allowed = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
    if (allowed.includes('*') || allowed.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin || '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, APCA-API-KEY-ID, APCA-API-SECRET-KEY');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '2mb' }));

  // ---- Health endpoint ----
  app.get('/health', async (req, res) => {
    try {
      await healthCheck();
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // ---- Cron endpoints ----
  const CRON_SECRET = process.env.CRON_SECRET;
  app.post('/api/cron/:job', (req, res) => {
    const auth = req.get('Authorization') || '';
    if (!auth.startsWith('Bearer ') || auth.slice(7) !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const job = req.params.job;
    const validJobs = ['tick', 'snapshot', 'predictions', 'predictions-settle'];
    if (!validJobs.includes(job)) {
      return res.status(404).json({ error: 'Unknown cron job' });
    }
    // Delegate to cron handler
    const cronHandler = require('./src/cron-jobs');
    const handler = cronHandler[job];
    if (!handler) {
      return res.status(500).json({ error: 'Cron handler not implemented' });
    }
    handler(req, res);
  });

  // ---- API routes ----
  const vantaRoutes = require('./src/vanta-routes');
  app.use('/api', vantaRoutes);

  // ---- /v2/* routes (legacy API compatibility) ----
  app.use('/v2', (req, res) => {
    res.redirect(301, `/api${req.path}`);
  });

  // ---- Next.js handler (everything else) ----
  app.get('*', (req, res) => {
    return nextHandler(req, res);
  });

  // ---- Start listening ----
  const publicPort = parseInt(process.env.PORT || '3000', 10);
  const nextPort = parseInt(process.env.NEXT_PORT || '3001', 10);

  // Start Next.js on private loopback port
  nextApp.prepare().then(() => {
    console.log(`Next.js starting on 127.0.0.1:${nextPort}`);
    const nextServer = express();
    nextServer.listen(nextPort, '127.0.0.1', () => {
      console.log(`Vanta Express API listening on port ${publicPort}`);
      app.listen(publicPort, () => {
        console.log(`Vanta Paper Trader ready — API: http://localhost:${publicPort}`);
      });
    });
  }).catch(err => {
    console.error('Next.js failed to start:', err);
    process.exit(1);
  });
}