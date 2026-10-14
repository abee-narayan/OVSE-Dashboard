const fs = require('fs');
const path = require('path');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const row = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        row.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    row.push(cur.trim());
    
    if (row.length >= 3) {
      let ovseId = row[0].replace(/^"|"$/g, '').trim();
      let authResult = row[1].replace(/^"|"$/g, '').trim().toLowerCase();
      let countStr = row[2].replace(/^"|"$/g, '').replace(/,/g, '').trim();
      let count = parseInt(countStr, 10) || 0;
      rows.push({ ovseId: ovseId || '(Blank / Unknown)', authResult, count });
    }
  }
  return rows;
}

function aggregate(rows) {
  const map = new Map();
  let totalSuccess = 0;
  let totalFailure = 0;
  let totalTx = 0;

  for (const r of rows) {
    if (!map.has(r.ovseId)) {
      map.set(r.ovseId, { ovseId: r.ovseId, success: 0, failure: 0, total: 0 });
    }
    const item = map.get(r.ovseId);
    if (r.authResult === 'y') {
      item.success += r.count;
      totalSuccess += r.count;
    } else if (r.authResult === 'n') {
      item.failure += r.count;
      totalFailure += r.count;
    }
    item.total += r.count;
    totalTx += r.count;
  }

  const list = Array.from(map.values()).map(item => {
    return {
      ...item,
      successRate: item.total > 0 ? (item.success / item.total) * 100 : 0,
      failureRate: item.total > 0 ? (item.failure / item.total) * 100 : 0,
    };
  });

  list.sort((a, b) => b.total - a.total);
  list.forEach((item, idx) => {
    item.rank = idx + 1;
  });

  return {
    totalTx,
    totalSuccess,
    totalFailure,
    overallSuccessRate: totalTx > 0 ? (totalSuccess / totalTx) * 100 : 0,
    overallFailureRate: totalTx > 0 ? (totalFailure / totalTx) * 100 : 0,
    uniqueCount: map.size,
    list,
    map
  };
}

