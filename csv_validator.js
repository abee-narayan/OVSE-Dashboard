/**
 * CSV Format Validation Utility for OVSE Executive Dashboard
 * 
 * Supports:
 * 1. Unified Master Dataset (Recommended): [Error Code, Ovse ID, Event Timestamp, Auth Result, Cred Exchange Channel, Count]
 * 2. Legacy Transactions: [Ovse ID, Auth Result, Count]
 * 3. Legacy Errors: [Error Code, Ovse ID, Count]
 * 4. Legacy Channels: [Cred Exchange Channel, Ovse ID, Count]
 */

function validateCSVFormat(content, expectedType = 'unified', fileName = 'Uploaded file') {
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    return {
      valid: false,
      error: `Upload Error: "${fileName}" is completely empty. Please select a valid CSV file with data.`
    };
  }

  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) {
    return {
      valid: false,
      error: `Upload Error: "${fileName}" does not contain enough rows. A valid dataset requires at least a header row and one or more data rows.`
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
  const hasDate = headerLower.some(h => h.includes('timestamp') || h.includes('date') || h.includes('time'));
  const hasCount = headerLower.some(h => h.includes('count') || h.includes('volume') || h.includes('tx'));

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

  // 1. Unified Master Dataset Validation (Preferred)
  if (expectedType === 'unified' || detectedType === 'unified') {
    if (headerParts.length < 6) {
      return {
        valid: false,
        error: `Format Notice: "${fileName}" has only ${headerParts.length} column(s). Expected Unified CSV with 6 columns: "Error Code, Ovse ID, Event Timestamp, Auth Result, Cred Exchange Channel, Count".`
      };
    }

    // Inspect first few rows for valid Auth Result ('y' / 'n')
    let validAuthCount = 0;
    let checkedRows = 0;
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      const row = parseLine(lines[i]);
      if (row.length >= 6) {
        checkedRows++;
        const auth = row[3].trim().toLowerCase();
        if (auth === 'y' || auth === 'n') validAuthCount++;
      }
    }
    if (checkedRows > 0 && validAuthCount === 0) {
      return {
        valid: false,
        error: `Format Warning: Column 4 (Auth Result) in "${fileName}" does not contain expected 'Y' or 'N' values.`
      };
    }

    return { valid: true, detectedType: 'unified' };
  }

  // Legacy Page 1: Transactions
  if (expectedType === 'transactions') {
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Ovse ID, Auth Result, Count".`
      };
    }
    return { valid: true, detectedType: 'transactions' };
  } 

  // Legacy Page 2: Errors
  if (expectedType === 'errors') {
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Error Code, Ovse ID, Count".`
      };
    }
    return { valid: true, detectedType: 'errors' };
  } 

  // Legacy Page 3: Channels
  if (expectedType === 'channels') {
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Cred Exchange Channel, Ovse ID, Count".`
      };
    }
    return { valid: true, detectedType: 'channels' };
  }

  return { valid: true, detectedType };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateCSVFormat };
}
