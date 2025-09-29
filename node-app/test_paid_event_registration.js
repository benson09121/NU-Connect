#!/usr/bin/env node

// Test script to verify paid event registration transaction linkage
const pool = require('./config/db');

async function testPaidEventRegistration() {
    let connection;
    try {
        console.log('🧪 Testing paid event registration transaction linkage...');

        console.log('About to get connection...');
        connection = await pool.getConnection();
        console.log('Connection obtained');

        console.log('About to query for event 37...');

        // Step 1: Find a paid event
        console.log('About to execute query for event 37...');
        const queryResult = await connection.query(`
            SELECT e.event_id, e.title as event_name, e.fee as event_fee, e.organization_id
            FROM tbl_event e
            WHERE e.event_id = 37
            LIMIT 5
        `);

        console.log('Query result structure:', {
            type: typeof queryResult,
            isArray: Array.isArray(queryResult),
            length: queryResult.length,
            firstElement: queryResult[0],
            firstElementType: typeof queryResult[0],
            firstElementIsArray: Array.isArray(queryResult[0])
        });

        let [paidEvents] = queryResult;
        console.log('After destructuring - paidEvents:', paidEvents);
        console.log('paidEvents type:', typeof paidEvents);
        console.log('paidEvents is array:', Array.isArray(paidEvents));
        console.log('paidEvents length:', paidEvents ? paidEvents.length : 'null/undefined');

        // If no event 37 found, try to find any paid event
        if (!paidEvents || paidEvents.length === 0) {
            console.log('Event 37 not found, trying to find any paid event...');
            const [anyPaidEvents] = await connection.query(`
                SELECT e.event_id, e.title as event_name, e.fee as event_fee, e.organization_id
                FROM tbl_event e
                WHERE e.fee > 0 AND e.status = 'Approved' AND e.type = 'Paid'
                LIMIT 5
            `);
            console.log('Any paid events found:', anyPaidEvents);
            if (anyPaidEvents && anyPaidEvents.length > 0) {
                console.log('Using first paid event found instead of event 37');
                // Use the first paid event found
                paidEvents = anyPaidEvents;
            }
        }

        if (!paidEvents || paidEvents.length === 0) {
            console.log('❌ No paid events found - cannot test registration');
            return;
        }

        const testEvent = paidEvents[0];
        console.log(`\n🎯 Testing with event: ${testEvent.event_name} (ID: ${testEvent.event_id}, Fee: ${testEvent.event_fee})`);

        // Step 2: Find a test user
        const [users] = await connection.query(`
            SELECT user_id, f_name as first_name, l_name as last_name, email
            FROM tbl_user
            LIMIT 1
        `);

        if (!users || users.length === 0) {
            console.log('❌ No users found - cannot test registration');
            return;
        }

        const testUser = users[0];
        console.log(`👤 Using test user: ${testUser.first_name} ${testUser.last_name} (ID: ${testUser.user_id})`);

        // Step 3: Check current attendance for this event
        const [currentAttendance] = await connection.query(`
            SELECT ea.attendance_id, ea.user_id, ea.transaction_id, ea.status,
                   t.payer_name, t.transaction_date
            FROM tbl_event_attendance ea
            LEFT JOIN tbl_transaction t ON ea.transaction_id = t.transaction_id
            WHERE ea.event_id = ?
            ORDER BY ea.created_at DESC
            LIMIT 5
        `, [testEvent.event_id]);

        console.log(`\n📋 Current attendance for event ${testEvent.event_id}:`, currentAttendance);

        // Step 4: Simulate the registration process (what the mobile app does)
        console.log('\n🔄 Simulating paid event registration...');

        // First, create the transaction (like createEventTransaction does)
        const transactionAmount = testEvent.event_fee;
        const payerName = `${testUser.first_name} ${testUser.last_name}`;
        const payerEmail = testUser.email;

        console.log(`💳 Creating transaction: Amount ${transactionAmount}, Payer: ${payerName}`);

        const [transactionResult] = await connection.query(`
            CALL CreateEventTransaction(?, ?, ?, ?, ?, ?, ?, ?)
        `, [payerEmail, payerName, transactionAmount, 'CASH', null, testEvent.event_id, testEvent.organization_id, 1]);

        console.log('📄 Transaction creation result type:', typeof transactionResult);
        console.log('📄 Transaction creation result is array:', Array.isArray(transactionResult));
        console.log('📄 Transaction creation result length:', transactionResult ? transactionResult.length : 'null');

        // Extract transaction_id using the same logic as our helper function
        let transaction_id = null;

        function extractTransactionId(result) {
            if (!result) return null;

            // Handle array of result sets
            if (Array.isArray(result)) {
                for (const item of result) {
                    const found = extractTransactionId(item);
                    if (found) return found;
                }
                return null;
            }

            // Handle single result set
            if (result && typeof result === 'object') {
                // Check for transaction_id directly
                if (result.transaction_id !== undefined) {
                    return Number(result.transaction_id);
                }

                // Check for insertId (common in MySQL2)
                if (result.insertId !== undefined) {
                    return Number(result.insertId);
                }

                // Recursively search nested objects/arrays
                for (const key in result) {
                    if (typeof result[key] === 'object' && result[key] !== null) {
                        const found = extractTransactionId(result[key]);
                        if (found) return found;
                    }
                }
            }

            return null;
        }

        transaction_id = extractTransactionId(transactionResult);
        console.log(`🔍 Extracted transaction_id: ${transaction_id}`);

        if (!transaction_id) {
            console.log('❌ Failed to extract transaction_id from result');
            return;
        }

        // Now register the event (like registerEvent does)
        console.log(`📝 Registering user ${testUser.user_id} for event ${testEvent.event_id} with transaction ${transaction_id}`);

        const [registrationResult] = await connection.query(`
            CALL RegisterEvent(?, ?, 'Pending', ?)
        `, [testEvent.event_id, testUser.user_id, transaction_id]);

        console.log('📄 Registration result:', JSON.stringify(registrationResult, null, 2));

        // Step 5: Verify the attendance record was created with the correct transaction_id
        const [newAttendance] = await connection.query(`
            SELECT ea.attendance_id, ea.user_id, ea.transaction_id, ea.status, ea.created_at,
                   t.payer_name, t.transaction_date, t.amount
            FROM tbl_event_attendance ea
            JOIN tbl_transaction t ON ea.transaction_id = t.transaction_id
            WHERE ea.event_id = ? AND ea.user_id = ?
            ORDER BY ea.created_at DESC
            LIMIT 1
        `, [testEvent.event_id, testUser.user_id]);

        console.log('\n✅ Verification - New attendance record:', newAttendance);

        if (newAttendance && newAttendance.length > 0) {
            const attendance = newAttendance[0];
            if (attendance.transaction_id === transaction_id) {
                console.log('🎉 SUCCESS: Attendance record correctly linked to transaction!');
                console.log(`   Attendance ID: ${attendance.attendance_id}`);
                console.log(`   Transaction ID: ${attendance.transaction_id}`);
                console.log(`   Status: ${attendance.status}`);
                console.log(`   Amount: ${attendance.amount}`);
            } else {
                console.log('❌ FAILURE: Transaction ID mismatch!');
                console.log(`   Expected: ${transaction_id}, Got: ${attendance.transaction_id}`);
            }
        } else {
            console.log('❌ FAILURE: No attendance record found!');
        }

        // Step 6: Check transaction-event linkage
        const [transactionEvent] = await connection.query(`
            SELECT * FROM tbl_transaction_event
            WHERE transaction_id = ? AND event_id = ?
        `, [transaction_id, testEvent.event_id]);

        console.log('\n🔗 Transaction-Event linkage:', transactionEvent);

        if (transactionEvent && transactionEvent.length > 0) {
            console.log('✅ Transaction-Event linkage exists');
        } else {
            console.log('❌ Transaction-Event linkage missing');
        }

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        if (connection) connection.release();
    }
}

// Run the test
testPaidEventRegistration().then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
});