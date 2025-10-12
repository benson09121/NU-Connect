const cron = require('node-cron');
const eventStatusChecker = require('./eventStatusChecker');
const eventReminderJob = require('./eventReminderJob');

/**
 * Initialize all cron jobs
 * This file serves as the main entry point for all scheduled tasks
 */
function initializeCronJobs() {
    console.log('Initializing cron jobs...');
    
    // Event Status Checker - runs every minute
    cron.schedule('* * * * *', async () => {
        try {
            await eventStatusChecker.checkAndUpdateEventStatus();
        } catch (error) {
            console.error('Error in event status checker cron job:', error);
        }
    });
    
    // Event Reminder Job - runs every hour at the top of the hour
    // Checks for events needing reminders (1 week, 1 day, day-of)
    cron.schedule('0 * * * *', async () => {
        try {
            console.log('Running event reminder job...');
            await eventReminderJob.sendEventReminders();
        } catch (error) {
            console.error('Error in event reminder cron job:', error);
        }
    });
    
    // Optional: Run reminder job once at 8 AM daily for day-of reminders
    // This ensures morning reminders are sent consistently
    cron.schedule('0 8 * * *', async () => {
        try {
            console.log('Running morning event reminder check...');
            await eventReminderJob.sendEventReminders();
        } catch (error) {
            console.error('Error in morning reminder cron job:', error);
        }
    });
    
    console.log('All cron jobs initialized successfully');
    console.log('- Event status checker: Every minute');
    console.log('- Event reminders: Every hour at :00');
    console.log('- Morning reminders: Daily at 8:00 AM');
}

module.exports = {
    initializeCronJobs
};
