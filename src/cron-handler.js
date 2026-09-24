#!/usr/bin/env node
// Cron job handler — called by hPanel cron with job name as argument.
// Sends Bearer token to the app's cron endpoint and exits nonzero on failure.

const https = require('https');
const http = require('http');
const url = require('url');

const job = process.argv[2];
if (!job) {
  console.error('Usage: node src/cron-handler.js <job>');
  process.exit(1);
}

const appUrl = process.env.APP_URL;
const cronSecret = process.env.CRON_SECRET;

if (!appUrl || !cronSecret) {
  console.error('APP_URL and CRON_SECRET required');
  process.exit(1);
}

const parsed = new URL(appUrl);
const isHttps = parsed.protocol === 'https:';
const transport = isHttps ? https : http;

const options = {
  hostname: parsed.hostname,
  port: parsed.port || (isHttps ? 443 : 80),
  path: `/api/cron/${job}`,
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${cronSecret}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
};

const req = transport.request(options, (res) => {
  let body = '';
  res.on('data', chunk => { body += chunk; });
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log(`Cron ${job}: OK (${res.statusCode})`);
      process.exit(0);
    } else {
      console.error(`Cron ${job}: FAILED (${res.statusCode}) — ${body}`);
      process.exit(1);
    }
  });
});

req.on('error', err => {
  console.error(`Cron ${job}: ERROR — ${err.message}`);
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  console.error(`Cron ${job}: TIMEOUT`);
  process.exit(1);
});

req.end();