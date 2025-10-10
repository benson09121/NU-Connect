#!/usr/bin/env node
/**
 * Reset Tracked Pages to Only New Default Page
 * 
 * This script removes all old tracked pages from Redis and sets up only the new default page
 * Use this to fix issues with old page IDs causing scraping problems
 * 
 * New Default Page: SDAONUDasma (104908055228742)
 * 
 * Usage:
 *   node reset-tracked-pages.js
 */

const { redisClient } = require('../../config/redis');

const NEW_DEFAULT_PAGE = {
    id: '104908055228742',
    url: 'https://www.facebook.com/SDAONUDasma',
    name: 'SDAO NU Dasma'
};

async function resetTrackedPages() {
    try {
        console.log('🔄 Connecting to Redis...');
        await redisClient.ping();
        console.log('✅ Connected to Redis\n');

        // Get current tracked pages
        const currentPages = await redisClient.smembers('tracked_pages');
        console.log(`📦 Current tracked pages: ${currentPages.length}`);
        currentPages.forEach(pageId => console.log(`  - ${pageId}`));

        // Delete all tracked pages
        if (currentPages.length > 0) {
            console.log('\n🗑️  Removing all tracked pages...');
            await redisClient.del('tracked_pages');
            
            // Remove page data for each old page
            for (const pageId of currentPages) {
                await redisClient.del(`page_data:${pageId}`);
                await redisClient.del(`scraped_data:${pageId}`);
                console.log(`  ✅ Removed page: ${pageId}`);
            }
        }

        // Add new default page
        console.log('\n📝 Adding new default page...');
        await redisClient.sadd('tracked_pages', NEW_DEFAULT_PAGE.id);
        await redisClient.hset(`page_data:${NEW_DEFAULT_PAGE.id}`, {
            id: NEW_DEFAULT_PAGE.id,
            url: NEW_DEFAULT_PAGE.url,
            name: NEW_DEFAULT_PAGE.name,
            addedAt: new Date().toISOString(),
            lastScraped: null,
            postCount: 0
        });
        
        console.log(`✅ Added: ${NEW_DEFAULT_PAGE.name} (${NEW_DEFAULT_PAGE.id})`);
        console.log(`   URL: ${NEW_DEFAULT_PAGE.url}`);

        // Verify
        const newTrackedPages = await redisClient.smembers('tracked_pages');
        const newPageData = await redisClient.hgetall(`page_data:${NEW_DEFAULT_PAGE.id}`);
        
        console.log('\n✅ Reset complete!');
        console.log(`📦 Tracked pages: ${newTrackedPages.length}`);
        console.log(`📋 Page data:`);
        console.log(JSON.stringify(newPageData, null, 2));
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error resetting tracked pages:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run the script
resetTrackedPages();
