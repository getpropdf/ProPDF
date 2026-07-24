@echo off
REM ============================================================
REM  ProPDF Engine - one-time installer (Windows)
REM  Everything installs and runs LOCALLY. No cloud, no uploads.
REM ============================================================
cd /d "%~dp0"
echo.
echo  ProPDF Engine installer
echo  -----------------------
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo  [!] Python not found.
  echo      Install Python 3.10+ from https://www.python.org/downloads/
  echo      IMPORTANT: tick "Add python.exe to PATH" during install, then run me again.
  pause
  exit /b 1
)

echo  [1/4] Installing Python packages (local processing engines)...
python -m pip install --upgrade pip >nul
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo  [!] Package install failed. Check your internet connection and retry.
  pause
  exit /b 1
)

echo  [2/4] Checking Tesseract OCR (needed for scanned PDFs)...
where tesseract >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\Tesseract-OCR\tesseract.exe" (
    echo      Found at "%ProgramFiles%\Tesseract-OCR" - add it to PATH if OCR fails.
  ) else (
    echo  [!] Tesseract not found. OCR of scanned PDFs will not work until you install it:
    echo      https://github.com/UB-Mannheim/tesseract/wiki  ^(free, local^)
    echo      During install, select the Indian languages you need:
    echo      Hindi, Marathi, Gujarati, Tamil, Telugu, Kannada, Bengali, Punjabi.
  )
) else (
  echo      OK - Tesseract found.
)

echo  [3/4] Checking LibreOffice (needed for Word/Excel/PPT to PDF)...
if exist "%ProgramFiles%\LibreOffice\program\soffice.exe" (
  echo      OK - LibreOffice found.
) else (
  where soffice >nul 2>nul
  if errorlevel 1 (
    echo  [!] LibreOffice not found. Office-to-PDF will not work until you install it:
    echo      https://www.libreoffice.org/download/  ^(free, local^)
  ) else (
    echo      OK - LibreOffice found.
  )
)

echo  [4/4] Checking Ghostscript (optional - improves compression/repair)...
where gswin64c >nul 2>nul
if errorlevel 1 (
  echo      Not found ^(optional^). https://ghostscript.com/releases/gsdnld.html
) else (
  echo      OK - Ghostscript found.
)

echo.
echo  Done. Start the engine any time with:  Start Engine.bat
echo  ProPDF (the browser app) will show "Engine: on" automatically.
echo.
pause
