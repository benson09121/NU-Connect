const express = require('express');
const router = express.Router();
const {
    getDefaultPagePosts,
    scrapePagePosts,
    getCachedPageData,
    getScrapingStatus,
    addPageToTracker,
    DEFAULT_PAGE
} = require('../controllers/facebookScraperController');

// Root endpoint - Get default page posts
router.get('/', getDefaultPagePosts);

// GET /api/facebook-scraper/posts - Get default page posts (NUDASMA CompSoc)
router.get('/posts', getDefaultPagePosts);

// GET /api/facebook-scraper/default - Alternative endpoint for default page posts
router.get('/default', getDefaultPagePosts);

// POST /api/facebook-scraper/scrape - Scrape a Facebook page (defaults to NUDASMA CompSoc if no body)
router.post('/scrape', scrapePagePosts);

// POST /api/facebook-scraper/default - Force scrape default page
router.post('/default', (req, res) => {
    // Force scrape the default page
    req.body = {
        pageId: DEFAULT_PAGE.id,
        pageUrl: DEFAULT_PAGE.url
    };
    req.query.forceRefresh = 'true';
    return scrapePagePosts(req, res);
});

// GET /api/facebook-scraper/scrape - GET version for default page scraping
router.get('/scrape', (req, res) => {
    // Convert GET to POST format for default page
    req.body = {
        pageId: DEFAULT_PAGE.id,
        pageUrl: DEFAULT_PAGE.url
    };
    return scrapePagePosts(req, res);
});

// GET /api/facebook-scraper/cached - Get cached data for default page
router.get('/cached', (req, res) => {
    req.params.pageId = DEFAULT_PAGE.id;
    return getCachedPageData(req, res);
});

// GET /api/facebook-scraper/cached/:pageId - Get cached data for a specific page
router.get('/cached/:pageId', getCachedPageData);

// GET /api/facebook-scraper/status - Get scraping system status
router.get('/status', getScrapingStatus);

// POST /api/facebook-scraper/track - Add a page to tracking system
router.post('/track', addPageToTracker);

// GET /api/facebook-scraper/health - Health check
router.get('/health', (req, res) => {
    res.json({
        success: true,
        message: 'Facebook Scraper Service is running',
        timestamp: new Date().toISOString(),
        defaultPage: {
            name: DEFAULT_PAGE.name,
            pageId: DEFAULT_PAGE.id,
            autoUpdated: true
        },
        endpoints: {
            'GET /': 'Get default page posts (root endpoint)',
            'GET /posts': 'Get default page posts (cache-first)',
            'GET /default': 'Alternative endpoint for default page posts',
            'POST /default': 'Force scrape default page (fresh data)',
            'GET /scrape': 'Scrape default page (GET version)',
            'POST /scrape': 'Scrape any Facebook page (or default if no body)',
            'GET /cached': 'Get cached data for default page',
            'GET /cached/:pageId': 'Get cached data for specific page',
            'GET /status': 'System status and tracking info',
            'POST /track': 'Add page to tracking system'
        },
        features: [
            'Automatic default page monitoring',
            'Cache-first responses for instant data',
            'Background scraping every 10 minutes',
            'Comprehensive scraping every 30 minutes',
            'Popup/modal detection and closing',
            'Redis caching for fast data retrieval',
            'Rate limiting and safety measures'
        ]
    });
});

module.exports = router;