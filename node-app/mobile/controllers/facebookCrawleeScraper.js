const { PlaywrightCrawler, Dataset } = require('crawlee');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { redisClient } = require('../../config/redis');

// Default page configuration
const DEFAULT_PAGE = {
    id: '113338964475892',
    url: 'https://www.facebook.com/nudasma.CompSoc',
    name: 'NUDASMA CompSoc',
    fallback_urls: [
        'https://facebook.com/nudasma.CompSoc',
        'https://m.facebook.com/nudasma.CompSoc'
    ]
};

// Facebook authentication storage path
const AUTH_DIR = path.join(__dirname, '../../.auth');
const FB_COOKIES_FILE = path.join(AUTH_DIR, 'facebook-cookies.json');
const FB_SESSION_FILE = path.join(AUTH_DIR, 'facebook-session.json');

class FacebookCrawleeScraper {
    constructor() {
        this.redisClient = null;
        this.isScrapingInProgress = false;
        this.lastScrapeTimes = new Map();
        this.initialized = false;
        this.sessionData = null;
        this.authenticated = false;
    }

    async init() {
        if (this.initialized) return;

        try {
            // Ensure auth directory exists
            await fs.mkdir(AUTH_DIR, { recursive: true });

            // Connect to Redis
            this.redisClient = redisClient;
            await this.redisClient.ping();
            console.log('✅ Facebook Crawlee Scraper connected to Redis');

            // Load authentication
            await this.loadAuthentication();

            // Add default page to tracking
            await this.addPageToTracker(DEFAULT_PAGE.id, DEFAULT_PAGE.url, DEFAULT_PAGE.name);
            console.log(`🎯 Default page "${DEFAULT_PAGE.name}" added to tracking`);

            // Initial scrape
            await this.ensureDefaultPageCached();

            // Setup real-time update monitoring
            this.setupRealtimeMonitoring();

            this.initialized = true;
        } catch (error) {
            console.error('❌ Facebook Crawlee Scraper initialization failed:', error.message);
            console.log('📝 Scraper will work without caching until Redis is available');
        }
    }

    // Load Facebook authentication from secure storage
    async loadAuthentication() {
        try {
            // Check for cookies file
            const cookiesExist = await fs.access(FB_COOKIES_FILE).then(() => true).catch(() => false);
            const sessionExist = await fs.access(FB_SESSION_FILE).then(() => true).catch(() => false);

            if (cookiesExist && sessionExist) {
                const cookiesData = await fs.readFile(FB_COOKIES_FILE, 'utf-8');
                const sessionData = await fs.readFile(FB_SESSION_FILE, 'utf-8');

                this.cookies = JSON.parse(cookiesData);
                this.sessionData = JSON.parse(sessionData);
                this.authenticated = true;

                console.log('✅ Facebook authentication loaded successfully');
                console.log(`👤 Logged in as: ${this.sessionData.name || 'Unknown'}`);
            } else {
                console.log('ℹ️  No Facebook authentication found');
                console.log('📖 To enable authenticated scraping, run: npm run setup-facebook-auth');
                this.authenticated = false;
            }
        } catch (error) {
            console.error('❌ Failed to load authentication:', error.message);
            this.authenticated = false;
        }
    }

    // Save Facebook authentication securely
    async saveAuthentication(cookies, sessionData) {
        try {
            await fs.writeFile(FB_COOKIES_FILE, JSON.stringify(cookies, null, 2));
            await fs.writeFile(FB_SESSION_FILE, JSON.stringify(sessionData, null, 2));

            // Set restrictive permissions (Unix only)
            if (process.platform !== 'win32') {
                await fs.chmod(FB_COOKIES_FILE, 0o600);
                await fs.chmod(FB_SESSION_FILE, 0o600);
            }

            this.cookies = cookies;
            this.sessionData = sessionData;
            this.authenticated = true;

            console.log('✅ Facebook authentication saved securely');
        } catch (error) {
            console.error('❌ Failed to save authentication:', error.message);
            throw error;
        }
    }

    // Setup real-time monitoring for page updates
    setupRealtimeMonitoring() {
        if (!this.redisClient) {
            console.log('⚠️  Real-time monitoring disabled - Redis not available');
            return;
        }

        // Check for updates every 5 minutes (real-time)
        cron.schedule('*/5 * * * *', async () => {
            console.log('⚡ Real-time update check...');
            await this.checkForRealtimeUpdates();
        });

        // Comprehensive scrape every 30 minutes
        cron.schedule('*/30 * * * *', async () => {
            console.log('🔄 Comprehensive scraping cycle...');
            await this.scrapeTrackedPages();
        });

        // Deep scrape every 4 hours
        cron.schedule('0 */4 * * *', async () => {
            console.log('🔍 Deep scraping cycle...');
            await this.deepScrapeTrackedPages();
        });

        console.log('📅 Real-time monitoring scheduled:');
        console.log('  - Every 5 minutes: Real-time update check');
        console.log('  - Every 30 minutes: Comprehensive scrape');
        console.log('  - Every 4 hours: Deep scrape');
    }

