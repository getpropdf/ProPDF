@echo off
REM ProPDF Engine launcher - listens on 127.0.0.1 ONLY (your machine).
REM Keep this window open while using ProPDF's engine-powered tools.
cd /d "%~dp0"
title ProPDF Engine (local only)
echo Starting ProPDF Engine on http://127.0.0.1:8712  (local only - no uploads)
echo Keep this window open. Press Ctrl+C to stop.
python server.py
pause
