const path = require('path');
const { generateAnalysis } = require('./generate_report');

console.log("==================================================");
console.log("REFRESHING OVSE DASHBOARD MASTER DATASET");
console.log("==================================================");

const masterData = generateAnalysis(__dirname);

if (masterData) {
  console.log("\n[SUCCESS] Unified master data refreshed successfully!");
  console.log(`- Reporting Cutoff: ${masterData.metadata.reportingCutoff}`);
  console.log(`- Lifetime Volume: ${masterData.overall.totalTx.toLocaleString()} tx across ${masterData.overall.uniqueCount} entities`);
  console.log(`- Weekly Volume:   ${masterData.weekly.totalTx.toLocaleString()} tx`);
  console.log(`- Lifetime Errors: ${masterData.errors.overall.totalErrors.toLocaleString()} failures`);
  console.log(`- Channels Tracked: ${masterData.channels.comparison.length}`);
  console.log("==================================================");
}
