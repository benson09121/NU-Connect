const db = require('../config/db');
const { broadcastToPage, broadcastToOrgDetail } = require('../services/websocketService');

/**
 * Event Status Checker Job
 * Checks for events that have passed their start time and updates their status to 'Rejected'
 */
class EventStatusChecker {
    
    /**
     * Main function to check and update event status
     */
    async checkAndUpdateEventStatus() {
        try {
            console.log(`[${new Date().toISOString()}] Running event status check...`);
            
            // Query for events that should be rejected (past their start time and date)
            const query = `
                SELECT 
                    event_id, 
                    title, 
                    start_date, 
                    start_time, 
                    status,
                    organization_id 
                FROM tbl_event 
                WHERE status IN ('Pending') 
                    AND (start_date = CURDATE() AND start_time < CURTIME())
            `;
            
            const [events] = await db.query(query);
            
            if (events.length === 0) {
                console.log('No events found that need status update');
                return;
            }
            
            console.log(`Found ${events.length} event(s) to update status to 'Rejected'`);
            
            // Update each event's status to 'Rejected'
            for (const event of events) {
                await this.updateEventStatus(event);
            }
            
        } catch (error) {
            console.error('Error in checkAndUpdateEventStatus:', error);
            throw error;
        }
    }
    
    /**
     * Update individual event status and notify clients
     */
    async updateEventStatus(event) {
        try {
            // Update the event status in database
            const updateQuery = `
                UPDATE tbl_event 
                SET status = 'Rejected'
                WHERE event_id = ?
            `;
                

            await db.query(updateQuery, [event.event_id]);

            // Also update the event application status to 'Rejected' if it exists
            const updateApplicationQuery = `
                UPDATE tbl_event_application 
                SET status = 'Rejected'
                WHERE proposed_event_id = ?
            `;

            await db.query(updateApplicationQuery, [event.event_id]);
            
            console.log(`Updated event ${event.event_id} (${event.title}) status to 'Rejected'`);
            
            // Get the updated event data to publish
            const [updatedEvent] = await db.query(`CALL GetEventById(?)`, [event.event_id]);

            // Publish the update to WebSocket subscribers
            if (updatedEvent && updatedEvent.length > 0) {
                broadcastToPage('events', 'events:updated', {
                    operation: 'UPDATE',
                    data: updatedEvent[0],
                    reason: 'Event expired - status changed to Rejected'
                });
                
                // Org detail pages can refetch event cards from this hint.
                if (event.organization_id) {
                  broadcastToOrgDetail(Number(event.organization_id), 'events:updated', {
                    operation: 'UPDATE',
                    data: updatedEvent[0],
                    reason: 'Event expired - status changed to Rejected'
                  });
                }
            }
            
        } catch (error) {
            console.error(`Error updating event ${event.event_id}:`, error);
            throw error;
        }
    }
}

module.exports = new EventStatusChecker();
