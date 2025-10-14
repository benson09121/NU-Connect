@echo off
echo ========================================
echo Creating E-Signature Directories
echo ========================================
echo.

REM Create host directories (Windows Docker Desktop paths)
echo Creating /opt/esignatures directory...
docker run --rm -v /opt/esignatures:/data alpine mkdir -p /data
if %errorlevel% neq 0 (
    echo ERROR: Failed to create /opt/esignatures
    exit /b 1
)

echo Creating /opt/approval-signatures directory...
docker run --rm -v /opt/approval-signatures:/data alpine mkdir -p /data
if %errorlevel% neq 0 (
    echo ERROR: Failed to create /opt/approval-signatures
    exit /b 1
)

echo.
echo Setting permissions...
docker run --rm -v /opt/esignatures:/data alpine chmod -R 777 /data
docker run --rm -v /opt/approval-signatures:/data alpine chmod -R 777 /data

echo.
echo ========================================
echo Verifying directories...
echo ========================================
docker run --rm -v /opt/esignatures:/data alpine ls -la /data
docker run --rm -v /opt/approval-signatures:/data alpine ls -la /data

echo.
echo ========================================
echo SUCCESS: Directories created!
echo ========================================
echo.
echo Next steps:
echo 1. Run: docker-compose down
echo 2. Run: docker-compose build node-app --no-cache
echo 3. Run: docker-compose up -d
echo.
pause
