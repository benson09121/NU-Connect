// @ts-nocheck
const { PlaywrightCrawler, Dataset } = require('crawlee');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { redisClient } = require('../../config/redis');

// Default page configuration
const DEFAULT_PAGE = {
    id: '104908055228742',
    url: 'https://www.facebook.com/SDAONUDasma',
    name: 'SDAO NU Dasma',
    fallback_urls: [
        'https://facebook.com/SDAONUDasma',
        'https://www.facebook.com/SDAONUDasma'  // Use web version only
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
            // Check for cookies file (primary requirement)
            const cookiesExist = await fs.access(FB_COOKIES_FILE).then(() => true).catch(() => false);
            
            if (cookiesExist) {
                console.log(`📂 Loading cookies from ${FB_COOKIES_FILE}...`);
                const cookiesData = await fs.readFile(FB_COOKIES_FILE, 'utf-8');
                
                let rawCookies;
                try {
                    rawCookies = JSON.parse(cookiesData);
                } catch (parseError) {
                    console.error(`❌ Failed to parse cookies JSON: ${parseError.message}`);
                    console.log('ℹ️  Scraper will work without authentication');
                    this.authenticated = false;
                    return;
                }

                if (!Array.isArray(rawCookies)) {
                    console.error('❌ Cookies file must contain an array of cookies');
                    console.log('ℹ️  Scraper will work without authentication');
                    this.authenticated = false;
                    return;
                }

                if (rawCookies.length === 0) {
                    console.warn('⚠️  Cookies file is empty');
                    console.log('ℹ️  Scraper will work without authentication');
                    this.authenticated = false;
                    return;
                }

                // Sanitize cookies to ensure Playwright compatibility
                this.cookies = this.sanitizeCookies(rawCookies);
                
                if (this.cookies.length === 0) {
                    console.warn('⚠️  All cookies were filtered out during sanitization');
                    console.log('ℹ️  Scraper will work without authentication');
                    this.authenticated = false;
                    return;
                }

                console.log(`✅ Loaded and sanitized ${this.cookies.length} cookies`);

                // Try to load session file (optional, for metadata)
                const sessionExist = await fs.access(FB_SESSION_FILE).then(() => true).catch(() => false);
                if (sessionExist) {
                    const sessionData = await fs.readFile(FB_SESSION_FILE, 'utf-8');
                    this.sessionData = JSON.parse(sessionData);
                } else {
                    // Create default session data if file doesn't exist
                    this.sessionData = {
                        userId: 'auto-detected',
                        name: 'Facebook User',
                        authenticatedAt: new Date().toISOString()
                    };
                    console.log('ℹ️  Session file not found, using default session data');
                }

                this.authenticated = true;
                console.log('✅ Facebook authentication loaded successfully');
                console.log(`👤 Logged in as: ${this.sessionData.name || 'Facebook User'}`);
                console.log(`🍪 Cookies loaded: ${this.cookies.length} cookies found`);
            } else {
                console.log('ℹ️  No Facebook authentication found');
                console.log('📖 To enable authenticated scraping, add facebook-cookies.json to .auth folder');
                console.log('💡 You can export cookies using Cookie-Editor browser extension');
                this.authenticated = false;
            }
        } catch (error) {
            console.error('❌ Failed to load authentication:', error.message);
            console.error('   Make sure facebook-cookies.json is valid JSON format');
            this.authenticated = false;
        }
    }

    // Sanitize cookies for Playwright compatibility
    sanitizeCookies(cookies) {
        console.log(`🔍 Sanitizing ${cookies.length} cookies...`);
        
        return cookies.map((cookie, index) => {
            const sanitized = { ...cookie };

            // Log original cookie sameSite value  
            const originalSameSite = cookie.sameSite || '(missing)';
            console.log(`  Cookie ${index + 1}: "${cookie.name}" - Original sameSite: "${originalSameSite}"`);

            // Fix sameSite attribute (must be "Strict", "Lax", or "None")
            if (sanitized.sameSite) {
                const sameSiteLower = sanitized.sameSite.toLowerCase();
                if (sameSiteLower === 'strict') {
                    sanitized.sameSite = 'Strict';
                } else if (sameSiteLower === 'lax') {
                    sanitized.sameSite = 'Lax';
                } else if (sameSiteLower === 'none') {
                    sanitized.sameSite = 'None';
                } else if (sameSiteLower === 'no_restriction') {
                    sanitized.sameSite = 'None'; // Chrome exports "no_restriction"
                } else {
                    console.warn(`  ⚠️  Invalid sameSite "${originalSameSite}" for "${cookie.name}", defaulting to Lax`);
                    sanitized.sameSite = 'Lax'; // Default fallback
                }
            } else {
                console.warn(`  ⚠️  Missing sameSite for "${cookie.name}", defaulting to Lax`);
                sanitized.sameSite = 'Lax'; // Default if missing
            }

            console.log(`  Cookie ${index + 1}: "${cookie.name}" - Sanitized sameSite: "${sanitized.sameSite}"`);

            // Ensure domain is properly formatted
            if (sanitized.domain && !sanitized.domain.startsWith('.') && sanitized.domain.includes('.')) {
                // Add leading dot for subdomain cookies
                sanitized.domain = '.' + sanitized.domain;
            }

            // Ensure path exists
            if (!sanitized.path) {
                sanitized.path = '/';
            }

            // Ensure expires is a number (Unix timestamp)
            if (sanitized.expires && typeof sanitized.expires === 'string') {
                sanitized.expires = parseInt(sanitized.expires, 10);
            }

            // If sameSite is None, secure must be true
            if (sanitized.sameSite === 'None') {
                sanitized.secure = true;
            }

            return sanitized;
        }).filter(cookie => {
            // Remove cookies with invalid names or domains
            if (!cookie.name || !cookie.domain) {
                console.warn(`⚠️  Skipping invalid cookie: ${JSON.stringify(cookie)}`);
                return false;
            }
            return true;
        });
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

        // CRITICAL FIX: Capture 'this' context before requestHandler
        const self = this;

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

                    // Load authentication if available (use 'self' instead of 'this')
                    if (self.authenticated && self.cookies) {
                        try {
                            await page.context().addCookies(self.cookies);
                            log.info('🔐 Using authenticated session');
                        } catch (cookieError) {
                            log.warn(`⚠️  Failed to add cookies: ${cookieError.message}`);
                            log.warn('   Continuing without authentication...');
                        }
                    }

                    // Navigate to page
                    await page.goto(request.url, { waitUntil: 'domcontentloaded', timeout: 20000 });

                    // Close popups (use 'self' instead of 'this')
                    await self.closePopupsAndModals(page);

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
            const cached = await this.getCachedData(pageId);
            console.log(`🔍 DEBUG: Returning cached (concurrent block): ${cached ? cached.totalPosts : 0} posts`);
            return cached;
        }

        this.isScrapingInProgress = true;
        console.log(`🔍 DEBUG: Set isScrapingInProgress = true, maxPosts=${maxPosts}`);

        try {
            console.log(`🚀 Starting Crawlee scrape for page ${pageId} (${scrapeId})`);
            console.log(`� Page URL: ${pageUrl}`);
            console.log(`�🔐 Authentication: ${this.authenticated ? 'Enabled' : 'Disabled'}`);

            const posts = [];
            console.log(`🔍 DEBUG: posts array created, length=${posts.length}`);
            let postCount = 0;

            // CRITICAL FIX: Capture 'this' context before requestHandler
            const self = this;

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

                    // Load authentication cookies if available (use 'self' instead of 'this')
                    if (self.authenticated && self.cookies) {
                        try {
                            await page.context().addCookies(self.cookies);
                            log.info('🔐 Using authenticated Facebook session');
                        } catch (cookieError) {
                            log.warn(`⚠️  Failed to add cookies: ${cookieError.message}`);
                            log.warn('   Continuing without authentication...');
                        }
                    }

                    // Navigate to page
                    await page.goto(request.url, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 30000 
                    });

                    // Wait for content to load
                    await page.waitForTimeout(5000); // Increased wait time

                    // DEBUG: Check what elements are on the page
                    const debugInfo = await page.evaluate(() => {
                        const articles = document.querySelectorAll('[role="article"]');
                        const feedUnits = document.querySelectorAll('[data-pagelet^="FeedUnit"]');
                        const posts = document.querySelectorAll('div[data-ad-preview="message"]');
                        
                        return {
                            articles: articles.length,
                            feedUnits: feedUnits.length,
                            posts: posts.length,
                            bodyText: document.body.textContent.substring(0, 500)
                        };
                    });
                    
                    log.info(`🔍 DEBUG: Found ${debugInfo.articles} articles, ${debugInfo.feedUnits} feed units, ${debugInfo.posts} posts`);
                    if (debugInfo.articles === 0 && debugInfo.feedUnits === 0) {
                        log.warn('⚠️  No post elements found! Page might need more time to load or different selectors.');
                        log.info(`Page preview: ${debugInfo.bodyText}`);
                        
                        // Save screenshot for debugging
                        const screenshotPath = `./debug-screenshot-${Date.now()}.png`;
                        await page.screenshot({ path: screenshotPath, fullPage: true });
                        log.info(`📸 Screenshot saved to ${screenshotPath}`);
                    }

                    // Close popups and modals (use 'self' instead of 'this')
                    await self.closePopupsAndModals(page);

                    // Auto-scroll to load posts (use 'self' instead of 'this')
                    log.info(`📜 Scrolling to load ${maxPosts} posts...`);
                    console.log(`🔍 DEBUG: About to call autoScrollAndCollectPosts with posts.length=${posts.length}`);
                    postCount = await self.autoScrollAndCollectPosts(page, maxPosts, posts);
                    console.log(`🔍 DEBUG: autoScrollAndCollectPosts returned postCount=${postCount}, posts.length=${posts.length}`);

                    log.info(`✅ Collected ${postCount} posts`);
                    
                    // If no posts found on desktop site, try mobile Facebook
                    if (postCount === 0 && !request.url.includes('m.facebook.com')) {
                        log.warn('⚠️  No posts found on desktop site, trying mobile Facebook...');
                        
                        const mobileUrl = request.url.replace('www.facebook.com', 'm.facebook.com');
                        log.info(`📱 Navigating to mobile URL: ${mobileUrl}`);
                        
                        await page.goto(mobileUrl, { 
                            waitUntil: 'domcontentloaded',
                            timeout: 30000 
                        });
                        
                        await page.waitForTimeout(3000);
                        
                        // Try to extract posts from mobile version
                        postCount = await self.autoScrollAndCollectPosts(page, maxPosts, posts);
                        log.info(`📱 Mobile site collected ${postCount} posts`);
                    }
                }
            });

            // Validate pageUrl before running crawler
            if (!pageUrl || typeof pageUrl !== 'string' || pageUrl.trim() === '') {
                throw new Error(`Invalid pageUrl provided: ${pageUrl}`);
            }

            console.log(`🔗 Running crawler with URL: ${pageUrl}`);
            
            // Run the crawler
            await crawler.run([pageUrl]);

            console.log(`🔍 DEBUG: After crawler.run(), posts.length=${posts.length}`);

            // ===== SERVER-SIDE DEDUPLICATION (Safety Net) =====
            console.log(`\n🔍 Server-side deduplication check...`);
            console.log(`📊 Before dedup: ${posts.length} posts`);
            
            // Deduplicate by postUrl
            const uniquePostsMap = new Map();
            posts.forEach(post => {
                if (post.postUrl) {
                    // Clean URL for deduplication
                    let cleanUrl = post.postUrl;
                    try {
                        const urlObj = new URL(post.postUrl);
                        cleanUrl = urlObj.origin + urlObj.pathname;
                    } catch (e) {}
                    
                    // Keep first occurrence of each URL
                    if (!uniquePostsMap.has(cleanUrl)) {
                        uniquePostsMap.set(cleanUrl, post);
                    } else {
                        console.log(`⏭️  Server-side dedup: Skipping duplicate URL: ${cleanUrl}`);
                    }
                }
            });
            
            const deduplicatedPosts = Array.from(uniquePostsMap.values());
            console.log(`📊 After dedup: ${deduplicatedPosts.length} unique posts (removed ${posts.length - deduplicatedPosts.length} duplicates)`);

            // Process and cache results
            const scrapedData = {
                pageId: pageId,
                pageUrl: pageUrl,
                posts: deduplicatedPosts,
                totalPosts: deduplicatedPosts.length,
                scrapedAt: new Date().toISOString(),
                authenticated: this.authenticated,
                scrapeId: scrapeId
            };

            console.log(`🔍 DEBUG: scrapedData created with totalPosts=${scrapedData.totalPosts}, posts.length=${scrapedData.posts.length}`);

            // Cache the data
            await this.cacheData(pageId, scrapedData);

            // Update page metadata
            await this.updatePageMetadata(pageId, deduplicatedPosts.length);

            this.isScrapingInProgress = false;
            console.log(`🔍 DEBUG: Set isScrapingInProgress = false, returning scrapedData`);
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
            // First, click all "See More" buttons to expand content
            await page.evaluate(() => {
                const seeMoreButtons = Array.from(document.querySelectorAll('div[role="button"]'))
                    .filter(btn => btn.textContent.match(/see more|show more/i));
                seeMoreButtons.forEach(btn => {
                    try {
                        btn.click();
                    } catch (e) {}
                });
            });

            // Wait for content to expand
            await page.waitForTimeout(500);

            // Now extract posts with full content
            const newPosts = await page.evaluate(() => {
                // ===== HELPER FUNCTION: PARSE RELATIVE TIMESTAMP =====
                window.parseRelativeTimestamp = function(timeStr) {
                    if (!timeStr) return null;
                    
                    const now = new Date();
                    const str = timeStr.toLowerCase();
                    
                    // Just now / Recently
                    if (str.match(/just now|recently/i)) {
                        return now.toISOString();
                    }
                    
                    // Yesterday
                    if (str.match(/yesterday/i)) {
                        const yesterday = new Date(now);
                        yesterday.setDate(yesterday.getDate() - 1);
                        return yesterday.toISOString();
                    }
                    
                    // X seconds/minutes/hours/days/weeks/months/years ago
                    const match = str.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/i);
                    if (match) {
                        const value = parseInt(match[1]);
                        const unit = match[2].toLowerCase();
                        const past = new Date(now);
                        
                        switch (unit) {
                            case 'second': past.setSeconds(past.getSeconds() - value); break;
                            case 'minute': past.setMinutes(past.getMinutes() - value); break;
                            case 'hour': past.setHours(past.getHours() - value); break;
                            case 'day': past.setDate(past.getDate() - value); break;
                            case 'week': past.setDate(past.getDate() - (value * 7)); break;
                            case 'month': past.setMonth(past.getMonth() - value); break;
                            case 'year': past.setFullYear(past.getFullYear() - value); break;
                        }
                        
                        return past.toISOString();
                    }
                    
                    return null;
                };
                
                // Try multiple selectors to find post elements - COMPREHENSIVE STRATEGY
                let postElements = [];
                
                // Strategy 1: Standard role="article"
                postElements = document.querySelectorAll('[role="article"]');
                console.log(`Strategy 1 - [role="article"]: ${postElements.length} elements`);
                
                // Strategy 2: FeedUnit pagelets
                if (postElements.length === 0) {
                    postElements = document.querySelectorAll('[data-pagelet^="FeedUnit"]');
                    console.log(`Strategy 2 - [data-pagelet^="FeedUnit"]: ${postElements.length} elements`);
                }
                
                // Strategy 3: Story containers
                if (postElements.length === 0) {
                    postElements = document.querySelectorAll('div[data-testid="story-subtitle"]');
                    console.log(`Strategy 3 - story-subtitle: ${postElements.length} elements`);
                    // Get parent containers
                    if (postElements.length > 0) {
                        postElements = Array.from(postElements).map(el => {
                            let parent = el;
                            for (let i = 0; i < 5; i++) {
                                parent = parent.parentElement;
                                if (!parent) break;
                            }
                            return parent;
                        }).filter(Boolean);
                    }
                }
                
                // Strategy 4: Look for divs with images and text content
                if (postElements.length === 0) {
                    const allDivs = document.querySelectorAll('div');
                    postElements = Array.from(allDivs).filter(div => {
                        const hasImage = div.querySelector('img[src*="scontent"]');
                        const hasText = div.textContent && div.textContent.length > 50;
                        const hasLink = div.querySelector('a[href*="facebook.com"]');
                        return hasImage && hasText && hasLink;
                    });
                    console.log(`Strategy 4 - structural pattern (div+img+text+link): ${postElements.length} elements`);
                }
                
                console.log(`✅ Final post element count: ${postElements.length}`);
                
                const results = [];

                postElements.forEach((postEl, index) => {
                    try {
                        console.log(`\n--- Processing post ${index + 1} ---`);
                        
                        // ===== EXTRACT POST URL FIRST (for deduplication) =====
                        let postUrl = null;
                        
                        // Strategy 1: Direct permalink/posts links
                        let urlLink = postEl.querySelector('a[href*="/posts/"]');
                        if (urlLink) {
                            postUrl = urlLink.href;
                            console.log(`📎 URL Strategy 1 (posts): ${postUrl}`);
                        }
                        
                        if (!postUrl) {
                            urlLink = postEl.querySelector('a[href*="/permalink/"]');
                            if (urlLink) {
                                postUrl = urlLink.href;
                                console.log(`📎 URL Strategy 2 (permalink): ${postUrl}`);
                            }
                        }
                        
                        if (!postUrl) {
                            urlLink = postEl.querySelector('a[href*="story_fbid"]');
                            if (urlLink) {
                                postUrl = urlLink.href;
                                console.log(`📎 URL Strategy 3 (story_fbid): ${postUrl}`);
                            }
                        }
                        
                        // Strategy 2: Look for timestamp links (they usually point to post)
                        if (!postUrl) {
                            const allLinks = postEl.querySelectorAll('a[href]');
                            for (const link of allLinks) {
                                const text = link.textContent?.trim() || '';
                                const href = link.href || '';
                                // Check if link text looks like a timestamp
                                if ((text.match(/ago|hr|min|day|week|month|year|recently/i) || 
                                     href.includes('/posts/') || 
                                     href.includes('/permalink/')) &&
                                     href.includes('facebook.com')) {
                                    postUrl = href;
                                    console.log(`📎 URL Strategy 4 (timestamp link): ${postUrl} (text: "${text}")`);
                                    break;
                                }
                            }
                        }
                        
                        // Strategy 3: Find any facebook.com link in the post
                        if (!postUrl) {
                            const fbLink = postEl.querySelector('a[href*="facebook.com"]');
                            if (fbLink && !fbLink.href.includes('/photo/') && !fbLink.href.includes('/watch/')) {
                                postUrl = fbLink.href;
                                console.log(`📎 URL Strategy 5 (any FB link): ${postUrl}`);
                            }
                        }
                        
                        // Clean URL for deduplication (remove query params)
                        let cleanUrl = postUrl;
                        if (postUrl) {
                            try {
                                const urlObj = new URL(postUrl);
                                // Keep only path, remove query string for deduplication
                                cleanUrl = urlObj.origin + urlObj.pathname;
                            } catch (e) {}
                        }
                        
                        // SKIP COMMENTS/REPLIES - Check if URL contains comment_id
                        if (postUrl && postUrl.includes('comment_id=')) {
                            console.log(`⏭️  Skipping comment/reply post: ${postUrl}`);
                            return;
                        }
                        
                        // DEDUPLICATION BY URL - Skip if already extracted
                        if (cleanUrl && window.__extractedPostUrls?.has(cleanUrl)) {
                            console.log(`⏭️  Skipping duplicate post URL: ${cleanUrl}`);
                            return;
                        }
                        
                        // Extract post ID (for identification only, not deduplication)
                        const postId = postEl.getAttribute('data-pagelet') || 
                                     postEl.querySelector('[data-ft]')?.getAttribute('data-ft') || 
                                     postEl.id ||
                                     `post_${index}_${Date.now()}`;

                        // ===== EXTRACT TIMESTAMP =====
                        let timestamp = null;
                        let timestampISO = null;
                        
                        // Strategy 1: abbr with data-utime (Unix timestamp - most reliable)
                        let timeEl = postEl.querySelector('abbr[data-utime]');
                        if (timeEl) {
                            const unixTime = timeEl.getAttribute('data-utime');
                            if (unixTime) {
                                timestampISO = new Date(parseInt(unixTime) * 1000).toISOString();
                                timestamp = timeEl.textContent?.trim() || timestampISO;
                                console.log(`⏰ Timestamp Strategy 1 (data-utime): ${timestamp} (ISO: ${timestampISO})`);
                            }
                        }
                        
                        // Strategy 2: abbr with any data attribute
                        if (!timestamp) {
                            timeEl = postEl.querySelector('abbr[data-tooltip-content], abbr[title]');
                            if (timeEl) {
                                timestamp = timeEl.textContent?.trim() || timeEl.getAttribute('title');
                                console.log(`⏰ Timestamp Strategy 2 (abbr): ${timestamp}`);
                            }
                        }
                        
                        // Strategy 3: Look for text with time keywords
                        if (!timestamp) {
                            const allText = postEl.querySelectorAll('span, a');
                            for (const el of allText) {
                                const text = el.textContent?.trim() || '';
                                if (text.match(/\d+\s*(second|minute|hour|day|week|month|year)s?\s*ago/i) ||
                                    text.match(/^(recently|just now|yesterday)$/i)) {
                                    timestamp = text;
                                    // Try to get the link for URL if we don't have it
                                    if (!postUrl && el.tagName === 'A') {
                                        postUrl = el.href;
                                        console.log(`📎 URL from timestamp link: ${postUrl}`);
                                    }
                                    console.log(`⏰ Timestamp Strategy 3 (text pattern): ${timestamp}`);
                                    break;
                                }
                            }
                        }
                        
                        // ===== PARSE RELATIVE TIMESTAMP TO ISO =====
                        if (timestamp && !timestampISO) {
                            timestampISO = window.parseRelativeTimestamp(timestamp);
                            if (timestampISO) {
                                console.log(`📅 Parsed relative timestamp "${timestamp}" to ISO: ${timestampISO}`);
                            }
                        }

                        // ===== EXTRACT CONTENT =====
                        let content = '';
                        
                        // Strategy 1: Facebook's message containers
                        let contentEl = postEl.querySelector('[data-ad-comet-preview="message"]');
                        if (contentEl) {
                            content = contentEl.textContent?.trim() || '';
                            console.log(`📝 Content Strategy 1 (data-ad-comet-preview): ${content.length} chars`);
                        }
                        
                        if (!content) {
                            contentEl = postEl.querySelector('[data-ad-preview="message"]');
                            if (contentEl) {
                                content = contentEl.textContent?.trim() || '';
                                console.log(`📝 Content Strategy 2 (data-ad-preview): ${content.length} chars`);
                            }
                        }
                        
                        // Strategy 2: div with dir="auto" (common for text content)
                        if (!content) {
                            const dirAutoEls = postEl.querySelectorAll('div[dir="auto"]');
                            for (const el of dirAutoEls) {
                                const text = el.textContent?.trim() || '';
                                // Get the longest meaningful text (likely the post content)
                                if (text.length > content.length && text.length > 20) {
                                    content = text;
                                }
                            }
                            if (content) {
                                console.log(`📝 Content Strategy 3 (dir="auto"): ${content.length} chars`);
                            }
                        }
                        
                        // Strategy 3: Find any substantial text content
                        if (!content) {
                            const allDivs = postEl.querySelectorAll('div');
                            for (const div of allDivs) {
                                // Skip if it has nested divs (too high level)
                                if (div.querySelectorAll('div').length > 3) continue;
                                
                                const text = div.textContent?.trim() || '';
                                if (text.length > content.length && text.length > 30) {
                                    content = text;
                                }
                            }
                            if (content) {
                                console.log(`📝 Content Strategy 4 (substantial text): ${content.length} chars`);
                            }
                        }

                        // ===== EXTRACT IMAGE =====
                        let imageUrl = null;
                        const firstImage = postEl.querySelector('img[src*="scontent"]');
                        if (firstImage) {
                            imageUrl = firstImage.src || firstImage.getAttribute('data-src');
                            console.log(`🖼️  Image found: ${imageUrl?.substring(0, 80)}...`);
                        } else {
                            console.log(`🖼️  No image found`);
                        }

                        // ===== VALIDATION =====
                        const hasContent = content && content.length > 10;
                        const hasImage = imageUrl !== null;
                        const hasUrl = postUrl !== null;
                        const hasTimestamp = timestamp !== null;

                        console.log(`Validation: content=${hasContent}, image=${hasImage}, url=${hasUrl}, timestamp=${hasTimestamp}`);

                        // STRICT VALIDATION: Must have (content OR image) AND URL, and NOT be a comment
                        const isValid = (hasContent || hasImage) && hasUrl && !postUrl.includes('comment_id');
                        
                        if (isValid) {
                            // Mark URL as extracted (for deduplication)
                            window.__extractedPostUrls = window.__extractedPostUrls || new Set();
                            if (cleanUrl) {
                                window.__extractedPostUrls.add(cleanUrl);
                            }
                            
                            results.push({
                                id: postId,
                                content: content || '', // Empty string if no content
                                image: imageUrl, // Null if no image
                                timestamp: timestamp || 'Recently',
                                timestampISO: timestampISO,
                                postUrl: postUrl,
                                extractedAt: new Date().toISOString()
                            });
                            
                            console.log(`✅ Post ${results.length} extracted: ${cleanUrl}`);
                        } else {
                            const reason = !hasUrl ? 'no URL' : 
                                          !hasContent && !hasImage ? 'no content or image' :
                                          postUrl.includes('comment_id') ? 'is a comment' : 'unknown';
                            console.log(`❌ Post validation failed - ${reason}`);
                        }
                    } catch (error) {
                        console.error(`❌ Error extracting post ${index}:`, error.message);
                    }
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
        if (!this.redisClient) {
            console.warn('⚠️  Redis not available, skipping cache');
            return;
        }

        try {
            const cacheKey = `scraped_data:${pageId}`;
            const cacheExpiry = 4 * 60 * 60; // 4 hours

            await this.redisClient.setex(cacheKey, cacheExpiry, JSON.stringify(data));
            console.log(`💾 Cached ${data.totalPosts} posts for page ${pageId} (expires in 4h)`);
            console.log(`📌 Cache key: ${cacheKey}`);
        } catch (error) {
            console.error('❌ Error caching data:', error);
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
            const pageId = req.params.pageId || DEFAULT_PAGE.id;
            const { maxPosts = 100 } = req.query;

            console.log(`\n🔍 DEBUG scrapePage called:`);
            console.log(`   pageId: ${pageId}`);
            console.log(`   maxPosts (from query): ${maxPosts}`);
            console.log(`   maxPosts (parsed): ${parseInt(maxPosts)}`);

            let pageData = await scraperInstance.getPageData(pageId);
            
            // If no page data, use DEFAULT_PAGE
            if (!pageData) {
                if (pageId === DEFAULT_PAGE.id) {
                    pageData = {
                        id: DEFAULT_PAGE.id,
                        url: DEFAULT_PAGE.url,
                        name: DEFAULT_PAGE.name
                    };
                } else {
                    return res.status(404).json({
                        success: false,
                        error: 'Page not found in tracker'
                    });
                }
            }

            console.log(`🚀 Scraping page: ${pageId} (${pageData.name || pageData.url})`);
            console.log(`🔍 DEBUG: Calling scrapePageWithCrawlee with:`);
            console.log(`   pageId: ${pageId}`);
            console.log(`   url: ${pageData.url}`);
            console.log(`   maxPosts: ${parseInt(maxPosts)}`);

            const result = await scraperInstance.scrapePageWithCrawlee(
                pageId, 
                pageData.url, 
                { maxPosts: parseInt(maxPosts) }
            );

            console.log(`🔍 DEBUG: scrapePageWithCrawlee returned:`);
            console.log(`   totalPosts: ${result.totalPosts}`);
            console.log(`   posts.length: ${result.posts ? result.posts.length : 'N/A'}`);
            console.log(`✅ Scrape complete. Cached ${result.totalPosts} posts for page ${pageId}`);

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
            const pageId = req.params.pageId || DEFAULT_PAGE.id;
            
            console.log(`📦 Getting cached data for page: ${pageId}`);
            const cachedData = await scraperInstance.getCachedData(pageId);

            if (!cachedData) {
                console.log(`⚠️  No cache found for page ${pageId}`);
                return res.status(404).json({
                    success: false,
                    error: 'No cached data available'
                });
            }

            console.log(`✅ Cache hit! Returning ${cachedData.totalPosts} posts for page ${pageId}`);
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

    // Clear all cache or specific page cache
    clearCache: async (req, res) => {
        try {
            const { pageId } = req.params;
            
            if (!scraperInstance.redisClient) {
                return res.status(503).json({
                    success: false,
                    error: 'Redis not available'
                });
            }

            let clearedKeys = [];

            if (pageId) {
                // Clear specific page cache
                const cacheKey = `scraped_data:${pageId}`;
                const deleted = await scraperInstance.redisClient.del(cacheKey);
                if (deleted > 0) {
                    clearedKeys.push(cacheKey);
                }
                console.log(`🗑️  Cleared cache for page: ${pageId}`);
            } else {
                // Clear ALL Facebook scraper caches
                const keys = await scraperInstance.redisClient.keys('scraped_data:*');
                
                if (keys.length > 0) {
                    for (const key of keys) {
                        await scraperInstance.redisClient.del(key);
                        clearedKeys.push(key);
                    }
                    console.log(`🗑️  Cleared ${keys.length} cache entries`);
                }
            }

            res.json({
                success: true,
                message: pageId 
                    ? `Cache cleared for page ${pageId}` 
                    : `All cache cleared (${clearedKeys.length} entries)`,
                clearedKeys: clearedKeys,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    },

    // Export scraper instance for internal use
    scraperInstance
};

// Auto-scrape on server startup (with delay for server stability)
setTimeout(async () => {
    try {
        console.log('\n🚀 ========================================');
        console.log('🚀 AUTO-SCRAPING ON SERVER STARTUP');
        console.log('🚀 ========================================\n');
        
        console.log(`📊 Scraping default page: ${DEFAULT_PAGE.name} (${DEFAULT_PAGE.id})`);
        console.log(`📎 URL: ${DEFAULT_PAGE.url}\n`);
        
        const result = await scraperInstance.scrapePageWithCrawlee(
            DEFAULT_PAGE.id,
            DEFAULT_PAGE.url,
            { maxPosts: 50 }
        );
        
        if (result.success) {
            console.log(`\n✅ AUTO-SCRAPE SUCCESS!`);
            console.log(`   Posts scraped: ${result.data.totalPosts}`);
            console.log(`   Cached: ${result.data.cached ? 'Yes' : 'No'}`);
            console.log(`   Timestamp: ${result.data.scrapedAt}`);
        } else {
            console.warn(`\n⚠️  AUTO-SCRAPE FAILED: ${result.error}`);
        }
        
        console.log('\n🚀 ========================================\n');
    } catch (error) {
        console.error(`\n❌ AUTO-SCRAPE ERROR: ${error.message}\n`);
    }
}, 5000); // 5-second delay for server stability
