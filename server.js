const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { aggregate, parseCSV } = require('./generate_report');
const { validateCSVFormat } = require('./csv_validator');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurable Credentials (overridable via Render Environment Variables)
// 1. Admin: Can view, download, and upload new data files
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Ovse#Secure9241!Admin';

// 2. User / Viewer: Can view and download data only (cannot upload)
const VIEWER_USERNAME = process.env.VIEWER_USERNAME || process.env.USER_USERNAME || 'viewer';
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || process.env.USER_PASSWORD || 'Ovse#View7583!User';

const SESSION_SECRET = process.env.SESSION_SECRET || 'ovse-secret-session-key-2026';

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE === 'true', // true if HTTPS behind proxy
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days session
  }
}));

// Configure Multer for in-memory file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB max file size
});

// Authentication middleware (any authenticated user)
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  return res.redirect('/login');
}

// Role-based authorization middleware (Admin only for uploads)
function requireAdmin(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({
    error: 'Access Denied: Only Administrator accounts have permission to upload weekly data files.'
  });
}

// -------------------------------------------------------------
// PUBLIC AUTH ROUTES
// -------------------------------------------------------------

// Serve Login Page
app.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// API Login with Role-Based Authentication
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  // 1. Check Administrator Access (Full Access + File Uploads)
  const isAdminUser = (
    cleanUser === (ADMIN_USERNAME || 'admin').toLowerCase() ||
    cleanUser === 'ovse_admin' ||
    cleanUser === 'admin'
  );
  const isAdminPass = (cleanPass === ADMIN_PASSWORD);

  if (isAdminUser && isAdminPass) {
    req.session.user = {
      username: username.trim(),
      role: 'admin',
      displayName: 'Administrator (Upload & View)',
      canUpload: true,
      loginTime: new Date().toISOString()
    };
    return res.json({
      success: true,
      message: 'Admin login successful',
      user: req.session.user
    });
  }

  // 2. Check User / Viewer Access (View & Download Data Only)
  const isViewerUser = (
    cleanUser === (VIEWER_USERNAME || 'viewer').toLowerCase() ||
    cleanUser === 'viewer' ||
    cleanUser === 'user' ||
    cleanUser === 'executive'
  );
  const isViewerPass = (cleanPass === VIEWER_PASSWORD);

  if (isViewerUser && isViewerPass) {
    req.session.user = {
      username: username.trim(),
      role: 'viewer',
      displayName: 'User / Executive (View & Download)',
      canUpload: false,
      loginTime: new Date().toISOString()
    };
    return res.json({
      success: true,
      message: 'Viewer login successful',
      user: req.session.user
    });
  }

  return res.status(401).json({ error: 'Invalid username or password.' });
});

// API Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to log out.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Logged out successfully.' });
  });
});

// Auth status check
app.get('/api/auth-check', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({
      authenticated: true,
      user: req.session.user
    });
  }
  return res.json({ authenticated: false });
});

// -------------------------------------------------------------
// PROTECTED APPLICATION ROUTES
// -------------------------------------------------------------

// Serve static assets from public folder (CSS, icons, etc.) with auth check for sensitive pages
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));

// API: Get Current Dashboard Data
app.get('/api/data', requireAuth, (req, res) => {
  const dataPath = path.join(__dirname, 'initial_data.json');
  if (fs.existsSync(dataPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
      return res.json({ success: true, data });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to read dashboard data.' });
    }
  }
  return res.status(404).json({ error: 'No data file found.' });
});

