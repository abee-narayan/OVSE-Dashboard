@echo off
title OVSE Weekly Report Updater
echo ===================================================================
echo     OVSE TRANSACTION INTELLIGENCE - AUTOMATED WEEKLY INGESTION
echo ===================================================================
echo.
echo Scanning workspace for the latest CSV files...
echo.
node "%~dp0generate_report.js"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] An error occurred while generating reports.
    echo Please make sure Node.js is installed and CSV files are present.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo ===================================================================
echo [SUCCESS] All CSV reports and Dashboard datasets have been updated!
echo.
echo Generated Files in this folder:
echo  1. OVSE_Executive_Summary_Report.csv
echo  2. OVSE_Full_Comparative_Analysis.csv
echo  3. OVSE_New_and_Surging_Entrants.csv
echo  4. OVSE_Error_Code_Analysis.csv
echo  5. OVSE_Sharing_Channels_Analysis.csv
echo  6. index.html (Updated with new data across all 3 dashboards)
echo ===================================================================
echo.
set /p OPEN_DASHBOARD="Do you want to open the Dashboard now? (Y/N): "
if /i "%OPEN_DASHBOARD%"=="Y" (
    start "" "%~dp0index.html"
)
exit /b 0
