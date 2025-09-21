const axios = require('axios');
require('dotenv').config();

// Get posts from your own page (requires page access token)
async function getFacebookPosts(req, res) {
    try {
        // For Facebook Pages (Free) - Use page access token
        const response = await axios.get(`https://graph.facebook.com/v18.0/${process.env.FB_PAGE_ID}/posts`, {
            params: {
                fields: 'message,created_time,full_picture,permalink_url,story,attachments{media,url,title,description}',
                access_token: process.env.FB_PAGE_ACCESS_TOKEN,
                limit: 25 // Free tier allows reasonable limits
            }
        });
        
        res.json({
            success: true,
            data: response.data.data,
            paging: response.data.paging
        });
    } catch (error) {
        console.error('Facebook API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Get posts from OTHER PEOPLE'S PUBLIC PAGES (Alternative approach)
async function getPublicPagePosts(req, res) {
    const { pageId } = req.params; // Any public page ID
    
    try {
        // Try multiple approaches due to Facebook permission restrictions
        
        // Approach 1: Try with User Access Token (if available)
        if (process.env.FB_USER_ACCESS_TOKEN) {
            try {
                const response = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
                    params: {
                        fields: 'message,created_time,full_picture,permalink_url,story',
                        access_token: process.env.FB_USER_ACCESS_TOKEN,
                        limit: 20
                    }
                });
                
                return res.json({
                    success: true,
                    page_id: pageId,
                    data: response.data.data,
                    method: 'user_token',
                    note: 'Public page posts via user token'
                });
            } catch (userTokenError) {
                console.log('User token failed, trying app token...');
            }
        }
        
        // Approach 2: Try basic page info only (this usually works)
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        const pageInfoResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
            params: {
                fields: 'id,name,about,category,fan_count,picture,link,website',
                access_token: appToken
            }
        });
        
        res.json({
            success: true,
            page_id: pageId,
            page_info: pageInfoResponse.data,
            posts_data: null,
            note: 'Page info only - posts require additional permissions',
            permission_error: true,
            solutions: [
                'Add "Page Public Content Access" feature to your Facebook app',
                'Get app reviewed by Facebook for pages_read_engagement permission',
                'Use the page owner\'s page access token instead'
            ]
        });
        
    } catch (error) {
        console.error('Public Page API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message,
            error_code: error.response?.data?.error?.code,
            solutions: [
                'Make sure the page exists and is public',
                'Add required permissions to your Facebook app',
                'Use a valid user access token that has liked/followed the page'
            ]
        });
    }
}

// Alternative: Get Facebook page data that works with current API restrictions
async function getAccessiblePageData(req, res) {
    const { pageId } = req.params;
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        // This usually works - basic page information
        const pageResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}`, {
            params: {
                fields: 'id,name,about,category,fan_count,picture.width(200),cover,link,website,phone,location,hours,description',
                access_token: appToken
            }
        });
        
        // Try to get recent activity (sometimes works)
        let recentActivity = null;
        try {
            const activityResponse = await axios.get(`https://graph.facebook.com/v18.0/${pageId}/feed`, {
                params: {
                    fields: 'created_time,story,type',
                    access_token: appToken,
                    limit: 5
                }
            });
            recentActivity = activityResponse.data.data;
        } catch (activityError) {
            console.log('Recent activity not accessible:', activityError.response?.data?.error?.message);
        }
        
        res.json({
            success: true,
            page_info: pageResponse.data,
            recent_activity: recentActivity,
            accessible_data_note: 'Full post content requires additional permissions',
            workarounds: {
                rss_feed: `Try checking if RSS feed exists: https://www.facebook.com/feeds/page.php?id=${pageId}&format=rss20`,
                instagram_alternative: 'Check if the page has an Instagram account for public posts',
                manual_scraping: 'Consider web scraping for public content (check terms of service)',
                api_permissions: 'Request Page Public Content Access feature in Facebook App Review'
            }
        });
        
    } catch (error) {
        console.error('Page access error:', error.response?.data || error.message);
        res.status(500).json({
            success: false,
            message: error.response?.data?.error?.message || error.message,
            facebook_api_status: 'Facebook has restricted public page access since 2018',
            current_solutions: [
                '1. Own the page (use page access token)',
                '2. Get user consent (use user access token)',
                '3. Apply for Page Public Content Access feature',
                '4. Use alternative data sources (Instagram, RSS, etc.)'
            ]
        });
    }
}

