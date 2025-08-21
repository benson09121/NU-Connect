# Cron Jobs Directory

This directory contains all scheduled tasks (cron jobs) for the NU-Connect application.

## Structure

- `index.js` - Main cron job manager that initializes all scheduled tasks
- `eventStatusChecker.js` - Checks and updates event statuses every minute
- `README.md` - This documentation file

## Current Cron Jobs

### Event Status Checker
- **Schedule**: Every minute (`* * * * *`)
- **Purpose**: Checks for events that have passed their start time and updates their status to 'Rejected'
- **File**: `eventStatusChecker.js`

## Adding New Cron Jobs

1. Create a new file in this directory for your cron job logic
2. Follow the class-based pattern used in `eventStatusChecker.js`
3. Add your cron job to the `initializeCronJobs()` function in `index.js`
4. Update this README with documentation

### Example Template

```javascript
const db = require('../config/db');

class YourNewCronJob {
    async executeTask() {
        try {
            console.log(`[${new Date().toISOString()}] Running your new cron job...`);
            
            // Your cron job logic here
            
        } catch (error) {
            console.error('Error in your new cron job:', error);
            throw error;
        }
    }
}

module.exports = new YourNewCronJob();
```

Then in `index.js`:
```javascript
const yourNewCronJob = require('./yourNewCronJob');

// Add to initializeCronJobs function:
cron.schedule('0 0 * * *', async () => { // Daily at midnight
    try {
        await yourNewCronJob.executeTask();
    } catch (error) {
        console.error('Error in your new cron job:', error);
    }
});
```

## Cron Schedule Format

```
* * * * * *
│ │ │ │ │ │
│ │ │ │ │ └─── day of week (0 - 7) (Sunday to Saturday)
│ │ │ │ └───── month (1 - 12)
│ │ │ └─────── day of month (1 - 31)
│ │ └───────── hour (0 - 23)
│ └─────────── minute (0 - 59)
└───────────── second (0 - 59, optional)
```

Common patterns:
- Every minute: `* * * * *`
- Every hour: `0 * * * *`
- Every day at midnight: `0 0 * * *`
- Every Monday at 9 AM: `0 9 * * 1`

## Dependencies

Make sure to install the required package:
```bash
npm install node-cron
```
