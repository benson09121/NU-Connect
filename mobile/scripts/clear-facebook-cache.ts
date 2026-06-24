// @ts-nocheck
#!/usr/bin/env node
/**
 * Clear Facebook Scraper Cache (Puppeteer-based scraper)
 * 
 * This script clears all cached Facebook data from Redis
 * Use this when you need to force a fresh scrape
 * 
 * Default Page: SDAONUDasma (104908055228742)
 * 
 * Usage:
 *   node clear-facebook-cache.js
 */

const { redisClient } = require('../config/redis');

async function clearCache() {
    try {
        console.log('🔄 Connecting to Redis...');
        await redisClient.ping();
        console.log('✅ Connected to Redis');

        // Get all page IDs
        const trackedPages = await redisClient.smembers('tracked_pages');
        console.log(`📦 Found ${trackedPages.length} tracked pages`);

        let clearedCount = 0;

        // Clear cached data for each page
        for (const pageId of trackedPages) {
            const cacheKey = `scraped_data:${pageId}`; // Crawlee scraper uses scraped_data prefix
            const existed = await redisClient.exists(cacheKey);
            
            if (existed) {
                await redisClient.del(cacheKey);
                console.log(`🗑️  Cleared cache for page: ${pageId}`);
                clearedCount++;
            }
        }

        // Also try to clear the default page specifically
        const defaultPageId = '104908055228742'; // SDAONUDasma
        const defaultCacheKey = `scraped_data:${defaultPageId}`; // Crawlee scraper uses scraped_data prefix
        const defaultExisted = await redisClient.exists(defaultCacheKey);
        
        if (defaultExisted && !trackedPages.includes(defaultPageId)) {
            await redisClient.del(defaultCacheKey);
            console.log(`🗑️  Cleared cache for default page: ${defaultPageId}`);
            clearedCount++;
        }

        console.log(`\n✅ Successfully cleared ${clearedCount} cached entries`);
        console.log('💡 The scraper will fetch fresh data on the next request');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing cache:', error.message);
        process.exit(1);
    }
}

// Run the script
clearCache();
