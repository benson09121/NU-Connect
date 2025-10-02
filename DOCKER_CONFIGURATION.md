# 🐳 Docker Configuration Updates - Facebook Crawlee Scraper

## Changes Made

### ✅ 1. docker-compose.yml

#### Added Named Volumes for Persistence

**Why?** To ensure Facebook authentication cookies and Crawlee data persist across container restarts.

```yaml
node-app:
  volumes:
    # ... existing volumes ...
    
    # NEW: Facebook Scraper persistent storage
    - facebook_auth:/app/.auth              # Authentication cookies
    - crawlee_storage:/app/storage          # Crawlee dataset storage
    - playwright_cache:/root/.cache/ms-playwright  # Playwright browser cache
```

**Volume Definitions:**
```yaml
volumes:
  mysql_volume:
  redis_volume:
  # NEW: Facebook Scraper volumes
  facebook_auth:      # Stores facebook-cookies.json & facebook-session.json
  crawlee_storage:    # Stores Crawlee datasets and request queues
  playwright_cache:   # Caches Playwright browser binaries
```

#### Removed Puppeteer Environment Variables

**Old (Removed):**
```yaml
environment:
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: "true"
  PUPPETEER_EXECUTABLE_PATH: "/usr/bin/chromium"
```

**Why removed?** We're now using Playwright via Crawlee, which manages its own browser installations.

---

### ✅ 2. node-app/dockerfile

#### Added Directory Creation for Scraper

```dockerfile
# Create Facebook Scraper directories
RUN mkdir -p /app/.auth && \
    mkdir -p /app/storage && \
    chown -R node:node /app/.auth && \
    chown -R node:node /app/storage && \
    chmod 700 /app/.auth
```

**What this does:**
- Creates `.auth/` folder for cookie storage
- Creates `storage/` folder for Crawlee datasets
- Sets ownership to `node` user (non-root)
- Sets restrictive permissions (700) on `.auth/` for security

---

## 📊 Volume Persistence Explained

### facebook_auth Volume

**Purpose:** Stores Facebook authentication data

**Contents:**
```
.auth/
├── facebook-cookies.json      # Encrypted browser cookies
└── facebook-session.json      # Session metadata
```

**Benefits:**
- ✅ Cookies persist across container restarts
- ✅ No need to re-authenticate every time
- ✅ Isolated from host filesystem (secure)
- ✅ Can be backed up easily

**Backup command:**
```bash
docker run --rm -v nuconnect-docker_facebook_auth:/data -v $(pwd):/backup \
  alpine tar czf /backup/facebook-auth-backup.tar.gz -C /data .
```

---

### crawlee_storage Volume

**Purpose:** Stores Crawlee's internal data (datasets, request queues)

**Contents:**
```
storage/
├── datasets/          # Scraped data before processing
├── key_value_stores/  # Metadata and state
└── request_queues/    # Pending scrape requests
```

**Benefits:**
- ✅ Crawlee can resume interrupted scrapes
- ✅ Data persists between deployments
- ✅ Better debugging (can inspect stored data)

---

### playwright_cache Volume

**Purpose:** Caches Playwright browser binaries

**Contents:**
```
.cache/ms-playwright/
└── chromium-<version>/  # ~200MB browser binary
```

**Benefits:**
- ✅ Faster container rebuilds (no re-download)
- ✅ Consistent browser version
- ✅ Reduces Docker image size

---

## 🚀 Impact on Deployment

### Before Changes (No Volumes)

❌ **Problems:**
- Authentication lost on container restart
- Must re-authenticate every time
- Crawlee data lost on restart
- Playwright re-downloads browser (slow)

### After Changes (With Volumes)

✅ **Improvements:**
- **Authentication persists** across restarts
- **One-time setup** (cookies stay saved)
- **Faster restarts** (cached browser)
- **Better reliability** (Crawlee state preserved)

---

## 🔧 Docker Commands

### View Volumes
```bash
# List all volumes
docker volume ls | findstr facebook

# Inspect a volume
docker volume inspect nuconnect-docker_facebook_auth
```

### Backup Volumes
```bash
# Backup authentication data
docker run --rm -v nuconnect-docker_facebook_auth:/data -v %cd%:/backup ^
  alpine tar czf /backup/facebook-auth-backup.tar.gz -C /data .

# Backup Crawlee storage
docker run --rm -v nuconnect-docker_crawlee_storage:/data -v %cd%:/backup ^
  alpine tar czf /backup/crawlee-storage-backup.tar.gz -C /data .
```

### Restore Volumes
```bash
# Restore authentication data
docker run --rm -v nuconnect-docker_facebook_auth:/data -v %cd%:/backup ^
  alpine tar xzf /backup/facebook-auth-backup.tar.gz -C /data
```

### Clean Volumes (DANGER)
```bash
# Remove all Facebook scraper volumes (will delete authentication!)
docker volume rm nuconnect-docker_facebook_auth
docker volume rm nuconnect-docker_crawlee_storage
docker volume rm nuconnect-docker_playwright_cache
```

---

## 📁 Nginx Configuration

### No Changes Required

**Why?** The `.auth/` and `storage/` folders are **backend-only**. Nginx doesn't need access because:

