// MySQL client module — shared pool for all route handlers.
// Connection string from environment variables; never committed.

let pool = null;

function getPool() {
  if (pool) return pool;
  const mysql = require('mysql2/promise');
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (!database || !user || !password) {
    throw new Error('MySQL credentials missing: DB_NAME, DB_USER, DB_PASSWORD required');
  }
  pool = mysql.createPool({
    host,
    port,
    database,
    user,
    password,
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4',
  });
  return pool;
}

function healthCheck() {
  return getPool().execute('SELECT 1');
}

// Generate CHAR(36) ID (compatible with Supabase UUID format)
function generateId() {
  return require('crypto').randomBytes(18).toString('hex');
}

module.exports = { getPool, healthCheck, generateId };