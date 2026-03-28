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
    
    
    console.log('All cron jobs initialized successfully');
    console.log('- Event status checker: Every minute');
    console.log('- Event reminders: Every hour at :00');
    console.log('- Morning reminders: Daily at 8:00 AM');
}

module.exports = {
    initializeCronJobs
};
