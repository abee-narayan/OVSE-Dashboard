const fs = require('fs');
const path = require('path');

const ERROR_DESCRIPTIONS = {
  'SDJWT_USER_DENIED_CONSENT': 'Citizen actively declined or cancelled the consent prompt on mAadhaar app.',
  'SDJWT_FACEAUTH_FAILED_731': 'Face authentication match failed (Threshold score not met, code 731).',
  'SDJWT_SIGN_VALIDATION_FAILED': 'Cryptographic signature validation failure between OVSE and UIDAI.',
  'INVALID_JWT': 'Malformed, invalid token payload, or expired token during handshake.',
  'SDJWT_CALLBACK_NETWORK_ERROR': 'Network timeout or connection drop during callback reporting to OVSE backend.',
  'SDJWT_FACEAUTH_FAILED_304': 'Face capture / lighting / sensor error during camera acquisition.',
  'SDJWT_FACEAUTH_FAILED_737': 'Low biometric confidence / quality score during facial matching.',
  'SDJWT_ZIP_CREATION_FAILED': 'Failure during local credential zip extraction or compression.',
  '0': 'Generic connection reset, client drop, or unspecified timeout error.',
  '731': 'Biometric verification threshold score not achieved (Code 731).',
  'SDJWT_FACEAUTH_FAILED': 'General facial authentication failure.'
};

const ERROR_CATEGORIES = {
  'SDJWT_USER_DENIED_CONSENT': 'User Consent Denial',
  'SDJWT_FACEAUTH_FAILED_731': 'Biometric Face Auth Failure',
  'SDJWT_FACEAUTH_FAILED_304': 'Biometric Face Auth Failure',
  'SDJWT_FACEAUTH_FAILED_737': 'Biometric Face Auth Failure',
  'SDJWT_FACEAUTH_FAILED': 'Biometric Face Auth Failure',
  '731': 'Biometric Face Auth Failure',
  'SDJWT_SIGN_VALIDATION_FAILED': 'Cryptographic / Security Error',
  'INVALID_JWT': 'Cryptographic / Security Error',
  'SDJWT_CALLBACK_NETWORK_ERROR': 'Network / Connectivity Timeout',
  'SDJWT_ZIP_CREATION_FAILED': 'System / Payload Processing',
  '0': 'Generic Timeout / Client Drop'
};

function parseLine(line) {
  const parts = [];
  let cur = '';
  let inQuotes = false;
  for (let c = 0; c < line.length; c++) {
    const ch = line[c];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  parts.push(cur.trim());
  return parts;
}

function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const row = parseLine(lines[i]);
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

function parseDate(dStr) {
  if (!dStr) return null;
  const parts = dStr.split('/').map(Number);
  if (parts.length !== 3) return null;
  return new Date(parts[2], parts[1] - 1, parts[0]);
}

function escapeCSV(val) {
  if (val === null || val === undefined) return '""';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Check if a CSV or JSON file is the Unified Master format (contains Error Code, Ovse ID, Auth Result, Channel, etc.)
function isUnifiedCSV(filePath) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.json') {
      const base = path.basename(filePath).toLowerCase();
      if (base === 'package.json' || base === 'package-lock.json' || base === 'initial_data.json') return false;
      const content = fs.readFileSync(filePath, 'utf-8').trim();
      const parsed = JSON.parse(content);
      if (parsed && parsed.overall && parsed.weekly && Array.isArray(parsed.comparison)) {
        return true; // Pre-aggregated master JSON
      }
      const arr = Array.isArray(parsed) ? parsed : (parsed?.rows || parsed?.data || parsed?.results || []);
      if (Array.isArray(arr) && arr.length > 0 && typeof arr[0] === 'object') {
        const keys = Object.keys(arr[0]).map(k => k.toLowerCase());
        return keys.some(k => k.includes('auth')) && keys.some(k => k.includes('channel') || k.includes('ovse'));
      }
      return false;
    }

    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(1024);
    const bytesRead = fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    const text = buf.toString('utf-8', 0, bytesRead);
    const firstLine = text.split(/\r?\n/)[0].toLowerCase();
    return (
      firstLine.includes('error code') &&
      firstLine.includes('auth result') &&
      firstLine.includes('channel')
    );
  } catch (e) {
    return false;
  }
}

// Helper to extract a field from a JSON row object with flexible key naming
function getJsonField(obj, candidates) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of Object.keys(obj)) {
    const lower = key.toLowerCase().trim();
    if (candidates.some(c => lower === c || lower.includes(c))) {
      return obj[key] !== null && obj[key] !== undefined ? String(obj[key]).trim() : '';
    }
  }
  return '';
}

