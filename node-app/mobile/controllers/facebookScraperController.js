const puppeteer = require('puppeteer');
const cron = require('node-cron');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
// Use existing Redis client from config
const { redisClient } = require('../../config/redis');

// Default page configuration  
const DEFAULT_PAGE = {
    id: '113338964475892',
    url: 'https://www.facebook.com/nudasma.CompSoc',
    name: 'NUDASMA CompSoc',
    fallback_urls: [
        'https://www.facebook.com/nudasmacompsoc',
        'https://facebook.com/nudasma.CompSoc',
        'https://www.facebook.com/profile.php?id=113338964475892'
    ]
};

// Facebook authentication storage path
const AUTH_DIR = path.join(__dirname, '../../.auth');
const FB_COOKIES_FILE = path.join(AUTH_DIR, 'facebook-cookies.json');
const FB_SESSION_FILE = path.join(AUTH_DIR, 'facebook-session.json');

// Tuning knobs for resource utilization
const MAX_PUPPETEER_CONCURRENCY = parseInt(process.env.FB_PUPPETEER_MAX_CONCURRENCY || '2', 10);
const MAX_SCRAPE_POSTS = parseInt(process.env.FB_PUPPETEER_MAX_POSTS || '100', 10);

class FacebookScraper {
    constructor() {
        this.redisClient = null;
        this.isScrapingInProgress = false;
        this.scraperQueue = new Map();
        this.lastScrapeTimes = new Map();
        this.initialized = false;
        this.sessionData = null;
        this.authenticated = false;
        this.cookies = null;
    }

    async init() {
        if (this.initialized) return;

        try {
            // Ensure auth directory exists
            await fs.mkdir(AUTH_DIR, { recursive: true });

            // Use the existing Redis client from config
            this.redisClient = redisClient;
            
            // Test Redis connection
            await this.redisClient.ping();
            console.log('✅ Facebook Scraper (Puppeteer) connected to Redis');
            
            // Load authentication
            await this.loadAuthentication();

            this.initialized = true;

            // Automatically add default page to tracking
            await this.addPageToTracker(DEFAULT_PAGE.id, DEFAULT_PAGE.url, DEFAULT_PAGE.name);
            console.log(`🎯 Default page "${DEFAULT_PAGE.name}" added to tracking`);

            // Do initial scrape of default page if no cache exists
            await this.ensureDefaultPageCached();

            // Setup scheduled scraping only after Redis is connected
            this.setupScheduledScraping();
        } catch (error) {
            console.error('❌ Facebook Scraper Redis connection failed:', error.message);
            console.log('📝 Scraper will work without caching until Redis is available');
        }
    }

    // Load Facebook authentication from secure storage
    async loadAuthentication() {
        try {
            // Check for cookies file (primary requirement)
            const cookiesExist = await fs.access(FB_COOKIES_FILE).then(() => true).catch(() => false);
            
            if (cookiesExist) {
                const cookiesData = await fs.readFile(FB_COOKIES_FILE, 'utf-8');
                const rawCookies = JSON.parse(cookiesData);
                
                // Normalize cookies for Puppeteer compatibility
                this.cookies = this.normalizeCookiesForPuppeteer(rawCookies);

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
                console.log('✅ Facebook authentication loaded successfully (Puppeteer)');
                console.log(`👤 Logged in as: ${this.sessionData.name || 'Facebook User'}`);
                console.log(`🍪 Cookies loaded: ${this.cookies.length} cookies normalized for Puppeteer`);
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

    // Normalize cookies from browser export format to Puppeteer format
    normalizeCookiesForPuppeteer(cookies) {
        return cookies.map(cookie => {
            // Map sameSite values to Puppeteer's expected format
            let sameSite = 'Lax'; // Default
            
            if (cookie.sameSite) {
                const sameSiteValue = cookie.sameSite.toLowerCase();
                if (sameSiteValue === 'strict') {
                    sameSite = 'Strict';
                } else if (sameSiteValue === 'lax') {
                    sameSite = 'Lax';
                } else if (sameSiteValue === 'none' || sameSiteValue === 'no_restriction') {
                    sameSite = 'None';
                }
            }

            // Convert expirationDate (unix timestamp) to expires (unix timestamp in seconds)
            const expires = cookie.expirationDate 
                ? Math.floor(cookie.expirationDate) 
                : undefined;

            return {
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain,
                path: cookie.path || '/',
                expires: expires,
                httpOnly: cookie.httpOnly || false,
                secure: cookie.secure || false,
                sameSite: sameSite
            };
        });
    }

    // Setup scheduled scraping to check for new posts
    setupScheduledScraping() {
        // Only setup if Redis is available
        if (!this.redisClient) {
            console.log('⚠️  Scheduled scraping disabled - Redis not available');
            return;
        }

        // Check default page every 10 minutes for new posts
        cron.schedule('*/10 * * * *', async () => {
            console.log('🕐 Quick check for default page updates...');
            await this.quickCheckDefaultPage();
        });

        // Run comprehensive check every 30 minutes for all tracked pages
        cron.schedule('*/30 * * * *', async () => {
            console.log('🕐 Comprehensive scraping check started...');
            await this.checkAndScrapeTrackedPages();
        });

        // Run every 6 hours for deep scraping
        cron.schedule('0 */6 * * *', async () => {
            console.log('🔄 Deep scraping cycle started...');
            await this.deepScrapeTrackedPages();
        });

        console.log('📅 Automatic scraping scheduled:');
        console.log('  - Every 10 minutes: Default page quick check');
        console.log('  - Every 30 minutes: All pages comprehensive check');
        console.log('  - Every 6 hours: Deep scraping');
    }

    // Test network connectivity and find working URL
    async testNetworkAndFindWorkingUrl() {
        const urlsToTest = [DEFAULT_PAGE.url, ...DEFAULT_PAGE.fallback_urls];
        
        for (const url of urlsToTest) {
            try {
                console.log(`🔍 Testing network connectivity to: ${url}`);
                
                const browser = await this.createBrowser();
                const page = await browser.newPage();
                await this.setupPageSecurity(page);
                
                // Load authentication cookies if available
                await this.loadFacebookCookies(page);
                
                await page.goto(url, { 
                    waitUntil: 'domcontentloaded',
                    timeout: 15000 
                });
                
                // Check if page loaded successfully
                const title = await page.title();
                await browser.close();
                
                if (title) {
                    console.log(`✅ Successfully connected to: ${url}`);
                    return url;
                }
                
            } catch (error) {
                console.warn(`❌ Failed to connect to ${url}: ${error.message.split('\n')[0]}`);
                continue;
            }
        }
        
        console.error('❌ All Facebook URLs failed to connect. Network may be down or Facebook is blocking requests.');
        return null;
    }

    // Add a page to be tracked (with fallback)
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
                const key = `tracked_pages`;
                await this.redisClient.sadd(key, pageId);
                await this.redisClient.hmset(`page_data:${pageId}`, pageData);
            } catch (error) {
                console.error('Error adding page to tracker:', error);
            }
        } else {
            console.log('📝 Page tracking requires Redis - page not persisted');
        }
        
        return pageData;
    }

