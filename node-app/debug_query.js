const pool = require('./config/db');

async function debugQuery() {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log('Connection obtained');

        const result = await connection.query(`
            SELECT e.event_id, e.title as event_name, e.fee as event_fee, e.organization_id
            FROM tbl_event e
            WHERE e.event_id = 37
            LIMIT 5
        `);

        console.log('Raw result:', result);
        console.log('Result type:', typeof result);
        console.log('Result is array:', Array.isArray(result));
        console.log('Result length:', result.length);

        if (result.length > 0) {
            console.log('First element:', result[0]);
            console.log('First element type:', typeof result[0]);
            console.log('First element is array:', Array.isArray(result[0]));
            if (Array.isArray(result[0])) {
                console.log('First element length:', result[0].length);
            }
        }

        // Test destructuring
        const [paidEvents] = result;
        console.log('Destructured paidEvents:', paidEvents);
        console.log('paidEvents type:', typeof paidEvents);
        console.log('paidEvents is array:', Array.isArray(paidEvents));
        console.log('paidEvents length:', paidEvents ? paidEvents.length : 'undefined');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        if (connection) connection.release();
    }
}

debugQuery();