// Check what permissions your current tokens have
async function checkTokenPermissions(req, res) {
    try {
        const results = {};
        
        // Check App Token permissions
        if (process.env.FB_APP_ID && process.env.FB_APP_SECRET) {
            const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
            try {
                const appResponse = await axios.get(`https://graph.facebook.com/v18.0/me`, {
                    params: { access_token: appToken }
                });
                results.app_token = { status: 'valid', data: appResponse.data };
            } catch (error) {
                results.app_token = { status: 'error', message: error.response?.data?.error?.message };
            }
        }
        
        // Check User Token permissions
        if (process.env.FB_USER_ACCESS_TOKEN) {
            try {
                const userResponse = await axios.get(`https://graph.facebook.com/v18.0/me/permissions`, {
                    params: { access_token: process.env.FB_USER_ACCESS_TOKEN }
                });
                results.user_token = { 
                    status: 'valid', 
                    permissions: userResponse.data.data,
                    has_pages_permission: userResponse.data.data.some(p => p.permission === 'pages_read_engagement' && p.status === 'granted')
                };
            } catch (error) {
                results.user_token = { status: 'error', message: error.response?.data?.error?.message };
            }
        }
        
        // Check Page Token permissions
        if (process.env.FB_PAGE_ACCESS_TOKEN) {
            try {
                const pageResponse = await axios.get(`https://graph.facebook.com/v18.0/me`, {
                    params: { access_token: process.env.FB_PAGE_ACCESS_TOKEN }
                });
                results.page_token = { status: 'valid', data: pageResponse.data };
            } catch (error) {
                results.page_token = { status: 'error', message: error.response?.data?.error?.message };
            }
        }
        
        res.json({
            success: true,
            token_status: results,
            recommendations: {
                for_own_pages: 'Use Page Access Token',
                for_public_pages: 'Need Page Public Content Access feature approval',
                for_user_content: 'Use User Access Token with proper permissions'
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

// Search for public pages and their recent posts (Free)
async function searchPublicPages(req, res) {
    const { query } = req.query; // Search term
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        // First, search for pages
        const searchResponse = await axios.get(`https://graph.facebook.com/v18.0/search`, {
            params: {
                q: query,
                type: 'page',
                fields: 'id,name,about,category,fan_count,picture',
                access_token: appToken,
                limit: 10
            }
        });
        
        // Then get posts from found pages
        const pagesWithPosts = await Promise.all(
            searchResponse.data.data.slice(0, 3).map(async (page) => {
                try {
                    const postsResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}/posts`, {
                        params: {
                            fields: 'message,created_time,permalink_url',
                            access_token: appToken,
                            limit: 5
                        }
                    });
                    
                    return {
                        ...page,
                        recent_posts: postsResponse.data.data
                    };
                } catch (error) {
                    return {
                        ...page,
                        recent_posts: [],
                        error: 'Posts not accessible'
                    };
                }
            })
        );
        
        res.json({
            success: true,
            search_query: query,
            pages: pagesWithPosts
        });
    } catch (error) {
        console.error('Search API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Get specific post details from any public post (Free)
async function getFacebookPostDetails(req, res) {
    const { postId } = req.params;
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        const response = await axios.get(`https://graph.facebook.com/v18.0/${postId}`, {
            params: {
                fields: 'message,created_time,full_picture,permalink_url,story,likes.summary(true),comments.summary(true),shares',
                access_token: appToken // Use app token for public posts
            }
        });
        
        res.json({
            success: true,
            data: response.data
        });
    } catch (error) {
        console.error('Facebook API Error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

// Helper function to get page ID from page URL or username
async function getPageIdFromUsername(req, res) {
    const { username } = req.params; // e.g., "nike", "coca-cola"
    
    try {
        const appToken = `${process.env.FB_APP_ID}|${process.env.FB_APP_SECRET}`;
        
        const response = await axios.get(`https://graph.facebook.com/v18.0/${username}`, {
            params: {
                fields: 'id,name,about,category,fan_count,picture,link',
                access_token: appToken
            }
        });
        
        res.json({
            success: true,
            page_info: response.data,
            note: 'Use the "id" field to get posts from this page'
        });
    } catch (error) {
        console.error('Page lookup error:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false,
            message: error.response?.data?.error?.message || error.message 
        });
    }
}

module.exports = { 
    getFacebookPosts,
    getPublicPagePosts,
    getAccessiblePageData,
    searchPublicPages,
    getFacebookPostDetails,
    getPageIdFromUsername,
    checkTokenPermissions
};