    // Ensure default page has cached data
    async ensureDefaultPageCached() {
        if (!this.redisClient) return;

        try {
            const cachedData = await this.getCachedData(DEFAULT_PAGE.id);
            
            if (!cachedData) {
                console.log('🚀 No cache found for default page, performing initial scrape...');
                await this.scrapeFacebookPage(DEFAULT_PAGE.id, DEFAULT_PAGE.url, {
                    maxPosts: 20,
                    forceRefresh: true
                });
                console.log('✅ Default page initially cached');
            } else {
                console.log('✅ Default page cache found, age:', Math.round(cachedData.cacheAge / 1000 / 60), 'minutes');
            }
        } catch (error) {
            console.error('Error ensuring default page cache:', error);
        }
    }

    // Quick check for default page updates
    async quickCheckDefaultPage() {
        if (!this.redisClient) return;

        try {
            const latestPostTime = await this.checkForNewPosts(DEFAULT_PAGE.url);
            
            // If network check failed, skip this cycle
            if (latestPostTime === null) {
                console.log('⚠️  Network check failed, skipping this cycle. Will try again later.');
                return;
            }
            
            const pageData = await this.redisClient.hgetall(`page_data:${DEFAULT_PAGE.id}`);
            const lastKnownTime = pageData.lastPostTime;

            if (!lastKnownTime || latestPostTime !== lastKnownTime) {
                console.log(`🆕 New content detected for default page, triggering background scrape...`);
                
                // Background scrape without waiting
                this.scrapeFacebookPage(DEFAULT_PAGE.id, DEFAULT_PAGE.url, { 
                    forceRefresh: true,
                    maxPosts: 20 
                }).then(() => {
                    console.log('✅ Background scrape completed for default page');
                }).catch(error => {
                    if (error.message.includes('network issues')) {
                        console.warn('⚠️  Background scrape failed due to network issues, will retry later');
                    } else {
                        console.error('❌ Background scrape failed:', error.message.split('\n')[0]);
                    }
                });

                // Update last known post time
                if (latestPostTime) {
                    await this.redisClient.hset(`page_data:${DEFAULT_PAGE.id}`, 'lastPostTime', latestPostTime);
                }
            } else {
                console.log('📋 No new content detected for default page');
            }
        } catch (error) {
            console.error('Error in quick check:', error.message.split('\n')[0]);
        }
    }

    // Check if new posts exist (lightweight check with retry and fallback)
    async checkForNewPosts(pageUrl, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        
        let browser;
        
        try {
            // First retry attempt: test if any Facebook URL works
            if (retryCount === 1) {
                console.log('🔄 Testing alternative Facebook URLs...');
                const workingUrl = await this.testNetworkAndFindWorkingUrl();
                if (workingUrl && workingUrl !== pageUrl) {
                    console.log(`🔄 Switching to working URL: ${workingUrl}`);
                    pageUrl = workingUrl;
                }
            }
            
            // First, test basic network connectivity
            if (retryCount === 0) {
                console.log(`🔍 Checking for new posts at: ${pageUrl}`);
            }
            
            browser = await this.createBrowser();
            const page = await browser.newPage();
            await this.setupPageSecurity(page);
            
            // Load authentication cookies if available
            await this.loadFacebookCookies(page);
            
            // Set a more aggressive timeout and user agent for problematic networks
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
            await page.setExtraHTTPHeaders({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            });
            
            await page.goto(pageUrl, { 
                waitUntil: 'domcontentloaded', // Less strict than networkidle2
                timeout: 20000 // Reduced timeout
            });

            // Get the timestamp of the first post (most recent)
            const latestPostTime = await page.evaluate(() => {
                const timeElements = document.querySelectorAll('time[datetime], abbr[data-utime], span[data-testid="story-subtitle"] time');
                if (timeElements.length > 0) {
                    const timeEl = timeElements[0];
                    return timeEl.getAttribute('datetime') || 
                           timeEl.getAttribute('data-utime') || 
                           timeEl.textContent;
                }
                return null;
            });

            await browser.close();
            
            if (retryCount > 0) {
                console.log(`✅ Network recovered after ${retryCount} retries`);
            }
            
            return latestPostTime;
            
        } catch (error) {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    console.error('Error closing browser:', closeError.message);
                }
            }
            
