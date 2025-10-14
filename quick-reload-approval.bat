@echo off
echo ========================================
echo QUICK FIX: Reload Approval Procedures
echo ========================================
echo.

cd c:\Users\Benz\Desktop\All-Project\CAPSTONE\COMBINING\nuconnect-docker

echo Restarting MySQL to reload stored procedures...
docker-compose restart mysql

echo.
echo Waiting for MySQL to be ready...
timeout /t 10 /nobreak

echo.
echo Restarting node-app...
docker-compose restart node-app

echo.
echo Watching logs for approval test...
echo Press Ctrl+C to stop
echo.
docker-compose logs -f node-app

pause