    // Check for real-time updates (fast check)
    async checkForRealtimeUpdates() {
        try {
            const trackedPages = await this.getTrackedPages();

            for (const pageId of trackedPages) {
                const pageData = await this.getPageData(pageId);
                if (!pageData) continue;

                // Quick check: only check first 3 posts for updates
                const latestPosts = await this.quickCheckLatestPosts(pageData.url, 3);

                if (latestPosts && latestPosts.length > 0) {
                    const cachedData = await this.getCachedData(pageId);

                    if (cachedData && cachedData.posts) {
                        const hasNewPost = this.hasNewPosts(latestPosts, cachedData.posts);

                        if (hasNewPost) {
                            console.log(`🆕 New post detected on page ${pageId}! Triggering full scrape...`);
                            await this.scrapePageWithCrawlee(pageId, pageData.url, { fullScrape: true });
                        }
                    }
                }
            }
        } catch (error) {
            console.error('❌ Real-time update check failed:', error.message);
        }
    }

    // Quick check for latest posts (fast)
    async quickCheckLatestPosts(pageUrl, maxPosts = 3) {
        const posts = [];

        try {
            const crawler = new PlaywrightCrawler({
                launchContext: {
                    launchOptions: {
                        headless: true,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-blink-features=AutomationControlled'
                        ]
                    }
                },
                browserPoolOptions: {
                    useFingerprints: true, // Anti-detection
                    fingerprintOptions: {
                        fingerprintGeneratorOptions: {
                            browsers: ['chrome'],
                            devices: ['desktop'],
                            locales: ['en-US']
                        }
                    }
                },
                maxRequestRetries: 2,
                requestHandlerTimeoutSecs: 30,
                
                async requestHandler({ page, request, log }) {
                    log.info(`Quick checking ${request.url}`);

                    // Load authentication if available
                    if (this.authenticated && this.cookies) {
                        await page.context().addCookies(this.cookies);
                        log.info('🔐 Using authenticated session');
                    }

                    // Navigate to page
                    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                    // Close popups
                    await this.closePopupsAndModals(page);

                    // Extract first few posts
                    const extractedPosts = await page.evaluate((max) => {
                        const postElements = document.querySelectorAll('[role="article"], [data-pagelet^="FeedUnit"], div[data-ad-preview="message"]');
                        const results = [];

                        for (let i = 0; i < Math.min(max, postElements.length); i++) {
                            const postEl = postElements[i];
                            
                            // Get post ID
                            const postId = postEl.getAttribute('data-pagelet') || 
                                         postEl.querySelector('[data-ft]')?.getAttribute('data-ft') || 
                                         `post_${i}_${Date.now()}`;

                            // Get timestamp
                            const timeEl = postEl.querySelector('a[href*="/posts/"] abbr, span[data-testid="story-subtitle"] a');
                            const timestamp = timeEl?.textContent?.trim() || null;

                            results.push({
                                id: postId,
                                timestamp: timestamp,
                                extractedAt: new Date().toISOString()
                            });
                        }

                        return results;
                    }, maxPosts);

                    posts.push(...extractedPosts);
                }
            });

            await crawler.run([pageUrl]);
            return posts;

        } catch (error) {
            console.error('❌ Quick check failed:', error.message);
            return [];
        }
    }

    // Check if there are new posts
    hasNewPosts(latestPosts, cachedPosts) {
        if (!latestPosts || latestPosts.length === 0) return false;
        if (!cachedPosts || cachedPosts.length === 0) return true;

        const latestPostId = latestPosts[0].id;
        const cachedPostIds = cachedPosts.map(p => p.id);

        return !cachedPostIds.includes(latestPostId);
    }

    // Main scraping function using Crawlee
    async scrapePageWithCrawlee(pageId, pageUrl, options = {}) {
        const scrapeId = crypto.randomBytes(8).toString('hex');
        const {
            maxPosts = 50, // Increased default
            fullScrape = false,
            timeout = 120000
        } = options;

        // Prevent concurrent scraping
        if (this.isScrapingInProgress) {
            console.log('⚠️  Scraping already in progress, queuing request...');
            return await this.getCachedData(pageId);
        }

        this.isScrapingInProgress = true;

        try {
            console.log(`🚀 Starting Crawlee scrape for page ${pageId} (${scrapeId})`);
            console.log(`🔐 Authentication: ${this.authenticated ? 'Enabled' : 'Disabled'}`);

            const posts = [];
            let postCount = 0;

            const crawler = new PlaywrightCrawler({
                launchContext: {
                    launchOptions: {
                        headless: true,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-gpu',
                            '--disable-blink-features=AutomationControlled',
                            '--disable-features=IsolateOrigins,site-per-process'
                        ]
                    }
                },
                // Crawlee's built-in anti-detection
                browserPoolOptions: {
                    useFingerprints: true, // Randomize browser fingerprints
                    fingerprintOptions: {
                        fingerprintGeneratorOptions: {
                            browsers: [
                                { name: 'chrome', minVersion: 120, maxVersion: 125 },
                                { name: 'edge', minVersion: 120, maxVersion: 125 }
                            ],
                            devices: ['desktop'],
                            locales: ['en-US', 'en-GB'],
                            operatingSystems: ['windows', 'linux']
                        }
                    }
                },
                maxRequestRetries: 3,
                requestHandlerTimeoutSecs: timeout / 1000,
                maxConcurrency: 1, // One page at a time for stability
                
                async requestHandler({ page, request, log }) {
                    log.info(`Scraping ${request.url}`);

                    // Load authentication cookies if available
                    if (this.authenticated && this.cookies) {
                        await page.context().addCookies(this.cookies);
                        log.info('🔐 Using authenticated Facebook session');
                    }

                    // Navigate to page
                    await page.goto(request.url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 30000 
                    });

                    // Wait for content to load
                    await page.waitForTimeout(3000);

                    // Close popups and modals
                    await this.closePopupsAndModals(page);

                    // Auto-scroll to load posts
                    log.info(`📜 Scrolling to load ${maxPosts} posts...`);
                    postCount = await this.autoScrollAndCollectPosts(page, maxPosts, posts);

                    log.info(`✅ Collected ${postCount} posts`);
                }
            });

            // Run the crawler
            await crawler.run([pageUrl]);

            // Process and cache results
            const scrapedData = {
                pageId: pageId,
                pageUrl: pageUrl,
                posts: posts,
                totalPosts: postCount,
                scrapedAt: new Date().toISOString(),
                authenticated: this.authenticated,
                scrapeId: scrapeId
            };

            // Cache the data
            await this.cacheData(pageId, scrapedData);

            // Update page metadata
            await this.updatePageMetadata(pageId, postCount);

            this.isScrapingInProgress = false;
            return scrapedData;

        } catch (error) {
            console.error('❌ Crawlee scraping failed:', error.message);
            this.isScrapingInProgress = false;
            throw error;
        }
    }

    // Auto-scroll and collect posts with Playwright
    async autoScrollAndCollectPosts(page, maxPosts, posts) {
        let scrollAttempts = 0;
        const maxScrollAttempts = 30; // More attempts for authenticated scraping
        let consecutiveNoNewContent = 0;
        const maxConsecutiveNoNewContent = 5; // More patience
        let previousPostCount = 0;

        while (posts.length < maxPosts && scrollAttempts < maxScrollAttempts) {
            scrollAttempts++;

            // Extract posts from current view
            const newPosts = await page.evaluate(() => {
                const postElements = document.querySelectorAll('[role="article"], [data-pagelet^="FeedUnit"]');
                const results = [];

                postElements.forEach((postEl, index) => {
                    // Extract post ID
                    const postId = postEl.getAttribute('data-pagelet') || 
                                 postEl.querySelector('[data-ft]')?.getAttribute('data-ft') || 
                                 `post_${index}_${Date.now()}`;

                    // Skip if already extracted
                    if (window.__extractedPostIds?.has(postId)) return;

                    // Mark as extracted
                    window.__extractedPostIds = window.__extractedPostIds || new Set();
                    window.__extractedPostIds.add(postId);

                    // Extract post content
                    const contentEl = postEl.querySelector('[data-ad-comet-preview="message"], [data-ad-preview="message"], div[dir="auto"]');
                    const content = contentEl?.textContent?.trim() || '';

                    // Extract images
                    const images = Array.from(postEl.querySelectorAll('img[src*="scontent"]')).map(img => img.src);

                    // Extract timestamp
                    const timeEl = postEl.querySelector('a[href*="/posts/"] abbr, span[data-testid="story-subtitle"] a');
                    const timestamp = timeEl?.textContent?.trim() || null;
                    const postUrl = timeEl?.closest('a')?.href || null;

                    // Extract reactions
                    const reactionsEl = postEl.querySelector('[aria-label*="reaction"], [aria-label*="like"]');
                    const reactions = reactionsEl?.textContent?.trim() || '0';

                    // Extract comments
                    const commentsEl = postEl.querySelector('[aria-label*="comment"]');
                    const comments = commentsEl?.textContent?.match(/\d+/)?.[0] || '0';

                    // Extract shares
                    const sharesEl = postEl.querySelector('[aria-label*="share"]');
                    const shares = sharesEl?.textContent?.match(/\d+/)?.[0] || '0';

                    results.push({
                        id: postId,
                        content: content.substring(0, 1000), // Limit content length
                        images: images,
                        timestamp: timestamp,
                        postUrl: postUrl,
                        reactions: reactions,
                        comments: comments,
                        shares: shares,
                        extractedAt: new Date().toISOString()
                    });
                });

                return results;
            });

            // Add new posts
            newPosts.forEach(post => {
                if (!posts.some(p => p.id === post.id)) {
                    posts.push(post);
                }
            });

            console.log(`📊 Progress: ${posts.length}/${maxPosts} posts (scroll ${scrollAttempts}/${maxScrollAttempts})`);

            // Check if we found new posts
            if (posts.length === previousPostCount) {
                consecutiveNoNewContent++;
                console.log(`⚠️  No new posts (strike ${consecutiveNoNewContent}/${maxConsecutiveNoNewContent})`);

                if (consecutiveNoNewContent >= maxConsecutiveNoNewContent) {
                    console.log('🛑 No new posts after 5 attempts, stopping...');
                    break;
                }

                // Try clicking "See More" buttons
                await page.evaluate(() => {
                    const seeMoreButtons = Array.from(document.querySelectorAll('div[role="button"]'))
                        .filter(btn => btn.textContent.match(/see more|show more/i));
                    seeMoreButtons.forEach(btn => btn.click());
                });
            } else {
                consecutiveNoNewContent = 0;
            }

            previousPostCount = posts.length;

            // Stop if we have enough posts
            if (posts.length >= maxPosts) {
                console.log(`✅ Reached target: ${posts.length} posts`);
                break;
            }

            // Scroll down
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * 0.8);
            });

            // Wait for lazy loading
            await page.waitForTimeout(this.randomDelay(2000, 4000));

            // Close any new popups
            await this.closePopupsAndModals(page);
        }

        return posts.length;
    }

    // Close popups and modals
    async closePopupsAndModals(page) {
        try {
            await page.evaluate(() => {
                const selectors = [
                    '[aria-label="Close"]',
                    '[aria-label="Close dialog"]',
                    '[aria-label="Dismiss"]',
                    'div[role="dialog"] button[type="button"]',
                    '[data-testid="cookie-policy-manage-dialog-accept-button"]'
                ];

                selectors.forEach(selector => {
                    const buttons = document.querySelectorAll(selector);
                    buttons.forEach(btn => {
                        if (btn.offsetParent !== null) {
                            try { btn.click(); } catch (e) {}
                        }
                    });
                });
            });
        } catch (error) {
            // Ignore errors
        }
    }

    // Random delay helper
    randomDelay(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Cache data in Redis
    async cacheData(pageId, data) {
        if (!this.redisClient) return;

        try {
            const cacheKey = `scraped_data:${pageId}`;
            const cacheExpiry = 4 * 60 * 60; // 4 hours

            await this.redisClient.setex(cacheKey, cacheExpiry, JSON.stringify(data));
            console.log(`💾 Cached data for page ${pageId}`);
        } catch (error) {
            console.error('Error caching data:', error);
        }
    }

    // Get cached data
    async getCachedData(pageId) {
        if (!this.redisClient) return null;

        try {
            const cacheKey = `scraped_data:${pageId}`;
            const cached = await this.redisClient.get(cacheKey);
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.error('Error getting cached data:', error);
            return null;
        }
    }

    // Add page to tracker
    async addPageToTracker(pageId, pageUrl, pageName = '') {
        const pageData = {
            id: pageId,
            url: pageUrl,
            name: pageName,
            addedAt: new Date().toISOString(),
            lastScraped: null,
            postCount: 0
        };

        if (this.redisClient) {
            try {
                await this.redisClient.sadd('tracked_pages', pageId);
                await this.redisClient.hset(`page_data:${pageId}`, pageData);
            } catch (error) {
                console.error('Error adding page to tracker:', error);
            }
        }

        return pageData;
    }

    // Get tracked pages
    async getTrackedPages() {
        if (!this.redisClient) return [DEFAULT_PAGE.id];

        try {
            const pages = await this.redisClient.smembers('tracked_pages');
            return pages.length > 0 ? pages : [DEFAULT_PAGE.id];
        } catch (error) {
            console.error('Error getting tracked pages:', error);
            return [DEFAULT_PAGE.id];
        }
    }

    // Get page data
    async getPageData(pageId) {
        if (!this.redisClient) return null;

        try {
            const data = await this.redisClient.hgetall(`page_data:${pageId}`);
            return Object.keys(data).length > 0 ? data : null;
        } catch (error) {
            console.error('Error getting page data:', error);
            return null;
        }
    }

    // Update page metadata
    async updatePageMetadata(pageId, postCount) {
        if (!this.redisClient) return;

        try {
            await this.redisClient.hset(`page_data:${pageId}`, {
                lastScraped: new Date().toISOString(),
                postCount: postCount
            });
        } catch (error) {
            console.error('Error updating page metadata:', error);
        }
    }

    // Ensure default page has cached data
    async ensureDefaultPageCached() {
        const cachedData = await this.getCachedData(DEFAULT_PAGE.id);

        if (!cachedData) {
            console.log('📥 No cached data for default page, performing initial scrape...');
            await this.scrapePageWithCrawlee(DEFAULT_PAGE.id, DEFAULT_PAGE.url, { maxPosts: 20 });
        }
    }

    // Scrape all tracked pages
    async scrapeTrackedPages() {
        const trackedPages = await this.getTrackedPages();

        for (const pageId of trackedPages) {
            const pageData = await this.getPageData(pageId);
            if (pageData) {
                await this.scrapePageWithCrawlee(pageId, pageData.url, { maxPosts: 30 });
                await new Promise(resolve => setTimeout(resolve, 10000)); // 10s delay between pages
            }
        }
    }

    // Deep scrape tracked pages
    async deepScrapeTrackedPages() {
        const trackedPages = await this.getTrackedPages();

        for (const pageId of trackedPages) {
            const pageData = await this.getPageData(pageId);
            if (pageData) {
                await this.scrapePageWithCrawlee(pageId, pageData.url, { 
                    maxPosts: 100, // Deep scrape
                    fullScrape: true 
                });
                await new Promise(resolve => setTimeout(resolve, 15000)); // 15s delay
            }
        }
    }
}

