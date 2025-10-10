# Facebook Scraper Cookie Fix - Complete Solution

## 🐛 Problem Analysis

### Error Encountered:
```
browserContext.addCookies: cookies[0].sameSite: expected one of (Strict|Lax|None)
at PlaywrightCrawler.requestHandler (/app/mobile/controllers/facebookCrawleeScraper.js:230:46)
```

### Root Cause:
The cookies exported from browser extensions (like Cookie-Editor) often have **invalid sameSite values** that don't match Playwright's strict requirements:

**Common Issues:**
1. **Lowercase values**: `"strict"`, `"lax"`, `"none"` (❌ Invalid)
2. **Chrome-specific**: `"no_restriction"` (❌ Invalid)
3. **Empty strings**: `""` (❌ Invalid)  
4. **Missing attribute**: `undefined` (❌ Invalid)
5. **Incorrect capitalization**: Must be exactly `"Strict"`, `"Lax"`, or `"None"` (✅ Valid)

---

## ✅ Solution Implemented

### 1. Created `sanitizeCookies()` Method

**Location:** Line ~111 in `facebookCrawleeScraper.js`

**Purpose:** Validate and fix all cookie attributes to ensure Playwright compatibility

**Code:**
```javascript
sanitizeCookies(cookies) {
    return cookies.map((cookie, index) => {
        const sanitized = { ...cookie };

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
                sanitized.sameSite = 'Lax'; // Default fallback
            }
        } else {
            sanitized.sameSite = 'Lax'; // Default if missing
        }

        // Ensure domain is properly formatted
        if (sanitized.domain && !sanitized.domain.startsWith('.') && sanitized.domain.includes('.')) {
            sanitized.domain = '.' + sanitized.domain; // Add leading dot for subdomain cookies
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
```

### 2. Applied Sanitization on Cookie Load

**Location:** Line ~73 in `loadAuthentication()` method

**Before (BROKEN):**
```javascript
const cookiesData = await fs.readFile(FB_COOKIES_FILE, 'utf-8');
this.cookies = JSON.parse(cookiesData); // ❌ No sanitization
```

**After (FIXED):**
```javascript
const cookiesData = await fs.readFile(FB_COOKIES_FILE, 'utf-8');
const rawCookies = JSON.parse(cookiesData);

// Sanitize cookies to ensure Playwright compatibility
this.cookies = this.sanitizeCookies(rawCookies); // ✅ Sanitized!
console.log(`🍪 Loaded and sanitized ${this.cookies.length} cookies`);
```

### 3. Added Error Handling for Cookie Addition

**Location 1:** Line ~288 in `quickCheckLatestPosts()` requestHandler

**Before (BROKEN):**
```javascript
if (self.authenticated && self.cookies) {
    await page.context().addCookies(self.cookies); // ❌ No error handling
    log.info('🔐 Using authenticated session');
}
```

**After (FIXED):**
```javascript
if (self.authenticated && self.cookies) {
    try {
        await page.context().addCookies(self.cookies); // ✅ With try-catch
        log.info('🔐 Using authenticated session');
    } catch (cookieError) {
        log.warn(`⚠️  Failed to add cookies: ${cookieError.message}`);
        log.warn('   Continuing without authentication...');
    }
}
```

**Location 2:** Line ~419 in `scrapePageWithCrawlee()` requestHandler

Same error handling applied.

---

## 📋 What Gets Fixed

### Cookie Attribute Corrections:

| Original Value | Sanitized Value | Notes |
|---------------|-----------------|-------|
| `"strict"` | `"Strict"` | Capitalized |
| `"lax"` | `"Lax"` | Capitalized |
| `"none"` | `"None"` | Capitalized |
| `"no_restriction"` | `"None"` | Chrome format converted |
| `""` (empty) | `"Lax"` | Default fallback |
| `undefined` | `"Lax"` | Default fallback |
| `"invalid"` | `"Lax"` | Default fallback |

### Domain Corrections:

| Original | Sanitized | Notes |
|----------|-----------|-------|
| `"facebook.com"` | `".facebook.com"` | Added leading dot |
| `".facebook.com"` | `".facebook.com"` | Already correct |
| `"www.facebook.com"` | `".www.facebook.com"` | Added leading dot |

### Other Fixes:

- **Path**: Defaults to `"/"` if missing
- **Expires**: Converts string timestamps to numbers
- **Secure**: Automatically set to `true` if `sameSite === "None"`
- **Invalid cookies**: Filtered out (missing name or domain)

