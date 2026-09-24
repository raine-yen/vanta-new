// Vanta Paper Trader — Express API routes (MySQL backend).
// Replaces all 43 Next.js API routes with MySQL queries.
// Follows Alpaca-style API key auth + session auth pattern.

const express = require('express');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { getPool, generateId, healthCheck } = require('./lib/mysql-client');
const {
  verifySession, verifyApiKey, promoteUser,
  hashPassword,
} = require('./lib/auth-mysql');
const { fetchYahooPrices, getPrice } = require('./lib/prices');
const { placeOrder } = require('./lib/engine');
const { syncPredictions } = require('./lib/prediction-sync');
const { settleResolvedPredictions } = require('./lib/prediction-settle');
const { computeRanks } = require('./lib/ranks');

function cleanText(text, maxLen) {
  if (!text || typeof text !== 'string') return null;
  return text.trim().slice(0, maxLen) || null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function alpacaCredentials(req) {
  const keyId = req.get('apca-api-key-id') || req.get('APCA-API-KEY-ID');
  const secret = req.get('apca-api-secret-key') || req.get('APCA-API-SECRET-KEY');
  if (keyId && secret) return { keyId, secret };
  const basic = req.get('authorization')?.match(/^Basic\s+(.+)$/i)?.[1];
  if (!basic) return null;
  const decoded = Buffer.from(basic, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep <= 0 || sep === decoded.length - 1) return null;
  return { keyId: decoded.slice(0, sep), secret: decoded.slice(sep + 1) };
}

function sessionAuth(req) {
  const auth = req.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    return verifySession(auth.slice(7));
  }
  return null;
}

function apiKeyAuth(req) {
  const creds = alpacaCredentials(req);
  if (!creds) return null;
  return verifyApiKey(creds.keyId, creds.secret);
}

// Auth middleware
function requireAuth(req, res, next) {
  return sessionAuth(req).then(user => {
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  });
}

function requireApiKey(req, res, next) {
  return apiKeyAuth(req).then(key => {
    if (!key) return res.status(401).json({ error: 'Invalid API key' });
    req.apiKey = key;
    next();
  });
}

