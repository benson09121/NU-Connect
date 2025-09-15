const userModel = require('../models/userModel');
const jwt = require('jsonwebtoken');

async function login(req, res) {
    try {
        console.log('Login attempt for:', req.body.email);
        
        // Set request timeout
        req.setTimeout(30000);
        
        const { mail } = req.body;
        
        // Get user
        console.log('Getting user...');
        const user = await userModel.getUser(mail);
        
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        
        console.log('Generating token...');
        const token = await userModel.generateToken(mail);
        console.log('Token generated, sending response...');
        
        res.json({
            message: 'User Authenticated',
            token: token,
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            message: 'Internal server error',
            error: error.message 
        });
    }
}

module.exports = { login };
