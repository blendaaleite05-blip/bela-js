
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 10000
});

pool.on('error', (error) => {
  console.error('Erro inesperado no PostgreSQL:', error.message);
});

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não foi configurada no Render.');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coins_wallets (
      guild_id VARCHAR(20) NOT NULL,
      user_id VARCHAR(20) NOT NULL,
      balance NUMERIC(30, 0) NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (guild_id, user_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coins_transactions (
      id BIGSERIAL PRIMARY KEY,
      guild_id VARCHAR(20) NOT NULL,
      user_id VARCHAR(20) NOT NULL,
      amount NUMERIC(30, 0) NOT NULL,
      balance_after NUMERIC(30, 0) NOT NULL,
      type VARCHAR(30) NOT NULL,
      description TEXT,
      metadata JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  console.log('Banco de dados Snow System conectado.');
  console.log('Tabelas de Coins verificadas.');
}

async function getOrCreateWallet(guildId, userId) {
  const result = await pool.query(
    `
      INSERT INTO coins_wallets (guild_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (guild_id, user_id) DO NOTHING
      RETURNING balance;
    `,
    [guildId, userId]
  );

  if (result.rows.length > 0) {
    return result.rows[0];
  }

  const wallet = await pool.query(
    `
      SELECT balance
      FROM coins_wallets
      WHERE guild_id = $1 AND user_id = $2;
    `,
    [guildId, userId]
  );

  return wallet.rows[0];
}
async function addCoins(guildId, userId, amount) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      `
        INSERT INTO coins_wallets (guild_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (guild_id, user_id) DO NOTHING;
      `,
      [guildId, userId]
    );

    const result = await client.query(
      `
        UPDATE coins_wallets
        SET balance = balance + $3::numeric,
            updated_at = NOW()
        WHERE guild_id = $1 AND user_id = $2
        RETURNING balance;
      `,
      [guildId, userId, amount.toString()]
    );

    const balance = result.rows[0].balance;

    await client.query(
      `
        INSERT INTO coins_transactions
          (guild_id, user_id, amount, balance_after, type, description)
        VALUES ($1, $2, $3, $4, 'admin_add', 'Adição administrativa de Coins');
      `,
      [guildId, userId, amount.toString(), balance]
    );

    await client.query('COMMIT');

    return balance;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
}

async function removeCoins(guildId, userId, amount) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      `
        UPDATE coins_wallets
        SET balance = balance - $3::numeric,
            updated_at = NOW()
        WHERE guild_id = $1
          AND user_id = $2
          AND balance >= $3::numeric
        RETURNING balance;
      `,
      [guildId, userId, amount.toString()]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const balance = result.rows[0].balance;

    await client.query(
      `
        INSERT INTO coins_transactions
          (guild_id, user_id, amount, balance_after, type, description)
        VALUES ($1, $2, $3, $4, 'admin_remove', 'Remoção administrativa de Coins');
      `,
      [guildId, userId, amount.toString(), balance]
    );

    await client.query('COMMIT');

    return balance;

  } catch (error) {
    await client.query('ROLLBACK');
    throw error;

  } finally {
    client.release();
  }
    }

module.exports = {
  pool,
  initDatabase,
  getOrCreateWallet,
  addCoins,
  removeCoins
};
              
