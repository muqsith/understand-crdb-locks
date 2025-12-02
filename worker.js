const fs = require('fs');
const path = require('path');
const DatabaseConnector = require('./DatabaseConnector');
const { delay } = require('./utils');

const connectionString = 'postgresql://root@localhost:26277/defaultdb?sslmode=disable';
const dbConnector = new DatabaseConnector(connectionString, 5);

/**
 * Create a new employee with lock acquisition and timeout
 * @param {Object} employeeData - Employee details
 * @param {number} threadId - Thread identifier for logging
 * @returns {Promise<Object>} Created employee record
 */
async function createEmployee(employeeData, threadId = 0) {
  const client = await dbConnector.getClient();
  const TIMEOUT_MS = 10000; // 10 seconds
  
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Operation timed out after ${TIMEOUT_MS / 1000} seconds`));
    }, TIMEOUT_MS);
  });
  
  const insertPromise = (async () => {
    try {
      const startTime = Date.now();
      await client.query('BEGIN');
      
      // Acquire lock
      console.log(`[Worker ${process.pid}][Thread ${threadId}] Acquiring lock for employee: ${employeeData.email}`);
      await client.query(
        "SELECT lockname FROM generic_locks WHERE lockname = 'create_employee_lock' FOR UPDATE"
      );
      console.log(`[Worker ${process.pid}][Thread ${threadId}] Lock acquired for: ${employeeData.email}`);
      
      const { firstName, lastName, email, department, salary } = employeeData;
      
      const query = `
        INSERT INTO employees (first_name, last_name, email, department, salary)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (first_name, last_name) DO NOTHING
        RETURNING *
      `;
      
      const values = [firstName, lastName, email, department || null, salary || null];
      const { rows } = await client.query(query, values);
      
      // Wait 3 seconds after insert
      await delay(3000);
      
      await client.query('COMMIT');
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (rows.length > 0) {
        console.log(`[Worker ${process.pid}][Thread ${threadId}] Employee created: ${rows[0].email} (took ${duration}s)`);
        return rows[0];
      } else {
        console.log(`[Worker ${process.pid}][Thread ${threadId}] Employee skipped (duplicate): ${firstName} ${lastName} (took ${duration}s)`);
        return null;
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[Worker ${process.pid}][Thread ${threadId}] Error creating employee:`, err.message);
      throw err;
    } finally {
      client.release();
    }
  })();
  
  try {
    return await Promise.race([insertPromise, timeoutPromise]);
  } catch (err) {
    try {
      client.release();
    } catch (releaseErr) {
      console.error(`[Worker ${process.pid}][Thread ${threadId}] Error releasing client:`, releaseErr.message);
    }
    console.error(`[Worker ${process.pid}][Thread ${threadId}] TIMEOUT ERROR for ${employeeData.email}: ${err.message}`);
    throw err;
  }
}

/**
 * Process a chunk of employees (worker process)
 */
async function processChunk(employees, workerId) {
  const CONCURRENCY = 5;
  let processedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  
  console.log(`[Worker ${process.pid}] Processing ${employees.length} employees with ${CONCURRENCY} threads`);
  
  for (let i = 0; i < employees.length; i += CONCURRENCY) {
    const batch = employees.slice(i, i + CONCURRENCY);
    const promises = batch.map((employee, index) => 
      (async () => {
        try {
          const result = await createEmployee(employee, (i + index) % CONCURRENCY + 1);
          if (result) {
            processedCount++;
          } else {
            skippedCount++;
          }
        } catch (err) {
          failedCount++;
          console.error(`[Worker ${process.pid}] Failed to process employee ${employee.email}:`, err.message);
        }
      })()
    );
    
    await Promise.allSettled(promises);
  }
  
  await dbConnector.close();
  
  return {
    workerId,
    processed: processedCount,
    failed: failedCount,
    skipped: skippedCount,
    total: employees.length
  };
}

// Handle messages from parent process
if (process.send) {
  process.on('message', async (message) => {
    if (message.type === 'PROCESS_CHUNK') {
      try {
        const result = await processChunk(message.employees, message.workerId);
        process.send({ type: 'RESULT', result });
      } catch (err) {
        process.send({ type: 'ERROR', error: err.message });
      }
    }
  });
}

module.exports = { createEmployee, processChunk };
