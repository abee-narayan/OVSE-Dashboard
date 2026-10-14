/**
 * CSV Format Validation Utility for OVSE Executive Dashboard
 * 
 * Validates uploaded CSV datasets against required schemas for:
 * 1. Transactions (Page 1): Expected columns [Ovse ID, Auth Result, Count]
 * 2. Errors (Page 2): Expected columns [Error Code, Ovse ID, Count]
 * 3. Channels (Page 3): Expected columns [Cred Exchange Channel, Ovse ID, Count]
 */

function validateCSVFormat(content, expectedType, fileName = 'Uploaded file') {
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

  // Detect which dataset type the file matches
  let detectedType = 'unknown';
  if (headerLower.some(h => h.includes('auth result') || h === 'auth_result' || h === 'auth')) {
    detectedType = 'transactions';
  } else if (headerLower.some(h => h.includes('error code') || h === 'error_code' || h === 'error')) {
    detectedType = 'errors';
  } else if (headerLower.some(h => h.includes('exchange channel') || h.includes('channel') || h === 'channel_type')) {
    detectedType = 'channels';
  }

  // Page 1: Transactions
  if (expectedType === 'transactions') {
    if (detectedType === 'errors') {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" appears to be a UIDAI Error Code dataset (columns: ${headerParts.join(', ')}).\n\nYou are on Page 1 (OVSE Transactions). Please switch to Page 2 (UIDAI Errors) to upload this file, or upload an OVSE Transaction dataset with columns: "Ovse ID, Auth Result, Count".`
      };
    }
    if (detectedType === 'channels') {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" appears to be a Data Sharing Channels dataset (columns: ${headerParts.join(', ')}).\n\nYou are on Page 1 (OVSE Transactions). Please switch to Page 3 (Sharing Channels) to upload this file, or upload an OVSE Transaction dataset with columns: "Ovse ID, Auth Result, Count".`
      };
    }
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Ovse ID, Auth Result, Count".`
      };
    }

    // Inspect first few data rows for Auth Result ('y' / 'n')
    let validAuthCount = 0;
    let checkedRows = 0;
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      const row = parseLine(lines[i]);
      if (row.length >= 3) {
        checkedRows++;
        const auth = row[1].trim().toLowerCase();
        if (auth === 'y' || auth === 'n') validAuthCount++;
      }
    }
    if (checkedRows > 0 && validAuthCount === 0) {
      return {
        valid: false,
        error: `Wrong Data Format: Column 2 in "${fileName}" does not contain transaction auth results ('Y' or 'N').\n\nExpected columns: "Ovse ID, Auth Result ('Y'/'N'), Count". Found values like "${parseLine(lines[1])[1]}".`
      };
    }
  } 
  // Page 2: Errors
  else if (expectedType === 'errors') {
    if (detectedType === 'transactions') {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" appears to be an OVSE Transaction dataset (columns: ${headerParts.join(', ')}).\n\nYou are on Page 2 (UIDAI Errors). Please switch to Page 1 (Transactions) to upload this file, or upload an Error Code dataset with columns: "Error Code, Ovse ID, Count".`
      };
    }
    if (detectedType === 'channels') {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" appears to be a Data Sharing Channels dataset (columns: ${headerParts.join(', ')}).\n\nYou are on Page 2 (UIDAI Errors). Please switch to Page 3 (Sharing Channels) to upload this file, or upload an Error Code dataset with columns: "Error Code, Ovse ID, Count".`
      };
    }
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Error Code, Ovse ID, Count".`
      };
    }
  } 
  // Page 3: Channels
  else if (expectedType === 'channels') {
    if (detectedType === 'transactions') {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" appears to be an OVSE Transaction dataset (columns: ${headerParts.join(', ')}).\n\nYou are on Page 3 (Sharing Channels). Please switch to Page 1 (Transactions) to upload this file, or upload a Sharing Channels dataset with columns: "Cred Exchange Channel, Ovse ID, Count".`
      };
    }
    if (detectedType === 'errors') {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" appears to be a UIDAI Error Code dataset (columns: ${headerParts.join(', ')}).\n\nYou are on Page 3 (Sharing Channels). Please switch to Page 2 (UIDAI Errors) to upload this file, or upload a Sharing Channels dataset with columns: "Cred Exchange Channel, Ovse ID, Count".`
      };
    }
    if (headerParts.length < 3) {
      return {
        valid: false,
        error: `Wrong Data Format: "${fileName}" has only ${headerParts.length} column(s). Expected 3 columns: "Cred Exchange Channel, Ovse ID, Count".`
      };
    }

    // Inspect first few data rows for channel values
    let validChannelCount = 0;
    let checkedRows = 0;
    const knownChannels = new Set(['APP_INTENT', 'WEB_INTENT', 'QR', 'QR_SCAN', 'APP', 'WEB']);
    for (let i = 1; i < Math.min(lines.length, 30); i++) {
      const row = parseLine(lines[i]);
      if (row.length >= 3) {
        checkedRows++;
        const ch = row[0].trim().toUpperCase();
        if (knownChannels.has(ch) || ch.includes('INTENT') || ch.includes('QR')) validChannelCount++;
      }
    }
    if (checkedRows > 0 && validChannelCount === 0) {
      return {
        valid: false,
        error: `Wrong Data Format: Column 1 in "${fileName}" does not contain valid sharing channels (e.g. APP_INTENT, WEB_INTENT, QR_SCAN).\n\nFound values like "${parseLine(lines[1])[0]}".`
      };
    }
  }

  // Row count check: verify Count column has numeric values
  let numericCountFound = 0;
  for (let i = 1; i < Math.min(lines.length, 20); i++) {
    const row = parseLine(lines[i]);
    if (row.length >= 3) {
      const countVal = row[2].replace(/,/g, '').trim();
      if (!isNaN(Number(countVal)) && countVal !== '') numericCountFound++;
    }
  }
  if (numericCountFound === 0 && lines.length > 1) {
    return {
      valid: false,
      error: `Wrong Data Format: Column 3 in "${fileName}" is expected to contain numeric transaction/error counts, but no valid numbers were found in sample rows.`
    };
  }

  return { valid: true, detectedType };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { validateCSVFormat };
}
