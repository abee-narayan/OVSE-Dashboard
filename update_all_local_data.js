const fs = require('fs');
const path = require('path');
const { generateAnalysis } = require('./generate_report');
const { generateExtendedAnalytics } = require('./analytics_extended');

console.log("==================================================");
console.log("UPDATING LOCAL DASHBOARD DATASETS (ALL 6 FILES)");
console.log("==================================================");

// 1. Generate base transaction analysis
const baseData = generateAnalysis(__dirname);

// 2. Generate extended analytics (Channels & Errors)
const extendedData = generateExtendedAnalytics(__dirname);

// 3. Merge into unified master dataset
const masterData = {
  ...baseData,
  channels: extendedData.channels,
  errors: extendedData.errors,
  lastUpdatedLocal: new Date().toISOString()
};

fs.writeFileSync(path.join(__dirname, 'initial_data.json'), JSON.stringify(masterData, null, 2), 'utf-8');

const bundleJs = `// Auto-generated baseline master data for OVSE Executive Dashboard
const BUNDLED_DATA = ${JSON.stringify(masterData, null, 2)};
`;
fs.writeFileSync(path.join(__dirname, 'initial_data_bundle.js'), bundleJs, 'utf-8');

console.log("\n[SUCCESS] Master data updated locally!");
console.log(`- Base Transactions: ${masterData.overall.totalTx.toLocaleString()} overall, ${masterData.weekly.totalTx.toLocaleString()} weekly`);
console.log(`- Channel Types: ${masterData.channels.comparison.length}`);
console.log(`- Error Code Types: ${masterData.errors.comparison.length}`);
console.log("==================================================");
