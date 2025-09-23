#!/usr/bin/env node

// Direct database verification script
const pool = require('../config/db');

async function verifyDatabaseState() {
    const connection = await pool.getConnection();
    
    try {
        console.log('🔍 Checking current database state...\n');
        
        // Check transaction 31 specifically
        console.log('=== TRANSACTION 31 CHECK ===');
        const [transaction31] = await connection.query(`
            SELECT transaction_id, user_id, amount, status, created_at 
            FROM tbl_transaction 
            WHERE transaction_id = 31
        `);
        console.log('Transaction 31:', transaction31);
        
        // Check membership for transaction 31
        const [membership31] = await connection.query(`
            SELECT transaction_id, organization_id, cycle_number 
            FROM tbl_transaction_membership 
            WHERE transaction_id = 31
        `);
        console.log('Membership for transaction 31:', membership31);
        
        // Check term payment for transaction 31
        const [payment31] = await connection.query(`
            SELECT payment_id, transaction_id, payment_status, created_at 
            FROM tbl_term_payments 
            WHERE transaction_id = 31
        `);
        console.log('Term payment for transaction 31:', payment31);
        
        console.log('\n=== RECENT TRANSACTIONS ===');
        // Check last 5 transactions
        const [recentTransactions] = await connection.query(`
            SELECT transaction_id, user_id, amount, status, created_at 
            FROM tbl_transaction 
            ORDER BY transaction_id DESC 
            LIMIT 5
        `);
        console.log('Last 5 transactions:', recentTransactions);
        
        console.log('\n=== ALL MEMBERSHIP ENTRIES ===');
        // Check all membership entries
        const [allMemberships] = await connection.query(`
            SELECT tm.transaction_id, tm.organization_id, tm.cycle_number,
                   t.user_id, t.amount, t.created_at
            FROM tbl_transaction_membership tm
            JOIN tbl_transaction t ON tm.transaction_id = t.transaction_id
            ORDER BY t.transaction_id DESC
        `);
        console.log('All transaction_membership entries:', allMemberships);
        
        console.log('\n=== RECENT TERM PAYMENTS ===');
        // Check recent term payments
        const [recentPayments] = await connection.query(`
            SELECT tp.payment_id, tp.transaction_id, tp.payment_status, tp.created_at,
                   t.user_id, t.amount
            FROM tbl_term_payments tp
            JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
            ORDER BY tp.payment_id DESC
            LIMIT 5
        `);
        console.log('Recent term payments:', recentPayments);
        
        console.log('\n=== MISSING MEMBERSHIPS ===');
        // Find term payments without corresponding membership entries
        const [missingMemberships] = await connection.query(`
            SELECT tp.payment_id, tp.transaction_id, tp.payment_status, tp.created_at,
                   t.user_id, t.amount,
                   tm.transaction_id as has_membership
            FROM tbl_term_payments tp
            JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
            LEFT JOIN tbl_transaction_membership tm ON tp.transaction_id = tm.transaction_id
            WHERE tm.transaction_id IS NULL
            ORDER BY tp.payment_id DESC
        `);
        console.log('Term payments WITHOUT membership entries:', missingMemberships);
        
    } catch (error) {
        console.error('❌ Verification failed:', error);
    } finally {
        connection.release();
    }
}

// Run the verification
verifyDatabaseState().then(() => {
    console.log('\n🏁 Database verification completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Verification crashed:', error);
    process.exit(1);
});