// Automatically detect the newest files in directory
function findLatestFiles(dir) {
  const files = fs.readdirSync(dir);
  
  const overallFiles = files
    .filter(f => (f.startsWith('ovse_wise_transactions_count') || f.toLowerCase().includes('overall')) && f.endsWith('.csv'))
    .map(f => ({ name: f, path: path.join(dir, f), time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  const weeklyFiles = files
    .filter(f => (f.startsWith('query_result') || f.toLowerCase().includes('week')) && f.endsWith('.csv'))
    .map(f => ({ name: f, path: path.join(dir, f), time: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time);

  return {
    overallFile: overallFiles.length > 0 ? overallFiles[0].path : null,
    weeklyFile: weeklyFiles.length > 0 ? weeklyFiles[0].path : null,
  };
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function generateAnalysis(dir = __dirname) {
  const { overallFile, weeklyFile } = findLatestFiles(dir);
  if (!overallFile || !weeklyFile) {
    console.error("Could not find required CSV files in " + dir);
    return;
  }

  console.log(`\n============================================================`);
  console.log(`⚡ OVSE TRANSACTION INTELLIGENCE & REPORTING ENGINE ⚡`);
  console.log(`============================================================`);
  console.log(`[+] Overall File Detected: ${path.basename(overallFile)}`);
  console.log(`[+] Weekly File Detected:  ${path.basename(weeklyFile)}`);

  const oRows = parseCSV(overallFile);
  const wRows = parseCSV(weeklyFile);

  const overall = aggregate(oRows);
  const weekly = aggregate(wRows);

  const ovseRanksOverall = new Map();
  overall.list.forEach(item => ovseRanksOverall.set(item.ovseId, item.rank));

  // Build full comparative dataset
  const allOvseIds = new Set([...overall.map.keys(), ...weekly.map.keys()]);
  const comparisonList = [];

  for (const id of allOvseIds) {
    const o = overall.map.get(id) || { success: 0, failure: 0, total: 0 };
    const w = weekly.map.get(id) || { success: 0, failure: 0, total: 0, rank: 'N/A' };
    const oRank = ovseRanksOverall.get(id) || 'Unranked';
    const wRank = w.rank || 'Inactive';

    const weeklyShareOfOverall = o.total > 0 ? (w.total / o.total) * 100 : (w.total > 0 ? 100 : 0);
    const isBrandNew = w.total > 0 && (o.total === w.total || !overall.map.has(id));
    const isHighGrowth = !isBrandNew && weeklyShareOfOverall >= 35 && w.total >= 10;
    const isInactive = w.total === 0;

    let status = 'Standard';
    if (isBrandNew) status = 'New Entrant';
    else if (isHighGrowth) status = 'Surging / High Growth';
    else if (isInactive) status = 'Inactive This Week';

    comparisonList.push({
      ovseId: id,
      status,
      weeklyRank: wRank,
      weeklyTotal: w.total,
      weeklySuccess: w.success,
      weeklyFailure: w.failure,
      weeklySuccessRate: w.total > 0 ? ((w.success / w.total) * 100).toFixed(2) : '0.00',
      weeklyFailureRate: w.total > 0 ? ((w.failure / w.total) * 100).toFixed(2) : '0.00',
      overallRank: oRank,
      overallTotal: o.total,
      overallSuccess: o.success,
      overallFailure: o.failure,
      overallSuccessRate: o.total > 0 ? ((o.success / o.total) * 100).toFixed(2) : '0.00',
      overallFailureRate: o.total > 0 ? ((o.failure / o.total) * 100).toFixed(2) : '0.00',
      weeklyShareOfOverallPct: weeklyShareOfOverall.toFixed(2)
    });
  }

  // Sort comparison by weeklyTotal desc, then overallTotal desc
  comparisonList.sort((a, b) => b.weeklyTotal - a.weeklyTotal || b.overallTotal - a.overallTotal);

  const newAndEmerging = comparisonList.filter(c => c.status === 'New Entrant' || c.status === 'Surging / High Growth');

  // 1. Generate Executive Summary CSV
  const summaryCSVRows = [
    ['OVSE TRANSACTION INTELLIGENCE - EXECUTIVE SUMMARY REPORT'],
    ['Generated At', new Date().toLocaleString()],
    ['Overall Dataset', path.basename(overallFile)],
    ['Weekly Dataset', path.basename(weeklyFile)],
    ['', '', '', '', ''],
    ['METRIC CATEGORY', 'INDICATOR', 'OVERALL (ALL TIME)', 'LAST 1 WEEK', 'KEY MANAGEMENT VARIANCE / INSIGHT'],
    ['Volume Metrics', 'Total Transactions', overall.totalTx, weekly.totalTx, `${((weekly.totalTx / overall.totalTx) * 100).toFixed(2)}% of all-time volume`],
    ['Volume Metrics', 'Successful Transactions', overall.totalSuccess, weekly.totalSuccess, `${overall.overallSuccessRate.toFixed(2)}% Overall vs ${weekly.overallSuccessRate.toFixed(2)}% Weekly`],
    ['Volume Metrics', 'Failed Transactions', overall.totalFailure, weekly.totalFailure, `${overall.overallFailureRate.toFixed(2)}% Overall vs ${weekly.overallFailureRate.toFixed(2)}% Weekly`],
    ['Quality Metrics', 'Success Rate %', `${overall.overallSuccessRate.toFixed(2)}%`, `${weekly.overallSuccessRate.toFixed(2)}%`, `+${(weekly.overallSuccessRate - overall.overallSuccessRate).toFixed(2)}% Improvement`],
    ['Quality Metrics', 'Failure Rate %', `${overall.overallFailureRate.toFixed(2)}%`, `${weekly.overallFailureRate.toFixed(2)}%`, `-${(overall.overallFailureRate - weekly.overallFailureRate).toFixed(2)}% Reduction in Failure Rate`],
    ['Entity Engagement', 'Active OVSE Entities', overall.uniqueCount, weekly.uniqueCount, `${((weekly.uniqueCount / overall.uniqueCount) * 100).toFixed(1)}% of registered entities active`],
    ['', '', '', '', ''],
    ['TOP 5 OVSEs OVERALL', 'RANK', 'TOTAL TX', 'SUCCESS RATE %', 'FAILURE RATE %'],
    ...overall.list.slice(0, 5).map((item, idx) => [`Top ${idx + 1} Overall: ${item.ovseId}`, idx + 1, item.total, `${item.successRate.toFixed(2)}%`, `${item.failureRate.toFixed(2)}%`]),
    ['', '', '', '', ''],
    ['TOP 5 OVSEs LAST WEEK', 'RANK', 'TOTAL TX', 'SUCCESS RATE %', 'FAILURE RATE %'],
    ...weekly.list.slice(0, 5).map((item, idx) => [`Top ${idx + 1} Weekly: ${item.ovseId}`, idx + 1, item.total, `${item.successRate.toFixed(2)}%`, `${item.failureRate.toFixed(2)}%`]),
    ['', '', '', '', ''],
    ['NEW & SURGING OVSEs', 'CLASSIFICATION', 'WEEKLY TX', 'WEEKLY SUCCESS %', 'WEEKLY SHARE OF LIFETIME %'],
    ...newAndEmerging.map(c => [
      c.ovseId, c.status, c.weeklyTotal, `${c.weeklySuccessRate}%`, `${c.weeklyShareOfOverallPct}%`
    ])
  ];

  const executiveCSVContent = summaryCSVRows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const executiveCSVPath = path.join(dir, 'OVSE_Executive_Summary_Report.csv');
  fs.writeFileSync(executiveCSVPath, executiveCSVContent, 'utf-8');
  console.log(`[✓] Generated: ${path.basename(executiveCSVPath)}`);

  // 2. Generate Full Comparative Analysis CSV
  const fullHeaders = [
    'OVSE ID', 'Status / Category', 'Weekly Rank', 'Weekly Total Tx', 'Weekly Success Tx', 'Weekly Failure Tx',
    'Weekly Success Rate (%)', 'Weekly Failure Rate (%)', 'Overall Rank', 'Overall Total Tx', 'Overall Success Tx',
    'Overall Failure Tx', 'Overall Success Rate (%)', 'Overall Failure Rate (%)', 'Weekly Volume Share of All-Time (%)'
  ];

  const fullRows = [
    fullHeaders,
    ...comparisonList.map(c => [
      c.ovseId, c.status, c.weeklyRank, c.weeklyTotal, c.weeklySuccess, c.weeklyFailure,
      c.weeklySuccessRate, c.weeklyFailureRate, c.overallRank, c.overallTotal, c.overallSuccess,
      c.overallFailure, c.overallSuccessRate, c.overallFailureRate, c.weeklyShareOfOverallPct
    ])
  ];

  const fullCSVContent = fullRows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const fullCSVPath = path.join(dir, 'OVSE_Full_Comparative_Analysis.csv');
  fs.writeFileSync(fullCSVPath, fullCSVContent, 'utf-8');
  console.log(`[✓] Generated: ${path.basename(fullCSVPath)}`);

  // 3. Generate New and Emerging Entrants CSV
  const newHeaders = ['OVSE ID', 'Classification', 'Weekly Rank', 'Weekly Tx', 'Weekly Success Rate (%)', 'Weekly Failure Rate (%)', 'Overall Lifetime Tx', 'Weekly Share of Lifetime (%)'];
  const newRows = [
    newHeaders,
    ...newAndEmerging.map(c => [
      c.ovseId, c.status, c.weeklyRank, c.weeklyTotal, c.weeklySuccessRate, c.weeklyFailureRate, c.overallTotal, c.weeklyShareOfOverallPct
    ])
  ];
  const newCSVContent = newRows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const newCSVPath = path.join(dir, 'OVSE_New_and_Surging_Entrants.csv');
  fs.writeFileSync(newCSVPath, newCSVContent, 'utf-8');
  console.log(`[✓] Generated: ${path.basename(newCSVPath)}`);

  // 4. Update JSON & bundled JS cache for instant browser display
  const exportData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      overallFile: path.basename(overallFile),
      weeklyFile: path.basename(weeklyFile),
      reportingCutoff: "October 14, 2026 2:50 PM"
    },
    overall: {
      totalTx: overall.totalTx,
      totalSuccess: overall.totalSuccess,
      totalFailure: overall.totalFailure,
      successRate: overall.overallSuccessRate,
      failureRate: overall.overallFailureRate,
      uniqueCount: overall.uniqueCount,
      top5: overall.list.slice(0, 5),
      top10: overall.list.slice(0, 10)
    },
    weekly: {
      totalTx: weekly.totalTx,
      totalSuccess: weekly.totalSuccess,
      totalFailure: weekly.totalFailure,
      successRate: weekly.overallSuccessRate,
      failureRate: weekly.overallFailureRate,
      uniqueCount: weekly.uniqueCount,
      top5: weekly.list.slice(0, 5),
      top10: weekly.list.slice(0, 10)
    },
    comparison: comparisonList,
    newAndEmerging: newAndEmerging
  };

  fs.writeFileSync(path.join(dir, 'initial_data.json'), JSON.stringify(exportData, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'initial_data_bundle.js'), `// Auto-generated baseline data for OVSE Executive Dashboard\nconst BUNDLED_DATA = ${JSON.stringify(exportData, null, 2)};\n`, 'utf-8');
  console.log(`[✓] Updated: initial_data.json & initial_data_bundle.js (Dashboard Web App synced)`);
  console.log(`============================================================\n`);

  return exportData;
}

module.exports = {
  parseCSV,
  aggregate,
  generateAnalysis,
  findLatestFiles
};

if (require.main === module) {
  generateAnalysis(__dirname);
}
