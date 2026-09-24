// MySQL session-based auth — replaces Supabase auth.users.
// Handles sign-in, sign-up, Google OAuth callback, logout, token refresh.

const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { getPool, generateId } = require('./mysql-client');

// ---- Helpers ----

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function cleanText(text, maxLen) {
  if (!text || typeof text !== 'string') return null;
  return text.trim().slice(0, maxLen) || null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

// ---- Auth operations ----

async function signUp(email, password, displayName) {
  const pool = getPool();
  if (!isValidEmail(email)) throw new Error('INVALID_EMAIL');
  if (!password || password.length < 8) throw new Error('PASSWORD_TOO_SHORT');
  if (!displayName || displayName.trim().length < 1) throw new Error('DISPLAY_NAME_REQUIRED');

  const userId = generateId();
  const passwordHash = hashPassword(password);
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Create user
    await conn.execute(
      'INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, NOW(3))',
      [userId, email.toLowerCase(), passwordHash, displayName.trim(), 'caller']
    );

    // Create session
    await conn.execute(
      'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, NOW(3))',
      [generateId(), userId, tokenHash, expiresAt]
    );

    // Auto-join default competition
    const [comps] = await conn.execute('SELECT id FROM competitions WHERE is_default = true LIMIT 1');
    if (comps.length > 0) {
      await conn.execute(
        'INSERT INTO accounts (id, user_id, competition_id, display_name, cash, starting_cash, equity, status, created_at) VALUES (?, ?, ?, ?, 10000, 10000, 10000, "active", NOW(3))',
        [generateId(), userId, comps[0].id, displayName.trim()]
      );
    }

    await conn.commit();
    return { ok: true, userId, token };
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') throw new Error('EMAIL_ALREADY_EXISTS');
    throw err;
  } finally {
    conn.release();
  }
}

async function signIn(email, password) {
  const pool = getPool();
  const [users] = await pool.execute(
    'SELECT id, email, password_hash, display_name, role FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );
  if (users.length === 0) throw new Error('INVALID_CREDENTIALS');

  const user = users[0];
  if (user.password_hash !== hashPassword(password)) throw new Error('INVALID_CREDENTIALS');

  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.execute(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, NOW(3))',
    [generateId(), user.id, tokenHash, expiresAt]
  );

  return { ok: true, userId: user.id, token, displayName: user.display_name, role: user.role };
}

async function signOut(sessionToken) {
  const pool = getPool();
  const tokenHash = hashToken(sessionToken);
  await pool.execute('DELETE FROM sessions WHERE token_hash = ?', [tokenHash]);
  return { ok: true };
}

async function verifySession(sessionToken) {
  const pool = getPool();
  const tokenHash = hashToken(sessionToken);
  const [sessions] = await pool.execute(
    'SELECT s.user_id, s.expires_at, u.email, u.display_name, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = ? AND s.expires_at > NOW(3)',
    [tokenHash]
  );
  if (sessions.length === 0) return null;
  return {
    userId: sessions[0].user_id,
    email: sessions[0].email,
    displayName: sessions[0].display_name,
    role: sessions[0].role,
    expiresAt: sessions[0].expires_at,
  };
}

async function refreshSession(sessionToken) {
  const pool = getPool();
  const tokenHash = hashToken(sessionToken);
  const [sessions] = await pool.execute(
    'SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > NOW(3)',
    [tokenHash]
  );
  if (sessions.length === 0) throw new Error('INVALID_SESSION');

  const newToken = generateToken();
  const newTokenHash = hashToken(newToken);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await pool.execute(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, NOW(3))',
    [generateId(), sessions[0].user_id, newTokenHash, expiresAt]
  );

  return { ok: true, token: newToken };
}

// ---- Google OAuth ----

async function googleOAuthCallback(googleId, email, displayName) {
  const pool = getPool();

  // Check if user exists
  const [users] = await pool.execute(
    'SELECT id, role FROM users WHERE email = ? LIMIT 1',
    [email.toLowerCase()]
  );

  if (users.length === 0) {
    // Create new user
    const userId = generateId();
    await pool.execute(
      'INSERT INTO users (id, email, password_hash, display_name, role, created_at) VALUES (?, ?, "", ?, ?, NOW(3))',
      [userId, email.toLowerCase(), displayName.trim(), 'caller']
    );
    // Auto-join default competition
    const [comps] = await pool.execute('SELECT id FROM competitions WHERE is_default = true LIMIT 1');
    if (comps.length > 0) {
      await pool.execute(
        'INSERT INTO accounts (id, user_id, competition_id, display_name, cash, starting_cash, equity, status, created_at) VALUES (?, ?, ?, ?, 10000, 10000, 10000, "active", NOW(3))',
        [generateId(), userId, comps[0].id, displayName.trim()]
      );
    }
    return { ok: true, userId, isNew: true };
  }

  // Existing user — just create session
  const user = users[0];
  const token = generateToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.execute(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, NOW(3))',
    [generateId(), user.id, tokenHash, expiresAt]
  );
  return { ok: true, userId: user.id, token, isNew: false };
}

// ---- API Key auth (Alpaca-style) ----

async function verifyApiKey(keyId, secret) {
  const pool = getPool();
  const secretHash = hashPassword(secret);
  const [keys] = await pool.execute(
    'SELECT id, user_id, account_id, label, last_used_at FROM api_keys WHERE key_id = ? AND secret_hash = ? AND revoked_at IS NULL LIMIT 1',
    [keyId, secretHash]
  );
  if (keys.length === 0) return null;

  const key = keys[0];
  await pool.execute('UPDATE api_keys SET last_used_at = NOW(3) WHERE id = ?', [key.id]);
  return {
    apiKeyId: key.id,
    userId: key.user_id,
    accountId: key.account_id,
    label: key.label,
  };
}

// ---- Admin ----

async function promoteUser(email, role) {
  const pool = getPool();
  const validRoles = ['owner', 'manager', 'caller', 'sales'];
  if (!validRoles.includes(role)) throw new Error('INVALID_ROLE');
  const [result] = await pool.execute(
    'UPDATE users SET role = ? WHERE email = ?',
    [role, email.toLowerCase()]
  );
  if (result.affectedRows === 0) throw new Error('USER_NOT_FOUND');
  return { ok: true };
}

module.exports = {
  signUp, signIn, signOut, verifySession, refreshSession,
  googleOAuthCallback, verifyApiKey, promoteUser,
  hashPassword, generateId,
};