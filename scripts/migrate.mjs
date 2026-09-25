#!/usr/bin/env node
// Migration runner — applies database/migrations/ in order.
// Records SHA-256 checksums in schema_migrations; refuses to re-apply
// edited migrations. MySQL 8 required (JSON columns, DATETIME(3)).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- MySQL connection (loaded lazily) ----
let pool = null;

async function getPool() {
  if (pool) return pool;
  const mysql = await import('mysql2/promise');
  const host = process.env.DB_HOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || '3306', 10);
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  if (!database || !user || !password) {
    throw new Error('DB_NAME, DB_USER, DB_PASSWORD required');
  }
  pool = mysql.createPool({ host, port, database, user, password, waitForConnections: true, connectionLimit: 10 });
  return pool;
}

// ---- Migration logic ----
async function main() {
  const pool = await getPool();

  // Create schema_migrations table if not exists
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id CHAR(36) PRIMARY KEY,
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB
  `);

  const migrationsDir = path.join(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const filepath = path.join(migrationsDir, file);
    const content = fs.readFileSync(filepath, 'utf8');
    const checksum = crypto.createHash('sha256').update(content).digest('hex');

    // Check if already applied
    const [rows] = await pool.execute('SELECT id FROM schema_migrations WHERE filename = ?', [file]);
    if (rows.length > 0) {
      const applied = rows[0];
      if (applied.checksum === checksum) {
        console.log(`Skipped ${file} (unchanged)`);
        continue;
      } else {
        console.error(`ERROR: ${file} was already applied with a different checksum!`);
        console.error(`  Applied: ${applied.checksum}`);
        console.error(`  Current: ${checksum}`);
        process.exit(1);
      }
    }

    // Apply migration
    console.log(`Applying ${file}...`);
    const statements = content.split(';').filter(s => s.trim().length > 0);
    let transaction;
    try {
      transaction = await pool.getConnection();
      await transaction.beginTransaction();

      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed.length === 0 || trimmed.startsWith('--')) continue;
        await transaction.execute(trimmed);
      }

      await transaction.commit();

      // Record in schema_migrations
      const id = crypto.randomBytes(18).toString('hex');
      await pool.execute('INSERT INTO schema_migrations (id, filename, checksum) VALUES (?, ?, ?)', [id, file, checksum]);
      console.log(`Applied ${file}`);
    } catch (err) {
      if (transaction) await transaction.rollback();
      console.error(`ERROR applying ${file}: ${err.message}`);
      process.exit(1);
    }
  }

  console.log('All migrations applied.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});