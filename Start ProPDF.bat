@echo off
REM ProPDF launcher - Kothari Jain & Associates
REM Runs ProPDF on a LOCAL-ONLY server (127.0.0.1) with no caching,
REM so every tool works and you always get the latest version.
cd /d "%~dp0"
where python >nul 2>nul && ( python "server.py" & goto :eof )
where py     >nul 2>nul && ( py "server.py" & goto :eof )
where node   >nul 2>nul && ( start "" http://localhost:8733/index.html & npx --yes http-server -p 8733 -c-1 . & goto :eof )
echo Python/Node not found - opening the file directly.
start "" "index.html"
