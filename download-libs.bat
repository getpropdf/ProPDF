@echo off
REM ============================================================
REM  ProPDF - vendor libraries for FULL OFFLINE / air-gapped use
REM  Run this ONCE on a machine that has internet. It downloads
REM  the JS libraries into the local \lib folder so ProPDF needs
REM  no network at all afterwards.
REM  Prepared by Kothari Jain & Associates
REM ============================================================
setlocal
set DIR=%~dp0lib
if not exist "%DIR%" mkdir "%DIR%"

echo Downloading libraries into %DIR% ...

powershell -Command "iwr 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js' -OutFile '%DIR%\pdf-lib.min.js'"
powershell -Command "iwr 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' -OutFile '%DIR%\pdf.min.js'"
powershell -Command "iwr 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js' -OutFile '%DIR%\pdf.worker.min.js'"
powershell -Command "iwr 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js' -OutFile '%DIR%\xlsx.full.min.js'"
powershell -Command "iwr 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' -OutFile '%DIR%\jszip.min.js'"
powershell -Command "iwr 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.0/tesseract.min.js' -OutFile '%DIR%\tesseract.min.js'"

echo.
echo Done. ProPDF will now run fully offline (except first-time OCR
echo language data, which Tesseract caches after first use).
echo NOTE: For 100%% offline OCR you must also place Tesseract
echo language ".traineddata" files locally - see docs\INSTALLATION.md.
pause
