const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);

/**
 * Mobile Student Registration Endpoint
 * 
 * @route POST /mobile/auth/register
 * @description Register a new student user for mobile platform with automatic resend for pending users
 * @access Public
 * 
 * @body {string} email - Student's email address (required)
 * @body {number} program_id - Program identifier (required) 
 * @body {string} program_name - Program name (required)
 * 
 * @returns {Object} Registration result with user details and invitation status
 * 
 * @example Request Body:
 * {
 *   "email": "student@example.com",
 *   "program_id": 123,
 *   "program_name": "Computer Science"
 * }
 * 
 * @behavior:
 * - New email: Creates new pending user and sends invitation
 * - Pending email: Automatically resends invitation (no error)
 * - Active email: Returns error
 * 
 * @error_codes:
 * - EMAIL_EXISTS: Email already registered and active
 * - MISSING_FIELDS: Required fields not provided
 * - INVALID_EMAIL: Email format is invalid
 * - INVALID_PROGRAM_ID: Program ID is not a valid number
 * - INVALID_PROGRAM_NAME: Program name is empty or invalid
 */
router.post('/register', authController.register);

router.get(
    '/programs',
    authController.getAllPrograms
);

// Test endpoint for mobile registration
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Mobile auth routes working!',
        endpoints: {
            login: 'POST /mobile/auth/login - Body: { mail }',
            register: 'POST /mobile/auth/register - Body: { email, program_id, program_name }',
            programs: 'GET /mobile/auth/programs'
        },
        registration_requirements: {
            email: 'Valid email address (required)',
            program_id: 'Numeric program identifier (required)',
            program_name: 'Program name string (required)'
        },
        behavior: {
            'new_email': 'Creates new pending user and sends invitation',
            'pending_email': 'Automatically resends invitation (no error)',
            'active_email': 'Returns EMAIL_EXISTS error'
        },
        error_codes: {
            'EMAIL_EXISTS': 'Email already registered and active',
            'MISSING_FIELDS': 'Required fields not provided',
            'INVALID_EMAIL': 'Email format is invalid'
        },
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
