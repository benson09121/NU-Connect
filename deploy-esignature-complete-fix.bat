@echo off
echo ========================================
echo COMPLETE E-SIGNATURE FIX DEPLOYMENT
echo ========================================
echo.

echo Step 1: Creating host directories...
call create-esignature-dirs.bat
if %errorlevel% neq 0 (
    echo ERROR: Failed to create directories
    exit /b 1
)

echo.
echo Step 2: Stopping containers...
docker-compose down
if %errorlevel% neq 0 (
    echo ERROR: Failed to stop containers
    exit /b 1
)

echo.
echo Step 3: Building node-app with new Dockerfile...
docker-compose build node-app --no-cache
if %errorlevel% neq 0 (
    echo ERROR: Failed to build node-app
    exit /b 1
)

echo.
echo Step 4: Starting all containers...
docker-compose up -d
if %errorlevel% neq 0 (
    echo ERROR: Failed to start containers
    exit /b 1
)

echo.
echo Step 5: Waiting for containers to be healthy...
timeout /t 10 /nobreak

echo.
echo Step 6: Verifying directory structure inside container...
docker exec node-app ls -la /app/ | findstr esignatures
docker exec node-app ls -la /app/esignatures

echo.
echo ========================================
echo DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Verification commands:
echo   docker exec node-app ls -la /app/esignatures
echo   docker logs -f node-app
echo.
echo Test upload now!
echo.
pause
