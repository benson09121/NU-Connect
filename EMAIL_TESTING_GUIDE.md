# Email Notifications - Quick Testing Guide

## Quick Start

### 1. Verify Email Configuration

```bash
# Check environment variables
cat .env | grep GMAIL

# Expected output:
# GMAIL_USER=your-email@gmail.com
# GMAIL_APP_PASS=abcd efgh ijkl mnop  # 16 characters with spaces
```

### 2. Restart Services

```bash
# Restart to apply email configuration
docker-compose restart node-app

# Check logs for email verification
docker-compose logs -f node-app | grep "Email"

# Expected log:
# ✅ Gmail SMTP connection verified successfully
# 📧 Email Deliverability Status:
#    📤 Sender: your-email@gmail.com
```

---

## Test Organization Emails

### ✅ Test Organization Approval Email

**Steps:**
1. Create a new organization application
2. Approve through all required steps
3. On final approval, email should be sent automatically

**Expected Behavior:**
```bash
# Server logs should show:
🎉 [RT-DEBUG] Organization is FULLY APPROVED - triggering notifications!
✅ Organization approval email sent to president@example.com
```

**Email Verification:**
- Check president's email inbox
- Subject: "🎉 Organization Approved - [Org Name]"
- Contains: Org details, approval date, dashboard link
- Professional green gradient design

### ❌ Test Organization Rejection Email

**Steps:**
1. Create a new organization application  
2. Reject at any approval step with a comment
3. Email should be sent immediately

**Expected Behavior:**
```bash
# Server logs should show:
✅ Organization rejection email sent to president@example.com
```

**Email Verification:**
- Check president's email inbox
- Subject: "Organization Application Update - [Org Name]"
- Contains: Rejection reason, reviewer name, reapply guidance
- Professional blue gradient design

---

## Test Event Emails

### ✅ Test Event Approval Email

**Steps:**
1. Create a new event proposal
2. Approve through all required steps
3. On final approval (all steps approved), email should be sent

**Expected Behavior:**
```bash
# Server logs should show:
🎉 Event proposal fully approved - sending email notification
✅ Event approval email sent to organizer@example.com
```

**Email Verification:**
- Check organizer's email inbox
- Subject: "🎉 Event Proposal Approved - [Event Title]"
- Contains: Event details, date/time/venue, dashboard link
- Professional green gradient design

### ❌ Test Event Rejection Email

**Steps:**
1. Create a new event proposal
2. Reject at any approval step with a comment
3. Email should be sent immediately

**Expected Behavior:**
```bash
# Server logs should show:
✅ Event rejection email sent to organizer@example.com
```

**Email Verification:**
- Check organizer's email inbox
- Subject: "Event Proposal Update - [Event Title]"
- Contains: Rejection reason, reviewer name, resubmission guidance
- Professional blue gradient design

---

## Troubleshooting

### Email Not Sending

**Check 1: SMTP Configuration**
```bash
docker exec -it node-app sh -c 'node -e "console.log(process.env.GMAIL_USER, process.env.GMAIL_APP_PASS?.length)"'

# Should output:
# your-email@gmail.com 19  (16 chars + 3 spaces)
```

**Check 2: Server Logs**
```bash
docker-compose logs node-app | grep -i "email\|smtp\|gmail"

# Look for:
# ✅ Gmail SMTP connection verified successfully
# OR
# ❌ Gmail SMTP verification failed: [error message]
```

**Check 3: Test Email Manually**
```bash
# Use "Send Test Email" button in Manage Accounts UI
# Or run in node-app container:
docker exec -it node-app node -e "
  const emailService = require('./services/emailService');
  emailService.diagnoseEmailDelivery('test@example.com')
    .then(result => console.log(result))
    .catch(err => console.error(err));
"
```

### Email Goes to Spam

**Solutions:**
1. Add sender email to contacts
2. Check spam folder and mark as "Not Spam"
3. Whitelist domain: `@nuconnect.net`
4. For Gmail: Create filter to never send to spam

### Wrong Recipient

**Debug:**
```bash
# Check application officers
docker exec mysql mysql -u admin -padmin db_nuconnect \
  -e "SELECT email, rank_name FROM tbl_application_officers WHERE application_id = [APP_ID];"

# Check event applicant
docker exec mysql mysql -u admin -padmin db_nuconnect \
  -e "SELECT applicant_email FROM tbl_event_application WHERE event_application_id = [EVENT_APP_ID];"
```

---

## Manual Email Testing

### Send Organization Approval Email

