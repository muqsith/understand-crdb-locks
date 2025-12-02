const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');

/**
 * Process employees using multiple child processes
 */
async function main() {
  try {
    // Read mock data
    const mockDataPath = path.join(__dirname, 'tmp', 'MOCK_DATA.json');
    const mockData = JSON.parse(fs.readFileSync(mockDataPath, 'utf8'));
    
    console.log(`Loaded ${mockData.length} employees from MOCK_DATA.json`);
    
    const NUM_WORKERS = 10;
    
    console.log(`Starting processing with ${NUM_WORKERS} worker processes`);
    console.log(`Each worker will process all ${mockData.length} employees with 5 concurrent threads\n`);
    
    const startTime = Date.now();
    const workers = [];
    const results = [];
    
    // Create worker processes - all processing the same data
    for (let i = 0; i < NUM_WORKERS; i++) {
      const worker = fork(path.join(__dirname, 'worker.js'));
      
      const workerPromise = new Promise((resolve, reject) => {
        worker.on('message', (message) => {
          if (message.type === 'RESULT') {
            console.log(`\n[Worker ${message.result.workerId}] Completed:`);
            console.log(`  - Processed: ${message.result.processed}`);
            console.log(`  - Skipped: ${message.result.skipped}`);
            console.log(`  - Failed: ${message.result.failed}`);
            console.log(`  - Total: ${message.result.total}`);
            results.push(message.result);
            worker.kill();
            resolve();
          } else if (message.type === 'ERROR') {
            worker.kill();
            reject(new Error(message.error));
          }
        });
        
        worker.on('error', (err) => {
          worker.kill();
          reject(err);
        });
        worker.on('exit', (code) => {
          if (code !== 0 && code !== null) {
            reject(new Error(`Worker exited with code ${code}`));
          }
        });
      });
      
      worker.send({
        type: 'PROCESS_CHUNK',
        employees: mockData,
        workerId: i + 1
      });
      
      workers.push(workerPromise);
    }
    
    // Wait for all workers to complete
    await Promise.allSettled(workers);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Aggregate results
    const totalProcessed = results.reduce((sum, r) => sum + r.processed, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✓ All workers completed in ${duration} seconds`);
    console.log(`  - Successfully processed: ${totalProcessed}`);
    console.log(`  - Skipped (duplicates): ${totalSkipped}`);
    console.log(`  - Failed: ${totalFailed}`);
    console.log(`  - Total: ${mockData.length}`);
    console.log(`${'='.repeat(60)}`);
    
    process.exit(0);
  } catch (err) {
    console.error('Failed to run main:', err);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { main };
