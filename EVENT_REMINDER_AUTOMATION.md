# Event Reminder Email Automation

## Overview

This feature automates email reminders for registered event participants at three critical times:
- **1 week before** the event
- **1 day before** the event  
- **Day of** the event (morning reminder)

## Features

### 📧 Email System Enhancements

1. **Theme-Responsive Email Templates**
   - Automatic light/dark mode detection using CSS media queries
   - Professional gradient designs with NU Connect branding
   - Mobile-responsive layout
   - Accessible color contrast in both themes

2. **Smart Reminder Logic**
   - Prevents duplicate reminders via database logging
   - Only sends to active, registered participants
   - Excludes rejected, cancelled, or archived events
   - Rate-limited email sending to avoid spam filters

3. **Event Information**
   - Event title, date, time
   - Venue/location details
   - Organization name
   - Event description
   - Direct link to event details

## Installation & Setup

### 1. Database Migration

Run the SQL migration to create the reminder log table:

```bash
# Connect to MySQL container
docker exec -it nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect

# Run the migration
source /docker-entrypoint-initdb.d/migrations/create_event_reminder_log.sql;
```

Or run manually:

```powershell
# From PowerShell
Get-Content mysql\migrations\create_event_reminder_log.sql | docker exec -i nuconnect-docker-mysql-1 mysql -u admin -padmin db_nuconnect
```

### 2. Verify Installation

Check that the table was created:

```sql
DESCRIBE tbl_event_reminder_log;
SELECT * FROM vw_event_reminders LIMIT 10;
```

### 3. Restart Services

```powershell
docker-compose restart node-app
```

The cron jobs will initialize automatically when the Node.js server starts.

## Cron Schedule

The reminder system runs on the following schedule:

| Job | Schedule | Description |
|-----|----------|-------------|
| **Event Status Checker** | Every minute (`* * * * *`) | Updates event statuses |
| **Event Reminders** | Every hour (`0 * * * *`) | Checks and sends all reminder types |
| **Morning Reminders** | Daily at 8 AM (`0 8 * * *`) | Additional day-of reminder check |

## How It Works

### Reminder Logic Flow

```
1. Cron job triggers hourly
   ↓
2. Query events needing reminders:
   - Week before: events starting in exactly 7 days
   - Day before: events starting tomorrow
   - Day of: events starting today but not yet started
   ↓
3. Filter participants:
   - Status: Registered or Attended
   - User status: Active
   - Not already reminded (check log)
   ↓
4. Send email via Gmail SMTP
   ↓
5. Log successful send to prevent duplicates
```

### Database Schema

**tbl_event_reminder_log**
```sql
- log_id (PK, AUTO_INCREMENT)
- event_id (FK → tbl_event)
- user_id (FK → tbl_user)
- reminder_type (ENUM: 'week_before', 'day_before', 'day_of')
- sent_at (TIMESTAMP)
- recipient_email (VARCHAR)
- UNIQUE KEY: (event_id, user_id, reminder_type)
```

## Email Template Examples

### Light Mode
- Clean white background
- Purple gradient header
- Professional sans-serif fonts
- Blue accent colors

