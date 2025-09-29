#!/usr/bin/env node

// Debug script to check stored procedure result structure
const pool = require('./config/db');

async function debugStoredProcedureResult() {
    const connection = await pool.getConnection();

    try {
        console.log('🔍 Debugging CreateEventTransaction result structure...');

        const [result] = await connection.query(`
            CALL CreateEventTransaction(?, ?, ?, ?, ?, ?, ?, ?)
        `, ['javierbb@students.nu-dasma.edu.ph', 'Debug User', 50, 'CASH', null, 37, 5, 1]);

        console.log('📄 Raw result structure:');
        console.log('Type:', typeof result);
        console.log('Is Array:', Array.isArray(result));
        console.log('Length:', result.length);

        // Log each result set
        result.forEach((resultSet, index) => {
            console.log(`\n--- Result Set ${index} ---`);
            console.log('Type:', typeof resultSet);
            console.log('Is Array:', Array.isArray(resultSet));
            if (Array.isArray(resultSet)) {
                console.log('Length:', resultSet.length);
                resultSet.forEach((item, itemIndex) => {
                    console.log(`  Item ${itemIndex}:`, typeof item, item);
                });
            } else {
                console.log('Content:', resultSet);
            }
        });

        // Test our extractTransactionId function
        function extractTransactionId(spResult) {
            const q = [spResult];
            while (q.length) {
                const cur = q.shift();
                if (!cur) continue;

                if (Array.isArray(cur)) {
                    for (const item of cur) q.push(item);
                    continue;
                }
                if (typeof cur === 'object') {
                    // final SELECT v_transaction_id AS transaction_id
                    if ('transaction_id' in cur && cur.transaction_id != null) {
                        return Number(cur.transaction_id);
                    }
                    // fallback for OkPacket (if ever used)
                    if ('insertId' in cur && cur.insertId) {
                        return Number(cur.insertId);
                    }
                }
            }
            return null;
        }

        const extractedId = extractTransactionId(result);
        console.log('\n🔍 Extracted transaction_id:', extractedId);

    } catch (error) {
        console.error('❌ Debug failed:', error);
    } finally {
        connection.release();
    }
}

// Run the debug
debugStoredProcedureResult().then(() => {
    console.log('\n🏁 Debug completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Debug crashed:', error);
    process.exit(1);
});