// Find latest unified or legacy files
function findLatestFiles(dir = __dirname) {
  const files = fs.readdirSync(dir);
  
  // 1. Look for newest Unified Master file (.csv or .json query export)
  const unifiedFiles = files
    .filter(f => (f.endsWith('.csv') || f.endsWith('.json')) && !f.startsWith('OVSE_') && f !== 'initial_data.json' && f !== 'package.json' && f !== 'package-lock.json')
    .map(f => {
      const p = path.join(dir, f);
      return { name: f, path: p, time: fs.statSync(p).mtimeMs, isUnified: isUnifiedCSV(p) };
    })
    .filter(f => f.isUnified)
    .sort((a, b) => b.time - a.time);

  if (unifiedFiles.length > 0) {
    return { unifiedFile: unifiedFiles[0].path };
  }

  // 2. Fallback to legacy dual transaction files
  const txFiles = files
    .filter(f => f.endsWith('.csv') && !f.startsWith('OVSE_'))
    .map(f => {
      const p = path.join(dir, f);
      try {
        const firstLine = fs.readFileSync(p, 'utf-8').split(/\r?\n/)[0] || '';
        return { name: f, path: p, time: fs.statSync(p).mtimeMs, header: firstLine };
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .filter(f => f.header.includes('Auth Result'));

  const overallFiles = txFiles
    .filter(f => f.name.startsWith('ovse_wise') || f.name.includes('duplicate') || f.name.toLowerCase().includes('overall'))
    .sort((a, b) => b.time - a.time);

  const weeklyFiles = txFiles
    .filter(f => f.name.startsWith('query_result') && !f.name.includes('duplicate'))
    .sort((a, b) => b.time - a.time);

  return {
    overallFile: overallFiles.length > 0 ? overallFiles[0].path : (txFiles[0] ? txFiles[0].path : null),
    weeklyFile: weeklyFiles.length > 0 ? weeklyFiles[0].path : (txFiles[1] ? txFiles[1].path : null),
  };
}

// Core Unified Processing Engine: Ingests 1 CSV or JSON and builds all 3 dashboards
function processUnifiedDataset(filePath, dir = path.dirname(filePath), options = {}) {
  const content = fs.readFileSync(filePath, 'utf-8').trim();
  const isJsonInput = filePath.toLowerCase().endsWith('.json') || content.startsWith('{') || content.startsWith('[');

  const allRows = [];
  const dateCounts = {};

  if (isJsonInput) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      throw new Error(`Invalid JSON file: ${e.message}`);
    }

    // Case A: Pre-aggregated Master Dashboard JSON object
    if (parsed && !Array.isArray(parsed) && parsed.overall && parsed.weekly && Array.isArray(parsed.comparison)) {
      const masterData = {
        ...parsed,
        metadata: {
          ...(parsed.metadata || {}),
          generatedAt: new Date().toISOString(),
          sourceFile: path.basename(filePath),
          isUnifiedMaster: true
        },
        lastUpdatedLocal: new Date().toISOString()
      };
      fs.writeFileSync(path.join(dir, 'initial_data.json'), JSON.stringify(masterData, null, 2), 'utf-8');
      fs.writeFileSync(path.join(dir, 'initial_data_bundle.js'), `// Auto-generated baseline master data for OVSE Executive Dashboard\nconst BUNDLED_DATA = ${JSON.stringify(masterData, null, 2)};\n`, 'utf-8');
      return masterData;
    }

    // Case B: Raw JSON Array of Unified Records (or wrapped in { rows/data/results })
    const rawArray = Array.isArray(parsed) ? parsed : (parsed?.rows || parsed?.data || parsed?.results || []);
    if (!Array.isArray(rawArray) || rawArray.length === 0) {
      throw new Error("JSON dataset contains no valid data records.");
    }

    for (const item of rawArray) {
      const errCode = getJsonField(item, ['error code', 'error_code', 'errorcode', 'err_code', 'errcode']);
      const ovseId = getJsonField(item, ['ovse id', 'ovse_id', 'ovseid', 'ovse', 'entity']) || '(Blank / Unknown)';
      const dateStr = getJsonField(item, ['event timestamp', 'event_timestamp', 'eventtimestamp', 'timestamp', 'date']);
      const authResult = getJsonField(item, ['auth result', 'auth_result', 'authresult', 'auth']).toLowerCase();
      let channel = getJsonField(item, ['cred exchange channel', 'cred_exchange_channel', 'channel']).toUpperCase();
      if (channel === 'QR') channel = 'QR_SCAN';
      const countRaw = getJsonField(item, ['count', 'volume', 'total', 'tx']);
      const count = parseInt(String(countRaw).replace(/,/g, ''), 10) || 0;

      const dt = parseDate(dateStr);
      if (dt) {
        dateCounts[dateStr] = (dateCounts[dateStr] || 0) + count;
      }

      allRows.push({
        errCode,
        ovseId,
        dateStr,
        dt,
        authResult,
        channel,
        count
      });
    }
  } else {
    // CSV Input with Dynamic Column Header Detection
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length < 2) throw new Error("Dataset contains no data rows.");

    const headerParts = parseLine(lines[0]).map(h => h.replace(/^"|"$/g, '').trim().toLowerCase());
    const errIdx = headerParts.findIndex(h => h.includes('error'));
    const ovseIdx = headerParts.findIndex(h => h.includes('ovse'));
    const dateIdx = headerParts.findIndex(h => h.includes('timestamp') || h.includes('date') || h.includes('time'));
    const authIdx = headerParts.findIndex(h => h.includes('auth'));
    const chanIdx = headerParts.findIndex(h => h.includes('channel'));
    const countIdx = headerParts.findIndex(h => h.includes('count') || h.includes('volume') || h.includes('tx'));

    const cErr = errIdx !== -1 ? errIdx : 0;
    const cOvse = ovseIdx !== -1 ? ovseIdx : 1;
    const cDate = dateIdx !== -1 ? dateIdx : 2;
    const cAuth = authIdx !== -1 ? authIdx : 3;
    const cChan = chanIdx !== -1 ? chanIdx : 4;
    const cCount = countIdx !== -1 ? countIdx : 5;

    for (let i = 1; i < lines.length; i++) {
      const parts = parseLine(lines[i]);
      if (parts.length < 6) continue;

      const errCode = (parts[cErr] || '').replace(/^"|"$/g, '').trim();
      const ovseId = (parts[cOvse] || '').replace(/^"|"$/g, '').trim() || '(Blank / Unknown)';
      const dateStr = (parts[cDate] || '').replace(/^"|"$/g, '').trim();
      const authResult = (parts[cAuth] || '').replace(/^"|"$/g, '').trim().toLowerCase();
      let channel = (parts[cChan] || '').replace(/^"|"$/g, '').trim().toUpperCase();
      if (channel === 'QR') channel = 'QR_SCAN';
      const count = parseInt((parts[cCount] || '0').replace(/^"|"$/g, '').replace(/,/g, ''), 10) || 0;

      const dt = parseDate(dateStr);
      if (dt) {
        dateCounts[dateStr] = (dateCounts[dateStr] || 0) + count;
      }

      allRows.push({
        errCode,
        ovseId,
        dateStr,
        dt,
        authResult,
        channel,
        count
      });
    }
  }

  // Determine Weekly Window: Last 7 calendar days up to the latest realistic date
  const now = new Date();
  const validDates = allRows
    .filter(r => r.dt && r.dt.getFullYear() >= 2025 && r.dt <= now)
    .map(r => r.dt.getTime());
  
  const maxTime = validDates.length > 0 ? Math.max(...validDates) : Date.now();
  const maxDate = new Date(maxTime);

  const weeklyDays = options.weeklyDays || 7;
  const weeklyStart = new Date(maxDate);
  weeklyStart.setDate(weeklyStart.getDate() - (weeklyDays - 1));
  weeklyStart.setHours(0, 0, 0, 0);

  const weeklyEnd = new Date(maxDate);
  weeklyEnd.setHours(23, 59, 59, 999);

  function buildAggregations(rows) {
    let totalTx = 0;
    let totalSuccess = 0;
    let totalFailure = 0;
    const txOvseMap = new Map();

    let totalErrors = 0;
    let totalSuccesses = 0;
    const errCodeMap = {};
    const errCatMap = {};
    const errOvseMap = {};

    let totalChannels = 0;
    const chanMap = {};
    const chanOvseMap = {};

    for (const r of rows) {
      totalTx += r.count;
      if (r.authResult === 'y') totalSuccess += r.count;
      else if (r.authResult === 'n') totalFailure += r.count;

      if (!txOvseMap.has(r.ovseId)) {
        txOvseMap.set(r.ovseId, { ovseId: r.ovseId, success: 0, failure: 0, total: 0 });
      }
      const txItem = txOvseMap.get(r.ovseId);
      if (r.authResult === 'y') txItem.success += r.count;
      else if (r.authResult === 'n') txItem.failure += r.count;
      txItem.total += r.count;

      if (r.errCode) {
        totalErrors += r.count;
        errCodeMap[r.errCode] = (errCodeMap[r.errCode] || 0) + r.count;
        const cat = ERROR_CATEGORIES[r.errCode] || 'Other System Errors';
        errCatMap[cat] = (errCatMap[cat] || 0) + r.count;

        if (!errOvseMap[r.ovseId]) {
          errOvseMap[r.ovseId] = { totalErrors: 0, codes: {} };
        }
        errOvseMap[r.ovseId].totalErrors += r.count;
        errOvseMap[r.ovseId].codes[r.errCode] = (errOvseMap[r.ovseId].codes[r.errCode] || 0) + r.count;
      } else {
        totalSuccesses += r.count;
      }

      if (r.channel) {
        totalChannels += r.count;
        chanMap[r.channel] = (chanMap[r.channel] || 0) + r.count;

        if (!chanOvseMap[r.ovseId]) {
          chanOvseMap[r.ovseId] = { total: 0, channels: {} };
        }
        chanOvseMap[r.ovseId].total += r.count;
        chanOvseMap[r.ovseId].channels[r.channel] = (chanOvseMap[r.ovseId].channels[r.channel] || 0) + r.count;
      }
    }

    const txList = Array.from(txOvseMap.values()).map(item => ({
      ...item,
      successRate: item.total > 0 ? (item.success / item.total) * 100 : 0,
      failureRate: item.total > 0 ? (item.failure / item.total) * 100 : 0
    })).sort((a, b) => b.total - a.total);

    txList.forEach((item, idx) => {
      item.rank = idx + 1;
      const mapEntry = txOvseMap.get(item.ovseId);
      if (mapEntry) mapEntry.rank = idx + 1;
    });

    const codeList = Object.entries(errCodeMap).map(([code, count]) => ({
      code,
      description: ERROR_DESCRIPTIONS[code] || `UIDAI error code ${code}`,
      category: ERROR_CATEGORIES[code] || 'Other System Errors',
      count,
      pctOfErrors: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    const categoryList = Object.entries(errCatMap).map(([category, count]) => ({
      category,
      count,
      pct: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    const ovseErrorList = Object.entries(errOvseMap).map(([ovseId, data]) => {
      const topCodes = Object.entries(data.codes).sort((a, b) => b[1] - a[1]);
      return {
        ovseId,
        totalErrors: data.totalErrors,
        topErrorCode: topCodes.length > 0 ? topCodes[0][0] : 'None',
        topErrorCount: topCodes.length > 0 ? topCodes[0][1] : 0,
        codes: data.codes
      };
    }).sort((a, b) => b.totalErrors - a.totalErrors);

    const channelList = Object.entries(chanMap).map(([channel, count]) => ({
      channel,
      displayName: channel === 'APP_INTENT' ? 'App-to-App (App Intent)' : (channel === 'WEB_INTENT' ? 'Web-to-App (Web Intent)' : 'Cross-Device QR (QR Scan)'),
      count,
      pct: totalChannels > 0 ? (count / totalChannels) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    const ovseChannelList = Object.entries(chanOvseMap).map(([ovseId, data]) => ({
      ovseId,
      total: data.total,
      appIntent: data.channels['APP_INTENT'] || 0,
      webIntent: data.channels['WEB_INTENT'] || 0,
      qrScan: data.channels['QR_SCAN'] || 0,
      appIntentPct: data.total > 0 ? (((data.channels['APP_INTENT'] || 0) / data.total) * 100).toFixed(1) : '0.0',
      webIntentPct: data.total > 0 ? (((data.channels['WEB_INTENT'] || 0) / data.total) * 100).toFixed(1) : '0.0',
      qrScanPct: data.total > 0 ? (((data.channels['QR_SCAN'] || 0) / data.total) * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.total - a.total);

    const activeOvseCount = txList.filter(item => item.success > 0).length;

    return {
      tx: {
        totalTx,
        totalSuccess,
        totalFailure,
        successRate: totalTx > 0 ? (totalSuccess / totalTx) * 100 : 0,
        failureRate: totalTx > 0 ? (totalFailure / totalTx) * 100 : 0,
        uniqueCount: activeOvseCount,
        registeredCount: txOvseMap.size,
        list: txList,
        map: txOvseMap,
        top5: txList.slice(0, 5),
        top10: txList.slice(0, 10)
      },
      errors: {
        totalErrors,
        totalSuccesses,
        codeList,
        categoryList,
        ovseErrorList
      },
      channels: {
        total: totalChannels,
        channelMap: chanMap,
        channelList,
        ovseList: ovseChannelList
      }
    };
  }

  const overallAgg = buildAggregations(allRows);
  const weeklyRows = allRows.filter(r => r.dt && r.dt >= weeklyStart && r.dt <= weeklyEnd);
  const weeklyAgg = buildAggregations(weeklyRows);

  const ovseRanksOverall = new Map();
  overallAgg.tx.list.forEach(item => ovseRanksOverall.set(item.ovseId, item.rank));

  const allOvseIds = new Set([...overallAgg.tx.map.keys(), ...weeklyAgg.tx.map.keys()]);
  const comparisonList = [];

  for (const id of allOvseIds) {
    const o = overallAgg.tx.map.get(id) || { success: 0, failure: 0, total: 0 };
    const w = weeklyAgg.tx.map.get(id) || { success: 0, failure: 0, total: 0, rank: 'N/A' };
    const oRank = ovseRanksOverall.get(id) || 'Unranked';
    const wRank = w.rank || 'Inactive';

    const weeklyShareOfOverall = o.total > 0 ? (w.total / o.total) * 100 : (w.total > 0 ? 100 : 0);
    const isActiveWeekly = w.success > 0;
    const isBrandNew = isActiveWeekly && (o.total === w.total || !overallAgg.tx.map.has(id));
    const isHighGrowth = !isBrandNew && isActiveWeekly && weeklyShareOfOverall >= 35 && w.total >= 10;
    const isInactive = !isActiveWeekly;

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

  comparisonList.sort((a, b) => b.weeklyTotal - a.weeklyTotal || b.overallTotal - a.overallTotal);
  const newAndEmerging = comparisonList.filter(c => c.status === 'New Entrant' || c.status === 'Surging / High Growth');

  const allCodes = new Set([...overallAgg.errors.codeList.map(c => c.code), ...weeklyAgg.errors.codeList.map(c => c.code)]);
  const errorComparison = Array.from(allCodes).map(code => {
    const o = overallAgg.errors.codeList.find(c => c.code === code) || { count: 0, pctOfErrors: 0 };
    const w = weeklyAgg.errors.codeList.find(c => c.code === code) || { count: 0, pctOfErrors: 0 };
    return {
      code,
      description: ERROR_DESCRIPTIONS[code] || `UIDAI error code ${code}`,
      category: ERROR_CATEGORIES[code] || 'Other System Errors',
      overallCount: o.count,
      overallPct: o.pctOfErrors.toFixed(2),
      weeklyCount: w.count,
      weeklyPct: w.pctOfErrors.toFixed(2),
      pctPointDelta: (w.pctOfErrors - o.pctOfErrors).toFixed(2)
    };
  }).sort((a, b) => b.weeklyCount - a.weeklyCount || b.overallCount - a.overallCount);

  const channelComparison = overallAgg.channels.channelList.map(oItem => {
    const wItem = weeklyAgg.channels.channelList.find(w => w.channel === oItem.channel) || { count: 0, pct: 0 };
    return {
      channel: oItem.channel,
      displayName: oItem.displayName,
      overallCount: oItem.count,
      overallPct: oItem.pct.toFixed(2),
      weeklyCount: wItem.count,
      weeklyPct: wItem.pct.toFixed(2),
      weeklyShareOfLifetime: oItem.count > 0 ? ((wItem.count / oItem.count) * 100).toFixed(2) : '0.00',
      pctPointDelta: (wItem.pct - oItem.pct).toFixed(2)
    };
  });

  const sortedDates = Object.keys(dateCounts).sort((a,b) => parseDate(a) - parseDate(b));
  const recentDates = sortedDates.slice(-30);
  const dailyTrend = recentDates.map(dStr => ({
    date: dStr,
    total: dateCounts[dStr] || 0
  }));

  // Build Monthly Trend Aggregation across Transactions, Errors & Sharing Channels
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthBuckets = {};
  for (const r of allRows) {
    if (!r.dt) continue;
    const y = r.dt.getFullYear();
    const m = r.dt.getMonth() + 1;
    if (y < 2025) continue;
    const ym = `${y}-${String(m).padStart(2, '0')}`;
    if (!monthBuckets[ym]) {
      monthBuckets[ym] = {
        monthKey: ym,
        label: `${MONTH_NAMES[m - 1]} ${y}`,
        totalTx: 0,
        successTx: 0,
        failureTx: 0,
        errorCount: 0,
        errorCategories: {},
        appIntent: 0,
        webIntent: 0,
        qrScan: 0,
        activeOvseSet: new Set()
      };
    }
    const b = monthBuckets[ym];
    b.totalTx += r.count;
    if (r.authResult === 'y') {
      b.successTx += r.count;
      if (r.count > 0) b.activeOvseSet.add(r.ovseId);
    }
    else if (r.authResult === 'n') b.failureTx += r.count;
    if (r.errCode) {
      b.errorCount += r.count;
      const cat = ERROR_CATEGORIES[r.errCode] || 'Other System Errors';
      b.errorCategories[cat] = (b.errorCategories[cat] || 0) + r.count;
    }
    if (r.channel === 'APP_INTENT') b.appIntent += r.count;
    else if (r.channel === 'WEB_INTENT') b.webIntent += r.count;
    else if (r.channel === 'QR_SCAN') b.qrScan += r.count;
  }
  const monthlyTrend = Object.keys(monthBuckets).sort().map(ym => {
    const b = monthBuckets[ym];
    const { activeOvseSet, ...rest } = b;
    return {
      ...rest,
      activeEntities: activeOvseSet.size,
      successRate: b.totalTx > 0 ? Number(((b.successTx / b.totalTx) * 100).toFixed(2)) : 0,
      failureRate: b.totalTx > 0 ? Number(((b.failureTx / b.totalTx) * 100).toFixed(2)) : 0,
      errorRate: b.totalTx > 0 ? Number(((b.errorCount / b.totalTx) * 100).toFixed(2)) : 0
    };
  });

  const formatDateDisplay = (dt) => {
    return dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const toISODateOnly = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const minTime = validDates.length > 0 ? Math.min(...validDates) : maxTime;
  const minDate = new Date(minTime);

  // Extract database export timestamp from filename if formatted like query_result_2026-10-16T10_04_14...
  const baseFileName = path.basename(filePath);
  let dataLastUpdated = new Date().toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  const tsMatch = baseFileName.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2})_(\d{2})_(\d{2})/);
  if (tsMatch) {
    const expDt = new Date(Number(tsMatch[1]), Number(tsMatch[2]) - 1, Number(tsMatch[3]), Number(tsMatch[4]), Number(tsMatch[5]), Number(tsMatch[6]));
    dataLastUpdated = expDt.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase() + ' IST';
  }

  // Compact raw records for instant client-side filtering (Today / Last Week / Last Month / Custom Date Range)
  const rawRecords = allRows.map(r => [
    r.errCode,
    r.ovseId,
    r.dateStr,
    r.authResult,
    r.channel,
    r.count
  ]);

  const masterData = {
    metadata: {
      generatedAt: new Date().toISOString(),
      dataLastUpdated,
      sourceFile: baseFileName,
      reportingCutoff: `${formatDateDisplay(maxDate)} (Weekly: ${formatDateDisplay(weeklyStart)} to ${formatDateDisplay(weeklyEnd)})`,
      dateBounds: {
        minDate: toISODateOnly(minDate),
        maxDate: toISODateOnly(maxDate),
        minFormatted: formatDateDisplay(minDate),
        maxFormatted: formatDateDisplay(maxDate)
      },
      weeklyWindow: {
        start: weeklyStart.toISOString(),
        end: weeklyEnd.toISOString(),
        startFormatted: formatDateDisplay(weeklyStart),
        endFormatted: formatDateDisplay(weeklyEnd),
        days: weeklyDays
      },
      isUnifiedMaster: true
    },
    overall: overallAgg.tx,
    weekly: weeklyAgg.tx,
    comparison: comparisonList,
    newAndEmerging,
    errors: {
      overall: overallAgg.errors,
      weekly: weeklyAgg.errors,
      comparison: errorComparison
    },
    channels: {
      overall: overallAgg.channels,
      weekly: weeklyAgg.channels,
      comparison: channelComparison
    },
    dailyTrend,
    monthlyTrend,
    rawRecords,
    lastUpdatedLocal: new Date().toISOString()
  };

  // --------------------------------------------------------------------------
  // WRITE ALL 5 EXECUTIVE CSV REPORTS & MASTER JSON/BUNDLE
  // --------------------------------------------------------------------------

  // 1. Executive Summary CSV
  const summaryCSVRows = [
    ['OVSE TRANSACTION INTELLIGENCE - EXECUTIVE SUMMARY REPORT'],
    ['Generated At', new Date().toLocaleString()],
    ['Unified Master Export', path.basename(filePath)],
    ['Reporting Window', masterData.metadata.reportingCutoff],
    ['', '', '', '', ''],
    ['METRIC CATEGORY', 'INDICATOR', 'OVERALL (ALL TIME)', 'LAST 1 WEEK', 'KEY MANAGEMENT VARIANCE / INSIGHT'],
    ['Volume Metrics', 'Total Transactions', overallAgg.tx.totalTx, weeklyAgg.tx.totalTx, `${((weeklyAgg.tx.totalTx / overallAgg.tx.totalTx) * 100).toFixed(2)}% of all-time volume`],
    ['Volume Metrics', 'Successful Transactions', overallAgg.tx.totalSuccess, weeklyAgg.tx.totalSuccess, `${overallAgg.tx.successRate.toFixed(2)}% Overall vs ${weeklyAgg.tx.successRate.toFixed(2)}% Weekly`],
    ['Volume Metrics', 'Failed Transactions', overallAgg.tx.totalFailure, weeklyAgg.tx.totalFailure, `${overallAgg.tx.failureRate.toFixed(2)}% Overall vs ${weeklyAgg.tx.failureRate.toFixed(2)}% Weekly`],
    ['Quality Metrics', 'Success Rate %', `${overallAgg.tx.successRate.toFixed(2)}%`, `${weeklyAgg.tx.successRate.toFixed(2)}%`, `+${(weeklyAgg.tx.successRate - overallAgg.tx.successRate).toFixed(2)}% Improvement`],
    ['Quality Metrics', 'Failure Rate %', `${overallAgg.tx.failureRate.toFixed(2)}%`, `${weeklyAgg.tx.failureRate.toFixed(2)}%`, `-${(overallAgg.tx.failureRate - weeklyAgg.tx.failureRate).toFixed(2)}% Reduction in Failure Rate`],
    ['Entity Engagement', 'Active OVSE Entities', overallAgg.tx.uniqueCount, weeklyAgg.tx.uniqueCount, `${((weeklyAgg.tx.uniqueCount / overallAgg.tx.uniqueCount) * 100).toFixed(1)}% of registered entities active`],
    ['', '', '', '', ''],
    ['TOP 5 OVSEs OVERALL', 'RANK', 'TOTAL TX', 'SUCCESS RATE %', 'FAILURE RATE %'],
    ...overallAgg.tx.list.slice(0, 5).map((item, idx) => [`Top ${idx + 1} Overall: ${item.ovseId}`, idx + 1, item.total, `${item.successRate.toFixed(2)}%`, `${item.failureRate.toFixed(2)}%`]),
    ['', '', '', '', ''],
    ['TOP 5 OVSEs LAST WEEK', 'RANK', 'TOTAL TX', 'SUCCESS RATE %', 'FAILURE RATE %'],
    ...weeklyAgg.tx.list.slice(0, 5).map((item, idx) => [`Top ${idx + 1} Weekly: ${item.ovseId}`, idx + 1, item.total, `${item.successRate.toFixed(2)}%`, `${item.failureRate.toFixed(2)}%`]),
    ['', '', '', '', ''],
    ['NEW & SURGING OVSEs', 'CLASSIFICATION', 'WEEKLY TX', 'WEEKLY SUCCESS %', 'WEEKLY SHARE OF LIFETIME %'],
    ...newAndEmerging.map(c => [
      c.ovseId, c.status, c.weeklyTotal, `${c.weeklySuccessRate}%`, `${c.weeklyShareOfOverallPct}%`
    ])
  ];
  fs.writeFileSync(path.join(dir, 'OVSE_Executive_Summary_Report.csv'), summaryCSVRows.map(r => r.map(escapeCSV).join(',')).join('\r\n'), 'utf-8');

  // 2. Full Comparative Analysis CSV
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
  fs.writeFileSync(path.join(dir, 'OVSE_Full_Comparative_Analysis.csv'), fullRows.map(r => r.map(escapeCSV).join(',')).join('\r\n'), 'utf-8');

  // 3. New and Surging Entrants CSV
  const newHeaders = ['OVSE ID', 'Classification', 'Weekly Rank', 'Weekly Tx', 'Weekly Success Rate (%)', 'Weekly Failure Rate (%)', 'Overall Lifetime Tx', 'Weekly Share of Lifetime (%)'];
  const newRows = [
    newHeaders,
    ...newAndEmerging.map(c => [
      c.ovseId, c.status, c.weeklyRank, c.weeklyTotal, c.weeklySuccessRate, c.weeklyFailureRate, c.overallTotal, c.weeklyShareOfOverallPct
    ])
  ];
  fs.writeFileSync(path.join(dir, 'OVSE_New_and_Surging_Entrants.csv'), newRows.map(r => r.map(escapeCSV).join(',')).join('\r\n'), 'utf-8');

  // 4. Error Code Analysis CSV
  const errorHeaders = ['Error Code', 'Category', 'Description / Meaning', 'Weekly Failures', 'Weekly Failure Share %', 'Lifetime Failures', 'Lifetime Failure Share %', 'Trend Delta (%)'];
  const errorRows = [
    ['UIDAI OVSE ERROR CODE INTELLIGENCE - EXECUTIVE REPORT'],
    ['Generated At', new Date().toLocaleString()],
    ['', '', '', '', '', '', '', ''],
    errorHeaders,
    ...errorComparison.map(e => [
      e.code, e.category, e.description, e.weeklyCount, e.weeklyPct + '%', e.overallCount, e.overallPct + '%', (Number(e.pctPointDelta) > 0 ? '+' : '') + e.pctPointDelta + '%'
    ]),
    ['', '', '', '', '', '', '', ''],
    ['TOP IMPACTED OVSE ENTITIES BY ERROR COUNT (WEEKLY)'],
    ['OVSE ID', 'Total Weekly Failures', 'Dominant Error Code', 'Dominant Error Count', 'Dominant Error Share %'],
    ...weeklyAgg.errors.ovseErrorList.slice(0, 15).map(o => [
      o.ovseId, o.totalErrors, o.topErrorCode, o.topErrorCount, o.totalErrors > 0 ? ((o.topErrorCount / o.totalErrors) * 100).toFixed(1) + '%' : '0%'
    ])
  ];
  fs.writeFileSync(path.join(dir, 'OVSE_Error_Code_Analysis.csv'), errorRows.map(r => r.map(escapeCSV).join(',')).join('\r\n'), 'utf-8');

  // 5. Sharing Channels Analysis CSV
  const channelHeaders = ['Channel Code', 'Channel Description', 'Weekly Volume', 'Weekly Share %', 'Overall Lifetime Volume', 'Overall Lifetime Share %', 'Adoption Delta (%)'];
  const channelRows = [
    ['OVSE DATA SHARING CHANNELS - EXECUTIVE ANALYSIS REPORT'],
    ['Generated At', new Date().toLocaleString()],
    ['', '', '', '', '', '', ''],
    channelHeaders,
    ...channelComparison.map(c => [
      c.channel, c.displayName, c.weeklyCount, c.weeklyPct + '%', c.overallCount, c.overallPct + '%', (Number(c.pctPointDelta) > 0 ? '+' : '') + c.pctPointDelta + '%'
    ]),
    ['', '', '', '', '', '', ''],
    ['TOP OVSEs BY CHANNEL USAGE (WEEKLY)'],
    ['OVSE ID', 'Total Weekly Tx', 'App Intent Tx', 'App Intent Share %', 'Web Intent Tx', 'Web Intent Share %', 'QR Scan Tx', 'QR Scan Share %'],
    ...weeklyAgg.channels.ovseList.slice(0, 15).map(o => [
      o.ovseId, o.total, o.appIntent, o.appIntentPct + '%', o.webIntent, o.webIntentPct + '%', o.qrScan, o.qrScanPct + '%'
    ])
  ];
  fs.writeFileSync(path.join(dir, 'OVSE_Sharing_Channels_Analysis.csv'), channelRows.map(r => r.map(escapeCSV).join(',')).join('\r\n'), 'utf-8');

  // Write master JSON & JavaScript bundle for dashboard app
  fs.writeFileSync(path.join(dir, 'initial_data.json'), JSON.stringify(masterData, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'initial_data_bundle.js'), `// Auto-generated baseline master data for OVSE Executive Dashboard\nconst BUNDLED_DATA = ${JSON.stringify(masterData, null, 2)};\n`, 'utf-8');

  return masterData;
}

// Master entrypoint
function generateAnalysis(dir = __dirname, explicitFile = null, options = {}) {
  let fileToProcess = explicitFile;
  
  if (!fileToProcess) {
    const detected = findLatestFiles(dir);
    if (detected.unifiedFile) {
      fileToProcess = detected.unifiedFile;
    }
  }

  if (fileToProcess && isUnifiedCSV(fileToProcess)) {
    console.log(`\n============================================================`);
    console.log(`⚡ UNIFIED MASTER INGESTION ENGINE ⚡`);
    console.log(`============================================================`);
    console.log(`[+] Processing Unified Master Export: ${path.basename(fileToProcess)}`);
    const masterData = processUnifiedDataset(fileToProcess, dir, options);
    console.log(`[✓] Generated all 5 Management CSV Reports!`);
    console.log(`[✓] Synced initial_data.json & initial_data_bundle.js`);
    console.log(`- Lifetime Volume: ${masterData.overall.totalTx.toLocaleString()} tx across ${masterData.overall.uniqueCount} OVSEs`);
    console.log(`- Weekly Volume:   ${masterData.weekly.totalTx.toLocaleString()} tx (${masterData.metadata.reportingCutoff})`);
    console.log(`- Lifetime Errors: ${masterData.errors.overall.totalErrors.toLocaleString()} failures`);
    console.log(`- Lifetime Channels: ${masterData.channels.overall.total.toLocaleString()} transactions`);
    console.log(`============================================================\n`);
    return masterData;
  }

  // Fallback for legacy dual transaction files
  const { overallFile, weeklyFile } = findLatestFiles(dir);
  if (!overallFile || !weeklyFile) {
    console.error("Could not find required CSV files in " + dir);
    return;
  }

  console.log(`[+] Fallback Legacy Ingestion:`);
  console.log(`- Overall: ${path.basename(overallFile)}`);
  console.log(`- Weekly:  ${path.basename(weeklyFile)}`);
  // return legacy structure if needed
}

module.exports = {
  parseCSV,
  parseLine,
  isUnifiedCSV,
  processUnifiedDataset,
  generateAnalysis,
  findLatestFiles
};

if (require.main === module) {
  generateAnalysis(__dirname);
}