function requireAdmin(req, res, next) {
  return requireAuth(req, res, next).then(() => {
    if (req.user.role !== 'owner' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

const router = express.Router();

// ---- Health ----
router.get('/health', async (req, res) => {
  try { await healthCheck(); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// ---- Auth ----
router.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, displayName } = req.body || {};
    const result = await require('lib/auth-mysql').signUp(email, password, displayName);
    res.status(201).json({ ok: true, userId: result.userId, token: result.token });
  } catch (err) {
    res.status(422).json({ error: err.message });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const result = await require('lib/auth-mysql').signIn(email, password);
    res.json({ ok: true, userId: result.userId, token: result.token, displayName: result.displayName, role: result.role });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

router.post('/api/auth/logout', requireAuth, async (req, res) => {
  const auth = req.get('Authorization') || '';
  await require('lib/auth-mysql').signOut(auth.slice(7));
  res.json({ ok: true });
});

router.post('/api/auth/refresh', async (req, res) => {
  const auth = req.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const result = await require('lib/auth-mysql').refreshSession(auth.slice(7));
  res.json({ ok: true, token: result.token });
});

router.post('/api/auth/google', async (req, res) => {
  try {
    const { googleId, email, displayName } = req.body || {};
    const result = await require('lib/auth-mysql').googleOAuthCallback(googleId, email, displayName);
    res.json({ ok: true, userId: result.userId, token: result.token, isNew: result.isNew });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Me ----
router.get('/api/me', requireAuth, async (req, res) => {
  const pool = getPool();
  const [accounts] = await pool.execute(
    'SELECT a.*, c.name as competition_name FROM accounts a JOIN competitions c ON a.competition_id = c.id WHERE a.user_id = ?',
    [req.user.userId]
  );
  res.json({
    userId: req.user.userId,
    email: req.user.email,
    displayName: req.user.displayName,
    role: req.user.role,
    accounts: accounts || [],
  });
});

// ---- Competitions ----
router.get('/api/competitions', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM competitions ORDER BY is_default DESC, created_at DESC');
  res.json(rows || []);
});

router.get('/api/competitions/:id', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.execute('SELECT * FROM competitions WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

// ---- Leaderboard ----
router.get('/api/leaderboard', async (req, res) => {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT a.id, a.user_id, a.display_name, a.cash, a.equity, a.status,
            c.name as competition_name
     FROM accounts a
     JOIN competitions c ON a.competition_id = c.id
     WHERE a.status = 'active'
     ORDER BY a.equity DESC
     LIMIT 100`
  );
  res.json(rows || []);
});

router.get('/api/rank', requireAuth, async (req, res) => {
  const pool = getPool();
  const [ranks] = await pool.execute(
    'SELECT * FROM ranks WHERE account_id = ? ORDER BY rank_points DESC',
    [req.user.userId]
  );
  res.json(ranks || []);
});

// ---- Quote ----
router.get('/api/quote', async (req, res) => {
  try {
    const symbol = (req.query.symbol || '').toUpperCase();
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const price = await getPrice(symbol, { forceLive: true });
    if (!price) return res.status(404).json({ error: 'Unknown symbol' });
    res.json(price);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/quotes', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    if (!symbols.length) return res.status(400).json({ error: 'symbols required' });
    const prices = await require('lib/prices').fetchYahooPrices(symbols);
    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Live market ----
router.get('/api/live', async (req, res) => {
  try {
    const symbols = (req.query.symbols || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const prices = await require('lib/prices').fetchYahooPrices(symbols);
    res.json(prices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Chart ----
router.get('/api/chart', async (req, res) => {
  try {
    const symbol = (req.query.symbol || '').toUpperCase();
    const range = req.query.range || '1mo';
    if (!symbol) return res.status(400).json({ error: 'symbol required' });
    const data = await require('lib/prices').getHistoricalPrices(symbol, range);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Trade (place order) ----
router.post('/api/trade', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const account = await getAccountForUser(req.user.userId);
    if (!account) return res.status(404).json({ error: 'No account found' });

    const result = await placeOrder({
      account,
      symbol: (body.symbol || '').toUpperCase(),
      qty: Number(body.qty),
      side: body.side,
      type: body.type || 'market',
      limit_price: body.limit_price,
      time_in_force: body.time_in_force || 'gtc',
      client_order_id: body.client_order_id || generateId(),
    });

    if (!result.ok) return res.status(422).json({ error: result.error });
    res.json({ ok: true, order: result.order });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/trader/:accountId', async (req, res) => {
  const pool = getPool();
  const [accounts] = await pool.execute(
    'SELECT * FROM accounts WHERE id = ?', [req.params.accountId]
  );
  if (!accounts.length) return res.status(404).json({ error: 'Not found' });

  const [orders] = await pool.execute(
    'SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.params.accountId]
  );
  const [positions] = await pool.execute(
    'SELECT * FROM positions WHERE account_id = ?', [req.params.accountId]
  );
  const [ledger] = await pool.execute(
    'SELECT * FROM ledger WHERE account_id = ? ORDER BY created_at DESC LIMIT 100',
    [req.params.accountId]
  );

  res.json({ account: accounts[0], orders, positions, ledger });
});

// ---- Account ----
router.get('/api/account', requireAuth, async (req, res) => {
  const pool = getPool();
  const [accounts] = await pool.execute(
    'SELECT * FROM accounts WHERE user_id = ?', [req.user.userId]
  );
  res.json(accounts || []);
});

// ---- Keys ----
router.get('/api/keys', requireAuth, async (req, res) => {
  const pool = getPool();
  const [keys] = await pool.execute(
    'SELECT id, key_id, label, last_used_at, revoked_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.userId]
  );
  res.json(keys || []);
});

router.post('/api/keys', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const body = req.body || {};
    const accountId = body.accountId || (await getAccountIdForUser(req.user.userId));
    const keyId = generateId().slice(0, 16);
    const secret = generateId();
    const secretHash = hashPassword(secret);
    const id = generateId();

    await pool.execute(
      'INSERT INTO api_keys (id, user_id, account_id, key_id, secret_hash, label, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW(3))',
      [id, req.user.userId, accountId, keyId, secretHash, cleanText(body.label, 80)]
    );
    res.status(201).json({ ok: true, keyId, secret });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/keys/:id', requireAuth, async (req, res) => {
  const pool = getPool();
  const [keys] = await pool.execute(
    'SELECT * FROM api_keys WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.userId]
  );
  if (!keys.length) return res.status(404).json({ error: 'Not found' });
  res.json(keys[0]);
});

router.delete('/api/keys/:id', requireAuth, async (req, res) => {
  const pool = getPool();
  await pool.execute(
    'UPDATE api_keys SET revoked_at = NOW(3) WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.userId]
  );
  res.json({ ok: true });
});

// ---- Predictions ----
router.get('/api/prediction-markets', async (req, res) => {
  const pool = getPool();
  const [markets] = await pool.execute(
    'SELECT * FROM prediction_markets WHERE status = ? ORDER BY volume_24h DESC LIMIT 50',
    ['active']
  );
  res.json(markets || []);
});

router.get('/api/prediction-markets/:id', async (req, res) => {
  const pool = getPool();
  const [markets] = await pool.execute(
    'SELECT * FROM prediction_markets WHERE id = ?', [req.params.id]
  );
  if (!markets.length) return res.status(404).json({ error: 'Not found' });
  res.json(markets[0]);
});

router.get('/api/prediction-markets/:id/history', async (req, res) => {
  const pool = getPool();
  const [history] = await pool.execute(
    'SELECT * FROM prediction_fills WHERE market_id = ? ORDER BY created_at DESC LIMIT 50',
    [req.params.id]
  );
  res.json(history || []);
});

router.post('/api/predictions/trade', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const account = await getAccountForUser(req.user.userId);
    if (!account) return res.status(404).json({ error: 'No account found' });

    const pool = getPool();
    const { marketId, outcome, shares, price, clientOrderId } = body;
    if (!marketId || !outcome || !shares || !price) {
      return res.status(422).json({ error: 'marketId, outcome, shares, price required' });
    }

    // Check cash
    if (outcome === 'yes' && price > 0) {
      const cost = shares * price;
      if (cost > account.cash) return res.status(422).json({ error: 'Insufficient cash' });
    }

    // Place position
    await pool.execute(
      `INSERT INTO prediction_positions (id, account_id, market_id, outcome, shares, avg_cost, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))
       ON DUPLICATE KEY UPDATE shares = shares + VALUES(shares), avg_cost = ((avg_cost * (shares - VALUES(shares)) + VALUES(shares) * VALUES(avg_cost)) / shares)`,
      [generateId(), account.id, marketId, outcome, shares, price]
    );

    // Record fill
    await pool.execute(
      'INSERT INTO prediction_fills (id, account_id, market_id, outcome, side, shares, price, total, cash_after, client_order_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
      [generateId(), account.id, marketId, outcome, 'buy', shares, price, shares * price, account.cash - (shares * price), clientOrderId || generateId()]
    );

    // Update cash
    await pool.execute(
      'UPDATE accounts SET cash = cash - ? WHERE id = ?',
      [shares * price, account.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/predictions/close', requireAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const account = await getAccountForUser(req.user.userId);
    const pool = getPool();
    const { marketId, outcome } = body;
    if (!marketId || !outcome) return res.status(422).json({ error: 'marketId, outcome required' });

    const [positions] = await pool.execute(
      'SELECT * FROM prediction_positions WHERE account_id = ? AND market_id = ? AND outcome = ?',
      [account.id, marketId, outcome]
    );
    if (!positions.length) return res.status(404).json({ error: 'No position found' });

    const pos = positions[0];
    await pool.execute(
      'UPDATE prediction_positions SET shares = 0 WHERE id = ?', [pos.id]
    );
    await pool.execute(
      'INSERT INTO prediction_fills (id, account_id, market_id, outcome, side, shares, price, total, cash_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
      [generateId(), account.id, marketId, outcome, 'close', pos.shares, pos.avg_cost, pos.shares * pos.avg_cost, account.cash + (pos.shares * pos.avg_cost)]
    );
    await pool.execute(
      'UPDATE accounts SET cash = cash + ? WHERE id = ?',
      [pos.shares * pos.avg_cost, account.id]
    );

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/predictions/refresh', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const markets = await syncPredictions(pool);
    res.json({ ok: true, synced: markets });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/predictions/settle', requireAuth, async (req, res) => {
  try {
    const pool = getPool();
    const settled = await settleResolvedPredictions(pool);
    res.json({ ok: true, settled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Orders ----
router.get('/api/orders', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [orders] = await pool.execute(
    'SELECT * FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 100',
    [account.id]
  );
  res.json(orders || []);
});

// ---- Positions ----
router.get('/api/positions', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [positions] = await pool.execute(
    'SELECT * FROM positions WHERE account_id = ?', [account.id]
  );
  res.json(positions || []);
});

// ---- Watchlists ----
router.get('/api/watchlists', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [list] = await pool.execute(
    'SELECT * FROM watchlists WHERE account_id = ? ORDER BY created_at DESC',
    [account.id]
  );
  res.json(list || []);
});

router.post('/api/watchlists', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const body = req.body || {};
  await pool.execute(
    'INSERT INTO watchlists (id, account_id, symbol, note, created_at) VALUES (?, ?, ?, ?, NOW(3))',
    [generateId(), account.id, (body.symbol || '').toUpperCase(), cleanText(body.note, 500)]
  );
  res.status(201).json({ ok: true });
});

// ---- Businesses ----
router.get('/api/businesses', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [list] = await pool.execute(
    'SELECT * FROM businesses WHERE account_id = ? AND is_active = true ORDER BY created_at DESC',
    [account.id]
  );
  res.json(list || []);
});

router.post('/api/businesses', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const body = req.body || {};
  await pool.execute(
    'INSERT INTO businesses (id, account_id, name, description, category, website, contact_email, contact_phone, address, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))',
    [generateId(), account.id, cleanText(body.name, 200), cleanText(body.description, 2000), cleanText(body.category, 100), cleanText(body.website, 500), cleanText(body.contactEmail, 254), cleanText(body.contactPhone, 50), cleanText(body.address, 500), cleanText(body.notes, 2000)]
  );
  res.status(201).json({ ok: true });
});

router.get('/api/businesses/:id', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [list] = await pool.execute(
    'SELECT * FROM businesses WHERE id = ? AND account_id = ?',
    [req.params.id, account.id]
  );
  if (!list.length) return res.status(404).json({ error: 'Not found' });
  res.json(list[0]);
});

// ---- Quests ----
router.get('/api/quests', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [quests] = await pool.execute(
    'SELECT * FROM challenges WHERE account_id = ? ORDER BY created_at DESC',
    [account.id]
  );
  res.json(quests || []);
});

// ---- Messages ----
router.get('/api/messages', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [msgs] = await pool.execute(
    'SELECT * FROM messages WHERE account_id = ? ORDER BY created_at DESC LIMIT 50',
    [account.id]
  );
  res.json(msgs || []);
});

// ---- Social ----
router.post('/api/social/block', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const body = req.body || {};
  await pool.execute(
    'INSERT INTO social_blocks (id, blocker_account_id, blocked_account_id, created_at) VALUES (?, ?, ?, NOW(3))',
    [generateId(), account.id, body.targetAccountId]
  );
  res.json({ ok: true });
});

router.post('/api/social/report', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const body = req.body || {};
  await pool.execute(
    'INSERT INTO social_reports (id, reporter_account_id, target_account_id, reason, created_at) VALUES (?, ?, ?, ?, NOW(3))',
    [generateId(), account.id, body.targetAccountId, cleanText(body.reason, 500)]
  );
  res.json({ ok: true });
});

// ---- Alerts ----
router.get('/api/alerts', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const [alerts] = await pool.execute(
    'SELECT * FROM alerts WHERE account_id = ? ORDER BY created_at DESC LIMIT 50',
    [account.id]
  );
  res.json(alerts || []);
});

// ---- Admin ----
router.get('/api/admin', requireAdmin, async (req, res) => {
  const pool = getPool();
  const [users] = await pool.execute('SELECT id, email, display_name, role, created_at FROM users ORDER BY created_at DESC LIMIT 50');
  const [competitions] = await pool.execute('SELECT id, name, status FROM competitions');
  res.json({ users, competitions });
});

router.post('/api/admin', requireAdmin, async (req, res) => {
  const body = req.body || {};
  if (body.action === 'promote' && body.email && body.role) {
    await promoteUser(body.email, body.role);
    return res.json({ ok: true });
  }
  res.status(422).json({ error: 'Unknown admin action' });
});

// ---- Assets (instruments) ----
router.get('/api/instruments/search', async (req, res) => {
  const pool = getPool();
  const q = (req.query.q || '').toUpperCase();
  const [assets] = await pool.execute(
    'SELECT symbol, name, sector, industry FROM assets WHERE symbol LIKE ? OR name LIKE ? LIMIT 20',
    [q + '%', '%' + q + '%']
  );
  res.json(assets || []);
});

// ---- Profile/avatar ----
router.post('/api/profile/avatar', requireAuth, async (req, res) => {
  const pool = getPool();
  const account = await getAccountForUser(req.user.userId);
  if (!account) return res.status(404).json({ error: 'No account' });
  const body = req.body || {};
  await pool.execute('UPDATE accounts SET display_name = ? WHERE id = ?', [cleanText(body.displayName, 120), account.id]);
  res.json({ ok: true });
});

// ---- Cron health check (no auth) ----
router.get('/api/cron/health', async (req, res) => {
  res.json({ ok: true });
});

// ---- Cron endpoints (require CRON_SECRET Bearer auth) ----
router.post('/api/cron/tick', requireCronAuth, async (req, res, next) => {
  try { await tickCron(req, res); } catch (e) { next(e); }
});
router.post('/api/cron/snapshot', requireCronAuth, async (req, res, next) => {
  try { await snapshotCron(req, res); } catch (e) { next(e); }
});
router.post('/api/cron/predictions', requireCronAuth, async (req, res, next) => {
  try { await predictionsCron(req, res); } catch (e) { next(e); }
});
router.post('/api/cron/predictions-settle', requireCronAuth, async (req, res, next) => {
  try { await settleCron(req, res); } catch (e) { next(e); }
});

// ---- Helper functions ----
async function getAccountForUser(userId) {
  const pool = getPool();
  const [accounts] = await pool.execute('SELECT * FROM accounts WHERE user_id = ? AND status = "active" LIMIT 1', [userId]);
  return accounts.length > 0 ? accounts[0] : null;
}

async function getAccountIdForUser(userId) {
  const acc = await getAccountForUser(userId);
  return acc ? acc.id : null;
}

module.exports = router;