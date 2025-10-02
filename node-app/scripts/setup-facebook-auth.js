#!/usr/bin/env node

/**
 * Facebook Authentication Setup Helper
 * 
 * This script helps you set up Facebook authentication for the scraper.
 * It will guide you through extracting cookies from your browser.
 */

const fs = require('fs').promises;
const path = require('path');
const readline = require('readline');

const AUTH_DIR = path.join(__dirname, '../.auth');
const FB_COOKIES_FILE = path.join(AUTH_DIR, 'facebook-cookies.json');
const FB_SESSION_FILE = path.join(AUTH_DIR, 'facebook-session.json');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('\n🔐 Facebook Authentication Setup\n');
    console.log('This will set up authenticated scraping for higher volume and better access.\n');

    console.log('📋 INSTRUCTIONS:');
    console.log('1. Open Facebook in your browser and log in');
    console.log('2. Open Developer Tools (F12)');
    console.log('3. Go to: Application → Cookies → https://www.facebook.com');
    console.log('4. Install "Cookie-Editor" extension or manually copy cookies\n');

    const proceed = await question('Ready to continue? (y/n): ');
    if (proceed.toLowerCase() !== 'y') {
        console.log('Setup cancelled.');
        process.exit(0);
    }

    console.log('\n📝 METHOD 1: Using Cookie-Editor Extension (Recommended)\n');
    console.log('1. Install "Cookie-Editor" extension for your browser');
    console.log('2. Go to Facebook and click the extension icon');
    console.log('3. Click "Export" → "JSON"');
    console.log('4. Copy the entire JSON array\n');

    console.log('📝 METHOD 2: Manual Cookie Extraction\n');
    console.log('Copy these essential cookies from DevTools:');
    console.log('- c_user (Your user ID)');
    console.log('- xs (Session token)');
    console.log('- datr (Device token)');
    console.log('- sb (Secure browsing token)\n');

    const method = await question('Choose method (1 or 2): ');

    let cookies = [];
    let sessionData = {};

    if (method === '1') {
        console.log('\nPaste your cookies JSON (press Enter twice when done):\n');
        
        let cookiesJson = '';
        rl.on('line', (line) => {
            if (line.trim() === '' && cookiesJson.trim() !== '') {
                rl.close();
            } else {
                cookiesJson += line;
            }
        });

        await new Promise(resolve => rl.on('close', resolve));

        try {
            const rawCookies = JSON.parse(cookiesJson);
            
            // Convert to Playwright format
            cookies = rawCookies.map(cookie => ({
                name: cookie.name,
                value: cookie.value,
                domain: cookie.domain || '.facebook.com',
                path: cookie.path || '/',
                expires: cookie.expirationDate || -1,
                httpOnly: cookie.httpOnly || false,
                secure: cookie.secure || true,
                sameSite: cookie.sameSite || 'None'
            }));

            // Extract session info
            const cUserCookie = rawCookies.find(c => c.name === 'c_user');
            if (cUserCookie) {
                sessionData.userId = cUserCookie.value;
            }

        } catch (error) {
            console.error('❌ Invalid JSON format:', error.message);
            process.exit(1);
        }

    } else if (method === '2') {
        console.log('\nEnter cookie values (press Enter to skip):\n');

        const cUser = await question('c_user: ');
        const xs = await question('xs: ');
        const datr = await question('datr: ');
        const sb = await question('sb: ');

        if (!cUser || !xs) {
            console.error('❌ c_user and xs are required!');
            process.exit(1);
        }

        cookies = [
            { name: 'c_user', value: cUser, domain: '.facebook.com', path: '/', secure: true, httpOnly: false, sameSite: 'None' },
            { name: 'xs', value: xs, domain: '.facebook.com', path: '/', secure: true, httpOnly: true, sameSite: 'None' }
        ];

        if (datr) {
            cookies.push({ name: 'datr', value: datr, domain: '.facebook.com', path: '/', secure: true, httpOnly: true, sameSite: 'None' });
        }
        if (sb) {
            cookies.push({ name: 'sb', value: sb, domain: '.facebook.com', path: '/', secure: true, httpOnly: true, sameSite: 'None' });
        }

        sessionData.userId = cUser;

        rl.close();
    } else {
        console.error('❌ Invalid method selected');
        process.exit(1);
    }

    // Get optional session metadata
    if (!sessionData.name) {
        const nameInput = await question('\nYour Facebook name (optional): ');
        if (nameInput) sessionData.name = nameInput;
    }

    sessionData.authenticatedAt = new Date().toISOString();

    // Create auth directory
    await fs.mkdir(AUTH_DIR, { recursive: true });

    // Save cookies
    await fs.writeFile(FB_COOKIES_FILE, JSON.stringify(cookies, null, 2));
    await fs.writeFile(FB_SESSION_FILE, JSON.stringify(sessionData, null, 2));

    // Set restrictive permissions (Unix only)
    if (process.platform !== 'win32') {
        await fs.chmod(FB_COOKIES_FILE, 0o600);
        await fs.chmod(FB_SESSION_FILE, 0o600);
    }

    console.log('\n✅ Authentication saved successfully!');
    console.log(`📁 Cookies saved to: ${FB_COOKIES_FILE}`);
    console.log(`📁 Session saved to: ${FB_SESSION_FILE}`);
    console.log('\n🔒 Security notes:');
    console.log('- These files contain sensitive authentication data');
    console.log('- Never commit them to version control');
    console.log('- They are stored with restricted permissions');
    console.log('- Add .auth/ to your .gitignore');
    console.log('\n🚀 Restart your application to use authenticated scraping!');
    console.log('   docker-compose restart node-app\n');
}

main().catch(error => {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
});
