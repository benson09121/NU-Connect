const axios = require('axios');
require('dotenv').config();

// Step 1: Get Facebook Login URL
async function getFacebookLoginUrl(req, res) {
    const redirectUri = `${req.protocol}://${req.get('host')}/api/facebook/auth/callback`;
    
    const facebookLoginUrl = `https://www.facebook.com/v18.0/dialog/oauth?` +
        `client_id=${process.env.FB_APP_ID}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=pages_read_engagement,pages_show_list,public_profile&` +
        `response_type=code&` +
        `state=facebook_auth`;
    
    res.json({
        success: true,
        login_url: facebookLoginUrl,
        instructions: 'Visit this URL to authorize the app and get user access token'
    });
}

// Step 2: Handle Facebook OAuth Callback
async function handleFacebookCallback(req, res) {
    const { code, state } = req.query;
    
    if (!code) {
        return res.status(400).json({
            success: false,
            message: 'Authorization code not provided'
        });
    }
    
    if (state !== 'facebook_auth') {
        return res.status(400).json({
            success: false,
            message: 'Invalid state parameter'
        });
    }
    
    try {
        const redirectUri = `${req.protocol}://${req.get('host')}/api/facebook/auth/callback`;
        
        // Exchange code for access token
        const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                client_id: process.env.FB_APP_ID,
                client_secret: process.env.FB_APP_SECRET,
                redirect_uri: redirectUri,
                code: code
            }
        });
        
        const { access_token, token_type, expires_in } = tokenResponse.data;
        
        // Get user info
        const userResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
            params: {
                fields: 'id,name,email',
                access_token: access_token
            }
        });
        
        // Get user permissions
        const permissionsResponse = await axios.get('https://graph.facebook.com/v18.0/me/permissions', {
            params: {
                access_token: access_token
            }
        });
        
        // Try to get user's pages (if they have any)
        let userPages = [];
        try {
            const pagesResponse = await axios.get('https://graph.facebook.com/v18.0/me/accounts', {
                params: {
                    fields: 'id,name,access_token',
                    access_token: access_token
                }
            });
            userPages = pagesResponse.data.data;
        } catch (pagesError) {
            console.log('Could not fetch user pages:', pagesError.response?.data?.error?.message);
        }
        
        res.json({
            success: true,
            message: 'Facebook authorization successful!',
            user_info: userResponse.data,
            access_token: {
                token: access_token,
                type: token_type,
                expires_in: expires_in,
                expires_at: new Date(Date.now() + (expires_in * 1000))
            },
            permissions: permissionsResponse.data.data,
            user_pages: userPages,
            instructions: {
                save_token: `Add this to your .env file: FB_USER_ACCESS_TOKEN=${access_token}`,
                token_expiry: `This token expires in ${expires_in} seconds (about ${Math.round(expires_in/3600)} hours)`,
                refresh_needed: 'You will need to re-authorize when the token expires'
            }
        });
        
    } catch (error) {
        console.error('Facebook auth error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to exchange code for access token',
            error: error.response?.data?.error || error.message
        });
    }
}

// Step 3: Extend short-lived token to long-lived token (60 days)
async function extendUserToken(req, res) {
    const { short_token } = req.body;
    const tokenToExtend = short_token || process.env.FB_USER_ACCESS_TOKEN;
    
    if (!tokenToExtend) {
        return res.status(400).json({
            success: false,
            message: 'No access token provided'
        });
    }
    
    try {
        const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
            params: {
                grant_type: 'fb_exchange_token',
                client_id: process.env.FB_APP_ID,
                client_secret: process.env.FB_APP_SECRET,
                fb_exchange_token: tokenToExtend
            }
        });
        
        const { access_token, token_type, expires_in } = response.data;
        
        res.json({
            success: true,
            message: 'Token extended successfully',
            extended_token: {
                token: access_token,
                type: token_type,
                expires_in: expires_in,
                expires_at: new Date(Date.now() + (expires_in * 1000)),
                duration: `${Math.round(expires_in/86400)} days`
            },
            instructions: {
                save_token: `Update your .env file: FB_USER_ACCESS_TOKEN=${access_token}`,
                note: 'Long-lived tokens last about 60 days'
            }
        });
        
    } catch (error) {
        console.error('Token extension error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to extend token',
            error: error.response?.data?.error || error.message
        });
    }
}

// Step 4: Check current token status
async function checkTokenStatus(req, res) {
    const token = process.env.FB_USER_ACCESS_TOKEN;
    
    if (!token) {
        return res.json({
            success: false,
            message: 'No user access token configured',
            action_needed: 'Use /api/facebook/auth/login to get a token'
        });
    }
    
    try {
        // Check token validity
        const debugResponse = await axios.get('https://graph.facebook.com/v18.0/debug_token', {
            params: {
                input_token: token,
                access_token: `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`
            }
        });
        
        const tokenInfo = debugResponse.data.data;
        
        // Get user info
        const userResponse = await axios.get('https://graph.facebook.com/v18.0/me', {
            params: {
                fields: 'id,name,email',
                access_token: token
            }
        });
        
        res.json({
            success: true,
            token_status: {
                is_valid: tokenInfo.is_valid,
                app_id: tokenInfo.app_id,
                user_id: tokenInfo.user_id,
                expires_at: tokenInfo.expires_at ? new Date(tokenInfo.expires_at * 1000) : 'Never',
                scopes: tokenInfo.scopes,
                type: tokenInfo.type
            },
            user_info: userResponse.data,
            time_remaining: tokenInfo.expires_at ? 
                Math.round((tokenInfo.expires_at * 1000 - Date.now()) / 3600000) + ' hours' : 
                'No expiration'
        });
        
    } catch (error) {
        console.error('Token check error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: 'Token is invalid or expired',
            error: error.response?.data?.error || error.message,
            action_needed: 'Get a new token using /api/facebook/auth/login'
        });
    }
}

module.exports = {
    getFacebookLoginUrl,
    handleFacebookCallback,
    extendUserToken,
    checkTokenStatus
};