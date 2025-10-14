@echo off
echo ========================================
echo DEPLOY ENDORSED STATUS FEATURE
echo ========================================
echo.
echo This will:
echo 1. Stop MySQL container
echo 2. Remove MySQL container (data preserved)
echo 3. Start MySQL with updated schema
echo 4. Reload stored procedures
echo 5. Restart node-app
echo.
echo Changes:
echo - Added "Endorsed" status for Dean, Program Chair, Faculty
echo - Added uses_endorsed boolean flag
echo - Added endorsed_at timestamp
echo - Updated stored procedures
echo.
pause

cd c:\Users\Benz\Desktop\All-Project\CAPSTONE\COMBINING\nuconnect-docker

echo.
echo Step 1: Stopping MySQL...
docker-compose stop mysql
if %errorlevel% neq 0 (
    echo ERROR: Failed to stop MySQL
    pause
    exit /b 1
)

echo.
echo Step 2: Removing MySQL container (data will be preserved)...
docker-compose rm -f mysql
if %errorlevel% neq 0 (
    echo ERROR: Failed to remove MySQL container
    pause
    exit /b 1
)

echo.
echo Step 3: Starting MySQL with updated init.sql...
docker-compose up -d mysql
if %errorlevel% neq 0 (
    echo ERROR: Failed to start MySQL
    pause
    exit /b 1
)

echo.
echo Step 4: Waiting for MySQL to initialize...
timeout /t 20 /nobreak

echo.
echo Step 5: Verifying table structure...
docker exec -i mysql mysql -uadmin -padmin nuconnect_db -e "DESCRIBE tbl_organization_approval_chain;" | findstr "uses_endorsed"
if %errorlevel% equ 0 (
    echo [OK] Column 'uses_endorsed' exists
) else (
    echo [WARN] Column 'uses_endorsed' not found - may need manual migration
)

docker exec -i mysql mysql -uadmin -padmin nuconnect_db -e "DESCRIBE tbl_organization_approval_chain;" | findstr "endorsed_at"
if %errorlevel% equ 0 (
    echo [OK] Column 'endorsed_at' exists
) else (
    echo [WARN] Column 'endorsed_at' not found - may need manual migration
)

echo.
echo Step 6: Verifying stored procedures...
docker exec -i mysql mysql -uadmin -padmin nuconnect_db -e "SHOW PROCEDURE STATUS WHERE Db = 'nuconnect_db' AND Name LIKE 'sp_%%Approval%%';"

echo.
echo Step 7: Restarting node-app...
docker-compose restart node-app

echo.
echo Step 8: Watching logs...
timeout /t 5 /nobreak
docker-compose logs --tail=50 node-app

echo.
echo ========================================
echo DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Next steps:
echo 1. Update existing approval chains to set uses_endorsed = TRUE for Dean/Program Chair/Faculty
echo 2. Update frontend to show "Endorse" button for those roles
echo 3. Test the approval flow
echo.
echo See ENDORSED_STATUS_IMPLEMENTATION.md for details
echo.
pause