            // Handle specific error types
            if (error.message.includes('net::ERR_NAME_NOT_RESOLVED') || 
                error.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
                error.message.includes('net::ERR_NETWORK_CHANGED')) {
                
                console.warn(`🌐 Network issue detected (attempt ${retryCount + 1}/${maxRetries + 1}): ${error.message.split('\n')[0]}`);
                
                if (retryCount < maxRetries) {
                    console.log(`⏳ Retrying in ${retryDelay/1000} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                    return this.checkForNewPosts(pageUrl, retryCount + 1);
                } else {
                    console.error(`❌ Max retries reached. Network connectivity issues persist for: ${pageUrl}`);
                    // Return a fallback value instead of throwing
                    return null;
                }
            }
            
            // For other errors, don't retry
            console.error('❌ Non-network error in checkForNewPosts:', error.message.split('\n')[0]);
            return null;
        }
    }

    // Create browser with stealth settings (Enhanced for Azure Ubuntu)
    async createBrowser() {
        const browserArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Better for constrained server environments
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-breakpad',
            '--disable-component-extensions-with-background-pages',
            '--disable-default-apps',
            '--disable-hang-monitor',
            '--disable-ipc-flooding-protection',
            '--disable-popup-blocking',
            '--disable-prompt-on-repost',
            '--disable-renderer-backgrounding',
            '--disable-sync',
            '--force-color-profile=srgb',
            '--metrics-recording-only',
            '--enable-automation',
            '--password-store=basic',
            '--use-mock-keychain',
            '--window-size=1920,1080',
            '--user-agent=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        try {
            console.log('🚀 Launching Puppeteer in headless mode for Azure Ubuntu...');
            
            const browser = await puppeteer.launch({
                headless: 'new', // Use new headless mode
                args: browserArgs,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || 
                               (process.platform === 'linux' ? '/usr/bin/chromium-browser' : undefined),
                ignoreHTTPSErrors: true,
                dumpio: false, // Set to true for debugging
                timeout: 30000
            });

            console.log('✅ Browser launched successfully');
            return browser;
            
        } catch (error) {
            console.error('❌ Failed to launch browser:', error.message);
            
            // Try fallback with minimal args
            console.log('🔄 Trying fallback browser configuration...');
            return await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ],
                ignoreHTTPSErrors: true,
                timeout: 30000
            });
        }
    }

    // Setup page security and stealth
    async setupPageSecurity(page) {
        // Set realistic viewport
        await page.setViewport({ width: 1920, height: 1080 });

        // Set user agent to look like real browser
        await page.setUserAgent(
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        );

        // Set headers
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        });

        // Block unnecessary resources to speed up (but allow images!)
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            // Allow images so we can extract them, but block other heavy resources
            if (['stylesheet', 'font', 'media'].includes(resourceType)) {
                request.abort();
            } else {
                request.continue();
            }
        });
    }

    // Load Facebook cookies for authenticated scraping
    // This allows access to more content and reduces rate limiting
    async loadFacebookCookies(page) {
        // Use loaded cookies from authentication
        if (!this.authenticated || !this.cookies) {
            console.log('ℹ️  No Facebook cookies loaded - scraping as guest');
            return false;
        }

        try {
            await page.setCookie(...this.cookies);
            console.log('✅ Loaded Facebook authentication cookies');
            console.log(`🔐 Using authenticated session for: ${this.sessionData?.name || 'Facebook User'}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to set Facebook cookies:', error.message);
            return false;
        }
    }

    // Close Facebook popups and modals that may block scrolling
    async closePopupsAndModals(page) {
        try {
            await page.evaluate(() => {
                console.log('🔍 Looking for popups and modals to close...');
                
                // Common Facebook popup/modal close button selectors
                const closeButtonSelectors = [
                    // The specific close button you mentioned
                    '[aria-label="Close"]',
                    '[aria-label="Close dialog"]',
                    '[aria-label="Close popup"]',
                    '[aria-label="Dismiss"]',
                    
                    // Common close button patterns
                    'button[data-testid="close-button"]',
                    'div[role="button"][aria-label="Close"]',
                    '.x1i10hfl[aria-label="Close"]',
                    
                    // Generic close patterns
                    '[title="Close"]',
                    '[data-visualcompletion="ignore-dynamic"]',
                    
                    // Facebook specific modal close buttons
                    'div[data-pagelet="ChromeController"] [aria-label="Close"]',
                    'div[role="dialog"] [aria-label="Close"]',
                    
                    // Cookie/privacy banners
                    '[data-testid="cookie-policy-banner-accept"]',
                    '[data-testid="cookie-policy-manage-dialog-accept-button"]'
                ];
                
                let clickedCount = 0;
                
                // Try each selector
                for (const selector of closeButtonSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        elements.forEach(element => {
                            // Check if element is visible and clickable
                            if (element.offsetParent !== null && 
                                element.getBoundingClientRect().width > 0 && 
                                element.getBoundingClientRect().height > 0) {
                                
                                try {
                                    element.click();
                                    clickedCount++;
                                    console.log(`✅ Clicked close button: ${selector}`);
                                } catch (clickError) {
                                    console.log(`⚠️  Could not click ${selector}:`, clickError);
                                }
                            }
                        });
                    } catch (selectorError) {
                        // Invalid selector, skip it
                        console.log(`⚠️  Invalid selector ${selector}:`, selectorError);
                    }
                }
                
                // Also try to close by pressing Escape key
                document.dispatchEvent(new KeyboardEvent('keydown', {
                    key: 'Escape',
                    code: 'Escape',
                    keyCode: 27
                }));
                
                // Look for and dismiss notification prompts
                const buttonTexts = ['Not Now', 'Block', "Don't Allow", 'Accept All', 'Allow essential and optional cookies'];
                const buttons = document.querySelectorAll('button, div[role="button"]');
                
                buttons.forEach(button => {
                    if (button.offsetParent !== null) {
                        const buttonText = button.textContent?.trim() || '';
                        const ariaLabel = button.getAttribute('aria-label') || '';
                        
                        if (buttonTexts.some(text => 
                            buttonText.includes(text) || ariaLabel.includes(text) || ariaLabel === 'Not Now'
                        )) {
                            try {
                                button.click();
                                clickedCount++;
                                console.log('✅ Dismissed notification prompt:', buttonText || ariaLabel);
                            } catch (e) {
                                console.log('⚠️  Could not dismiss notification:', e);
                            }
                        }
                    }
                });
                
                console.log(`🚫 Popup closing completed. Clicked ${clickedCount} elements.`);
                return clickedCount;
            });
            
            // Wait a moment for popups to close
            await this.randomDelay(1000, 2000);
            
        } catch (error) {
            console.error('Error closing popups:', error);
        }
    }

    // Debug function to see what elements are on the page
    async debugPageElements(page) {
        try {
            const debugInfo = await page.evaluate(() => {
                const info = {
                    popups: [],
                    closeButtons: [],
                    posts: [],
                    modals: [],
                    overlays: []
                };

                // Look for popup/modal elements
                const popupSelectors = [
                    '[role="dialog"]',
                    '[aria-modal="true"]',
                    '.x1n2onr6', // Common Facebook modal class
                    'div[data-pagelet*="Dialog"]',
                    'div[data-pagelet*="Modal"]'
                ];

                popupSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (el.offsetParent !== null) {
                            info.popups.push({
                                selector,
                                classes: el.className,
                                text: el.textContent?.substring(0, 100) || '',
                                visible: true
                            });
                        }
                    });
                });

                // Look for close buttons
                const closeSelectors = [
                    '[aria-label="Close"]',
                    '[aria-label*="close"]',
                    'button[title="Close"]',
                    'div[role="button"][aria-label="Close"]'
                ];

                closeSelectors.forEach(selector => {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(el => {
                        if (el.offsetParent !== null) {
                            info.closeButtons.push({
                                selector,
                                classes: el.className,
                                position: el.getBoundingClientRect(),
                                visible: true
                            });
                        }
                    });
                });

                // Count posts
                const postSelectors = [
                    '[role="article"]',
                    '[data-pagelet="FeedUnit"]',
                    'div[data-testid="story-root"]'
                ];

                postSelectors.forEach(selector => {
                    const count = document.querySelectorAll(selector).length;
                    if (count > 0) {
                        info.posts.push({ selector, count });
                    }
                });