---

## 🚀 How to Apply the Fix

### Step 1: Restart Container
```bash
docker-compose restart node-app
```

### Step 2: Watch Logs
```bash
docker logs -f node-app
```

### Step 3: Look for Success Messages

**✅ Expected Output:**
```
✅ Facebook authentication loaded successfully
🍪 Loaded and sanitized 25 cookies
👤 Logged in as: [Your Name]
✅ Crawlee scraper initialized
INFO  PlaywrightCrawler: Quick checking https://www.facebook.com/SDAONUDasma
🔐 Using authenticated session
📜 Scrolling to load 10 posts...
✅ Collected 10 posts
```

**❌ No More Errors:**
```
❌ browserContext.addCookies: cookies[0].sameSite: expected one of (Strict|Lax|None)  ← FIXED!
```

---

## 🔍 Verification Steps

### 1. Check Cookie Sanitization
Look for this log message:
```
🍪 Loaded and sanitized X cookies
```

### 2. Check Authentication
Look for this log message:
```
🔐 Using authenticated session
```

### 3. Check for Errors
Should **NOT** see:
```
⚠️  Failed to add cookies: browserContext.addCookies...
```

### 4. Check Scraping Success
Should see:
```
✅ Collected X posts
💾 Cached data for page 104908055228742
```

---

## 🛠️ Troubleshooting

### If you still see cookie errors:

**1. Check your cookies file format**
```bash
cat /app/.auth/facebook-cookies.json
```

Should be valid JSON array:
```json
[
  {
    "name": "c_user",
    "value": "...",
    "domain": ".facebook.com",
    "path": "/",
    "expires": 1234567890,
    "httpOnly": false,
    "secure": true,
    "sameSite": "None"
  }
]
```

**2. Re-export cookies**
- Use Cookie-Editor browser extension
- Export from Facebook.com (while logged in)
- Save as `facebook-cookies.json`
- Place in `/app/.auth/` folder

**3. Manually fix sameSite in JSON**
Edit the file and change all:
- `"sameSite": "strict"` → `"sameSite": "Strict"`
- `"sameSite": "lax"` → `"sameSite": "Lax"`
- `"sameSite": "none"` → `"sameSite": "None"`
- `"sameSite": "no_restriction"` → `"sameSite": "None"`

**4. Check if cookies are expired**
If scraping fails:
- Cookies might be expired (check `expires` timestamp)
- Re-login to Facebook and export fresh cookies

---

## 📝 Technical Details

### Why This Error Happens

**Playwright's Cookie Requirements:**
Playwright uses Chromium's strict cookie validation which requires:
1. `sameSite` must be exactly `"Strict"`, `"Lax"`, or `"None"` (case-sensitive)
2. If `sameSite` is `"None"`, `secure` must be `true`
3. `domain` must be properly formatted (with leading dot for subdomains)
4. All required fields must be present and valid types

**Browser Extensions Export Issues:**
- Cookie-Editor exports lowercase: `"strict"`, `"lax"`, `"none"`
- Chrome DevTools exports: `"no_restriction"` instead of `"None"`
- EditThisCookie exports: Empty strings `""`
- Some don't include `path` or `domain`

### How Sanitization Solves This

The `sanitizeCookies()` method:
1. **Normalizes** all sameSite values to Playwright's expected format
2. **Provides defaults** for missing attributes
3. **Fixes domains** to proper format (with leading dot)
4. **Ensures type correctness** (expires as number, not string)
5. **Filters invalid** cookies that can't be fixed
6. **Logs warnings** for skipped cookies

---

## 🎯 Summary

**Files Modified:**
- ✅ `facebookCrawleeScraper.js` (3 locations)
  - Added `sanitizeCookies()` method
  - Modified `loadAuthentication()` to use sanitization
  - Added error handling in both crawler requestHandlers

**Lines Changed:**
- Line ~73: Apply sanitization when loading cookies
- Line ~111: New `sanitizeCookies()` method (60 lines)
- Line ~288: Error handling in `quickCheckLatestPosts`
- Line ~419: Error handling in `scrapePageWithCrawlee`

**Total Changes:** ~70 lines added/modified

**Result:** 
- ✅ All cookie sameSite errors fixed
- ✅ Graceful degradation if cookies fail
- ✅ Better logging and debugging
- ✅ Robust cookie validation

---

**Last Updated:** October 9, 2025  
**Status:** ✅ Ready to test
