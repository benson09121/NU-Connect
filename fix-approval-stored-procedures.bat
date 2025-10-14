@echo off
echo ========================================
echo FIX APPROVAL STORED PROCEDURES
echo ========================================
echo.
echo Issues Fixed:
echo 1. sp_ReceiveAndSignApproval - org_version_id -^> application_id
echo 2. sp_SignApprovalStep - org_version_id -^> application_id
echo 3. sp_ApproveApprovalStep - org_version_id -^> application_id
echo 4. All procedures - notes -^> remarks (column name in table)
echo.
echo This will reload the stored procedures from init.sql
echo.
pause

echo.
echo Step 1: Stopping MySQL container...
docker-compose stop mysql
if %errorlevel% neq 0 (
    echo ERROR: Failed to stop MySQL
    pause
    exit /b 1
)

echo.
echo Step 2: Removing MySQL container (data will be preserved in volume)...
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
echo Step 4: Waiting for MySQL to be ready...
timeout /t 15 /nobreak

echo.
echo Step 5: Dropping old stored procedures...
docker exec -i mysql mysql -uadmin -padmin nuconnect_db -e "DROP PROCEDURE IF EXISTS sp_ReceiveAndSignApproval; DROP PROCEDURE IF EXISTS sp_SignApprovalStep; DROP PROCEDURE IF EXISTS sp_ApproveApprovalStep;"

echo.
echo Step 6: Reloading stored procedures from init.sql...
docker exec -i mysql mysql -uadmin -padmin nuconnect_db < mysql\init.sql

echo.
echo Step 7: Verifying stored procedures...
docker exec -i mysql mysql -uadmin -padmin nuconnect_db -e "SHOW PROCEDURE STATUS WHERE Db = 'nuconnect_db' AND Name LIKE 'sp_%Approval%';"

echo.
echo Step 8: Restarting node-app to pick up changes...
docker-compose restart node-app

echo.
echo ========================================
echo FIX COMPLETE!
echo ========================================
echo.
echo The stored procedures have been updated to use 'application_id' instead of 'org_version_id'
echo.
echo Test the approval flow now!
echo.
pause
