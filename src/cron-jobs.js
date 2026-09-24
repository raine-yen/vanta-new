// Cron job handlers — the actual logic for each scheduled task.
// Each handler receives (req, res) and sends a response.

const { getPool } = require('./lib/mysql-client');
const { fetchYahooPrices } = require('./lib/prices');
const { syncPredictions } = require('./lib/prediction-sync');
const { settleResolvedPredictions } = require('./lib/prediction-settle');
const { computeRanks } = require('./lib/ranks');

async function tick(req, res) {
  // Update live market prices from Yahoo Finance
  try {
    const pool = getPool();
    const prices = await fetchYahooPrices();
    for (const [symbol, data] of Object.entries(prices)) {
      await pool.execute(
        `INSERT INTO prices (symbol, price, prev_close, updated_at) VALUES (?, ?, ?, NOW(3))
         ON DUPLICATE KEY UPDATE price = VALUES(price), prev_close = VALUES(prev_close), updated_at = NOW(3)`,
        [symbol, data.price, data.prevClose]
      );
    }
    res.json({ ok: true, updated: Object.keys(prices).length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function snapshot(req, res) {
  // Snapshot current portfolio equity for leaderboard
  try {
    const pool = getPool();
    const [accounts] = await pool.execute(
      'SELECT id, user_id, cash, equity FROM accounts WHERE status = "active"'
    );
    for (const acc of accounts) {
      await pool.execute(
        'INSERT INTO leaderboard_snapshot (account_id, equity, snapshot_at) VALUES (?, ?, NOW(3))',
        [acc.id, acc.equity]
      );
    }
    res.json({ ok: true, snapshot: accounts.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function predictions(req, res) {
  // Sync prediction markets from Polymarket
  try {
    const pool = getPool();
    const markets = await syncPredictions(pool);
    res.json({ ok: true, synced: markets });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

async function predictionsSettle(req, res) {
  // Settle resolved prediction markets
  try {
    const pool = getPool();
    const settled = await settleResolvedPredictions(pool);
    res.json({ ok: true, settled });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
}

module.exports = { tick, snapshot, predictions, predictionsSettle };