const { Pool } = require('pg');

class DatabaseConnector {
  constructor(connectionString, poolSize = 5) {
    this.pool = new Pool({
      connectionString,
      max: poolSize,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });

    console.log(`Database pool initialized with size: ${poolSize}`);
  }

  /**
   * Get a client from the pool
   * @returns {Promise<PoolClient>} Database client
   */
  async getClient() {
    try {
      const client = await this.pool.connect();
      return client;
    } catch (err) {
      console.error('Error acquiring client from pool:', err);
      throw err;
    }
  }

  /**
   * Close the pool and all connections
   */
  async close() {
    try {
      await this.pool.end();
      console.log('Database pool closed');
    } catch (err) {
      console.error('Error closing database pool:', err);
      throw err;
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }
}

module.exports = DatabaseConnector;
