# OVSE Transaction Intelligence & Executive Dashboard

An enterprise-grade executive analytics portal and reporting engine built for monitoring **Online Verification Service Entities (OVSE)** transaction volumes, quality rates, and onboarding momentum.

Now configured with **Secure User Authentication (Username/Password)** and ready for **1-Click Hosting on Render.com** or running locally.

---

## 🔐 Default Login Credentials

When launching locally or accessing the portal:
- **Username:** `admin`
- **Password:** `ovse2026!`

*(You can customize these credentials in `.env` locally or via Render Environment Variables in the cloud).*

---

## ☁️ How to Host on Render (Step-by-Step Guide)

You can host this portal for free on [Render](https://render.com) with automatic HTTPS and multi-user access.

### Step 1: Push This Project to GitHub
1. Open PowerShell or Terminal in this folder (`C:\Users\Microsave LTD\Desktop\OVSE Dashboard`).
2. Initialize and push your repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: OVSE Executive Dashboard with Auth & Render support"
   git branch -M main
   git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/ovse-dashboard.git
   git push -u origin main
   ```

### Step 2: Deploy on Render
1. Go to [https://dashboard.render.com](https://dashboard.render.com) and sign in (or sign up with GitHub).
2. Click **"New +"** in the top right and select **"Web Service"**.
3. Choose **"Build and deploy from a Git repository"** and connect your `ovse-dashboard` repository.
4. Render will automatically detect the settings from `package.json` and `render.yaml`:
   - **Name:** `ovse-executive-dashboard`
   - **Region:** Any (e.g. Singapore, Frankfurt, or Oregon)
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** `Free`

### Step 3: Configure Your Username & Password on Render
Scroll down to the **"Environment Variables"** section and add:
- `ADMIN_USERNAME` = `admin` *(or your custom username)*
- `ADMIN_PASSWORD` = `YourCustomStrongPassword123!` *(set your secret password)*
- `SESSION_SECRET` = `a_long_random_secure_secret_string`
- `NODE_ENV` = `production`

5. Click **"Create Web Service"**.
6. Render will build and deploy your app in 1–2 minutes. You will receive a public secure URL like:
   `https://ovse-executive-dashboard.onrender.com`

---

## 🔄 How Weekly Ingestion Works on Render

Once hosted on Render:
1. Open your Render URL in your web browser.
2. Sign in with your username and password.
3. Every week, click the **"Weekly Data Ingestion"** button in the top navigation bar.
4. Drag & drop or select your two new CSV exports:
   - **Dropzone 1:** Overall cumulative transactions file
   - **Dropzone 2:** Last 1-week transactions file
5. Click **"⚡ Process & Update Dashboard"**.
6. The server automatically ingests the CSVs, recalculates all KPIs, updates all charts, refreshes the rankings, and prepares new downloadable CSV reports for Senior Management.

---

## 💻 Running Locally on Windows

### 1. Launch with Web Server & Authentication (Recommended)
- **Double-click** `launch_dashboard.bat`.
- The server starts on `http://localhost:3000` and automatically opens in your browser.
- Log in with `admin` / `ovse2026!`.

### 2. Run Headless Script Ingestion
- Copy your new CSVs into this folder.
- **Double-click** `update_weekly_report.bat`.
- Re-generates all CSV reports in 2 seconds.

---

## 📊 Summary of Baseline Analysis (October 14, 2026 Cutoff)

### 1. Cumulative vs Weekly Volume & Quality Metrics
| Operational Metric | Overall (Lifetime Cumulative) | Last 1 Week | Variance / Trajectory |
| :--- | :---: | :---: | :---: |
| **Total Volume** | **6,613,182** transactions | **201,036** transactions | 3.04% of lifetime volume executed this week |
| **Success Count** | 4,794,110 | 180,023 | 89.55% weekly success rate |
| **Failure Count** | 1,819,072 | 21,013 | 10.45% weekly failure rate |
| **Success Rate %** | **72.49%** | **89.55%** | **+17.06% surge** in transaction reliability |
| **Failure Rate %** | **27.51%** | **10.45%** | **-17.06% reduction** in failure rate |
| **Active OVSEs** | 221 registered entities | 82 entities | **37.1% active entity participation** |

### 2. Top 5 OVSE Entities Overall (Cumulative Lifetime)
1. **SelectiveShare**: 2,604,063 tx | **99.99%** Success | 0.01% Failure
2. **tspolice**: 2,247,973 tx | **28.69%** Success | **71.31%** Failure
3. **000**: 1,219,372 tx | **99.92%** Success | 0.08% Failure
4. **urbancompany**: 250,013 tx | **59.00%** Success | **41.00%** Failure
5. **tnmc**: 50,617 tx | **69.99%** Success | 30.01% Failure

### 3. Top 5 OVSE Entities (Last 1 Week)
1. **SelectiveShare**: 151,735 tx | **99.99%** Success | Rank #1 (Stable)
2. **urbancompany**: 21,601 tx | **54.00%** Success | Rank #2 (Climbed from #4)
3. **gridlines**: 5,375 tx | **51.11%** Success | Rank #3 (Climbed from #6)
4. **LIC of India** (`life-insurance-corporation-of-india`): 4,747 tx | **48.43%** Success | Rank #4 (Surged from #13)
5. **protean**: 3,776 tx | **83.71%** Success | Rank #5 (Surged from #14)

### 4. New Entrants & High-Surge Entities Spotlight
- **Brand New Entrants** (100% of historical transactions executed during this week):
  - `202609177828`: 14 transactions (100% failure rate)
  - `null`: 2 transactions (100% failure rate)
- **High-Surge Rapid Adopters** (>40% of lifetime transactions executed in this week alone):
  - **LIC of India**: 4,747 weekly / 9,345 overall (**50.8%** weekly share)
  - **Protean**: 3,776 weekly / 6,159 overall (**61.3%** weekly share)
  - **Punjab School Education Board**: 327 weekly / 700 overall (**46.7%** weekly share)
  - **Transaction Analysts**: 35 weekly / 72 overall (**48.6%** weekly share)
  - **Doklink Services**: 20 weekly / 31 overall (**64.5%** weekly share, 100% success rate)
  - **Tadoba Andhari Tiger Reserve**: 19 weekly / 25 overall (**76.0%** weekly share, 0% success rate)

---

## 📁 Project File Structure
```
OVSE Dashboard/
│
├── server.js                            # Express backend server with Auth & API endpoints
├── render.yaml                          # Render Blueprint for 1-click cloud deployment
├── package.json                         # Node dependencies & start scripts
├── .env.example                         # Environment variable template
├── .gitignore                           # Git ignore configuration
│
├── index.html                           # Protected Executive Dashboard Portal (Tailwind + Chart.js)
├── public/
│   └── login.html                       # Enterprise Login Screen with password toggle
│
├── initial_data_bundle.js               # Bundled initial baseline dataset
├── initial_data.json                    # Structured JSON data export
│
├── generate_report.js                   # Data parsing & analytics computation engine
├── launch_dashboard.bat                 # 1-Click Windows batch script to launch local server
├── update_weekly_report.bat             # 1-Click Windows batch script for automated weekly ingestion
│
├── OVSE_Executive_Summary_Report.csv    # Export 1: High-level metrics for senior management email
├── OVSE_Full_Comparative_Analysis.csv   # Export 2: Complete dataset across all 221 entities
├── OVSE_New_and_Surging_Entrants.csv    # Export 3: Isolated list of emerging & surging entities
│
├── ovse_wise_transactions_count_...csv  # Baseline input file (Overall)
└── query_result_...csv                  # Baseline input file (Last 1 Week)
```
