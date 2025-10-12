# Quick Deployment Guide - Event Email Reminders

## 🚀 Quick Start (5 Minutes)

### Step 1: Apply Database Migration
```powershell
# Option A: Copy migration file into container and run
docker cp mysql\migrations\create_event_reminder_log.sql nuconnect-docker-mysql-1:/tmp/
docker exec -it nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect -e "source /tmp/create_event_reminder_log.sql"

# Option B: Direct execution
Get-Content mysql\migrations\create_event_reminder_log.sql | docker exec -i nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect
```

### Step 2: Verify Database Changes
```powershell
docker exec -it nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect -e "
DESCRIBE tbl_event_reminder_log;
SELECT COUNT(*) as table_exists FROM information_schema.tables 
WHERE table_schema = 'db_nuconnect' AND table_name = 'tbl_event_reminder_log';
"
```

Expected output:
```
+-----------------+----------------------------------------------------------+
| Field           | Type                                                     |
+-----------------+----------------------------------------------------------+
| log_id          | int                                                      |
| event_id        | int                                                      |
| user_id         | int                                                      |
| reminder_type   | enum('week_before','day_before','day_of')               |
| sent_at         | timestamp                                                |
| recipient_email | varchar(255)                                            |
+-----------------+----------------------------------------------------------+

+--------------+
| table_exists |
+--------------+
|            1 |
+--------------+
```

### Step 3: Restart Node Application
```powershell
docker-compose restart node-app

# Wait for startup
Start-Sleep -Seconds 5

# Verify logs
docker logs nuconnect-docker-node-app-1 --tail 50
```

Look for:
```
Initializing cron jobs...
- Event status checker: Every minute
- Event reminders: Every hour at :00
- Morning reminders: Daily at 8:00 AM
All cron jobs initialized successfully
```

### Step 4: Test Email Configuration (Optional but Recommended)
```powershell
# Enter Node.js container
docker exec -it nuconnect-docker-node-app-1 /bin/sh

# Run in Node REPL
node
```

```javascript
const emailService = require('./services/emailService');
await emailService.testEmailConfig();
// Should output: ✅ Email configuration is valid
```

## ✅ Verification Checklist

- [x] Database table `tbl_event_reminder_log` created
- [x] View `vw_event_reminders` created
- [x] Stored procedure `CleanupOldReminderLogs` created
- [x] Node.js container restarted
- [x] Cron jobs initialized successfully
- [x] Email configuration valid

## 📊 Monitor Reminders

### Real-time Monitoring
```powershell
# Follow reminder logs
docker logs -f nuconnect-docker-node-app-1 | Select-String "reminder"
```

### Check Sent Reminders
```sql
-- Via MySQL
docker exec -it nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect

-- View recent reminders
SELECT * FROM vw_event_reminders ORDER BY sent_at DESC LIMIT 10;

-- Count reminders by type today
SELECT 
    reminder_type,
    COUNT(*) as count
FROM tbl_event_reminder_log
WHERE DATE(sent_at) = CURDATE()
GROUP BY reminder_type;
```

## 🔧 Troubleshooting

### Issue: Cron jobs not running

**Check 1**: Verify jobs initialized
```powershell
docker logs nuconnect-docker-node-app-1 | Select-String "cron"
```

**Solution**: Restart if no logs found
```powershell
docker-compose restart node-app
```

### Issue: Emails not sending

**Check 1**: Email configuration
```bash
docker exec nuconnect-docker-node-app-1 env | grep GMAIL
```

**Solution**: Verify `.env` has correct Gmail credentials:
```
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASS=your-16-char-app-password
```

### Issue: Table doesn't exist error

**Check**: Database migration status
```sql
SHOW TABLES LIKE '%reminder%';
```

**Solution**: Re-run migration (Step 1 above)

### Issue: Duplicate reminders

**Check**: Unique constraint
```sql
SHOW KEYS FROM tbl_event_reminder_log WHERE Key_name = 'unique_reminder';
```

