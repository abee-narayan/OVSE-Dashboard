/**
 * Dataset Format Validation Utility (CSV & JSON) for OVSE Executive Dashboard
 * 
 * Supports:
 * 1. Unified Master Dataset CSV (Recommended): Any column order containing [Error Code, Ovse ID, Event Timestamp, Auth Result, Cred Exchange Channel, Count]
 * 2. Unified Master Dataset JSON:
 *    - Raw JSON Array of row objects (or { rows/data/results: [...] })
 *    - Pre-aggregated Master Dashboard JSON ({ overall, weekly, comparison, errors, channels })
 * 3. Legacy Transactions: [Ovse ID, Auth Result, Count]
 * 4. Legacy Errors: [Error Code, Ovse ID, Count]
 * 5. Legacy Channels: [Cred Exchange Channel, Ovse ID, Count]
 */

function validateCSVFormat(content, expectedType = 'unified', fileName = 'Uploaded file') {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return {
      valid: false,
      error: `Upload Error: "${fileName}" is completely empty. Please select a valid CSV or JSON file with data.`
    };
  }

  const trimmed = content.trim();
  const isJson = fileName.toLowerCase().endsWith('.json') || trimmed.startsWith('{') || trimmed.startsWith('[');

  // -------------------------------------------------------------------------
  // A. JSON FORMAT VALIDATION
  // -------------------------------------------------------------------------
  if (isJson) {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return {
        valid: false,
        error: `JSON Syntax Error in "${fileName}": ${e.message}. Please ensure the file is valid JSON.`
      };
    }

    // 1. Pre-aggregated Master Dashboard JSON snapshot (e.g. initial_data.json)
    if (parsed && !Array.isArray(parsed) && parsed.overall && parsed.weekly && Array.isArray(parsed.comparison)) {
      return {
        valid: true,
        detectedType: 'unified',
        format: 'json_master',
        recordCount: parsed.comparison.length
      };
    }

    // 2. Raw JSON Array of records (or { rows: [...] }, { data: [...] }, { results: [...] })
    const arr = Array.isArray(parsed) ? parsed : (parsed?.rows || parsed?.data || parsed?.results || null);
    if (!Array.isArray(arr) || arr.length === 0) {
      return {
        valid: false,
        error: `JSON Structure Error in "${fileName}": Expected either a JSON array of records ([{ "Auth Result": "y", "Ovse ID": "...", "Count": 100, ... }]) or a Master Dashboard JSON object.`
      };
    }

    const firstRow = arr[0];
    if (!firstRow || typeof firstRow !== 'object') {
      return {
        valid: false,
        error: `JSON Structure Error in "${fileName}": Array elements must be JSON objects representing rows.`
      };
    }

    const keysLower = Object.keys(firstRow).map(k => k.toLowerCase().trim());
    const hasError = keysLower.some(k => k.includes('error'));
    const hasAuth = keysLower.some(k => k.includes('auth'));
    const hasChannel = keysLower.some(k => k.includes('channel'));
    const hasOvse = keysLower.some(k => k.includes('ovse') || k.includes('entity'));
    const hasCount = keysLower.some(k => k.includes('count') || k.includes('volume') || k.includes('tx'));

    if ((hasAuth && hasChannel) || (hasAuth && hasError) || (hasAuth && hasOvse && hasCount)) {
      return {
        valid: true,
        detectedType: 'unified',
        format: 'json_raw',
        recordCount: arr.length
      };
    }

    return {
      valid: false,
      error: `JSON Schema Notice in "${fileName}": Missing required fields. Expected keys such as "Auth Result", "Error Code", "Event Timestamp", "Ovse ID", "Cred Exchange Channel", and "Count".`
    };
  }

  // -------------------------------------------------------------------------
  // B. CSV FORMAT VALIDATION
  // -------------------------------------------------------------------------
  const lines = trimmed.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return {
      valid: false,
      error: `Upload Error: "${fileName}" does not contain enough rows. A valid CSV dataset requires at least a header row and one or more data rows.`
    };
  }

  // Parse CSV line respecting quotes
  const parseLine = (line) => {
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        parts.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += ch;
      }
    }
    parts.push(cur.trim().replace(/^"|"$/g, ''));
    return parts;
  };

  const headerParts = parseLine(lines[0]);
  const headerLower = headerParts.map(h => h.toLowerCase());

  const hasErrorCode = headerLower.some(h => h.includes('error code') || h === 'error_code' || h === 'error');
  const hasAuthResult = headerLower.some(h => h.includes('auth result') || h === 'auth_result' || h === 'auth');
  const hasChannel = headerLower.some(h => h.includes('exchange channel') || h.includes('channel') || h === 'channel_type');

  // Detect which dataset type the file matches
  let detectedType = 'unknown';
  if (hasErrorCode && hasAuthResult && hasChannel) {
    detectedType = 'unified';
  } else if (hasAuthResult && !hasErrorCode && !hasChannel) {
    detectedType = 'transactions';
  } else if (hasErrorCode && !hasAuthResult && !hasChannel) {
    detectedType = 'errors';
  } else if (hasChannel && !hasAuthResult && !hasErrorCode) {
    detectedType = 'channels';
  }

  // 1. Unified Master Dataset Validation (Preferred - supports any column order)
  if (expectedType === 'unified' || detectedType === 'unified') {
    if (headerParts.length < 6) {
      return {
        valid: false,
        error: `Format Notice: "${fileName}" has only ${headerParts.length} column(s). Expected Unified CSV with 6 columns: "Auth Result, Error Code, Event Timestamp, Ovse ID, Cred Exchange Channel, Count" (in any order).`
      };
    }

    // Dynamically locate Auth Result column index from header
    const authColIdx = headerLower.findIndex(h => h.includes('auth'));
    const checkCol = authColIdx !== -1 ? authColIdx : 3;

    let validAuthCount = 0;
    let checkedRows = 0;
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      const row = parseLine(lines[i]);
      if (row.length >= 6 && row[checkCol] !== undefined) {
        checkedRows++;
        const auth = row[checkCol].trim().toLowerCase();
        if (auth === 'y' || auth === 'n') validAuthCount++;
      }
    }
    if (checkedRows > 0 && validAuthCount === 0) {
      return {
        valid: false,
        error: `Format Warning: The Auth Result column in "${fileName}" does not contain expected 'Y' or 'N' values.`
      };
    }

    return {
      valid: true,
      detectedType: 'unified',
      format: 'csv',
      recordCount: lines.length - 1
    };
  }

  // Legacy Page 1: Transactions
  if (expectedType === 'transactions') {
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Ovse ID, Auth Result, Count".`
      };
    }
    return { valid: true, detectedType: 'transactions', format: 'csv' };
  } 

  // Legacy Page 2: Errors
  if (expectedType === 'errors') {
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Error Code, Ovse ID, Count".`
      };
    }
    return { valid: true, detectedType: 'errors', format: 'csv' };
  } 

  // Legacy Page 3: Channels
  if (expectedType === 'channels') {
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Cred Exchange Channel, Ovse ID, Count".`
      };
    }
    return { valid: true, detectedType: 'channels', format: 'csv' };
  }

  return { valid: true, detectedType, format: 'csv' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateCSVFormat };
}

