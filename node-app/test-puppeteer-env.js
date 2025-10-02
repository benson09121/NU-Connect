#!/usr/bin/env node

/**
 * Puppeteer Environment Test Script
 * Tests if Puppeteer can launch and scrape in the current environment
 * Run: node test-puppeteer-env.js
 */

const puppeteer = require('puppeteer');

console.log('🔍 Testing Puppeteer Environment...\n');

async function testPuppeteer() {
    try {
        console.log('1️⃣ Attempting to launch browser...');
        
        const browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--single-process',
                '--no-zygote'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            timeout: 30000
        });
        
        console.log('✅ Browser launched successfully!\n');
        
        console.log('2️⃣ Creating new page...');
        const page = await browser.newPage();
        console.log('✅ Page created!\n');
        
        console.log('3️⃣ Navigating to Google...');
        await page.goto('https://www.google.com', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        console.log('✅ Navigation successful!\n');
        
        console.log('4️⃣ Getting page title...');
        const title = await page.title();
        console.log(`✅ Page title: "${title}"\n`);
        
        console.log('5️⃣ Taking screenshot...');
        const screenshot = await page.screenshot();
        console.log(`✅ Screenshot captured! (${screenshot.length} bytes)\n`);
        
        console.log('6️⃣ Closing browser...');
        await browser.close();
        console.log('✅ Browser closed!\n');
        
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('🎉 ALL TESTS PASSED!');
        console.log('✅ Puppeteer is working correctly');
        console.log('✅ Ready for Facebook scraping');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        
        // Environment info
        console.log('📊 Environment Information:');
        console.log(`   Node Version: ${process.version}`);
        console.log(`   Platform: ${process.platform}`);
        console.log(`   Architecture: ${process.arch}`);
        console.log(`   Puppeteer Executable: ${process.env.PUPPETEER_EXECUTABLE_PATH || 'default'}`);
        console.log(`   Memory Usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
        
        process.exit(0);
        
    } catch (error) {
        console.error('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ TEST FAILED!');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.error('Error:', error.message);
        console.error('\nFull Error Stack:');
        console.error(error.stack);
        
        console.error('\n📋 Troubleshooting Steps:');
        console.error('1. Ensure Chromium is installed: apt-get install chromium chromium-driver');
        console.error('2. Check Docker has enough memory (2GB+ recommended)');
        console.error('3. Verify --no-sandbox flag is set');
        console.error('4. Set PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium');
        console.error('5. Check logs: docker logs node-app');
        console.error('6. Increase shm_size in docker-compose.yml: shm_size: "2gb"');
        
        process.exit(1);
    }
}

// Run the test
testPuppeteer();
