/**
 * Delay execution for a specified number of milliseconds
 * @param {number} ms - Number of milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { delay };