// API: Upload New Weekly CSV Datasets (Strictly Admin Only)
app.post('/api/upload', requireAuth, requireAdmin, upload.fields([
  { name: 'overallFile', maxCount: 1 },
  { name: 'weeklyFile', maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files || (!req.files.overallFile && !req.files.weeklyFile)) {
      return res.status(400).json({ error: 'Please upload at least one CSV file (Overall or Weekly).' });
    }

    const datasetType = req.body.datasetType || 'transactions';

    // Strictly validate CSV formats before processing
    if (req.files.overallFile) {
      const overallContent = req.files.overallFile[0].buffer.toString('utf-8');
      const val = validateCSVFormat(overallContent, datasetType, req.files.overallFile[0].originalname);
      if (!val.valid) {
        return res.status(400).json({ error: val.error });
      }
    }

    if (req.files.weeklyFile) {
      const weeklyContent = req.files.weeklyFile[0].buffer.toString('utf-8');
      const val = validateCSVFormat(weeklyContent, datasetType, req.files.weeklyFile[0].originalname);
      if (!val.valid) {
        return res.status(400).json({ error: val.error });
      }
    }

    let overallPath = null;
    let weeklyPath = null;

    if (req.files.overallFile) {
      const overallContent = req.files.overallFile[0].buffer.toString('utf-8');
      const overallName = `${datasetType}_overall_${Date.now()}.csv`;
      overallPath = path.join(__dirname, overallName);
      fs.writeFileSync(overallPath, overallContent, 'utf-8');
    }

    if (req.files.weeklyFile) {
      const weeklyContent = req.files.weeklyFile[0].buffer.toString('utf-8');
      const weeklyName = `${datasetType}_weekly_${Date.now()}.csv`;
      weeklyPath = path.join(__dirname, weeklyName);
      fs.writeFileSync(weeklyPath, weeklyContent, 'utf-8');
    }

    // Load master initial_data.json
    const initialDataPath = path.join(__dirname, 'initial_data.json');
    let currentMaster = {};
    if (fs.existsSync(initialDataPath)) {
      try {
        currentMaster = JSON.parse(fs.readFileSync(initialDataPath, 'utf-8'));
      } catch (e) {}
    }

    if (datasetType === 'errors') {
      const { analyzeErrors } = require('./analytics_extended');
      const defaultOverall = path.join(__dirname, 'query_result_2026-10-14T17_25_26.025521+05_30.csv');
      const defaultWeekly = path.join(__dirname, 'query_result_2026-10-14T17_25_49.077416+05_30.csv');
      const errorsResult = analyzeErrors(overallPath || defaultOverall, weeklyPath || defaultWeekly);
      currentMaster.errors = errorsResult;
      currentMaster.lastUpdatedLocal = new Date().toISOString();
      fs.writeFileSync(initialDataPath, JSON.stringify(currentMaster, null, 2), 'utf-8');
      fs.writeFileSync(path.join(__dirname, 'initial_data_bundle.js'), `// Auto-generated baseline master data for OVSE Executive Dashboard\nconst BUNDLED_DATA = ${JSON.stringify(currentMaster, null, 2)};\n`, 'utf-8');

      return res.json({
        success: true,
        message: 'UIDAI Error datasets processed and Tab 2 updated successfully!',
        data: currentMaster
      });
    } else if (datasetType === 'channels') {
      const { analyzeChannels } = require('./analytics_extended');
      const defaultOverall = path.join(__dirname, 'query_result_2026-10-14T16_40_50.390522+05_30.csv');
      const defaultWeekly = path.join(__dirname, 'query_result_2026-10-14T16_41_07.437168+05_30.csv');
      const channelsResult = analyzeChannels(overallPath || defaultOverall, weeklyPath || defaultWeekly);
      currentMaster.channels = channelsResult;
      currentMaster.lastUpdatedLocal = new Date().toISOString();
      fs.writeFileSync(initialDataPath, JSON.stringify(currentMaster, null, 2), 'utf-8');
      fs.writeFileSync(path.join(__dirname, 'initial_data_bundle.js'), `// Auto-generated baseline master data for OVSE Executive Dashboard\nconst BUNDLED_DATA = ${JSON.stringify(currentMaster, null, 2)};\n`, 'utf-8');

      return res.json({
        success: true,
        message: 'Data sharing channels processed and Tab 3 updated successfully!',
        data: currentMaster
      });
    } else {
      // Default: transactions
      const { generateAnalysis } = require('./generate_report');
      const computedData = generateAnalysis(__dirname);
      currentMaster = {
        ...currentMaster,
        ...computedData,
        lastUpdatedLocal: new Date().toISOString()
      };
      fs.writeFileSync(initialDataPath, JSON.stringify(currentMaster, null, 2), 'utf-8');
      fs.writeFileSync(path.join(__dirname, 'initial_data_bundle.js'), `// Auto-generated baseline master data for OVSE Executive Dashboard\nconst BUNDLED_DATA = ${JSON.stringify(currentMaster, null, 2)};\n`, 'utf-8');

      return res.json({
        success: true,
        message: 'Transaction datasets processed and Page 1 updated successfully!',
        data: currentMaster
      });
    }
  } catch (err) {
    console.error('Upload processing error:', err);
    return res.status(500).json({ error: 'Failed to process files: ' + err.message });
  }
});

// CSV Direct Download Endpoints
app.get('/api/download/executive-summary', requireAuth, (req, res) => {
  const filePath = path.join(__dirname, 'OVSE_Executive_Summary_Report.csv');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'OVSE_Executive_Summary_Report.csv');
  }
  res.status(404).send('Report not generated yet.');
});

app.get('/api/download/full-analysis', requireAuth, (req, res) => {
  const filePath = path.join(__dirname, 'OVSE_Full_Comparative_Analysis.csv');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'OVSE_Full_Comparative_Analysis.csv');
  }
  res.status(404).send('Analysis not generated yet.');
});

app.get('/api/download/new-entrants', requireAuth, (req, res) => {
  const filePath = path.join(__dirname, 'OVSE_New_and_Surging_Entrants.csv');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'OVSE_New_and_Surging_Entrants.csv');
  }
  res.status(404).send('New entrants list not generated yet.');
});

app.get('/api/download/error-analysis', requireAuth, (req, res) => {
  const filePath = path.join(__dirname, 'OVSE_Error_Code_Analysis.csv');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'OVSE_Error_Code_Analysis.csv');
  }
  res.status(404).send('Error analysis report not generated yet.');
});

app.get('/api/download/channel-analysis', requireAuth, (req, res) => {
  const filePath = path.join(__dirname, 'OVSE_Sharing_Channels_Analysis.csv');
  if (fs.existsSync(filePath)) {
    return res.download(filePath, 'OVSE_Sharing_Channels_Analysis.csv');
  }
  res.status(404).send('Channel analysis report not generated yet.');
});

// Serve the Main Protected Dashboard at "/"
app.get('/', requireAuth, (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve initial_data_bundle.js
app.get('/initial_data_bundle.js', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'initial_data_bundle.js'));
});

// Health check endpoint for Render monitoring
app.get('/healthz', (req, res) => {
  res.status(200).send('OK');
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🚀 OVSE Executive Dashboard Server Running!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🔐 Default Credentials: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  console.log(`☁️ Ready for Render deployment!`);
  console.log(`=======================================================`);
});