```javascript
// In node-app container or via API endpoint:
const emailService = require('./services/emailService');

const orgDetails = {
  name: 'Test Organization',
  application_id: 123,
  approved_date: new Date().toISOString(),
  organization_id: 45,
  cycle_number: 2
};

emailService.sendOrganizationApprovalEmail('recipient@example.com', orgDetails)
  .then(result => console.log('✅', result))
  .catch(err => console.error('❌', err));
```

### Send Event Approval Email

```javascript
const emailService = require('./services/emailService');

const eventDetails = {
  title: 'Test Event',
  event_id: 789,
  start_date: '2025-11-15',
  start_time: '09:00:00',
  venue: 'Main Auditorium',
  organization_name: 'Tech Club',
  description: 'Annual tech summit'
};

emailService.sendEventApprovalEmail('recipient@example.com', eventDetails)
  .then(result => console.log('✅', result))
  .catch(err => console.error('❌', err));
```

---

## Quick Verification Checklist

### Before Testing
- [ ] Gmail credentials configured in .env
- [ ] 2FA enabled on Gmail account
- [ ] App password generated (16 characters)
- [ ] node-app container restarted
- [ ] SMTP verification successful in logs

### Organization Emails
- [ ] Approval email sent on final step
- [ ] Rejection email sent on any rejection
- [ ] Correct recipient (president/first officer)
- [ ] All placeholders filled correctly
- [ ] Links work (dashboard access)
- [ ] Professional design renders correctly

### Event Emails
- [ ] Approval email sent on final step
- [ ] Rejection email sent on any rejection
- [ ] Correct recipient (event organizer)
- [ ] All event details correct
- [ ] Links work (event dashboard)
- [ ] Professional design renders correctly

### Error Handling
- [ ] Email failure doesn't break approval/rejection
- [ ] Errors logged appropriately
- [ ] User still sees success message
- [ ] No 500 errors returned

---

## Common Log Messages

### Success
```
✅ Gmail SMTP connection verified successfully
✅ Organization approval email sent to president@nu.edu (ID: <message-id>)
✅ Event rejection email sent to organizer@nu.edu
```

### Warnings
```
⚠️ Failed to send organization approval email: Email service not configured
⚠️ No officers found for organization approval notification
📧 Email service not configured. Skipping email send.
```

### Errors
```
❌ Gmail SMTP verification failed: Invalid login
❌ Error sending organization rejection email: Network timeout
❌ Organization approval email failed for president@nu.edu: Connection refused
```

---

## Expected Email Appearance

### Organization Approval
```
┌─────────────────────────────────────┐
│ [Green Gradient Header]             │
│ 🎉 Congratulations!                 │
│ Your Organization Has Been Approved │
└─────────────────────────────────────┘

✅ (Large checkmark icon)

Dear Organization Leader,

We are pleased to inform you that your organization 
application has been approved!

┌─────────────────────────────────────┐
│ Organization Details                │
│ Name: Student Council               │
│ Application ID: 12345               │
│ Approval Date: October 13, 2025     │
└─────────────────────────────────────┘

Your organization is now active:
✅ Manage members and roles
✅ Create event proposals
...

[Access Organization Dashboard] (Green button)
```

### Event Rejection
```
┌─────────────────────────────────────┐
│ [Blue Gradient Header]              │
│ Event Proposal Update               │
│ Annual Tech Summit                  │
└─────────────────────────────────────┘

Dear Event Organizer,

Thank you for submitting your event proposal...

┌─────────────────────────────────────┐
│ ⚠️ Application Feedback             │
│ [Rejection reason from reviewer]    │
│ Reviewed by: Dr. Smith              │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ✅ Submit a New Proposal!           │
│ You can reapply after addressing... │
└─────────────────────────────────────┘
```

---

## Environment Variables Reference

```bash
# Required for email notifications
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASS=abcd efgh ijkl mnop

# Optional customization
FROM_NAME=NU Connect Team
FROM_EMAIL=noreply@nuconnect.net
SUPPORT_EMAIL=support@nuconnect.net
REACT_APP_URL=https://nuconnect.net
```

---

## Quick Debug Commands

```bash
# Check email configuration
docker exec node-app env | grep GMAIL

# Watch email-related logs
docker-compose logs -f node-app | grep -i "email\|smtp"

# Verify SMTP connection
docker exec node-app node -e "require('./services/emailService')"

# Test database connection for recipients
docker exec mysql mysql -u admin -padmin db_nuconnect \
  -e "SELECT email FROM tbl_application_officers WHERE application_id = 1;"
```

---

**Last Updated:** October 13, 2025
