@echo off
echo ========================================
echo E-SIGNATURE FIX VERIFICATION TOOL
echo ========================================
echo.

echo [1] Checking Dockerfile configuration...
echo.
echo Expected: /app/esignatures directory should be created
findstr /C:"mkdir -p /app/esignatures" node-app\dockerfile
if %errorlevel% equ 0 (
    echo [OK] Dockerfile creates /app/esignatures
) else (
    echo [FAIL] Dockerfile missing /app/esignatures creation
)
echo.

echo [2] Checking docker-compose.yml volume mapping...
echo.
echo Expected: /opt/esignatures:/app/esignatures
findstr /C:"/opt/esignatures:/app/esignatures" docker-compose.yml
if %errorlevel% equ 0 (
    echo [OK] Volume mapping is correct
) else (
    echo [FAIL] Volume mapping is wrong
)
echo.

echo [3] Checking if containers are running...
docker ps | findstr "node-app"
if %errorlevel% equ 0 (
    echo [OK] node-app container is running
    echo.
    echo [4] Checking directory inside container...
    docker exec node-app ls -la /app/ | findstr esignatures
    if %errorlevel% equ 0 (
        echo [OK] /app/esignatures exists inside container
    ) else (
        echo [FAIL] /app/esignatures NOT found inside container
        echo [ACTION] Run: deploy-esignature-complete-fix.bat
    )
    echo.
    echo [5] Checking directory permissions...
    docker exec node-app ls -ld /app/esignatures
    echo.
    echo [6] Checking volume mount...
    docker exec node-app mount | findstr esignatures
) else (
    echo [WARN] node-app container is not running
    echo [ACTION] Run: deploy-esignature-complete-fix.bat
)

echo.
echo [7] Checking host directory...
docker run --rm -v /opt/esignatures:/data alpine ls -la /data
if %errorlevel% equ 0 (
    echo [OK] Host directory /opt/esignatures exists
) else (
    echo [FAIL] Host directory /opt/esignatures does NOT exist
    echo [ACTION] Run: create-esignature-dirs.bat
)

echo.
echo ========================================
echo VERIFICATION COMPLETE
echo ========================================
echo.
echo If all checks passed, test file upload now!
echo If any checks failed, run the suggested ACTION commands.
echo.
pause
