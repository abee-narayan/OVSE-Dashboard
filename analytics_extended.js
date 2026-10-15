const fs = require('fs');
const path = require('path');

// Robust CSV parser
function parseCSV(filePath) {
  if (!fs.existsSync(filePath)) return [];
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
    rows.push(row);
  }
  return rows;
}

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

function analyzeChannels(fOverall, fWeekly) {
  const oRows = parseCSV(fOverall);
  const wRows = parseCSV(fWeekly);

  function aggregateCh(rows) {
    const channelMap = {};
    const ovseMap = {};
    let total = 0;

    for (const r of rows) {
      if (r.length < 3) continue;
      let ch = r[0].replace(/^"|"$/g, '').trim().toUpperCase();
      let ovse = r[1].replace(/^"|"$/g, '').trim() || '(Blank / Unknown)';
      let count = parseInt(r[2].replace(/^"|"$/g, '').replace(/,/g, ''), 10) || 0;

      // Normalize QR
      if (ch === 'QR') ch = 'QR_SCAN';

      channelMap[ch] = (channelMap[ch] || 0) + count;
      total += count;

      if (!ovseMap[ovse]) {
        ovseMap[ovse] = { total: 0, channels: {} };
      }
      ovseMap[ovse].total += count;
      ovseMap[ovse].channels[ch] = (ovseMap[ovse].channels[ch] || 0) + count;
    }

    const channelList = Object.entries(channelMap).map(([channel, count]) => ({
      channel,
      displayName: channel === 'APP_INTENT' ? 'App-to-App (App Intent)' : (channel === 'WEB_INTENT' ? 'Web-to-App (Web Intent)' : 'Cross-Device QR (QR Scan)'),
      count,
      pct: total > 0 ? (count / total) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    const ovseList = Object.entries(ovseMap).map(([ovseId, data]) => ({
      ovseId,
      total: data.total,
      appIntent: data.channels['APP_INTENT'] || 0,
      webIntent: data.channels['WEB_INTENT'] || 0,
      qrScan: data.channels['QR_SCAN'] || 0,
      appIntentPct: data.total > 0 ? (((data.channels['APP_INTENT'] || 0) / data.total) * 100).toFixed(1) : '0.0',
      webIntentPct: data.total > 0 ? (((data.channels['WEB_INTENT'] || 0) / data.total) * 100).toFixed(1) : '0.0',
      qrScanPct: data.total > 0 ? (((data.channels['QR_SCAN'] || 0) / data.total) * 100).toFixed(1) : '0.0',
    })).sort((a, b) => b.total - a.total);

    return { total, channelMap, channelList, ovseList };
  }

  const overall = aggregateCh(oRows);
  const weekly = aggregateCh(wRows);

  // Growth comparison for channels
  const comparison = overall.channelList.map(oItem => {
    const wItem = weekly.channelList.find(w => w.channel === oItem.channel) || { count: 0, pct: 0 };
    return {
      channel: oItem.channel,
      displayName: oItem.displayName,
      overallCount: oItem.count,
      overallPct: oItem.pct.toFixed(2),
      weeklyCount: wItem.count,
      weeklyPct: wItem.pct.toFixed(2),
      weeklyShareOfLifetime: oItem.count > 0 ? ((wItem.count / oItem.count) * 100).toFixed(2) : '0.00',
      pctPointDelta: (wItem.pct - oItem.pct).toFixed(2) // positive means adoption surged this week
    };
  });

  return { overall, weekly, comparison };
}

function analyzeErrors(fOverall, fWeekly) {
  const oRows = parseCSV(fOverall);
  const wRows = parseCSV(fWeekly);

  function aggregateErr(rows) {
    const codeMap = {};
    const ovseMap = {};
    const categoryMap = {};
    let totalErrors = 0;
    let totalSuccesses = 0;

    for (const r of rows) {
      if (r.length < 3) continue;
      const rawCode = r[0].replace(/^"|"$/g, '').trim();
      const ovse = r[1].replace(/^"|"$/g, '').trim() || '(Blank / Unknown)';
      const count = parseInt(r[2].replace(/^"|"$/g, '').replace(/,/g, ''), 10) || 0;

      if (!rawCode || rawCode === '') {
        totalSuccesses += count;
        continue;
      }

      const code = rawCode;
      codeMap[code] = (codeMap[code] || 0) + count;
      totalErrors += count;

      const cat = ERROR_CATEGORIES[code] || 'Other System Errors';
      categoryMap[cat] = (categoryMap[cat] || 0) + count;

      if (!ovseMap[ovse]) {
        ovseMap[ovse] = { totalErrors: 0, codes: {} };
      }
      ovseMap[ovse].totalErrors += count;
      ovseMap[ovse].codes[code] = (ovseMap[ovse].codes[code] || 0) + count;
    }

    const codeList = Object.entries(codeMap).map(([code, count]) => ({
      code,
      description: ERROR_DESCRIPTIONS[code] || 'UIDAI transaction error code ' + code,
      category: ERROR_CATEGORIES[code] || 'Other System Errors',
      count,
      pctOfErrors: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    const categoryList = Object.entries(categoryMap).map(([category, count]) => ({
      category,
      count,
      pct: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    })).sort((a, b) => b.count - a.count);

    const ovseErrorList = Object.entries(ovseMap).map(([ovseId, data]) => {
      const topCodes = Object.entries(data.codes).sort((a, b) => b[1] - a[1]).slice(0, 3);
      return {
        ovseId,
        totalErrors: data.totalErrors,
        topErrorCode: topCodes.length > 0 ? topCodes[0][0] : 'None',
        topErrorCount: topCodes.length > 0 ? topCodes[0][1] : 0,
        codes: data.codes
      };
    }).sort((a, b) => b.totalErrors - a.totalErrors);

    return { totalErrors, totalSuccesses, codeList, categoryList, ovseErrorList };
  }

  const overall = aggregateErr(oRows);
  const weekly = aggregateErr(wRows);

  // Compare error codes overall vs weekly
  const allCodes = new Set([...overall.codeList.map(c => c.code), ...weekly.codeList.map(c => c.code)]);
  const comparison = Array.from(allCodes).map(code => {
    const o = overall.codeList.find(c => c.code === code) || { count: 0, pctOfErrors: 0 };
    const w = weekly.codeList.find(c => c.code === code) || { count: 0, pctOfErrors: 0 };
    return {
      code,
      description: ERROR_DESCRIPTIONS[code] || 'UIDAI error code ' + code,
      category: ERROR_CATEGORIES[code] || 'Other System Errors',
      overallCount: o.count,
      overallPct: o.pctOfErrors.toFixed(2),
      weeklyCount: w.count,
      weeklyPct: w.pctOfErrors.toFixed(2),
      pctPointDelta: (w.pctOfErrors - o.pctOfErrors).toFixed(2)
    };
  }).sort((a, b) => b.weeklyCount - a.weeklyCount || b.overallCount - a.overallCount);

  return { overall, weekly, comparison };
}

function generateExtendedAnalytics(dir = __dirname) {
  // If master data already exists in initial_data.json, reuse it
  const initialDataPath = path.join(dir, 'initial_data.json');
  if (fs.existsSync(initialDataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(initialDataPath, 'utf-8'));
      if (data.channels && data.errors && data.metadata?.isUnifiedMaster) {
        return { channels: data.channels, errors: data.errors };
      }
    } catch (e) {}
  }

  const fChanOverall = path.join(dir, 'query_result_2026-10-14T16_40_50.390522+05_30.csv');
  let fChanWeek = path.join(dir, 'query_result_2026-10-14T16_41_07.437168+05_30.csv');
  if (!fs.existsSync(fChanWeek)) {
    fChanWeek = path.join(dir, 'query_result_2026-10-14T16_41_07.437168+05_30 - Copy.csv');
  }

  const fErrOverall = path.join(dir, 'query_result_2026-10-14T17_25_26.025521+05_30.csv');
  const fErrWeek = path.join(dir, 'query_result_2026-10-14T17_25_49.077416+05_30.csv');

  console.log('Processing Extended Datasets (Channels & Errors)...');
  const channels = analyzeChannels(fChanOverall, fChanWeek);
  const errors = analyzeErrors(fErrOverall, fErrWeek);

  // Generate CSV 1: Channel Analysis CSV
  const channelHeaders = ['Channel Code', 'Channel Description', 'Weekly Volume', 'Weekly Share %', 'Overall Lifetime Volume', 'Overall Lifetime Share %', 'Adoption Delta (%)'];
  const channelRows = [
    ['OVSE DATA SHARING CHANNELS - EXECUTIVE ANALYSIS REPORT'],
    ['Generated At', new Date().toLocaleString()],
    ['', '', '', '', '', '', ''],
    channelHeaders,
    ...channels.comparison.map(c => [
      c.channel, c.displayName, c.weeklyCount, c.weeklyPct + '%', c.overallCount, c.overallPct + '%', (Number(c.pctPointDelta) > 0 ? '+' : '') + c.pctPointDelta + '%'
    ]),
    ['', '', '', '', '', '', ''],
    ['TOP OVSEs BY CHANNEL USAGE (WEEKLY)'],
    ['OVSE ID', 'Total Weekly Tx', 'App Intent Tx', 'App Intent Share %', 'Web Intent Tx', 'Web Intent Share %', 'QR Scan Tx', 'QR Scan Share %'],
    ...channels.weekly.ovseList.slice(0, 15).map(o => [
      o.ovseId, o.total, o.appIntent, o.appIntentPct + '%', o.webIntent, o.webIntentPct + '%', o.qrScan, o.qrScanPct + '%'
    ])
  ];

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return '""';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const channelCSVContent = channelRows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const channelCSVPath = path.join(dir, 'OVSE_Sharing_Channels_Analysis.csv');
  fs.writeFileSync(channelCSVPath, channelCSVContent, 'utf-8');
  console.log(`[✓] Generated: ${path.basename(channelCSVPath)}`);

  // Generate CSV 2: Error Code Analysis CSV
  const errorHeaders = ['Error Code', 'Category', 'Description / Meaning', 'Weekly Failures', 'Weekly Failure Share %', 'Lifetime Failures', 'Lifetime Failure Share %', 'Trend Delta (%)'];
  const errorRows = [
    ['UIDAI OVSE ERROR CODE INTELLIGENCE - EXECUTIVE REPORT'],
    ['Generated At', new Date().toLocaleString()],
    ['', '', '', '', '', '', '', ''],
    errorHeaders,
    ...errors.comparison.map(e => [
      e.code, e.category, e.description, e.weeklyCount, e.weeklyPct + '%', e.overallCount, e.overallPct + '%', (Number(e.pctPointDelta) > 0 ? '+' : '') + e.pctPointDelta + '%'
    ]),
    ['', '', '', '', '', '', '', ''],
    ['TOP IMPACTED OVSE ENTITIES BY ERROR COUNT (WEEKLY)'],
    ['OVSE ID', 'Total Weekly Failures', 'Dominant Error Code', 'Dominant Error Count', 'Dominant Error Share %'],
    ...errors.weekly.ovseErrorList.slice(0, 15).map(o => [
      o.ovseId, o.totalErrors, o.topErrorCode, o.topErrorCount, o.totalErrors > 0 ? ((o.topErrorCount / o.totalErrors) * 100).toFixed(1) + '%' : '0%'
    ])
  ];

  const errorCSVContent = errorRows.map(r => r.map(escapeCSV).join(',')).join('\r\n');
  const errorCSVPath = path.join(dir, 'OVSE_Error_Code_Analysis.csv');
  fs.writeFileSync(errorCSVPath, errorCSVContent, 'utf-8');
  console.log(`[✓] Generated: ${path.basename(errorCSVPath)}`);

  return { channels, errors };
}

module.exports = {
  analyzeChannels,
  analyzeErrors,
  generateExtendedAnalytics
};

if (require.main === module) {
  generateExtendedAnalytics(__dirname);
}
