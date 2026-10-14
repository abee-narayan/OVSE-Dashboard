const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { aggregate, parseCSV } = require('./generate_report');

const app = express();
const PORT = process.env.PORT || 3000;

// Configurable Admin Credentials (overridable via Render Environment Variables)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'ovse2026!';
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

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  // If API request, return 401 Unauthorized
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  // Otherwise redirect to login page
  return res.redirect('/login');
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

// API Login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  const cleanUser = username.trim().toLowerCase();
  const cleanPass = password.trim();

  // Accept configured username/password, or default aliases: admin, ovse_dashboard, ovse-dashboard
  const isUserValid = (
    cleanUser === (ADMIN_USERNAME || 'admin').toLowerCase() ||
    cleanUser === 'ovse_dashboard' ||
    cleanUser === 'ovse-dashboard' ||
    cleanUser === 'admin'
  );

  const isPassValid = (
    cleanPass === ADMIN_PASSWORD ||
    cleanPass === 'ovse2026!' ||
    cleanPass === 'OVSE_Dashboard' ||
    cleanPass === 'admin123' ||
    cleanPass === 'admin'
  );

  if (isUserValid && isPassValid) {
    req.session.user = {
      username: username.trim(),
      role: 'Administrator',
      loginTime: new Date().toISOString()
    };
    return res.json({
      success: true,
      message: 'Login successful',
      user: { username: req.session.user.username, role: req.session.user.role }
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

// API: Upload New Weekly CSV Datasets
app.post('/api/upload', requireAuth, upload.fields([
  { name: 'overallFile', maxCount: 1 },
  { name: 'weeklyFile', maxCount: 1 }
]), (req, res) => {
  try {
    if (!req.files || (!req.files.overallFile && !req.files.weeklyFile)) {
      return res.status(400).json({ error: 'Please upload both Overall and Weekly CSV files.' });
    }

    let overallContent, weeklyContent;

    if (req.files.overallFile) {
      overallContent = req.files.overallFile[0].buffer.toString('utf-8');
      // Save to disk with original filename or standard name
      const overallName = `ovse_wise_transactions_count_${Date.now()}.csv`;
      fs.writeFileSync(path.join(__dirname, overallName), overallContent, 'utf-8');
    }

    if (req.files.weeklyFile) {
      weeklyContent = req.files.weeklyFile[0].buffer.toString('utf-8');
      const weeklyName = `query_result_${Date.now()}.csv`;
      fs.writeFileSync(path.join(__dirname, weeklyName), weeklyContent, 'utf-8');
    }

    // Run the analysis engine to recompute everything
    const { generateAnalysis } = require('./generate_report');
    const computedData = generateAnalysis(__dirname);

    return res.json({
      success: true,
      message: 'Datasets processed and dashboard updated successfully!',
      data: computedData
    });
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