### Dark Mode (Automatic Detection)
- Dark gray background (#2d2d2d)
- Adjusted contrast for readability
- Purple/violet theme maintained
- Border adjustments for dark UI

### Mobile Responsive
- Stacks vertically on small screens
- Readable font sizes
- Touch-friendly button sizing
- Optimized padding

## Testing

### Manual Test (Development)

Add a test function to `eventReminderJob.js`:

```javascript
// Add this method to EventReminderJob class
async testSendReminder(eventId, userEmail, reminderType) {
    const [event] = await db.query(`
        SELECT e.*, COALESCE(o.organization_name, 'SDAO') AS organization_name
        FROM tbl_event e
        LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
        WHERE e.event_id = ?
    `, [eventId]);
    
    if (event.length === 0) {
        throw new Error('Event not found');
    }
    
    return await sendEventReminderEmail(userEmail, event[0], reminderType);
}
```

Run test:

```javascript
// In Node.js REPL or test script
const reminderJob = require('./jobs/eventReminderJob');
await reminderJob.testSendReminder(123, 'test@example.com', 'week_before');
```

### Verify Reminders Sent

```sql
-- Check recent reminders
SELECT * FROM vw_event_reminders ORDER BY sent_at DESC LIMIT 20;

-- Count reminders by type
SELECT 
    reminder_type,
    COUNT(*) as count,
    DATE(sent_at) as date
FROM tbl_event_reminder_log
GROUP BY reminder_type, DATE(sent_at)
ORDER BY date DESC;

-- Find participants not yet reminded for upcoming event
SELECT 
    ea.user_id,
    u.email,
    e.title,
    e.start_date
FROM tbl_event_attendance ea
INNER JOIN tbl_user u ON ea.user_id = u.user_id
INNER JOIN tbl_event e ON ea.event_id = e.event_id
LEFT JOIN tbl_event_reminder_log erl ON (
    erl.event_id = ea.event_id 
    AND erl.user_id = ea.user_id 
    AND erl.reminder_type = 'week_before'
)
WHERE 
    e.status = 'Approved'
    AND DATE(e.start_date) = DATE_ADD(CURDATE(), INTERVAL 7 DAY)
    AND ea.status = 'Registered'
    AND erl.log_id IS NULL;
```

## Monitoring & Maintenance

### View Logs

```bash
# Node.js logs (shows email sending activity)
docker logs -f nuconnect-docker-node-app-1 | grep -i "reminder"

# MySQL logs (if needed)
docker logs nuconnect-docker-mysql-1
```

### Common Log Messages

✅ Success:
```
✅ Sent week_before reminder to user@example.com for event "Tech Workshop"
```

⚠️ Warnings:
```
⚠️ Failed to send day_before reminder to user@example.com: Network error
⚠️ tbl_event_reminder_log table does not exist yet
```

❌ Errors:
```
❌ Error sending reminder to user@example.com: Authentication failed
Error in event reminder cron job: EAUTH
```

### Cleanup Old Logs

Run periodically to maintain database performance:

```sql
CALL CleanupOldReminderLogs();
```

Or schedule via cron (add to `jobs/index.js`):

```javascript
// Monthly cleanup - runs on the 1st at 2 AM
cron.schedule('0 2 1 * *', async () => {
    try {
        await db.query('CALL CleanupOldReminderLogs()');
        console.log('Cleaned up old reminder logs');
    } catch (error) {
        console.error('Error cleaning up logs:', error);
    }
});
```

## Troubleshooting

### Reminders Not Sending

1. **Check Email Configuration**
   ```javascript
   const emailService = require('./services/emailService');
   await emailService.testEmailConfig();
   ```

2. **Verify Cron Jobs Running**
   ```bash
   docker logs nuconnect-docker-node-app-1 | grep "Initializing cron jobs"
   ```
   Should show:
   ```
   Initializing cron jobs...
   - Event status checker: Every minute
   - Event reminders: Every hour at :00
   - Morning reminders: Daily at 8:00 AM
   All cron jobs initialized successfully
   ```

3. **Check Database Table**
   ```sql
   SHOW TABLES LIKE '%reminder%';
   ```

4. **Verify Gmail Credentials**
   ```bash
   docker exec nuconnect-docker-node-app-1 env | grep GMAIL
   ```

### Duplicate Reminders Being Sent

Check for unique constraint violations:

```sql
-- Should show unique constraint
SHOW CREATE TABLE tbl_event_reminder_log;

-- Check for duplicates (should be empty)
SELECT event_id, user_id, reminder_type, COUNT(*) 
FROM tbl_event_reminder_log
GROUP BY event_id, user_id, reminder_type
HAVING COUNT(*) > 1;
```

### Email Going to Spam

See existing email service documentation for deliverability tips. Key points:
- Use professional "from" address
- Add to recipient contacts/whitelist
- Monitor bounce rates
- Use SPF/DKIM records if using custom domain

## Configuration

### Customize Reminder Timing

Edit `eventReminderJob.js` - modify the date conditions:

```javascript
case 'week_before':
    // Change from 7 days to 5 days
    dateCondition = `DATE(e.start_date) = DATE_ADD(CURDATE(), INTERVAL 5 DAY)`;
    break;
```

### Customize Cron Schedule

Edit `jobs/index.js`:

```javascript
// Run every 30 minutes instead of hourly
cron.schedule('*/30 * * * *', async () => { ... });

// Run at specific times: 8 AM, 12 PM, 6 PM
cron.schedule('0 8,12,18 * * *', async () => { ... });
```

### Customize Email Template

Edit `emailService.js` - `generateEventReminderTemplate()` function:
- Modify colors in CSS
- Change layout structure
- Add additional event information
- Customize branding

## Performance Considerations

- **Rate Limiting**: 500ms delay between emails prevents Gmail rate limiting
- **Batch Processing**: Events are grouped to minimize database queries
- **Indexed Queries**: All reminder queries use indexed columns
- **Log Cleanup**: Old logs auto-removed after 1 year to maintain performance

## Security

- Email addresses validated before sending
- SQL injection prevented via parameterized queries
- Foreign key constraints ensure data integrity
- No sensitive information exposed in emails
- HTTPS required for event detail links

## Future Enhancements

Potential improvements:
- [ ] User preference for reminder opt-out
- [ ] SMS reminders via Twilio integration
- [ ] Push notifications for mobile app
- [ ] Customizable reminder timing per event
- [ ] Event organizer reminder notifications
- [ ] Reminder analytics dashboard

## Support

For issues or questions:
1. Check logs: `docker logs nuconnect-docker-node-app-1`
2. Verify email config: Run `testEmailConfig()`
3. Check database: Query `vw_event_reminders`
4. Review this documentation

## License

Part of NU Connect system - National University Dasmariñas