                return info;
            });

            console.log('🐛 DEBUG INFO:', JSON.stringify(debugInfo, null, 2));
            return debugInfo;
        } catch (error) {
            console.error('Debug error:', error);
            return null;
        }
    }

    // Main scraping function with safety measures
    async scrapeFacebookPage(pageId, pageUrl, options = {}) {
        const { 
            useCache = true, 
            forceRefresh = false,
            maxPosts = 3,
            timeout = 60000,
            debug = false
        } = options;

        // Check if scraping is already in progress for this page
        if (this.isScrapingInProgress) {
            throw new Error('Scraping already in progress. Please wait.');
        }

        // Check cache first
        if (useCache && !forceRefresh) {
            const cachedData = await this.getCachedData(pageId);
            if (cachedData) {
                return cachedData;
            }
        }

        // Prevent concurrent scraping
        this.isScrapingInProgress = true;
        const scrapeId = crypto.randomUUID();
        
        try {
            console.log(`🚀 Starting scrape for page ${pageId} (${scrapeId})`);
            
            const browser = await this.createBrowser();
            const page = await browser.newPage();
            await this.setupPageSecurity(page);
            
            // OPTIONAL: Load Facebook cookies for authenticated scraping
            await this.loadFacebookCookies(page);

            // Add random delay to avoid detection
            await this.randomDelay(2000, 5000);

            // Navigate with retry logic
            let navigationSuccess = false;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (!navigationSuccess && retryCount < maxRetries) {
                try {
                    console.log(`🌐 Navigating to ${pageUrl} (attempt ${retryCount + 1}/${maxRetries})...`);
                    
                    await page.goto(pageUrl, { 
                        waitUntil: 'domcontentloaded', // More lenient than networkidle2
                        timeout: Math.min(timeout, 30000) // Cap timeout at 30s
                    });
                    
                    navigationSuccess = true;
                    console.log(`✅ Successfully navigated to ${pageUrl}`);
                    
                } catch (navError) {
                    retryCount++;
                    
                    if (navError.message.includes('net::ERR_NAME_NOT_RESOLVED') || 
                        navError.message.includes('net::ERR_INTERNET_DISCONNECTED') ||
                        navError.message.includes('net::ERR_NETWORK_CHANGED')) {
                        
                        console.warn(`🌐 Network error on navigation attempt ${retryCount}: ${navError.message.split('\n')[0]}`);
                        
                        if (retryCount < maxRetries) {
                            const retryDelay = Math.pow(2, retryCount) * 2000; // 2s, 4s, 8s
                            console.log(`⏳ Retrying navigation in ${retryDelay/1000} seconds...`);
                            await new Promise(resolve => setTimeout(resolve, retryDelay));
                        }
                    } else {
                        // Non-network error, don't retry
                        throw navError;
                    }
                }
            }
            
            if (!navigationSuccess) {
                throw new Error(`Failed to navigate to ${pageUrl} after ${maxRetries} attempts due to network issues`);
            }

            // Wait for posts to load - Desktop Facebook
            console.log('⏳ Waiting for Facebook feed to load...');
            try {
                await page.waitForSelector('[role="article"], [role="main"], [data-pagelet="FeedUnit"]', { 
                    timeout: 25000 
                });
                console.log('✅ Feed elements detected on page');
                
                // Additional wait for posts to fully render
                await this.randomDelay(2000, 3000);
            } catch (waitError) {
                console.warn('⚠️  Standard selectors not found, page may not have loaded correctly');
                console.warn('Error:', waitError.message);
                // Continue anyway to try extraction
            }

            // Close any popups/modals before scrolling
            console.log('🚫 Checking for and closing popups/modals...');
            await this.closePopupsAndModals(page);

            // Debug mode - show what elements are on the page
            if (debug) {
                console.log('🐛 Debug mode enabled - analyzing page elements...');
                const debugInfo = await this.debugPageElements(page);
                
                // Also capture page HTML for analysis
                const bodyHTML = await page.evaluate(() => {
                    // Get a sample of the page structure
                    const body = document.body;
                    const allArticles = document.querySelectorAll('[role="article"]');
                    const feedUnits = document.querySelectorAll('[data-pagelet="FeedUnit"]');
                    
                    return {
                        bodyClasses: body.className,
                        articleCount: allArticles.length,
                        feedUnitCount: feedUnits.length,
                        pageTitle: document.title,
                        pageURL: window.location.href,
                        mainContent: document.querySelector('[role="main"]') ? 'Found main container' : 'No main container',
                        firstArticleHTML: allArticles.length > 0 ? allArticles[0].outerHTML.substring(0, 1000) : 'No articles found'
                    };
                });
                
                console.log('📄 Page Structure:', JSON.stringify(bodyHTML, null, 2));
                
                // Take screenshot for debugging
                try {
                    const screenshotPath = path.join(__dirname, '../../logs', `debug-${scrapeId}.png`);
                    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
                    await page.screenshot({ path: screenshotPath, fullPage: false });
                    console.log(`📸 Screenshot saved to: ${screenshotPath}`);
                } catch (screenshotError) {
                    console.error('Failed to save screenshot:', screenshotError.message);
                }
            }

            // Scroll to load more posts (improved timing)
            console.log('📜 Starting to scroll and load more posts...');
            await this.autoScrollPage(page, maxPosts);
            
            // Additional wait to ensure all content is loaded
            await this.randomDelay(3000, 5000);
            
            // Try to click "See More" buttons if any exist
            await page.evaluate(() => {
                // Find buttons by text content instead of using :contains()
                function clickButtonsByText(selector, texts) {
                    const elements = document.querySelectorAll(selector);
                    elements.forEach(element => {
                        if (element.offsetParent !== null) {
                            const text = element.textContent || '';
                            if (texts.some(t => text.toLowerCase().includes(t.toLowerCase()))) {
                                try {
                                    element.click();
                                } catch (e) {
                                    console.log('Could not click button:', e);
                                }
                            }
                        }
                    });
                }
                
                // Try various button types and text patterns
                const seeMoreTexts = ['see more', 'show more', 'load more', 'see more posts', 'show more posts'];
                clickButtonsByText('button', seeMoreTexts);
                clickButtonsByText('span', seeMoreTexts);
                clickButtonsByText('div[role="button"]', seeMoreTexts);
                clickButtonsByText('a', seeMoreTexts);
                
                // Also try aria-label attributes
                const ariaButtons = document.querySelectorAll('[aria-label*="See more"], [data-testid*="see-more"]');
                ariaButtons.forEach(button => {
                    if (button.offsetParent !== null) {
                        try {
                            button.click();
                        } catch (e) {
                            console.log('Could not click aria button:', e);
                        }
                    }
                });
            });
            
            // Wait for any additional content to load after clicking
            await this.randomDelay(2000, 4000);

            // Extract posts data
            const posts = await page.evaluate((maxPosts) => {
                const extractedPosts = [];
                
                // Desktop Facebook selectors (PRIORITIZED)
                const postSelectors = [
                    '[role="article"]',                    // Primary desktop selector
                    'div[data-pagelet="FeedUnit"]',        // Desktop feed units
                    'div.x1yztbdb',                         // New Facebook layout
                    'div[class*="userContentWrapper"]',   // Classic layout
                ];

                let postElements = [];
                let usedSelector = '';
                
                console.log('🔍 Searching for posts with desktop Facebook selectors...');
                
                // Try each selector and use the first one that finds posts
                for (const selector of postSelectors) {
                    try {
                        const elements = document.querySelectorAll(selector);
                        console.log(`  Selector "${selector}" found ${elements.length} elements`);
                        if (elements.length > 0) {
                            postElements = Array.from(elements);
                            usedSelector = selector;
                            console.log(`✅ Using selector "${usedSelector}" - found ${postElements.length} posts`);
                            break; // Use first working selector
                        }
                    } catch (selectorError) {
                        console.log(`  Selector "${selector}" failed:`, selectorError);
                    }
                }
                
                // If no posts found, log page structure for debugging
                if (postElements.length === 0) {
                    console.error('❌ No posts found with any selector!');
                    console.log('📄 Page structure debug:');
                    console.log('  - Articles:', document.querySelectorAll('article').length);
                    console.log('  - [role="article"]:', document.querySelectorAll('[role="article"]').length);
                    console.log('  - Feed units:', document.querySelectorAll('[data-pagelet="FeedUnit"]').length);
                    console.log('  - Page title:', document.title);
                    console.log('  - Page URL:', window.location.href);
                    
                    // Try to find the main feed container
                    const mainFeed = document.querySelector('div[role="main"], div[role="feed"], #content_container');
                    if (mainFeed) {
                        console.log('  - Found main feed container');
                        const feedChildren = mainFeed.querySelectorAll(':scope > div');
                        console.log('  - Feed children:', feedChildren.length);
                    }
                    
                    return []; // Return empty array if no posts found
                }

                for (let index = 0; index < Math.min(postElements.length, maxPosts); index++) {
                    const post = postElements[index];
                    
                    try {
                        // Extract post content - Desktop Facebook selectors
                        const contentSelectors = [
                            '[data-testid="post_message"]',
                            'div[data-ad-preview="message"]',
                            '.userContent',
                            'div[dir="auto"][style*="text-align"]',
                            'div[data-ad-comet-preview="message"]',
                            'span[dir="auto"]'
                        ];
                        
                        let content = '';
                        for (const selector of contentSelectors) {
                            const contentElement = post.querySelector(selector);
                            if (contentElement && contentElement.textContent.trim()) {
                                content = contentElement.textContent.trim();
                                break;
                            }
                        }
                        
                        // If no specific content found, try to extract meaningful text
                        if (!content) {
                            const allText = post.textContent || '';
                            const lines = allText.split('\n').filter(line => {
                                line = line.trim();
                                return line.length > 15 && 
                                       !line.match(/^(Like|Comment|Share|ago|\d+)$/i) &&
                                       !line.includes('·') &&
                                       !line.includes('Follow');
                            });
                            if (lines.length > 0) {
                                content = lines[0].trim();
                            }
                        }

                        // Extract timestamp - Desktop Facebook selectors
                        const timeSelectors = [
                            'span[id*="jsc"] a[href*="/posts/"]',
                            'a[href*="/posts/"] abbr',
                            'a.x1i10hfl[role="link"] span',
                            '[data-testid="story-subtitle"] a',
                            'span > a[href*="?story_fbid"]',
                            'abbr[data-utime]',
                            'time[datetime]'
                        ];
                        
                        let timestamp = null;
                        for (const selector of timeSelectors) {
                            const timeElement = post.querySelector(selector);
                            if (timeElement) {
                                timestamp = timeElement.getAttribute('datetime') || 
                                           timeElement.getAttribute('data-utime') ||
                                           timeElement.getAttribute('title') ||
                                           timeElement.textContent;
                                if (timestamp && timestamp.trim()) break;
                            }
                        }

                        // Extract images with better filtering
                        const imageElements = post.querySelectorAll('img');
                        const images = Array.from(imageElements)
                            .map(img => img.src)
                            .filter(src => {
                                return src && 
                                       (src.includes('facebook') || src.includes('fbcdn') || src.includes('scontent')) &&
                                       !src.includes('emoji') && 
                                       !src.includes('reaction') && 
                                       !src.includes('safe_image') &&
                                       src.includes('http');
                            })
                            .slice(0, 5); // Limit to 5 images

                        // Extract post URL with more selectors
                        const urlSelectors = [
                            'a[href*="/posts/"]',
                            'a[href*="/permalink/"]',
                            'a[href*="/photos/"]',
                            'a[href*="/videos/"]',
                            'a[href*="story_fbid"]'
                        ];
                        
                        let postUrl = null;
                        for (const selector of urlSelectors) {
                            const linkElement = post.querySelector(selector);
                            if (linkElement && linkElement.getAttribute('href')) {
                                const href = linkElement.getAttribute('href');
                                postUrl = href.startsWith('http') ? href : 'https://facebook.com' + href;
                                break;
                            }
                        }

                        // Extract author/page name
                        const authorSelectors = [
                            '[data-testid="story-subtitle"] a strong',
                            '[data-testid="story-subtitle"] strong',
                            'h3 a',
                            'strong a'
                        ];
                        
                        let author = '';
                        for (const selector of authorSelectors) {
                            const authorElement = post.querySelector(selector);
                            if (authorElement && authorElement.textContent.trim()) {
                                author = authorElement.textContent.trim();
                                break;
                            }
                        }

                        // Extract reactions (likes, loves, etc.)
                        let reactions = {
                            total: 0,
                            likes: 0,
                            loves: 0,
                            breakdown: []
                        };
                        
                        try {
                            // Look for reaction count elements
                            const reactionSelectors = [
                                '[aria-label*="reaction"]',
                                '[data-testid="like_count"]',
                                'span[aria-label*="Like"]',
                                'div[role="button"][aria-label*="Like"]',
                                'a[aria-label*="reaction"]',
                                'span:has(img[alt*="Like"])',
                                'span:has(img[alt*="Love"])'
                            ];
                            
                            for (const selector of reactionSelectors) {
                                const reactionElement = post.querySelector(selector);
                                if (reactionElement) {
                                    const ariaLabel = reactionElement.getAttribute('aria-label') || '';
                                    const text = reactionElement.textContent || '';
                                    
                                    // Try to extract numbers from aria-label or text
                                    const matches = (ariaLabel + ' ' + text).match(/(\d+[\d,\.]*[kKmM]?)/g);
                                    if (matches && matches.length > 0) {
                                        // Parse numbers like "1.2K" or "1,234"
                                        const parseCount = (str) => {
                                            str = str.replace(/,/g, '');
                                            if (str.toLowerCase().includes('k')) {
                                                return Math.round(parseFloat(str) * 1000);
                                            } else if (str.toLowerCase().includes('m')) {
                                                return Math.round(parseFloat(str) * 1000000);
                                            }
                                            return parseInt(str) || 0;
                                        };
                                        
                                        reactions.total = parseCount(matches[0]);
                                        break;
                                    }
                                }
                            }
                            
                            // Fallback: look for any text that looks like reaction counts
                            if (reactions.total === 0) {
                                const allText = post.textContent || '';
                                const likeMatch = allText.match(/(\d+[\d,\.]*[kKmM]?)\s*(Like|Reaction)/i);
                                if (likeMatch) {
                                    const parseCount = (str) => {
                                        str = str.replace(/,/g, '');
                                        if (str.toLowerCase().includes('k')) {
                                            return Math.round(parseFloat(str) * 1000);
                                        } else if (str.toLowerCase().includes('m')) {
                                            return Math.round(parseFloat(str) * 1000000);
                                        }
                                        return parseInt(str) || 0;
                                    };
                                    reactions.total = parseCount(likeMatch[1]);
                                }
                            }
                        } catch (reactionError) {
                            console.log('Error extracting reactions:', reactionError);
                        }

                        // Extract share count
                        let shareCount = 0;
                        try {
                            const shareSelectors = [
                                '[aria-label*="share"]',
                                'span:contains("Share")',
                                'div[role="button"]:contains("Share")',
                                'a[aria-label*="Share"]'
                            ];
                            
                            // Can't use :contains in querySelector, so search through text
                            const allLinks = post.querySelectorAll('a, span, div[role="button"]');
                            for (const element of allLinks) {
                                const text = element.textContent || '';
                                const ariaLabel = element.getAttribute('aria-label') || '';
                                
                                // Look for patterns like "25 shares" or "Share 25"
                                const shareMatch = (text + ' ' + ariaLabel).match(/(\d+[\d,\.]*[kKmM]?)\s*[Ss]hare/);
                                if (shareMatch) {
                                    const parseCount = (str) => {
                                        str = str.replace(/,/g, '');
                                        if (str.toLowerCase().includes('k')) {
                                            return Math.round(parseFloat(str) * 1000);
                                        } else if (str.toLowerCase().includes('m')) {
                                            return Math.round(parseFloat(str) * 1000000);
                                        }
                                        return parseInt(str) || 0;
                                    };
                                    shareCount = parseCount(shareMatch[1]);
                                    break;
                                }
                            }
                        } catch (shareError) {
                            console.log('Error extracting share count:', shareError);
                        }

                        // Extract comments
                        let comments = [];
                        let commentCount = 0;
                        
                        try {
                            // First, try to find comment count
                            const commentCountSelectors = [
                                '[aria-label*="comment"]',
                                'span:contains("Comment")',
                                'div[role="button"]:contains("Comment")'
                            ];
                            
                            const allElements = post.querySelectorAll('a, span, div[role="button"]');
                            for (const element of allElements) {
                                const text = element.textContent || '';
                                const ariaLabel = element.getAttribute('aria-label') || '';
                                
                                // Look for patterns like "25 comments" or "Comment (25)"
                                const commentMatch = (text + ' ' + ariaLabel).match(/(\d+[\d,\.]*[kKmM]?)\s*[Cc]omment/);
                                if (commentMatch) {
                                    const parseCount = (str) => {
                                        str = str.replace(/,/g, '');
                                        if (str.toLowerCase().includes('k')) {
                                            return Math.round(parseFloat(str) * 1000);
                                        } else if (str.toLowerCase().includes('m')) {
                                            return Math.round(parseFloat(str) * 1000000);
                                        }
                                        return parseInt(str) || 0;
                                    };
                                    commentCount = parseCount(commentMatch[1]);
                                    break;
                                }
                            }
                            
                            // Try to extract actual comment text and authors
                            // Comments are often in nested article elements or specific comment containers
                            const commentContainerSelectors = [
                                'div[data-testid="UFI2CommentsList"]',
                                'div[role="article"] div[role="article"]', // Nested articles are often comments
                                'ul[data-testid="UFI2CommentsList"] li',
                                'div[data-testid="comment-content"]',
                                'div[class*="comment"]'
                            ];
                            
                            for (const selector of commentContainerSelectors) {
                                const commentElements = post.querySelectorAll(selector);
                                if (commentElements.length > 0) {
                                    // Extract up to 10 top comments
                                    for (let i = 0; i < Math.min(commentElements.length, 10); i++) {
                                        const commentEl = commentElements[i];
                                        
                                        // Extract commenter name
                                        const commenterNameEl = commentEl.querySelector('a[role="link"], strong, span[dir="auto"]');
                                        const commenterName = commenterNameEl ? commenterNameEl.textContent.trim() : 'Unknown User';
                                        
                                        // Extract comment text
                                        const commentTextEl = commentEl.querySelector('div[dir="auto"], span[dir="auto"]');
                                        const commentText = commentTextEl ? commentTextEl.textContent.trim() : '';
                                        
                                        // Extract comment timestamp
                                        const commentTimeEl = commentEl.querySelector('abbr[data-utime], time');
                                        const commentTime = commentTimeEl ? 
                                            (commentTimeEl.getAttribute('data-utime') || 
                                             commentTimeEl.getAttribute('datetime') || 
                                             commentTimeEl.textContent) : null;
                                        
                                        if (commentText && commentText.length > 0) {
                                            comments.push({
                                                author: commenterName,
                                                text: commentText.substring(0, 500), // Limit length
                                                timestamp: commentTime
                                            });
                                        }
                                    }
                                    
                                    if (comments.length > 0) {
                                        break; // Found comments, stop trying other selectors
                                    }
                                }
                            }
                            
                            // If we found a comment count but no actual comments, set commentCount
                            if (commentCount === 0 && comments.length > 0) {
                                commentCount = comments.length;
                            }
                        } catch (commentError) {
                            console.log('Error extracting comments:', commentError);
                        }

                        // Only include posts with meaningful content
                        if (content.length > 10 || images.length > 0) {
                            extractedPosts.push({
                                id: `post_${index}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                content: content.substring(0, 1000), // Limit content length
                                author: author,
                                timestamp: timestamp,
                                images: images,
                                url: postUrl,
                                reactions: reactions,
                                shareCount: shareCount,
                                comments: comments,
                                commentCount: commentCount,
                                scraped_at: new Date().toISOString(),
                                post_index: index
                            });
                            
                            console.log(`✅ Extracted post ${index + 1}: "${content.substring(0, 60)}..." [${reactions.total} reactions, ${shareCount} shares, ${commentCount} comments]`);
                        } else {
                            console.log(`⚠️  Skipped post ${index + 1}: insufficient content`);
                        }
                    } catch (error) {
                        console.error(`❌ Error extracting post ${index}:`, error);
                    }
                }

                console.log(`📋 Total posts extracted: ${extractedPosts.length} out of ${postElements.length} found`);
                return extractedPosts;
            }, maxPosts);

            // If no posts found, take screenshot for debugging
            if (posts.length === 0) {
                console.error('❌ ZERO POSTS EXTRACTED - Taking debug screenshot...');
                try {
                    const screenshotPath = path.join(__dirname, '../../logs', `no-posts-${scrapeId}.png`);
                    await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    console.error(`📸 Debug screenshot saved to: ${screenshotPath}`);
                    
                    // Also save page HTML
                    const htmlPath = path.join(__dirname, '../../logs', `no-posts-${scrapeId}.html`);
                    const html = await page.content();
                    await fs.writeFile(htmlPath, html);
                    console.error(`📄 Page HTML saved to: ${htmlPath}`);
                } catch (debugError) {
                    console.error('Failed to save debug files:', debugError.message);
                }
            }

            await browser.close();

            // Generate content hash to detect changes
            const contentHash = crypto.createHash('md5')
                .update(JSON.stringify(posts))
                .digest('hex');

            const scrapedData = {
                pageId: pageId,
                pageUrl: pageUrl,
                posts: posts,
                scrapedAt: new Date().toISOString(),
                scrapeId: scrapeId,
                postCount: posts.length,
                contentHash: contentHash,
                success: true
            };

            // Cache the results
            await this.cacheData(pageId, scrapedData);
            
            // Update tracking info
            await this.updatePageTrackingInfo(pageId, {
                lastScraped: new Date().toISOString(),
                postCount: posts.length,
                contentHash: contentHash
            });

            console.log(`✅ Scrape completed for page ${pageId}: ${posts.length} posts found`);
            return scrapedData;

        } catch (error) {
            console.error(`❌ Scraping failed for page ${pageId}:`, error);
            throw error;
        } finally {
            this.isScrapingInProgress = false;
        }
    }

    // Auto scroll to load more posts
    async autoScrollPage(page, maxPosts = 20) { // Increased from 3 to 20 posts
        let postCount = 0;
        let scrollAttempts = 0;
        const maxScrollAttempts = 15; // Increased from 2 to 15 attempts
        let previousHeight = 0;
        let consecutiveNoNewContent = 0; // Track how many times no new content loaded
        const maxConsecutiveNoNewContent = 3; // Stop after 3 failed attempts

        console.log(`📜 Starting auto-scroll to load ${maxPosts} posts...`);

        while (postCount < maxPosts && scrollAttempts < maxScrollAttempts) {
            // Count current posts with multiple selectors
            postCount = await page.evaluate(() => {
                const selectors = [
                    '[role="article"]',
                    '[data-pagelet="FeedUnit"]',
                    'div[data-testid="story-root"]',
                    '.userContentWrapper',
                    '[data-testid="story-subtitle"]',
                    'div[class*="story"]'
                ];
                let maxCount = 0;
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    maxCount = Math.max(maxCount, elements.length);
                }
                return maxCount;
            });

            console.log(`📊 Scroll attempt ${scrollAttempts + 1}: Found ${postCount} posts`);

            if (postCount >= maxPosts) {
                console.log(`✅ Target post count reached: ${postCount}`);
                break;
            }

            // Get current page height
            const currentHeight = await page.evaluate(() => document.body.scrollHeight);

            // Scroll down slowly in chunks
            await page.evaluate(() => {
                const scrollStep = window.innerHeight / 2;
                const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
                window.scrollTo(0, scrollTop + scrollStep);
            });

            // Wait for potential lazy loading
            await this.randomDelay(1500, 3000);

            // Scroll to bottom to trigger more content
            await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
            });

            // Wait for new content to load
            await this.randomDelay(2000, 4000);

            // Check if page height changed (new content loaded)
            const newHeight = await page.evaluate(() => document.body.scrollHeight);

            if (newHeight === previousHeight && newHeight === currentHeight) {
                consecutiveNoNewContent++;
                console.log(`⚠️  No new content loaded after scroll ${scrollAttempts + 1} (strike ${consecutiveNoNewContent}/${maxConsecutiveNoNewContent})`);
                
                if (consecutiveNoNewContent >= maxConsecutiveNoNewContent) {
                    console.log('🛑 Stopping: No new content after 3 consecutive attempts');
                    break;
                }
                
                // Try to close any popups that might be blocking scrolling
                console.log('🚫 Checking for popups during scroll...');
                await this.closePopupsAndModals(page);
                
                // Try clicking "See More" or "Load More" buttons (no :contains, filter by textContent)
                await page.evaluate(() => {
                    function clickButtonsByText(tag, texts) {
                        const elements = document.querySelectorAll(tag);
                        elements.forEach(el => {
                            if (el.offsetParent !== null && texts.some(t => el.textContent && el.textContent.trim().toLowerCase().includes(t))) {
                                try { el.click(); } catch (e) {}
                            }
                        });
                    }
                    // Try common tags and button texts
                    const seeMoreTexts = ["see more", "show more", "see more posts", "show more posts"];
                    ["button", "span", "a", "div"].forEach(tag => clickButtonsByText(tag, seeMoreTexts));
                });
                await this.randomDelay(2000, 3000);
            } else {
                // New content loaded successfully
                consecutiveNoNewContent = 0;
                console.log(`✅ New content loaded (height: ${previousHeight} → ${newHeight})`);
            }

            previousHeight = newHeight;
            scrollAttempts++;
        }

        console.log(`📜 Scrolling completed: ${postCount} posts found after ${scrollAttempts} attempts`);
        return postCount;
    }

    // Cache data in Redis (with fallback)
    async cacheData(pageId, data) {
        if (!this.redisClient) {
            console.log('📝 Caching disabled - Redis not available');
            return;
        }

        try {
            const cacheKey = `scraped_data:${pageId}`;
            const cacheExpiry = 30 * 60; // 30 minutes
            
            await this.redisClient.setex(cacheKey, cacheExpiry, JSON.stringify(data));
        } catch (error) {
            console.error('Error caching data:', error);
        }
    }

    // Get cached data (with fallback)
    async getCachedData(pageId) {
        if (!this.redisClient) {
            return null;
        }

        try {
            const cacheKey = `scraped_data:${pageId}`;
            const cachedData = await this.redisClient.get(cacheKey);
            
            if (cachedData) {
                const data = JSON.parse(cachedData);
                data.fromCache = true;
                data.cacheAge = Date.now() - new Date(data.scrapedAt).getTime();
                return data;
            }
            
            return null;
        } catch (error) {
            console.error('Error getting cached data:', error);
            return null;
        }
    }

    // Check and scrape tracked pages (with fallback)
    async checkAndScrapeTrackedPages() {
        if (!this.redisClient) {
            console.log('📝 Scheduled scraping requires Redis');
            return;
        }

        try {
            const trackedPages = await this.redisClient.smembers('tracked_pages');
            
            for (const pageId of trackedPages) {
                const pageData = await this.redisClient.hgetall(`page_data:${pageId}`);
                
                if (pageData.url) {
                    // Check if content has changed
                    const latestPostTime = await this.checkForNewPosts(pageData.url);
                    const lastKnownTime = pageData.lastPostTime;
                    
                    if (!lastKnownTime || latestPostTime !== lastKnownTime) {
                        console.log(`🆕 New content detected for page ${pageId}, triggering scrape...`);
                        
                        try {
                            await this.scrapeFacebookPage(pageId, pageData.url, { 
                                forceRefresh: true,
                                maxPosts: 10 
                            });
                            
                            // Update last known post time
                            await this.redisClient.hset(`page_data:${pageId}`, 'lastPostTime', latestPostTime || 'unknown');
                        } catch (error) {
                            console.error(`Error scraping page ${pageId}:`, error);
                        }
                    }
                }
                
                // Add delay between pages to avoid detection
                await this.randomDelay(5000, 10000);
            }
        } catch (error) {
            console.error('Error in scheduled scraping:', error);
        }
    }

    // Update page tracking information (with fallback)
    async updatePageTrackingInfo(pageId, updates) {
        if (!this.redisClient) return;
        
        try {
            const key = `page_data:${pageId}`;
            for (const [field, value] of Object.entries(updates)) {
                await this.redisClient.hset(key, field, value);
            }
        } catch (error) {
            console.error('Error updating page tracking info:', error);
        }
    }

    // Random delay to avoid detection
    async randomDelay(min, max) {
        const delay = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise(resolve => setTimeout(resolve, delay));
    }

    // Deep scrape for comprehensive data (with fallback)
    async deepScrapeTrackedPages() {
        if (!this.redisClient) {
            console.log('📝 Deep scraping requires Redis');
            return;
        }

        try {
            const trackedPages = await this.redisClient.smembers('tracked_pages');
            
            for (const pageId of trackedPages) {
                const pageData = await this.redisClient.hgetall(`page_data:${pageId}`);
                
                if (pageData.url) {
                    try {
                        await this.scrapeFacebookPage(pageId, pageData.url, { 
                            forceRefresh: true,
                            maxPosts: 50 
                        });
                    } catch (error) {
                        console.error(`Deep scrape failed for page ${pageId}:`, error);
                    }
                    
                    // Longer delay for deep scraping
                    await this.randomDelay(10000, 20000);
                }
            }
        } catch (error) {
            console.error('Error in deep scraping:', error);
        }
    }

    // Get scraping status (with fallback)
    async getScrapingStatus() {
        const status = {
            isScrapingInProgress: this.isScrapingInProgress,
            redisConnected: !!this.redisClient,
            trackedPagesCount: 0,
            trackedPages: []
        };

        if (!this.redisClient) {
            status.note = 'Redis not connected - caching and tracking disabled';
            return status;
        }

        try {
            const trackedPages = await this.redisClient.smembers('tracked_pages');
            status.trackedPagesCount = trackedPages.length;

            for (const pageId of trackedPages) {
                const pageData = await this.redisClient.hgetall(`page_data:${pageId}`);
                const cachedData = await this.getCachedData(pageId);
                
                status.trackedPages.push({
                    pageId: pageId,
                    url: pageData.url,
                    lastScraped: pageData.lastScraped,
                    postCount: pageData.postCount,
                    hasCachedData: !!cachedData,
                    cacheAge: cachedData ? cachedData.cacheAge : null
                });
            }
        } catch (error) {
            console.error('Error getting scraping status:', error);
            status.error = error.message;
        }

        return status;
    }
}

// Initialize the scraper (but don't connect immediately)
const facebookScraper = new FacebookScraper();

// Auto-initialize when module is loaded (with delay to ensure other services are ready)
setTimeout(async () => {
    try {
        await facebookScraper.init();
        console.log('🚀 Facebook Scraper auto-initialized successfully');
    } catch (error) {
        console.error('❌ Facebook Scraper auto-initialization failed:', error);
        // Retry after 30 seconds
        setTimeout(async () => {
            try {
                await facebookScraper.init();
                console.log('🚀 Facebook Scraper retry initialization successful');
            } catch (retryError) {
                console.error('❌ Facebook Scraper retry failed:', retryError);
            }
        }, 30000);
    }
}, 5000); // Wait 5 seconds for other services to be ready

// Controller functions

// Get default page posts (NUDASMA CompSoc) - automatic and cache-first
async function getDefaultPagePosts(req, res) {
    const { maxPosts = 20, forceRefresh = false, debug = false } = req.query;

    try {
        // Initialize scraper if not already done
        await facebookScraper.init();

        // Always try cache first for instant response
        let result = await facebookScraper.getCachedData(DEFAULT_PAGE.id);
        
        if (!result || forceRefresh === 'true') {
            // If no cache or force refresh, scrape fresh data
            result = await facebookScraper.scrapeFacebookPage(DEFAULT_PAGE.id, DEFAULT_PAGE.url, {
                useCache: false,
                forceRefresh: true,
                maxPosts: parseInt(maxPosts),
                debug: debug === 'true'
            });
        }

        // Trigger background scrape if cache is older than 30 minutes
        if (result && result.cacheAge && result.cacheAge > 30 * 60 * 1000) {
            console.log('🔄 Cache is old, triggering background refresh...');
            facebookScraper.scrapeFacebookPage(DEFAULT_PAGE.id, DEFAULT_PAGE.url, {
                forceRefresh: true,
                maxPosts: parseInt(maxPosts)
            }).catch(error => {
                console.error('Background refresh failed:', error);
            });
        }

        res.json({
            success: true,
            data: result,
            pageInfo: {
                name: DEFAULT_PAGE.name,
                pageId: DEFAULT_PAGE.id,
                url: DEFAULT_PAGE.url
            },
            note: result.fromCache ? 
                `Data from cache (${Math.round(result.cacheAge / 1000 / 60)} minutes old)` : 
                'Freshly scraped data',
            autoUpdated: true
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            pageInfo: {
                name: DEFAULT_PAGE.name,
                pageId: DEFAULT_PAGE.id,
                url: DEFAULT_PAGE.url
            },
            suggestions: [
                'The page might be temporarily unavailable',
                'Try again in a few moments',
                'Check if Facebook is blocking requests'
            ]
        });
    }
}
async function scrapePagePosts(req, res) {
    // Handle both empty body and missing properties
    const body = req.body || {};
    const { pageId = DEFAULT_PAGE.id, pageUrl = DEFAULT_PAGE.url } = body;
    const { useCache = true, forceRefresh = false, maxPosts = 20, debug = false } = req.query;

    try {
        // Initialize scraper if not already done
        await facebookScraper.init();
        
        // If it's the default page, use optimized flow
        if (pageId === DEFAULT_PAGE.id) {
            return await getDefaultPagePosts(req, res);
        }
        
        // Add to tracker if not already tracked
        await facebookScraper.addPageToTracker(pageId, pageUrl);

        const result = await facebookScraper.scrapeFacebookPage(pageId, pageUrl, {
            useCache: useCache === 'true',
            forceRefresh: forceRefresh === 'true',
            maxPosts: parseInt(maxPosts),
            debug: debug === 'true'
        });

        res.json({
            success: true,
            data: result,
            note: result.fromCache ? 'Data served from cache' : 'Freshly scraped data'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            suggestions: [
                'The page might be private or restricted',
                'Facebook might be blocking the scraper',
                'Try again later with different parameters'
            ]
        });
    }
}

async function getCachedPageData(req, res) {
    const { pageId } = req.params;

    try {
        // Initialize scraper if not already done
        await facebookScraper.init();
        
        const cachedData = await facebookScraper.getCachedData(pageId);
        
        if (cachedData) {
            res.json({
                success: true,
                data: cachedData,
                fromCache: true
            });
        } else {
            res.json({
                success: false,
                message: 'No cached data found for this page',
                suggestion: 'Trigger a scrape to get fresh data'
            });
        }

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

async function getScrapingStatus(req, res) {
    try {
        // Initialize scraper if not already done
        await facebookScraper.init();
        
        const status = await facebookScraper.getScrapingStatus();
        res.json({
            success: true,
            status: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

async function addPageToTracker(req, res) {
    const { pageId, pageUrl } = req.body;

    if (!pageId || !pageUrl) {
        return res.status(400).json({
            success: false,
            message: 'pageId and pageUrl are required'
        });
    }

    try {
        // Initialize scraper if not already done
        await facebookScraper.init();
        
        const result = await facebookScraper.addPageToTracker(pageId, pageUrl);
        res.json({
            success: true,
            message: 'Page added to tracking system',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
}

module.exports = {
    getDefaultPagePosts,
    scrapePagePosts,
    getCachedPageData,
    getScrapingStatus,
    addPageToTracker,
    facebookScraper,
    DEFAULT_PAGE
};