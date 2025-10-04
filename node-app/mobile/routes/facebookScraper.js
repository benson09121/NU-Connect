const express = require('express');
const router = express.Router();

// Import new Crawlee-based scraper controller
const {
    initScraper,
    scrapePage,
    getCachedData,
    setupAuthentication,
    getAuthStatus,
    scraperInstance
} = require('../controllers/facebookCrawleeScraper');

// Default page constant for backwards compatibility
const DEFAULT_PAGE = {
    id: '113338964475892',
    name: 'NUDASMA CompSoc'
};

// Initialize scraper on module load
initScraper({ body: {} }, { 
    json: (data) => console.log('Scraper initialized:', data),
    status: (code) => ({ json: (data) => console.error('Init error:', data) })
}).catch(err => console.error('Scraper init failed:', err));

// Authentication endpoints
router.get('/auth/status', getAuthStatus);
router.post('/auth/setup', setupAuthentication);

// Root endpoint - Get default page posts from cache
router.get('/', async (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return getCachedData(req, res);
});

// GET /api/facebook-scraper/posts - Get default page posts
router.get('/posts', async (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return getCachedData(req, res);
});

// GET /api/facebook-scraper/default - Get default page posts
router.get('/default', async (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return getCachedData(req, res);
});

// POST /api/facebook-scraper/scrape - Trigger scrape of default page
router.post('/scrape', async (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return scrapePage(req, res);
});

// GET /api/facebook-scraper/scrape - Trigger scrape via GET
router.get('/scrape', async (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return scrapePage(req, res);
});

// POST /api/facebook-scraper/scrape/:pageId - Scrape specific page
router.post('/scrape/:pageId', scrapePage);

// GET /api/facebook-scraper/scrape/:pageId - Scrape specific page via GET
router.get('/scrape/:pageId', scrapePage);

// GET /api/facebook-scraper/cached - Get cached data for default page
router.get('/cached', async (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return getCachedData(req, res);
});

// GET /api/facebook-scraper/cached/:pageId - Get cached data for a specific page
router.get('/cached/:pageId', getCachedData);

// GET /api/facebook-scraper/status - Get scraping system status
router.get('/status', async (req, res) => {
    try {
        const authenticated = scraperInstance.authenticated;
        const trackedPages = await scraperInstance.getTrackedPages();
        
        res.json({
            success: true,
            status: 'running',
            authenticated: authenticated,
            trackedPages: trackedPages.length,
            realtimeMonitoring: true,
            version: '2.0-crawlee'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// GET /api/facebook-scraper/debug - Debug scraping with verbose output
router.get('/debug', async (req, res) => {
    try {
        console.log('\n🔍 ========== DEBUG SCRAPE STARTED ==========');
        
        // Force fresh scrape
        const maxPosts = parseInt(req.query.maxPosts) || 20;
        req.params.pageId = DEFAULT_PAGE.id;
        req.query.maxPosts = maxPosts;
        
        console.log(`📋 Scraping ${DEFAULT_PAGE.name} with maxPosts=${maxPosts}`);
        console.log(`🔐 Authentication: ${scraperInstance.authenticated}`);
        console.log(`🍪 Cookies loaded: ${scraperInstance.cookies?.length || 0}`);
        
        // Trigger scrape
        const result = await new Promise((resolve, reject) => {
            scrapePage(req, {
                json: (data) => resolve(data),
                status: (code) => ({
                    json: (data) => code >= 400 ? reject(data) : resolve(data)
                })
            });
        });
        
        console.log('🔍 ========== DEBUG SCRAPE COMPLETED ==========\n');
        
        res.json({
            success: true,
            debug: true,
            result: result,
            checkLogs: 'Check server logs for detailed extraction info'
        });
    } catch (error) {
        console.error('❌ Debug scrape failed:', error);
        res.status(500).json({
            success: false,
            error: error.message || error.error
        });
    }
});

// GET /api/facebook-scraper/health - Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Facebook Crawlee Scraper Service is running',
        timestamp: new Date().toISOString(),
        defaultPage: {
            name: DEFAULT_PAGE.name,
            pageId: DEFAULT_PAGE.id
        },
        features: {
            crawlee: true,
            playwright: true,
            antiDetection: true,
            authenticated: scraperInstance.authenticated,
            realtimeUpdates: true,
            autoUpdated: true
        }
    });
});

module.exports = router;