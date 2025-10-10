@echo off
REM Clear Facebook Cache and Restart Docker
REM This script clears old cached data and restarts containers

echo.
echo ========================================
echo  FACEBOOK SCRAPER FIX - APPLY CHANGES
echo ========================================
echo.

cd /d "%~dp0"

echo [1/4] Clearing Facebook cache from Redis...
docker-compose exec -T redis redis-cli KEYS "facebook_posts:*"

echo.
echo [2/4] Clearing all cached data...
docker-compose exec -T redis redis-cli KEYS "scraped_data:*"

echo.
echo [3/4] Restarting Node.js app...
docker-compose restart node-app

echo.
echo [4/4] Waiting for app to start...
timeout /t 5 /nobreak

echo.
echo ========================================
echo  DONE! Testing the scraper...
echo ========================================
echo.

echo Testing API endpoint...
curl -X GET "http://localhost:3000/api/facebook-scraper/scrape" -H "Accept: application/json"

echo.
echo.
echo ========================================
echo  SUCCESS!
echo ========================================
echo.
echo Next steps:
echo 1. Wait 10-20 seconds for scraping to complete
echo 2. Test the cached endpoint: http://localhost:3000/api/facebook-scraper/cached
echo 3. The response should show "pageUrl": "https://www.facebook.com/nudasma.CompSoc"
echo 4. Open your Flutter app to see the Facebook posts
echo.

pause
