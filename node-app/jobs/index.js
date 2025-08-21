const cron = require('node-cron');
const eventStatusChecker = require('./eventStatusChecker');

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
    
    // Add more cron jobs here as needed
    // Example:
    // cron.schedule('0 0 * * *', async () => {
    //     // Daily cleanup job
    //     await dailyCleanupJob();
    // });
    
    console.log('All cron jobs initialized successfully');
}

module.exports = {
    initializeCronJobs
};