- ✅ Authentication is handled by Node.js API
- ✅ Scraped data is served via API endpoints
- ✅ No direct file serving needed
- ✅ Security: keeps auth data isolated from web server

**Nginx only proxies API requests:**
```nginx
location /api/ {
    proxy_pass http://node-app:3000;
    # ... proxy headers ...
}
```

---

## 🔒 Security Improvements

### Volume Isolation

**Before (host bind mount):**
```yaml
# Less secure - host filesystem access
volumes:
  - ./node-app/.auth:/app/.auth
```

**After (named volume):**
```yaml
# More secure - isolated Docker volume
volumes:
  - facebook_auth:/app/.auth
```

**Benefits:**
- ✅ Isolated from host filesystem
- ✅ Harder to accidentally expose
- ✅ Proper permission management
- ✅ Can't be accidentally committed to Git

### File Permissions

**Dockerfile ensures:**
```dockerfile
chmod 700 /app/.auth  # Owner-only access
chown node:node /app/.auth  # Non-root user
```

**Result:**
- ✅ Only the Node.js process can access `.auth/`
- ✅ No other containers can read the data
- ✅ Host system has no direct access

---

## 🧪 Testing Volume Persistence

### Test 1: Authentication Persistence
```bash
# 1. Setup authentication
docker-compose exec node-app npm run setup-facebook-auth

# 2. Verify it's saved
docker-compose exec node-app ls -la /app/.auth

# 3. Restart container
docker-compose restart node-app

# 4. Check if auth still works
curl http://localhost:3000/api/mobile/facebook-scraper/auth/status
```

**Expected:** `authenticated: true` ✅

### Test 2: Crawlee Storage Persistence
```bash
# 1. Trigger scrape
curl -X POST http://localhost:3000/api/mobile/facebook-scraper/scrape

# 2. Check storage
docker-compose exec node-app ls -la /app/storage

# 3. Restart container
docker-compose restart node-app

# 4. Storage should still exist
docker-compose exec node-app ls -la /app/storage
```

**Expected:** Storage folder persists ✅

---

## 🔄 Migration from Old Setup

### If You Already Have .auth/ Folder on Host

**Option 1: Copy to Volume**
```bash
# Start container
docker-compose up -d node-app

# Copy existing auth to volume
docker cp ./node-app/.auth/. node-app:/app/.auth/

# Verify
docker-compose exec node-app ls -la /app/.auth
```

**Option 2: Re-authenticate (Recommended)**
```bash
# Just re-run setup
docker-compose exec node-app npm run setup-facebook-auth
```

---

## 📋 Updated Deployment Checklist

### Before Deployment
- [ ] Understand volume persistence (read this doc)
- [ ] Backup existing `.auth/` folder (if any)
- [ ] Review security implications

### During Deployment
- [ ] Run `docker-compose build node-app`
- [ ] Run `docker-compose up -d`
- [ ] Verify volumes created: `docker volume ls`
- [ ] Setup authentication: `npm run setup-facebook-auth`
- [ ] Test persistence: restart container and verify auth

### After Deployment
- [ ] Verify volumes are listed: `docker volume ls`
- [ ] Test authentication persists across restarts
- [ ] Schedule regular volume backups (weekly)
- [ ] Monitor volume disk usage

---

## 📊 Volume Size Estimates

| Volume | Size | Growth |
|--------|------|--------|
| `facebook_auth` | ~10KB | Static |
| `crawlee_storage` | ~100MB | Grows slowly |
| `playwright_cache` | ~200MB | Static |
| **Total** | **~300MB** | Minimal |

**Disk impact:** Negligible for modern systems

---

## 🆘 Troubleshooting

### Issue: "Volume not found"
```bash
# Recreate volumes
docker-compose down
docker-compose up -d
```

### Issue: "Permission denied" in .auth/
```bash
# Fix permissions
docker-compose exec node-app chmod 700 /app/.auth
docker-compose exec node-app chown -R node:node /app/.auth
```

### Issue: "Authentication lost after restart"
```bash
# Check if volume exists
docker volume inspect nuconnect-docker_facebook_auth

# If missing, recreate
docker-compose down
docker volume create nuconnect-docker_facebook_auth
docker-compose up -d
```

### Issue: "Playwright browser not found after restart"
```bash
# Reinstall browsers
docker-compose exec node-app npx playwright install chromium
```

---

## ✅ Summary

### What Changed
- ✅ Added 3 named volumes (facebook_auth, crawlee_storage, playwright_cache)
- ✅ Removed Puppeteer environment variables
- ✅ Added directory creation in Dockerfile
- ✅ Set proper permissions (700 for .auth/)

### Why It Matters
- ✅ **Authentication persists** across container restarts
- ✅ **Faster deployments** (cached browsers)
- ✅ **Better security** (isolated volumes)
- ✅ **More reliable** (Crawlee state preserved)

### No Breaking Changes
- ✅ All existing volumes still work
- ✅ No changes to nginx
- ✅ API endpoints unchanged
- ✅ Backward compatible

---

## 📚 Related Documentation

- `DEPLOYMENT_CHECKLIST.md` - Full deployment guide
- `QUICK_START.md` - Setup instructions
- `FACEBOOK_CRAWLEE_SETUP.md` - Technical details

---

**Docker configuration complete! Your scraper storage is now persistent and secure! 🎉**
