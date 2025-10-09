@echo off
REM Clear Rate Limit State from Redis
echo.
echo ========================================
echo  CLEAR RATE LIMIT STATE
echo ========================================
echo.

cd /d "%~dp0"

echo Clearing rate limit data from Redis...
docker-compose exec -T redis redis-cli --scan --pattern "rl:*" | xargs -r docker-compose exec -T redis redis-cli DEL

echo.
echo Restarting Node.js app...
docker-compose restart node-app

echo.
echo ========================================
echo  Rate limit cleared!
echo ========================================
echo.
echo You can now try logging in again.
echo.

pause
