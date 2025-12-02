const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://root@localhost:26277/defaultdb?sslmode=disable';

async function runMigrations(reset = false) {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to CockroachDB');

    // Reset migrations if requested
    if (reset) {
      console.log('Resetting migrations...');
      await client.query('DROP TABLE IF EXISTS migrations CASCADE');
      await client.query('DROP TABLE IF EXISTS generic_locks CASCADE');
      await client.query('DROP TABLE IF EXISTS employees CASCADE');
      console.log('Existing tables dropped');
    }

    // Ensure base migration is run first
    const baseSqlPath = path.join(__dirname, 'sql', 'base.sql');
    const baseSql = fs.readFileSync(baseSqlPath, 'utf8');
    await client.query(baseSql);
    console.log('Base migration executed');

    // Get list of executed migrations
    const { rows: executedMigrations } = await client.query(
      'SELECT name FROM migrations ORDER BY id'
    );
    const executedNames = executedMigrations.map(row => row.name);
    console.log('Executed migrations:', executedNames);

    // Get all migration files
    const sqlDir = path.join(__dirname, 'sql');
    const files = fs.readdirSync(sqlDir)
      .filter(file => file.endsWith('.sql') && file !== 'base.sql')
      .sort();

    // Run pending migrations
    for (const file of files) {
      if (!executedNames.includes(file)) {
        console.log(`Running migration: ${file}`);
        const filePath = path.join(sqlDir, file);
        const sql = fs.readFileSync(filePath, 'utf8');
        
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(
            'INSERT INTO migrations (name) VALUES ($1)',
            [file]
          );
          await client.query('COMMIT');
          console.log(`✓ Migration ${file} completed`);
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`✗ Migration ${file} failed:`, err.message);
          throw err;
        }
      } else {
        console.log(`Skipping already executed migration: ${file}`);
      }
    }

    console.log('All migrations completed successfully');
  } catch (err) {
    console.error('Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Check for --reset flag
const reset = process.argv.includes('--reset');

if (reset) {
  console.log('⚠️  Running migrations with RESET flag - all data will be lost!');
}

runMigrations(reset);