// Singleton instance
const scraperInstance = new FacebookCrawleeScraper();

// Export controller functions
module.exports = {
    // Initialize scraper
    initScraper: async (req, res) => {
        try {
            await scraperInstance.init();
            res.json({
                success: true,
                message: 'Facebook Crawlee Scraper initialized',
                authenticated: scraperInstance.authenticated
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // Scrape a specific page
    scrapePage: async (req, res) => {
        try {
            const { pageId } = req.params;
            const { maxPosts = 50 } = req.query;

            const pageData = await scraperInstance.getPageData(pageId);
            if (!pageData) {
                return res.status(404).json({
                    success: false,
                    error: 'Page not found in tracker'
                });
            }

            const result = await scraperInstance.scrapePageWithCrawlee(
                pageId, 
                pageData.url, 
                { maxPosts: parseInt(maxPosts) }
            );

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // Get cached data
    getCachedData: async (req, res) => {
        try {
            const { pageId } = req.params;
            const cachedData = await scraperInstance.getCachedData(pageId);

            if (!cachedData) {
                return res.status(404).json({
                    success: false,
                    error: 'No cached data available'
                });
            }

            res.json({
                success: true,
                data: cachedData
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // Setup Facebook authentication
    setupAuthentication: async (req, res) => {
        try {
            const { cookies, sessionData } = req.body;

            if (!cookies || !sessionData) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing cookies or session data'
                });
            }

            await scraperInstance.saveAuthentication(cookies, sessionData);

            res.json({
                success: true,
                message: 'Facebook authentication saved successfully'
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // Get authentication status
    getAuthStatus: async (req, res) => {
        res.json({
            success: true,
            authenticated: scraperInstance.authenticated,
            session: scraperInstance.authenticated ? {
                name: scraperInstance.sessionData?.name || 'Unknown',
                authenticatedAt: scraperInstance.sessionData?.authenticatedAt || null
            } : null
        });
    },

    // Export scraper instance for internal use
    scraperInstance
};