**Solution**: Should exist. If not, recreate table using migration.

## 🧪 Testing

### Manual Test Reminder (Safe for Production)

```javascript
// In Node.js container
const reminderJob = require('./jobs/eventReminderJob');

// Test fetching events (doesn't send emails)
const events = await reminderJob.getEventsNeedingReminder('week_before');
console.log('Events needing week-before reminders:', events.length);
```

### Test Email Template

Create test event and register yourself:
1. Create event starting in exactly 7 days
2. Register for the event
3. Wait for the next hourly cron (or manually trigger)
4. Check your email inbox

### Force Run Reminders (Development Only)

```javascript
// In Node.js REPL
const reminderJob = require('./jobs/eventReminderJob');
await reminderJob.sendEventReminders();
```

## 📅 Reminder Schedule Reference

| Reminder Type | Trigger Condition | Example |
|---------------|------------------|---------|
| **Week Before** | Event starts in exactly 7 days | Event on Oct 19 → Reminder on Oct 12 |
| **Day Before** | Event starts tomorrow | Event on Oct 13 → Reminder on Oct 12 |
| **Day Of** | Event starts today (not yet started) | Event at 2 PM today → Reminder at 8 AM |

## 🔄 Rollback (If Needed)

If you need to undo the changes:

```sql
-- Remove table and related objects
DROP VIEW IF EXISTS vw_event_reminders;
DROP PROCEDURE IF EXISTS CleanupOldReminderLogs;
DROP TABLE IF EXISTS tbl_event_reminder_log;
```

```powershell
# Revert code changes (if using git)
git checkout HEAD -- node-app/services/emailService.js
git checkout HEAD -- node-app/jobs/eventReminderJob.js
git checkout HEAD -- node-app/jobs/index.js

# Restart
docker-compose restart node-app
```

## 📈 Performance Monitoring

### Check Email Queue Performance
```sql
-- Average reminders per day
SELECT 
    DATE(sent_at) as date,
    COUNT(*) as reminders_sent,
    COUNT(DISTINCT event_id) as events_covered
FROM tbl_event_reminder_log
WHERE sent_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY DATE(sent_at)
ORDER BY date DESC;
```

### Monitor Cron Job Execution
```powershell
# Check logs for cron execution timestamps
docker logs nuconnect-docker-node-app-1 --since 24h | Select-String "Running event reminder"
```

## 🎯 Next Steps

After successful deployment:

1. **Monitor for 24 hours**: Watch logs for any errors
2. **Test all reminder types**: Create test events at different intervals
3. **User feedback**: Ask a few users to confirm they received reminders
4. **Adjust schedule if needed**: Modify cron timing in `jobs/index.js`
5. **Set up log cleanup**: Consider scheduling monthly cleanup

## 📚 Full Documentation

For detailed information, see:
- `EVENT_REMINDER_AUTOMATION.md` - Complete feature documentation
- `node-app/services/emailService.js` - Email template code
- `node-app/jobs/eventReminderJob.js` - Reminder logic
- `mysql/migrations/create_event_reminder_log.sql` - Database schema

## ⚡ Quick Commands Reference

```powershell
# Restart everything
docker-compose restart

# View Node.js logs (live)
docker logs -f nuconnect-docker-node-app-1

# Access MySQL
docker exec -it nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect

# Check reminders sent today
docker exec -it nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect -e "
SELECT COUNT(*) as reminders_today FROM tbl_event_reminder_log WHERE DATE(sent_at) = CURDATE();
"

# Force reminder check (development)
docker exec -it nuconnect-docker-node-app-1 node -e "
require('./jobs/eventReminderJob').sendEventReminders().then(() => console.log('Done'));
"
```

---

**Status**: ✅ Ready for Production
**Estimated Time**: 5-10 minutes
**Risk Level**: Low (non-breaking changes, isolated feature)
