#!/usr/bin/env node

// Test script to verify tbl_transaction_membership insertion
const pool = require('../config/db');

async function testTransactionMembershipInsertion() {
    const connection = await pool.getConnection();
    
    try {
        console.log('🧪 Testing tbl_transaction_membership insertion...');
        
        // Check if we have any renewal cycles
        const [cycles] = await connection.query(`
            SELECT organization_id, cycle_number, org_version_id 
            FROM tbl_renewal_cycle 
            ORDER BY organization_id, cycle_number 
            LIMIT 5
        `);
        
        console.log('📊 Available renewal cycles:', cycles);
        
        if (cycles.length === 0) {
            console.log('❌ No renewal cycles found - cannot test insertion');
            return;
        }
        
        // Check existing transaction_membership entries
        const [existingEntries] = await connection.query(`
            SELECT tm.*, t.payer_name, t.transaction_date
            FROM tbl_transaction_membership tm
            JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
            ORDER BY tm.transaction_id DESC
            LIMIT 10
        `);
        
        console.log('📋 Recent transaction_membership entries:', existingEntries);
        
        // Check recent term payments to see if they should have corresponding membership entries
        const [recentPayments] = await connection.query(`
            SELECT tp.payment_id, tp.transaction_id, tp.organization_id, tp.created_at,
                   t.payer_name, t.transaction_date,
                   tm.transaction_id as membership_transaction_id,
                   tm.cycle_number
            FROM tbl_term_payments tp
            JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
            LEFT JOIN tbl_transaction_membership tm ON tp.transaction_id = tm.transaction_id
            ORDER BY tp.created_at DESC
            LIMIT 10
        `);
        
        console.log('🔍 Recent term payments with membership check:');
        recentPayments.forEach(payment => {
            const hasMembership = payment.membership_transaction_id ? '✅' : '❌';
            console.log(`  Payment ${payment.payment_id}: Transaction ${payment.transaction_id} ${hasMembership} ${payment.payer_name} (${payment.transaction_date})`);
        });
        
        // Count mismatches
        const missingMembership = recentPayments.filter(p => !p.membership_transaction_id);
        console.log(`\n📈 Summary: ${recentPayments.length - missingMembership.length}/${recentPayments.length} term payments have corresponding membership entries`);
        
        if (missingMembership.length > 0) {
            console.log('❌ Missing membership entries for transactions:', missingMembership.map(p => p.transaction_id));
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        connection.release();
    }
}

// Run the test
testTransactionMembershipInsertion().then(() => {
    console.log('🏁 Test completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Test crashed:', error);
    process.exit(1);
});