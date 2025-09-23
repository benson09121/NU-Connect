#!/usr/bin/env node

// Focused test to simulate mobile payment creation process
const pool = require('../config/db');

async function simulateMobilePaymentCreation() {
    const connection = await pool.getConnection();
    
    try {
        console.log('🧪 Simulating mobile payment creation process...');
        
        // Step 1: Check available organizations with current versions
        const [orgs] = await connection.query(`
            SELECT o.organization_id, o.name, o.current_org_version_id,
                   ov.membership_fee_amount, ov.membership_fee_type
            FROM tbl_organization o
            JOIN tbl_organization_version ov ON o.current_org_version_id = ov.org_version_id
            WHERE o.status = 'Approved'
            LIMIT 5
        `);
        
        console.log('📋 Available organizations:', orgs);
        
        if (orgs.length === 0) {
            console.log('❌ No approved organizations found');
            return;
        }
        
        // Step 2: Check renewal cycles for these organizations
        for (const org of orgs) {
            console.log(`\n🔍 Checking cycles for ${org.name} (ID: ${org.organization_id}, Version: ${org.current_org_version_id})`);
            
            const [cycles] = await connection.query(`
                SELECT cycle_number, organization_id, org_version_id
                FROM tbl_renewal_cycle 
                WHERE organization_id = ?
                ORDER BY cycle_number DESC
            `, [org.organization_id]);
            
            console.log(`  Available cycles:`, cycles);
            
            // Check if there's a matching cycle for the current org version
            const matchingCycle = cycles.find(c => c.org_version_id === org.current_org_version_id);
            
            if (matchingCycle) {
                console.log(`  ✅ Found matching cycle: ${matchingCycle.cycle_number} for version ${org.current_org_version_id}`);
            } else {
                console.log(`  ❌ No matching cycle found for current version ${org.current_org_version_id}`);
                console.log(`  Available version cycles:`, cycles.map(c => c.org_version_id));
            }
        }
        
        // Step 3: Check current active term
        const [terms] = await connection.query(`
            SELECT term_id, term_name, start_date, end_date,
                   CURDATE() BETWEEN start_date AND end_date as is_current
            FROM tbl_academic_term 
            ORDER BY start_date DESC
            LIMIT 3
        `);
        
        console.log('\n📅 Academic terms:', terms);
        
        // Step 4: Check recent term payments and their membership linkage
        const [recentPayments] = await connection.query(`
            SELECT tp.payment_id, tp.transaction_id, tp.organization_id, tp.organization_version_id,
                   t.payer_name, t.created_at,
                   tm.transaction_id as membership_link,
                   tm.cycle_number,
                   o.name as org_name
            FROM tbl_term_payments tp
            JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
            JOIN tbl_organization o ON tp.organization_id = o.organization_id
            LEFT JOIN tbl_transaction_membership tm ON tp.transaction_id = tm.transaction_id
            ORDER BY t.created_at DESC
            LIMIT 10
        `);
        
        console.log('\n📊 Recent payments with membership status:');
        recentPayments.forEach(payment => {
            const status = payment.membership_link ? `✅ Linked (cycle ${payment.cycle_number})` : '❌ Missing';
            console.log(`  ${payment.org_name}: Payment ${payment.payment_id} (v${payment.organization_version_id}) - ${status}`);
        });
        
    } catch (error) {
        console.error('❌ Simulation failed:', error);
    } finally {
        connection.release();
    }
}

// Run the simulation
simulateMobilePaymentCreation().then(() => {
    console.log('\n🏁 Simulation completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Simulation crashed:', error);
    process.exit(1);
});