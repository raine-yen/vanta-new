// MySQL-compatible duck-typed DB wrapper for engine.ts / prices.ts
// Provides the minimal Supabase-like interface: db.from(table).select(...).eq().maybeSingle().single().insert().update().delete().select().single()

const mysql = require('mysql2/promise');

function wrapPool(pool) {
  if (!pool) return null;

  function from(table) {
    return {
      select(fields) {
        let query = `SELECT ${fields || '*'} FROM \`${table}\``;
        const conditions = [];
        const values = [];

        return {
          eq(col, val) {
            conditions.push(`${col} = ?`);
            values.push(val);
            return this;
          },
          gt(col, val) {
            conditions.push(`${col} > ?`);
            values.push(val);
            return this;
          },
          lte(col, val) {
            conditions.push(`${col} <= ?`);
            values.push(val);
            return this;
          },
          is(col, val) {
            if (val === null) conditions.push(`${col} IS NULL`);
            else conditions.push(`${col} IS NOT NULL`);
            return this;
          },
          or(predicate) {
            // Simple: unwrap and append
            conditions.push(predicate);
            return this;
          },
          maybeSingle() {
            if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
            query += ' LIMIT 2';
            return pool.query(query, values).then(([rows]) => {
              if (rows.length === 0) return { data: null, error: null };
              if (rows.length === 1) return { data: rows[0], error: null };
              return { data: rows[0], error: new Error('Multiple rows returned') };
            });
          },
          single() {
            if (conditions.length > 0) query += ` WHERE ${conditions.join(' AND ')}`;
            query += ' LIMIT 1';
            return pool.query(query, values).then(([rows]) => {
              if (rows.length === 0) return { data: null, error: new Error('No row found') };
              return { data: rows[0], error: null };
            });
          },
          insert(row) {
            const cols = Object.keys(row);
            const vals = Object.values(row);
            const placeholders = cols.map(() => '?').join(', ');
            query = `INSERT INTO \`${table}\` (${cols.map(c => '`' + c + '`').join(', ')}) VALUES (${placeholders})`;
            return pool.query(query, vals).then(([result]) => ({
              data: { id: result.insertId },
              error: null,
            }));
          },
          update(values) {
            const setClauses = Object.entries(values).map(([k, v]) => `${k} = ?`).join(', ');
            const setVals = Object.values(values);
            query = `UPDATE \`${table}\` SET ${setClauses}`;
            if (conditions.length > 0) {
              query += ` WHERE ${conditions.join(' AND ')}`;
              values.forEach(v => setVals.push(v));
            }
            return pool.query(query, setVals).then(([result]) => ({
              error: result.affectedRows === 0 ? new Error('No rows updated') : null,
            }));
          },
          delete() {
            query = `DELETE FROM \`${table}\``;
            if (conditions.length > 0) {
              query += ` WHERE ${conditions.join(' AND ')}`;
            }
            return pool.query(query, values).then(([result]) => ({
              error: result.affectedRows === 0 ? new Error('No rows deleted') : null,
            }));
          },
        };
      },
    };
  }

  return { from };
}

module.exports = { wrapPool };
