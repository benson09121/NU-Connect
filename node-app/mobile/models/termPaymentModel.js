// ===========================
// MOBILE TERM PAYMENT MODEL
// ===========================

const pool = require('../../config/db');
// Import SSE functionality for real-time updates
const { publishToChannel } = require('../../web/controllers/sseController');

class MobileTermPaymentModel {
    // ==================
    // TERM OPERATIONS
    // ==================

    // Get current active term
    static async getCurrentActiveTerm() {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query('CALL GetCurrentActiveTerm()');
            return rows[0][0] || null;
        } catch (error) {
            console.error('Error fetching current active term:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get term by date range (check if current date falls within term)
    static async getTermByDateRange(currentDate = null) {
        const connection = await pool.getConnection();
        try {
            const dateToCheck = currentDate || new Date().toISOString().split('T')[0];
            
            const [rows] = await connection.query(`
                SELECT 
                    term_id,
                    academic_year,
                    term_name,
                    start_date,
                    end_date,
                    is_active,
                    created_at,
                    DATE(?) BETWEEN start_date AND end_date as is_current_term
                FROM tbl_academic_term 
                WHERE DATE(?) BETWEEN start_date AND end_date
                ORDER BY start_date DESC
                LIMIT 1
            `, [dateToCheck, dateToCheck]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching term by date range:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get all terms (for mobile display)
    static async getAllTerms() {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    term_id,
                    academic_year,
                    term_name,
                    start_date,
                    end_date,
                    is_active,
                    created_at
                FROM tbl_academic_term 
                ORDER BY start_date DESC
            `);
            return rows;
        } catch (error) {
            console.error('Error fetching all terms:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ==================
    // PAYMENT OPERATIONS
    // ==================

    // Get user's term payments for specific organization
    static async getUserTermPayments(userId, organizationId, organizationVersionId = null) {
        const connection = await pool.getConnection();
        try {
            if (organizationVersionId) {
                // Use direct query when organization_version_id is provided
                const [rows] = await connection.query(`
                    SELECT 
                        tp.payment_id,
                        tp.user_id,
                        tp.organization_id,
                        tp.organization_version_id,
                        tp.term_id,
                        tp.payment_status,
                        tp.verified_by,
                        tp.verified_at,
                        tp.notes,
                        tp.created_at,
                        tp.updated_at,
                        t.amount as payment_amount,
                        t.receipt_no as transaction_reference,
                        t.transaction_date,
                        t.proof_image as receipt_url,
                        at.term_name,
                        at.academic_year,
                        o.name as organization_name
                    FROM tbl_term_payments tp
                    JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                    JOIN tbl_academic_term at ON tp.term_id = at.term_id
                    JOIN tbl_organization o ON tp.organization_id = o.organization_id
                    WHERE tp.user_id = ? 
                    AND tp.organization_id = ?
                    AND tp.organization_version_id = ?
                    ORDER BY tp.created_at DESC
                `, [userId, organizationId, organizationVersionId]);
                return rows;
            } else {
                // Fallback to stored procedure for backward compatibility
                const [rows] = await connection.query(
                    'CALL GetUserTermPayments(?, ?)',
                    [userId, organizationId]
                );
                return rows[0] || [];
            }
        } catch (error) {
            console.error('Error fetching user term payments:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Enhanced payment status check with exclusion logic and additional parameters
    static async checkEnhancedPaymentStatus(userId, organizationId, organizationVersionId = null, options = {}) {
        const connection = await pool.getConnection();
        try {
            const {
                application_date,
                current_term_id,
                include_history = false,
                future_terms_count = 4
            } = options;
            
            console.log('\n🚀 ========== ENHANCED PAYMENT STATUS CHECK START ==========');
            console.log('👤 User ID:', userId);
            console.log('🏢 Organization ID:', organizationId);
            console.log('📦 Organization Version ID:', organizationVersionId);
            console.log('⚙️ Options:', options);
            
            // Step 1: Get organization payment settings and rules
            console.log('\n📋 STEP 1: Fetching organization settings...');
            const [orgSettings] = await connection.query(`
                SELECT 
                    o.organization_id,
                    o.name as organization_name,
                    o.current_org_version_id,
                    o.membership_fee_amount,
                    o.membership_fee_type,
                    o.status as org_status,
                    ov.org_version_id,
                    -- Default exclusion policy if column doesn't exist yet
                    'CURRENT_TERM' as term_exclusion_policy
                FROM tbl_organization o
                LEFT JOIN tbl_organization_version ov ON o.current_org_version_id = ov.org_version_id
                WHERE o.organization_id = ?
                AND o.status = 'Approved'
                AND (? IS NULL OR ov.org_version_id IS NULL OR ov.org_version_id = ?)
            `, [organizationId, organizationVersionId, organizationVersionId]);

            if (orgSettings.length === 0) {
                console.log('❌ Organization not found or not approved');
                console.log('🚀 ========== ENHANCED PAYMENT STATUS CHECK END: FAILED ==========\n');
                return {
                    success: false,
                    message: 'Organization not found or not approved'
                };
            }

            const orgData = orgSettings[0];
            console.log('✅ Organization found:', {
                organization_id: orgData.organization_id,
                organization_name: orgData.organization_name,
                fee_amount: orgData.membership_fee_amount,
                fee_type: orgData.membership_fee_type,
                org_status: orgData.org_status
            });

            // Step 2: Get user membership information including application date
            const [membershipInfo] = await connection.query(`
                SELECT 
                    om.user_id,
                    om.organization_id,
                    om.org_version_id as organization_version_id,
                    om.joined_at,
                    om.status as membership_status,
                    om.payment_start_term_id,
                    om.excluded_terms,
                    -- Get application date from membership_application table
                    ma.applied_at as application_date,
                    ma.status as application_status
                FROM tbl_organization_members om
                LEFT JOIN tbl_membership_application ma ON (
                    ma.organization_id = om.organization_id 
                    AND ma.cycle_number = om.cycle_number 
                    AND ma.user_id = om.user_id
                    AND ma.status = 'Approved'
                )
                WHERE om.user_id = ? 
                AND om.organization_id = ?
                AND (? IS NULL OR om.org_version_id = ?)
                AND om.status = 'Active'
                ORDER BY om.joined_at DESC
                LIMIT 1
            `, [userId, organizationId, organizationVersionId, organizationVersionId]);

            if (membershipInfo.length === 0) {
                console.log('❌ User is not an active member of this organization');
                console.log('🚀 ========== ENHANCED PAYMENT STATUS CHECK END: FAILED ==========\n');
                return {
                    success: false,
                    message: 'User is not an active member of this organization'
                };
            }

            const memberData = membershipInfo[0];
            const userApplicationDate = application_date || memberData.application_date;
            console.log('✅ Membership found:', {
                user_id: memberData.user_id,
                joined_at: memberData.joined_at,
                membership_status: memberData.membership_status,
                payment_start_term_id: memberData.payment_start_term_id,
                application_date: userApplicationDate
            });

            // Step 3: Get current term and relevant terms
            console.log('\n📋 STEP 3: Fetching current term...');
            const currentDate = new Date().toISOString().split('T')[0];
            const [terms] = await connection.query(`
                SELECT 
                    term_id,
                    academic_year,
                    term_name,
                    start_date,
                    end_date,
                    is_active,
                    DATE(?) BETWEEN start_date AND end_date as is_current_term
                FROM tbl_academic_term 
                ORDER BY start_date DESC
                LIMIT ?
            `, [currentDate, future_terms_count + 2]);

            const currentTerm = current_term_id 
                ? terms.find(t => t.term_id === current_term_id)
                : terms.find(t => t.is_current_term === 1);

            if (!currentTerm) {
                console.log('❌ No current term found');
                console.log('📅 Available terms:', terms);
                console.log('🚀 ========== ENHANCED PAYMENT STATUS CHECK END: FAILED ==========\n');
                return {
                    success: false,
                    message: 'No current term found',
                    available_terms: terms
                };
            }

            console.log('✅ Current term found:', {
                term_id: currentTerm.term_id,
                term_name: currentTerm.term_name,
                start_date: currentTerm.start_date,
                end_date: currentTerm.end_date,
                is_active: currentTerm.is_active
            });

            // Step 4: Apply enhanced exclusion logic with payment verification
            console.log('\n📋 STEP 4: Checking if user should be excluded from current term payment...');
            const shouldExcludeCurrentTerm = await this.shouldExcludeFromCurrentTermEnhanced(
                userId,
                organizationId,
                currentTerm.term_id,
                userApplicationDate,
                currentTerm.start_date,
                orgData.membership_fee_type,
                connection
            );

            console.log('📊 Exclusion result:', shouldExcludeCurrentTerm);
            console.log('💡 This means:', shouldExcludeCurrentTerm 
                ? '✅ User is EXEMPT from current term (should show PAID)' 
                : '❌ User MUST PAY for current term (should show PAYMENT REQUIRED)');

            // Step 5: Get existing payments with transaction status
            console.log('\n📋 STEP 5: Fetching existing payments...');
            const [existingPayments] = await connection.query(`
                SELECT 
                    tp.payment_id,
                    tp.user_id,
                    tp.organization_id,
                    tp.organization_version_id,
                    tp.term_id,
                    tp.payment_status,
                    tp.created_at,
                    tp.verified_at,
                    at.term_name,
                    at.start_date,
                    at.end_date,
                    t.amount as transaction_amount,
                    t.transaction_date,
                    t.status as transaction_status
                FROM tbl_term_payments tp
                LEFT JOIN tbl_academic_term at ON tp.term_id = at.term_id
                LEFT JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                WHERE tp.user_id = ?
                AND tp.organization_id = ?
                AND (? IS NULL OR tp.organization_version_id = ?)
                ${include_history ? '' : 'AND tp.payment_status != "Rejected"'}
                ORDER BY at.start_date DESC
            `, [userId, organizationId, organizationVersionId, organizationVersionId]);

            console.log('✅ Found', existingPayments.length, 'existing payment(s)');
            if (existingPayments.length > 0) {
                console.log('💳 Payment details:', existingPayments.map(p => ({
                    payment_id: p.payment_id,
                    term_name: p.term_name,
                    payment_status: p.payment_status,
                    transaction_status: p.transaction_status
                })));
            }

            // Step 6: Calculate payment schedule
            console.log('\n📋 STEP 6: Calculating payment schedule...');
            const paymentSchedule = this.calculatePaymentSchedule(
                terms,
                existingPayments,
                currentTerm,
                shouldExcludeCurrentTerm,
                orgData.membership_fee_amount,
                future_terms_count
            );

            console.log('✅ Payment schedule calculated:');
            paymentSchedule.forEach((item, index) => {
                console.log(`  ${index + 1}. ${item.term_name}:`, {
                    status: item.status,
                    amount: item.amount,
                    reason: item.reason
                });
            });

            // Step 7: Prepare enhanced response
            console.log('\n📋 STEP 7: Preparing response...');
            const response = {
                success: true,
                organization_info: {
                    organization_id: orgData.organization_id,
                    organization_name: orgData.organization_name,
                    fee_amount: orgData.membership_fee_amount,
                    fee_type: orgData.membership_fee_type,
                    exclusion_policy: orgData.term_exclusion_policy
                },
                current_term: currentTerm,
                exclusion_info: {
                    excluded_from_current_term: shouldExcludeCurrentTerm,
                    reason: shouldExcludeCurrentTerm 
                        ? 'Applied after term start date' 
                        : 'Applied before or on term start date',
                    application_date: userApplicationDate,
                    term_start_date: currentTerm.start_date
                },
                payment_schedule: paymentSchedule,
                existing_payments: existingPayments,
                next_payment_required: paymentSchedule.find(p => p.status === 'required'),
                user_message: this.generateUserMessage(shouldExcludeCurrentTerm, currentTerm, paymentSchedule)
            };

            const nextPaymentRequired = paymentSchedule.find(p => p.status === 'required');
            console.log('\n🎯 FINAL RESULT:');
            console.log('  • User should be excluded from current term?', shouldExcludeCurrentTerm);
            console.log('  • Next payment required?', nextPaymentRequired ? 'YES' : 'NO');
            if (nextPaymentRequired) {
                console.log('  • Next payment details:', {
                    term: nextPaymentRequired.term_name,
                    amount: nextPaymentRequired.amount,
                    due_date: nextPaymentRequired.end_date
                });
            }
            console.log('  • User message:', response.user_message);
            console.log('🚀 ========== ENHANCED PAYMENT STATUS CHECK END: SUCCESS ==========\n');

            return response;

        } catch (error) {
            console.error('\n❌ ========== ERROR IN PAYMENT STATUS CHECK ==========');
            console.error('Error details:', error);
            console.error('Stack trace:', error.stack);
            console.error('🚀 ========== ENHANCED PAYMENT STATUS CHECK END: ERROR ==========\n');
            throw error;
        } finally {
            connection.release();
        }
    }

    // Enhanced exclusion logic that checks actual payment verification
    static async shouldExcludeFromCurrentTermEnhanced(userId, organizationId, currentTermId, applicationDate, termStartDate, paymentType, connection) {
        console.log('\n🔍 ========== PAYMENT EXCLUSION CHECK START ==========');
        console.log('📋 Input Parameters:', {
            userId,
            organizationId,
            currentTermId,
            applicationDate,
            termStartDate,
            paymentType
        });
        
        // Fix case sensitivity - database uses 'Per Term', not 'PER_TERM'
        if (paymentType !== 'Per Term') {
            console.log('❌ Not a Per Term organization - payment type:', paymentType);
            console.log('🔍 ========== PAYMENT EXCLUSION CHECK END: FALSE ==========\n');
            return false; // Only applies to per-term organizations
        }
        
        if (!currentTermId) {
            console.log('❌ No current term ID provided');
            console.log('🔍 ========== PAYMENT EXCLUSION CHECK END: FALSE ==========\n');
            return false; // Can't check without term ID
        }
        
        try {
            // SIMPLIFIED LOGIC: Check if user's joined_at date falls within the current term's date range
            // If YES → User already paid during application (application fee covers this term)
            // If NO → Check if explicit payment exists in tbl_term_payments
            
            console.log('🔎 Executing database query to check membership and payment...');
            const [termCheck] = await connection.query(`
                SELECT 
                    om.joined_at,
                    om.user_id,
                    om.organization_id,
                    at.term_id,
                    at.term_name,
                    at.start_date,
                    at.end_date,
                    -- Check if joined_at falls within term date range
                    DATE(om.joined_at) BETWEEN at.start_date AND at.end_date as joined_during_term,
                    -- Check if explicit payment exists
                    tp.payment_id,
                    tp.payment_status,
                    -- Extra debug info
                    DATE(om.joined_at) as joined_date_only,
                    om.status as membership_status
                FROM tbl_organization_members om
                CROSS JOIN tbl_academic_term at
                LEFT JOIN tbl_term_payments tp ON (
                    tp.user_id = om.user_id 
                    AND tp.organization_id = om.organization_id
                    AND tp.term_id = at.term_id
                )
                WHERE om.user_id = ?
                AND om.organization_id = ?
                AND at.term_id = ?
                AND om.status = 'Active'
                LIMIT 1
            `, [userId, organizationId, currentTermId]);
            
            console.log('📊 Query returned', termCheck.length, 'row(s)');
            
            if (termCheck.length === 0) {
                console.log('⚠️ No membership record found for user');
                console.log('🔍 ========== PAYMENT EXCLUSION CHECK END: FALSE ==========\n');
                return false;
            }
            
            if (termCheck.length > 0) {
                const data = termCheck[0];
                
                console.log('📄 Database Result:', {
                    user_id: data.user_id,
                    organization_id: data.organization_id,
                    term_id: data.term_id,
                    term_name: data.term_name,
                    membership_status: data.membership_status,
                    joined_at: data.joined_at,
                    joined_date_only: data.joined_date_only,
                    term_start_date: data.start_date,
                    term_end_date: data.end_date,
                    joined_during_term: data.joined_during_term,
                    payment_id: data.payment_id,
                    payment_status: data.payment_status
                });
                
                // CASE 1: User has explicit payment in tbl_term_payments
                console.log('\n🔍 CASE 1: Checking for explicit payment in tbl_term_payments...');
                if (data.payment_id) {
                    console.log('✅ Payment record found:', {
                        payment_id: data.payment_id,
                        payment_status: data.payment_status
                    });
                    
                    if (data.payment_status === 'Paid' || data.payment_status === 'Pending') {
                        console.log('✅ Payment status is Paid or Pending - User is EXEMPT');
                        console.log('🔍 ========== PAYMENT EXCLUSION CHECK END: TRUE ==========\n');
                        return true; // User is EXEMPT because they have a payment record
                    } else {
                        console.log('⚠️ Payment exists but status is:', data.payment_status);
                    }
                } else {
                    console.log('❌ No payment record found in tbl_term_payments');
                }
                
                // CASE 2: User joined during the current term's date range
                console.log('\n🔍 CASE 2: Checking if user joined during term period...');
                console.log('📅 Date Comparison:', {
                    joined_at: data.joined_at,
                    joined_date: data.joined_date_only,
                    term_start: data.start_date,
                    term_end: data.end_date,
                    joined_during_term_flag: data.joined_during_term
                });
                
                if (data.joined_during_term === 1) {
                    console.log('✅ User joined DURING term period - User is EXEMPT');
                    console.log('💡 Reason: Application fee covers this term');
                    console.log('🔍 ========== PAYMENT EXCLUSION CHECK END: TRUE ==========\n');
                    return true; // User is EXEMPT because application fee covered this term
                } else {
                    console.log('❌ User joined BEFORE term started');
                }
            }
            
            // CASE 3: User joined before term started → Must pay
            console.log('\n🔍 CASE 3: User must pay');
            console.log('📝 Reason: User joined before term started AND no explicit payment exists');
            console.log('🔍 ========== PAYMENT EXCLUSION CHECK END: FALSE ==========\n');
            return false;
            
        } catch (error) {
            console.error('Error checking if user should be excluded from current term:', error);
            // On error, default to NOT excluding (safer - requires payment)
            return false;
        }
    }

    // Legacy method kept for backward compatibility
    static shouldExcludeFromCurrentTerm(applicationDate, termStartDate, paymentType) {
        // Fix case sensitivity - database uses 'Per Term', not 'PER_TERM'
        if (paymentType !== 'Per Term') {
            return false; // Only applies to per-term organizations
        }
        
        if (!applicationDate || !termStartDate) {
            return false; // Default to not exclude if dates are missing
        }
        
        const appDate = new Date(applicationDate);
        const termStart = new Date(termStartDate);
        
        // CORRECTED LOGIC: If user applied during or after the current term start,
        // they should be EXEMPT from current term payment because they already paid application fee
        // Their term payments should start from the NEXT term
        return appDate >= termStart;
    }

    // Helper method to calculate payment schedule with enhanced status logic
    static calculatePaymentSchedule(terms, existingPayments, currentTerm, shouldExcludeCurrentTerm, feeAmount, futureTermsCount) {
        const schedule = [];
        const relevantTerms = terms.slice(0, futureTermsCount + 1);
        
        for (const term of relevantTerms) {
            const existingPayment = existingPayments.find(p => p.term_id === term.term_id);
            
            let status = 'required';
            let reason = '';
            
            if (existingPayment) {
                // Enhanced status checking with transaction status
                if (existingPayment.payment_status === 'Paid' || 
                    (existingPayment.payment_status === 'Pending' && existingPayment.transaction_status === 'Completed')) {
                    status = 'paid';
                    reason = 'Payment completed';
                } else if (existingPayment.payment_status === 'Pending') {
                    status = 'pending';
                    reason = 'Payment pending verification';
                } else if (existingPayment.payment_status === 'Rejected') {
                    status = 'rejected';
                    reason = 'Payment rejected';
                } else if (existingPayment.payment_status === 'Cancelled') {
                    status = 'cancelled';
                    reason = 'Payment cancelled';
                } else {
                    status = existingPayment.payment_status.toLowerCase();
                    reason = 'Payment exists';
                }
            } else if (term.term_id === currentTerm.term_id && shouldExcludeCurrentTerm) {
                // User is exempt from current term (joined during term or has payment)
                status = 'paid';  // Changed from 'excluded' to 'paid' for mobile display
                reason = 'Automatically paid - joined during term (application fee covered this term)';
            } else if (new Date(term.end_date) < new Date()) {
                status = 'overdue';
                reason = 'Term has ended';
            }
            
            schedule.push({
                term_id: term.term_id,
                term_name: term.term_name,
                start_date: term.start_date,
                end_date: term.end_date,
                amount: feeAmount,
                status: status,
                reason: reason,
                existing_payment: existingPayment || null
            });
        }
        
        return schedule;
    }

    // Helper method to generate user-friendly message
    static generateUserMessage(shouldExcludeCurrentTerm, currentTerm, paymentSchedule) {
        const requiredPayment = paymentSchedule.find(p => p.status === 'required');
        
        if (shouldExcludeCurrentTerm) {
            const nextTerm = paymentSchedule.find(p => p.term_id !== currentTerm.term_id && p.status === 'required');
            if (nextTerm) {
                return `Since you applied during the current term, you're not required to pay for ${currentTerm.term_name}. Your payments will begin with ${nextTerm.term_name} starting on ${nextTerm.start_date}.`;
            } else {
                return `Since you applied during the current term, you're not required to pay for ${currentTerm.term_name}. No immediate payment required.`;
            }
        } else if (requiredPayment) {
            return `Your term payments begin with ${requiredPayment.term_name}. Payment of ₱${requiredPayment.amount} is required.`;
        } else {
            return 'All required payments are up to date.';
        }
    }

    // Original method kept for backward compatibility
    static async checkCurrentTermPaymentStatus(userId, organizationId, organizationVersionId = null) {
        const connection = await pool.getConnection();
        try {
            console.log(`DEBUG MODEL: Check payment status called for userId: ${userId}, organizationId: ${organizationId}, organizationVersionId: ${organizationVersionId}`);
            
            // Get current term by date range
            const currentDate = new Date().toISOString().split('T')[0];
            console.log(`DEBUG MODEL: Current date: ${currentDate}`);

            // Step 1: Check if current term exists and get organization details with LEFT JOIN for payment
            const [result] = await connection.query(`
                SELECT 
                    -- Term information
                    at.term_id,
                    at.academic_year,
                    at.term_name,
                    at.start_date,
                    at.end_date,
                    at.is_active,
                    DATE(?) BETWEEN at.start_date AND at.end_date as is_current_term,
                    CASE WHEN at.term_id IS NOT NULL THEN 1 ELSE 0 END as term_exists,
                    
                    -- Organization information (get fee from main organization table)
                    o.organization_id,
                    o.name as organization_name,
                    o.current_org_version_id,
                    o.membership_fee_amount,
                    o.membership_fee_type,
                    
                    -- Payment information (will be NULL if no payment exists)
                    tp.payment_id,
                    tp.payment_status,
                    tp.organization_version_id,
                    tp.created_at as payment_created_at,
                    tp.updated_at as payment_updated_at,
                    tp.verified_by,
                    tp.verified_at,
                    tp.notes as payment_notes,
                    
                    -- Transaction information (will be NULL if no payment exists)
                    t.transaction_id,
                    t.amount as transaction_amount,
                    pt.label as payment_method,
                    t.receipt_no,
                    t.proof_image as receipt_url,
                    t.transaction_date,
                    
                    -- Payment existence indicator
                    CASE WHEN tp.payment_id IS NOT NULL THEN 1 ELSE 0 END as payment_exists,
                    
                    -- Current date for debugging
                    DATE(?) as check_date
                FROM tbl_academic_term at
                CROSS JOIN tbl_organization o
                LEFT JOIN tbl_organization_version ov ON o.current_org_version_id = ov.org_version_id
                LEFT JOIN tbl_term_payments tp ON (
                    tp.term_id = at.term_id 
                    AND tp.organization_id = o.organization_id 
                    AND tp.organization_version_id = COALESCE(?, o.current_org_version_id)
                    AND tp.user_id = ?
                )
                LEFT JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                LEFT JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                WHERE DATE(?) BETWEEN at.start_date AND at.end_date
                AND o.organization_id = ?
                AND o.status = 'Approved'
                AND (? IS NULL OR ov.org_version_id IS NULL OR ov.org_version_id = ?)
                ORDER BY at.start_date DESC
                LIMIT 1
            `, [currentDate, currentDate, organizationVersionId, userId, currentDate, organizationId, organizationVersionId, organizationVersionId]);

            console.log('DEBUG MODEL: Query result:', result);

            if (result.length === 0) {
                // No current term found, get all available terms for debugging
                const [allTerms] = await connection.query(`
                    SELECT 
                        term_id,
                        academic_year,
                        term_name,
                        start_date,
                        end_date,
                        is_active,
                        DATE(?) as check_date,
                        DATE(?) BETWEEN start_date AND end_date as is_current_term
                    FROM tbl_academic_term 
                    ORDER BY start_date DESC
                `, [currentDate, currentDate]);

                console.log('DEBUG MODEL: No current term found, all available terms:', allTerms);

                return {
                    term_exists: 0,
                    payment_exists: 0,
                    current_term: null,
                    payment_required: false,
                    payment_records: null,
                    organization_fee: null,
                    message: 'No active academic term found for current date',
                    debug_info: {
                        current_date: currentDate,
                        available_terms: allTerms
                    }
                };
            }

            const data = result[0];
            console.log('DEBUG MODEL: Found term and organization data:', data);

            // Prepare the response structure
            const response = {
                term_exists: data.term_exists,
                payment_exists: data.payment_exists,
                current_term: {
                    term_id: data.term_id,
                    term_name: data.term_name,
                    start_date: data.start_date,
                    end_date: data.end_date,
                    academic_year: data.academic_year
                },
                organization_fee: {
                    amount: data.membership_fee_amount,
                    type: data.membership_fee_type,
                    organization_name: data.organization_name
                },
                debug_info: {
                    current_date: currentDate,
                    query_result: data
                }
            };

            if (data.payment_exists === 1) {
                // Payment exists - return payment details
                console.log('DEBUG MODEL: Payment exists, returning payment status');
                
                response.payment_required = false;
                response.payment_records = [{
                    payment_id: data.payment_id,
                    term_id: data.term_id,
                    organization_id: data.organization_id,
                    user_id: userId,
                    payment_status: data.payment_status,
                    created_at: data.payment_created_at,
                    updated_at: data.payment_updated_at,
                    verified_by: data.verified_by,
                    verified_at: data.verified_at,
                    notes: data.payment_notes,
                    transaction_id: data.transaction_id,
                    transaction_amount: data.transaction_amount,
                    payment_method: data.payment_method,
                    receipt_no: data.receipt_no,
                    receipt_url: data.receipt_url,
                    transaction_date: data.transaction_date,
                    term_name: data.term_name,
                    start_date: data.start_date,
                    end_date: data.end_date,
                    organization_fee_amount: data.membership_fee_amount,
                    organization_fee_type: data.membership_fee_type
                }];
                response.message = `Payment status: ${data.payment_status}`;
            } else {
                // Term exists but no payment - user needs to pay
                console.log('DEBUG MODEL: Term exists but no payment found - user needs to pay');
                
                response.payment_required = true;
                response.payment_records = null;
                response.message = 'Payment required for current term';
            }

            return response;

        } catch (error) {
            console.error('ERROR MODEL: Error checking current term payment status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // STEP 1: Create transaction and membership entry (returns transaction details for real-time)
    static async createTransactionWithMembership(userId, organizationId, organizationVersionId, receiptPath, paymentMethod = null) {
        const connection = await pool.getConnection();
        try {
            console.log(`DEBUG MODEL: Creating transaction with membership - User: ${userId}, Org: ${organizationId}`);
            
            // Extract filename from full path (store only filename in database)
            const filename = receiptPath.split('/').pop();
            
            // Call CreateTransactionWithMembership procedure
            const [transactionResult] = await connection.query(`
                CALL CreateTransactionWithMembership(?, ?, ?, ?, ?, @transaction_id, @cycle_number, @amount, @transaction_message)
            `, [
                userId,
                organizationId, 
                organizationVersionId,
                filename,
                paymentMethod || 'UPLOAD_PROOF'
            ]);
            
            // Get transaction output parameters
            const [transactionOutput] = await connection.query(`
                SELECT 
                    @transaction_id as transaction_id, 
                    @cycle_number as cycle_number, 
                    @amount as amount,
                    @transaction_message as result_message
            `);
            
            const transactionData = transactionOutput[0];
            console.log(`DEBUG MODEL: Transaction procedure result:`, transactionData);
            
            if (!transactionData.transaction_id || transactionData.result_message.startsWith('Transaction Error:')) {
                throw new Error(transactionData.result_message || 'Failed to create transaction');
            }
            
            const transactionId = transactionData.transaction_id;
            const cycleNumber = transactionData.cycle_number;
            
            // Get transaction details for real-time response
            const [transactionDetails] = await connection.query(`
                SELECT 
                    t.transaction_id,
                    t.amount,
                    t.proof_image as receipt_url,
                    t.receipt_no,
                    pt.label as payment_method,
                    o.name as organization_name,
                    tm.cycle_number
                FROM tbl_transaction t
                JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                JOIN tbl_organization o ON t.organization_id = o.organization_id
                JOIN tbl_transaction_membership tm ON t.transaction_id = tm.transaction_id
                WHERE t.transaction_id = ?
            `, [transactionId]);
            
            if (transactionDetails.length === 0) {
                throw new Error('Transaction created but details not found');
            }
            
            const result = transactionDetails[0];
            console.log(`DEBUG MODEL: Transaction and membership created successfully:`, result);
            
            return {
                transaction_id: result.transaction_id,
                cycle_number: result.cycle_number,
                amount: result.amount,
                payment_method: result.payment_method,
                receipt_url: result.receipt_url,
                receipt_no: result.receipt_no,
                organization_name: result.organization_name,
                message: 'Transaction and membership created successfully'
            };
            
        } catch (error) {
            console.error('Error creating transaction with membership:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // STEP 2: Create term payment using existing transaction ID
    static async createTermPaymentWithTransactionId(userId, organizationId, organizationVersionId, termId, transactionId) {
        const connection = await pool.getConnection();
        try {
            console.log(`DEBUG MODEL: Creating term payment - Transaction: ${transactionId}, Term: ${termId}`);
            
            // Call CreateTermPayment procedure
            const [paymentResult] = await connection.query(`
                CALL CreateTermPayment(?, ?, ?, ?, ?, @payment_id, @payment_message)
            `, [
                userId,
                organizationId,
                organizationVersionId,
                termId,
                transactionId
            ]);
            
            // Get payment output parameters
            const [paymentOutput] = await connection.query(`
                SELECT 
                    @payment_id as payment_id, 
                    @payment_message as result_message
            `);
            
            const paymentData = paymentOutput[0];
            console.log(`DEBUG MODEL: Payment procedure result:`, paymentData);
            
            if (!paymentData.payment_id || paymentData.result_message.startsWith('Payment Error:')) {
                throw new Error(paymentData.result_message || 'Failed to create term payment');
            }
            
            const paymentId = paymentData.payment_id;
            
            // Get complete payment details for response
            const [paymentDetails] = await connection.query(`
                SELECT 
                    tp.payment_id,
                    t.amount,
                    tp.payment_status,
                    pt.label as payment_method,
                    t.proof_image as receipt_url,
                    t.transaction_id,
                    t.receipt_no,
                    at.term_name,
                    at.start_date,
                    at.end_date,
                    o.name as organization_name
                FROM tbl_term_payments tp
                JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                JOIN tbl_academic_term at ON tp.term_id = at.term_id
                JOIN tbl_organization o ON tp.organization_id = o.organization_id
                WHERE tp.payment_id = ?
            `, [paymentId]);
            
            if (paymentDetails.length === 0) {
                throw new Error('Payment created but details not found');
            }
            
            const result = paymentDetails[0];
            console.log(`DEBUG MODEL: Term payment created successfully:`, result);
            
            return {
                payment_id: result.payment_id,
                transaction_id: result.transaction_id,
                receipt_no: result.receipt_no || `PAY-${paymentId}`,
                amount: result.amount,
                payment_method: result.payment_method,
                payment_status: result.payment_status,
                receipt_url: result.receipt_url,
                term_name: result.term_name,
                due_date: result.end_date,
                organization_name: result.organization_name,
                message: 'Term payment created successfully'
            };
            
        } catch (error) {
            console.error('Error creating term payment:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Create term payment with transaction using two separate procedures for real-time updates
    static async createTermPaymentWithTransaction(userId, organizationId, organizationVersionId, termId, receiptPath, paymentMethod = null) {
        const connection = await pool.getConnection();
        try {
            console.log(`DEBUG MODEL: Creating payment with method: ${paymentMethod}, orgVersionId: ${organizationVersionId}`);
            
            // Extract filename from full path (store only filename in database)
            const filename = receiptPath.split('/').pop();
            
            // STEP 1: Create Transaction with Membership (Real-time for transactions)
            console.log(`DEBUG MODEL: Calling CreateTransactionWithMembership procedure`);
            
            const [transactionResult] = await connection.query(`
                CALL CreateTransactionWithMembership(?, ?, ?, ?, ?, @transaction_id, @cycle_number, @amount, @transaction_message)
            `, [
                userId,
                organizationId, 
                organizationVersionId,
                filename,
                paymentMethod || 'UPLOAD_PROOF'
            ]);
            
            // Get transaction output parameters
            const [transactionOutput] = await connection.query(`
                SELECT 
                    @transaction_id as transaction_id, 
                    @cycle_number as cycle_number, 
                    @amount as amount,
                    @transaction_message as result_message
            `);
            
            const transactionData = transactionOutput[0];
            console.log(`DEBUG MODEL: Transaction procedure result:`, transactionData);
            
            if (!transactionData.transaction_id || transactionData.result_message.startsWith('Transaction Error:')) {
                throw new Error(transactionData.result_message || 'Failed to create transaction');
            }
            
            const transactionId = transactionData.transaction_id;
            const cycleNumber = transactionData.cycle_number;
            const actualAmount = parseFloat(transactionData.amount) || 100.00;
            
            console.log(`DEBUG MODEL: Transaction and membership created - ID: ${transactionId}, Cycle: ${cycleNumber}, Amount: ${actualAmount}`);
            
            // REAL-TIME: Publish transaction creation immediately
            try {
                publishToChannel(`transactions_${organizationId}`, {
                    type: 'new_transaction',
                    transaction_id: transactionId,
                    organization_id: organizationId,
                    cycle_number: cycleNumber,
                    amount: actualAmount,
                    user_id: userId,
                    timestamp: new Date().toISOString()
                });
                console.log(`🟢 REAL-TIME: Published transaction creation to SSE: transactions_${organizationId}`);
            } catch (sseError) {
                console.error('🔴 Failed to publish transaction SSE:', sseError);
            }
            
            // STEP 2: Create Term Payment (Real-time for term payments)
            console.log(`DEBUG MODEL: Calling CreateTermPayment procedure`);
            
            const [paymentResult] = await connection.query(`
                CALL CreateTermPayment(?, ?, ?, ?, ?, @payment_id, @payment_message)
            `, [
                userId,
                organizationId,
                organizationVersionId,
                termId,
                transactionId
            ]);
            
            // Get payment output parameters
            const [paymentOutput] = await connection.query(`
                SELECT 
                    @payment_id as payment_id, 
                    @payment_message as result_message
            `);
            
            const paymentData = paymentOutput[0];
            console.log(`DEBUG MODEL: Payment procedure result:`, paymentData);
            
            if (!paymentData.payment_id || paymentData.result_message.startsWith('Payment Error:')) {
                throw new Error(paymentData.result_message || 'Failed to create term payment');
            }
            
            const paymentId = paymentData.payment_id;
            
            console.log(`DEBUG MODEL: Term payment created - ID: ${paymentId}`);
            
            // REAL-TIME: Publish term payment creation immediately
            try {
                publishToChannel(`term_payments_${organizationId}`, {
                    type: 'new_term_payment',
                    payment_id: paymentId,
                    transaction_id: transactionId,
                    organization_id: organizationId,
                    user_id: userId,
                    amount: actualAmount,
                    payment_method: paymentMethod,
                    timestamp: new Date().toISOString()
                });
                console.log(`🟢 REAL-TIME: Published term payment creation to SSE: term_payments_${organizationId}`);
            } catch (sseError) {
                console.error('🔴 Failed to publish term payment SSE:', sseError);
            }
            
            // Get complete payment details for response
            const [paymentDetails] = await connection.query(`
                SELECT 
                    tp.payment_id,
                    t.amount,
                    tp.payment_status,
                    pt.label as payment_method,
                    t.proof_image as receipt_url,
                    t.transaction_id,
                    t.receipt_no,
                    at.term_name,
                    at.start_date,
                    at.end_date,
                    o.name as organization_name
                FROM tbl_term_payments tp
                JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                JOIN tbl_academic_term at ON tp.term_id = at.term_id
                JOIN tbl_organization o ON tp.organization_id = o.organization_id
                WHERE tp.payment_id = ?
            `, [paymentId]);
            
            if (paymentDetails.length === 0) {
                throw new Error('Payment created but details not found');
            }
            
            const result_data = paymentDetails[0];
            console.log(`DEBUG MODEL: Payment details retrieved:`, result_data);
            
            // REAL-TIME: Publish updated term payments list for dashboard
            try {
                const [termPaymentsList] = await connection.query(`
                    SELECT * FROM vw_term_payment_overview
                    WHERE organization_id = ? AND organization_version_id = ?
                    ORDER BY created_at DESC
                `, [organizationId, organizationVersionId]);
                
                publishToChannel(`term_payment_submissions_${organizationId}`, termPaymentsList);
                console.log(`🟢 REAL-TIME: Published updated term payments list to SSE: term_payment_submissions_${organizationId}`);
                
            } catch (sseError) {
                console.error('🔴 Failed to publish term payments list SSE:', sseError);
            }
            
            return {
                payment_id: result_data.payment_id,
                transaction_id: result_data.transaction_id,
                receipt_no: result_data.receipt_no || `PAY-${paymentId}`,
                amount: result_data.amount,
                payment_method: result_data.payment_method,
                payment_status: result_data.payment_status,
                receipt_url: result_data.receipt_url,
                term_name: result_data.term_name,
                due_date: result_data.end_date,
                organization_name: result_data.organization_name,
                message: 'Payment created successfully'
            };
            
        } catch (error) {
            console.error('Error creating term payment:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment receipt
    static async updateTermPaymentReceipt(paymentId, receiptPath, notes, userId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'CALL UpdateTermPaymentReceipt(?, ?, ?, ?)',
                [paymentId, receiptPath, notes, userId]
            );
            return result[0][0];
        } catch (error) {
            console.error('Error updating term payment receipt:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Generate term payments for organization
    static async generateTermPaymentsForOrganization(organizationId, termId = null) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'CALL GenerateTermPaymentsForSpecificOrganization(?, ?)',
                [organizationId, termId]
            );
            return result[0][0];
        } catch (error) {
            console.error('Error generating term payments for organization:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Generate term payments for all Per Term organizations
    static async generateTermPaymentsForAllOrganizations(termId) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'CALL GenerateTermPaymentsForAllPerTermOrganizations(?)',
                [termId]
            );
            return result[0][0];
        } catch (error) {
            console.error('Error generating term payments for all organizations:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ==================
    // ORGANIZATION OPERATIONS
    // ==================

    // Get organization details
    static async getOrganizationDetails(organizationId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    organization_id,
                    name as organization_name,
                    membership_fee_amount,
                    membership_fee_type,
                    current_org_version_id
                FROM tbl_organization 
                WHERE organization_id = ?
            `, [organizationId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching organization details:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get pending payments for organization
    static async getPendingTermPayments(organizationId, termId = null) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'CALL GetPendingTermPayments(?, ?)',
                [organizationId, termId]
            );
            return result[0] || [];
        } catch (error) {
            console.error('Error fetching pending term payments:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Update payment status
    static async updateTermPaymentStatus(paymentId, status, verifiedBy, notes = null) {
        const connection = await pool.getConnection();
        try {
            const [result] = await connection.query(
                'CALL UpdateTermPaymentStatus(?, ?, ?, ?)',
                [paymentId, status, verifiedBy, notes]
            );
            return result[0][0];
        } catch (error) {
            console.error('Error updating term payment status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // ==================
    // VALIDATION HELPERS
    // ==================

    // Check if payment belongs to user
    static async validatePaymentOwnership(paymentId, userId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT payment_id, user_id, organization_id
                FROM tbl_term_payments 
                WHERE payment_id = ? AND user_id = ?
            `, [paymentId, userId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error validating payment ownership:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Get payment details with transaction info
    static async getPaymentWithTransactionDetails(paymentId) {
        const connection = await pool.getConnection();
        try {
            const [rows] = await connection.query(`
                SELECT 
                    tp.*,
                    t.transaction_id,
                    t.amount as transaction_amount,
                    pt.label as payment_method,
                    t.receipt_no,
                    t.proof_image as image_path,
                    t.payment_description as notes,
                    o.name as organization_name,
                    o.membership_fee_amount,
                    at.term_name,
                    at.start_date,
                    at.end_date
                FROM tbl_term_payments tp
                LEFT JOIN tbl_transaction t ON tp.transaction_id = t.transaction_id
                LEFT JOIN tbl_payment_type pt ON t.payment_type_id = pt.payment_type_id
                LEFT JOIN tbl_organization o ON tp.organization_id = o.organization_id
                LEFT JOIN tbl_academic_term at ON tp.term_id = at.term_id
                WHERE tp.payment_id = ?
            `, [paymentId]);
            
            return rows[0] || null;
        } catch (error) {
            console.error('Error fetching payment with transaction details:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Check if user has a rejected payment and can retry
    static async checkRejectedPaymentStatus(userId, organizationId, organizationVersionId = null, termId = null) {
        const connection = await pool.getConnection();
        try {
            // If no termId provided, get current active term
            let queryTermId = termId;
            if (!queryTermId) {
                const [termResult] = await connection.query(`
                    SELECT term_id FROM tbl_academic_term 
                    WHERE is_active = 1 AND status = 'active'
                    AND DATE(NOW()) BETWEEN start_date AND end_date
                    ORDER BY start_date DESC LIMIT 1
                `);
                if (termResult.length === 0) {
                    return { canRetry: false, reason: 'No active term found' };
                }
                queryTermId = termResult[0].term_id;
            }

            // Use current org version if not provided
            if (!organizationVersionId) {
                const [orgResult] = await connection.query(`
                    SELECT current_org_version_id FROM tbl_organization WHERE organization_id = ?
                `, [organizationId]);
                if (orgResult.length === 0) {
                    return { canRetry: false, reason: 'Organization not found' };
                }
                organizationVersionId = orgResult[0].current_org_version_id;
            }

            const [rows] = await connection.query(`
                SELECT 
                    tp.payment_id,
                    tp.payment_status,
                    tp.notes as rejection_reason,
                    tp.verified_at,
                    tp.created_at as payment_date,
                    at.term_name,
                    o.name as organization_name,
                    o.membership_fee_amount
                FROM tbl_term_payments tp
                JOIN tbl_organization o ON tp.organization_id = o.organization_id
                JOIN tbl_academic_term at ON tp.term_id = at.term_id
                WHERE tp.user_id = ? 
                AND tp.organization_id = ? 
                AND tp.organization_version_id = ?
                AND tp.term_id = ?
                ORDER BY tp.created_at DESC
                LIMIT 1
            `, [userId, organizationId, organizationVersionId, queryTermId]);

            if (rows.length === 0) {
                // No payment exists, user can create new payment
                return { 
                    canRetry: true, 
                    isNewPayment: true,
                    reason: 'No previous payment found'
                };
            }

            const payment = rows[0];
            
            if (payment.payment_status === 'Rejected') {
                return {
                    canRetry: true,
                    isNewPayment: false,
                    rejectionReason: payment.rejection_reason,
                    lastPaymentDate: payment.payment_date,
                    rejectedAt: payment.verified_at,
                    termName: payment.term_name,
                    organizationName: payment.organization_name,
                    membershipFeeAmount: payment.membership_fee_amount
                };
            } else if (payment.payment_status === 'Pending') {
                return {
                    canRetry: false,
                    reason: 'Payment is already pending review',
                    currentStatus: payment.payment_status
                };
            } else if (payment.payment_status === 'Paid') {
                return {
                    canRetry: false,
                    reason: 'Payment is already completed for this term',
                    currentStatus: payment.payment_status
                };
            }

            return {
                canRetry: false,
                reason: 'Unknown payment status',
                currentStatus: payment.payment_status
            };
            
        } catch (error) {
            console.error('Error checking rejected payment status:', error);
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = MobileTermPaymentModel;