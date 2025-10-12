const db = require('../config/db');
const { sendEventReminderEmail } = require('../services/emailService');

/**
 * Event Reminder Job
 * Sends automated email reminders to registered participants:
 * - 1 week before the event
 * - 1 day before the event
 * - On the day of the event
 */
class EventReminderJob {
    
    /**
     * Main function to check and send event reminders
     * Runs periodically via cron job
     */
    async sendEventReminders() {
        try {
            // Get events that need reminders
            const weekBeforeEvents = await this.getEventsNeedingReminder('week_before');
            const dayBeforeEvents = await this.getEventsNeedingReminder('day_before');
            const dayOfEvents = await this.getEventsNeedingReminder('day_of');
            
            const totalReminders = weekBeforeEvents.length + dayBeforeEvents.length + dayOfEvents.length;
            if (totalReminders > 0) {
                console.log(`📅 Event reminders: ${weekBeforeEvents.length} week, ${dayBeforeEvents.length} day, ${dayOfEvents.length} today`);
            }
            
            // Send reminders for each category
            await this.processReminders(weekBeforeEvents, 'week_before');
            await this.processReminders(dayBeforeEvents, 'day_before');
            await this.processReminders(dayOfEvents, 'day_of');
            
        } catch (error) {
            console.error('Error in sendEventReminders:', error);
            throw error;
        }
    }
    
    /**
     * Get events that need reminders based on the type
     * @param {string} reminderType - 'week_before', 'day_before', or 'day_of'
     * @returns {Array} Events with attendee information
     */
    async getEventsNeedingReminder(reminderType) {
        try {
            let dateCondition = '';
            
            // Calculate the date condition based on reminder type
            switch (reminderType) {
                case 'week_before':
                    // Events starting exactly 7 days from now
                    dateCondition = `DATE(e.start_date) = DATE_ADD(CURDATE(), INTERVAL 7 DAY)`;
                    break;
                case 'day_before':
                    // Events starting tomorrow
                    dateCondition = `DATE(e.start_date) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)`;
                    break;
                case 'day_of':
                    // Events starting today (but not yet started)
                    dateCondition = `DATE(e.start_date) = CURDATE() AND TIMESTAMP(e.start_date, e.start_time) > NOW()`;
                    break;
                default:
                    throw new Error(`Invalid reminder type: ${reminderType}`);
            }
            
            // Query to get events with their registered participants
            const query = `
                SELECT 
                    e.event_id,
                    e.title,
                    e.description,
                    e.start_date,
                    e.start_time,
                    e.end_time,
                    e.venue,
                    e.organization_id,
                    COALESCE(o.organization_name, 'SDAO') AS organization_name,
                    u.email AS participant_email,
                    u.f_name AS participant_first_name,
                    u.l_name AS participant_last_name,
                    ea.user_id AS participant_user_id
                FROM tbl_event e
                LEFT JOIN tbl_organization o ON e.organization_id = o.organization_id
                INNER JOIN tbl_event_attendance ea ON e.event_id = ea.event_id
                INNER JOIN tbl_user u ON ea.user_id = u.user_id
                LEFT JOIN tbl_event_reminder_log erl ON (
                    erl.event_id = e.event_id 
                    AND erl.user_id = ea.user_id 
                    AND erl.reminder_type = ?
                )
                WHERE 
                    e.status = 'Approved'
                    AND ${dateCondition}
                    AND ea.status IN ('Registered', 'Attended')
                    AND u.status = 'Active'
                    AND erl.log_id IS NULL
                ORDER BY e.start_date, e.start_time, e.event_id
            `;
            
            const [rows] = await db.query(query, [reminderType]);
            return rows;
            
        } catch (error) {
            console.error(`Error getting events for ${reminderType}:`, error);
            throw error;
        }
    }
    
    /**
     * Process and send reminders for a list of events
     * @param {Array} events - Events with participant information
     * @param {string} reminderType - Type of reminder being sent
     */
    async processReminders(events, reminderType) {
        if (events.length === 0) {
            return;
        }
        
        // Group events by event_id to avoid duplicate processing
        const eventGroups = events.reduce((acc, event) => {
            if (!acc[event.event_id]) {
                acc[event.event_id] = {
                    eventDetails: {
                        event_id: event.event_id,
                        title: event.title,
                        description: event.description,
                        start_date: event.start_date,
                        start_time: event.start_time,
                        end_time: event.end_time,
                        venue: event.venue,
                        organization_name: event.organization_name
                    },
                    participants: []
                };
            }
            
            acc[event.event_id].participants.push({
                email: event.participant_email,
                first_name: event.participant_first_name,
                last_name: event.participant_last_name,
                user_id: event.participant_user_id
            });
            
            return acc;
        }, {});
        
        // Send reminders for each event
        for (const [eventId, data] of Object.entries(eventGroups)) {
            let successCount = 0;
            let failCount = 0;
            
            for (const participant of data.participants) {
                try {
                    // Send the email
                    const result = await sendEventReminderEmail(
                        participant.email,
                        data.eventDetails,
                        reminderType
                    );
                    
                    if (result.success) {
                        // Log the sent reminder to prevent duplicates
                        await this.logReminderSent(
                            eventId,
                            participant.user_id,
                            reminderType,
                            participant.email
                        );
                        successCount++;
                    } else {
                        console.warn(`⚠️ Failed ${reminderType} reminder to ${participant.email}`);
                        failCount++;
                    }
                    
                    // Add a small delay between emails to avoid rate limiting
                    await this.delay(500); // 500ms delay
                    
                } catch (error) {
                    console.error(`❌ Error sending reminder to ${participant.email}:`, error);
                    failCount++;
                }
            }
            
            // Log summary only if there were any sends
            if (successCount > 0) {
                console.log(`✅ ${reminderType}: ${successCount} sent for "${data.eventDetails.title}"${failCount > 0 ? ` (${failCount} failed)` : ''}`);
            }
        }
    }
    
    /**
     * Log that a reminder was sent to prevent duplicate sends
     * @param {number} eventId - Event ID
     * @param {number} userId - User ID
     * @param {string} reminderType - Type of reminder
     * @param {string} email - Recipient email
     */
    async logReminderSent(eventId, userId, reminderType, email) {
        try {
            const query = `
                INSERT INTO tbl_event_reminder_log 
                (event_id, user_id, reminder_type, sent_at, recipient_email)
                VALUES (?, ?, ?, NOW(), ?)
            `;
            
            await db.query(query, [eventId, userId, reminderType, email]);
            
        } catch (error) {
            // If table doesn't exist yet, log but don't fail
            if (error.code === 'ER_NO_SUCH_TABLE') {
                console.warn('⚠️ tbl_event_reminder_log table does not exist yet. Run the migration SQL to create it.');
            } else {
                console.error('Error logging reminder:', error);
            }
        }
    }
    
    /**
     * Utility function to add delay between operations
     * @param {number} ms - Milliseconds to delay
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new EventReminderJob();
