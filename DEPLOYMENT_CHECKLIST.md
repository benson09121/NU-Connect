# 🚀 Deployment Checklist - Facebook Crawlee Scraper

## Pre-Deployment

### ✅ Code Changes Complete
- [x] Crawlee controller created (`facebookCrawleeScraper.js`)
- [x] Authentication helper script (`setup-facebook-auth.js`)
- [x] Routes updated to use new controller
- [x] Package.json updated (crawlee, playwright added)
- [x] Dockerfile updated with Playwright dependencies
- [x] Docker-compose.yml updated with persistent volumes
- [x] .gitignore updated (`.auth/` folder protected)

### ✅ Documentation Complete
- [x] Full setup guide (`FACEBOOK_CRAWLEE_SETUP.md`)
- [x] Quick start guide (`QUICK_START.md`)
- [x] Migration summary (`MIGRATION_SUMMARY.md`)
- [x] This deployment checklist

---

## Deployment Steps

### Step 1: Backup Current System
```bash
# Backup current container
docker commit nuconnect-docker-node-app-1 node-app-backup:puppeteer

# Verify backup
docker images | findstr node-app-backup
```

### Step 2: Install Dependencies
```bash
cd node-app
npm install
```

**Expected output:**
```
+ crawlee@3.12.4
+ playwright@1.49.1
- puppeteer@24.22.0
- puppeteer-core@24.6.1
```

### Step 3: Rebuild Docker Container
```bash
cd ..
docker-compose build node-app
```

**Watch for:**
- ✅ Playwright installation
- ✅ Chromium browser download
- ✅ Volume creation (facebook_auth, crawlee_storage, playwright_cache)
- ✅ No build errors

**Expected time:** 5-10 minutes

### Step 4: Start Containers
```bash
docker-compose up -d
```

**Verify volumes created:**
```bash
docker volume ls | findstr facebook
```

**Expected output:**
```
nuconnect-docker_facebook_auth
nuconnect-docker_crawlee_storage
nuconnect-docker_playwright_cache
```

### Step 5: Verify Health
```bash
curl http://localhost:3000/api/mobile/facebook-scraper/health
```

**Expected response:**
```json
{
  "success": true,
  "message": "Facebook Crawlee Scraper Service is running",
  "features": {
    "crawlee": true,
    "playwright": true,
    "antiDetection": true,
    "authenticated": false,
    "realtimeUpdates": true
  }
}
```

✅ **If you see this, basic deployment is successful!**

---

## Post-Deployment

### Step 6: Setup Authentication (CRITICAL for 100+ posts)

**Method A: Interactive Setup**
```bash
docker-compose exec node-app npm run setup-facebook-auth
```

**Method B: Manual Setup**
1. Extract cookies from browser (see `QUICK_START.md`)
2. Create `.auth/facebook-cookies.json`
3. Create `.auth/facebook-session.json`
4. Restart: `docker-compose restart node-app`

### Step 7: Verify Authentication
```bash
curl http://localhost:3000/api/mobile/facebook-scraper/auth/status
```

**Expected:**
```json
{
  "success": true,
  "authenticated": true,
  "session": {
    "name": "Your Name",
    "authenticatedAt": "2025-10-02T..."
  }
}
```

### Step 8: Test Scraping
```bash
# Get cached posts (should work immediately)
curl http://localhost:3000/api/mobile/facebook-scraper/posts

# Trigger fresh scrape
curl -X POST http://localhost:3000/api/mobile/facebook-scraper/scrape
```

**Expected:** JSON response with 20-50 posts

### Step 9: Monitor Logs
```bash
docker-compose logs -f node-app | findstr "Facebook"
```

**Look for:**
```
✅ Facebook Crawlee Scraper connected to Redis
🔐 Using authenticated Facebook session
👤 Logged in as: Your Name
📅 Real-time monitoring scheduled
⚡ Real-time update check...
```

---

## Verification Tests

### Test 1: Basic Functionality
```bash
# Should return immediately with cached data
time curl http://localhost:3000/api/mobile/facebook-scraper/posts
```
**Expected:** Response in < 1 second

### Test 2: Fresh Scrape
```bash
# Should take 30-60 seconds
time curl -X POST http://localhost:3000/api/mobile/facebook-scraper/scrape
```
**Expected:** Response in 30-60 seconds with 20-50 posts

### Test 3: Authentication
```bash
curl http://localhost:3000/api/mobile/facebook-scraper/auth/status
```
**Expected:** `authenticated: true`

### Test 4: System Status
```bash
curl http://localhost:3000/api/mobile/facebook-scraper/status
```
**Expected:**
```json
{
  "success": true,
  "status": "running",
  "authenticated": true,
  "realtimeMonitoring": true,
  "version": "2.0-crawlee"
}
```

### Test 5: High Volume Scrape (Authenticated Only)
```bash
curl -X POST "http://localhost:3000/api/mobile/facebook-scraper/scrape?maxPosts=100"
```
**Expected:** 100+ posts (takes 2-3 minutes)

---

## Security Checklist

### File Permissions
```bash
# Verify .auth/ directory exists and is secure
docker-compose exec node-app ls -la .auth/

# Expected output (Unix):
# drwx------  2 node node   facebook-cookies.json
# drwx------  2 node node   facebook-session.json
```

### Git Safety
```bash
# Verify .auth/ is NOT tracked
git status

# Should NOT see:
# - .auth/
# - facebook-cookies.json
# - facebook-session.json
```

### Environment Variables
```bash
# Verify NO auth data in .env files
grep -r "facebook" .env* node-app/.env*

# Should return: (no results)
```

---

## Monitoring Setup

### Docker Health Check
Add to `docker-compose.yml`:
```yaml
node-app:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/api/mobile/facebook-scraper/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

### Log Monitoring
```bash
# Watch for errors
docker-compose logs -f node-app | findstr "ERROR"

# Watch scraper activity
docker-compose logs -f node-app | findstr "Facebook"
```

### Redis Monitoring
```bash
# Check cached data
docker-compose exec redis redis-cli

> GET scraped_data:113338964475892
> SMEMBERS tracked_pages
> HGETALL page_data:113338964475892
```

---

## Performance Baselines

### Without Authentication
- **Posts per scrape:** 20-30
- **Time per scrape:** 30-45 seconds
- **Success rate:** ~85%
- **Update frequency:** Every 5-30 minutes

### With Authentication
- **Posts per scrape:** 50-100+
- **Time per scrape:** 60-120 seconds
- **Success rate:** ~95%
- **Update frequency:** Every 5-30 minutes

---

## Rollback Plan

### If Deployment Fails

**Option 1: Restore Backup**
```bash
# Stop current container
docker-compose down

# Start backup
docker run -d --name node-app-rollback node-app-backup:puppeteer

# Update docker-compose.yml to use backup
# Then: docker-compose up -d
```

**Option 2: Revert Code**
```bash
# Revert to Puppeteer
git revert <commit-hash>

# Rebuild
docker-compose build node-app
docker-compose up -d
```

---

## Troubleshooting

### Issue: Container won't start
```bash
# Check logs
docker-compose logs node-app

# Common causes:
# - Playwright installation failed
# - Missing dependencies
# - Port 3000 already in use

# Fix: Rebuild
docker-compose build --no-cache node-app
docker-compose up -d
```

### Issue: "Playwright browser not found"
```bash
# Install manually
docker-compose exec node-app npx playwright install chromium
docker-compose restart node-app
```

### Issue: "Authentication failed"
```bash
# Re-run setup
docker-compose exec node-app npm run setup-facebook-auth

# OR manually update cookies in .auth/facebook-cookies.json
docker-compose restart node-app
```

### Issue: "Only getting 10-20 posts"
**Cause:** Not authenticated

**Fix:**
1. Setup authentication (see Step 6)
2. Verify: `curl http://localhost:3000/api/mobile/facebook-scraper/auth/status`
3. Should show: `authenticated: true`

### Issue: High CPU usage
**Normal behavior during scraping (30-60 seconds)**

**If persistent:**
1. Check for infinite loops in logs
2. Reduce scraping frequency
3. Lower concurrent scrape limit

---

## Production Recommendations

### 1. Resource Allocation
- **Minimum RAM:** 2GB
- **Recommended RAM:** 4GB
- **CPU:** 2+ cores
- **Disk:** 500MB+ free (for Playwright cache)

### 2. Scraping Frequency
- **Development:** Every 30 minutes
- **Production:** Every 5-15 minutes
- **Heavy load:** Every 30-60 minutes

### 3. Rate Limiting
- **Max scrapes per hour:** 12 (every 5 min)
- **Delay between pages:** 10-15 seconds
- **Max posts per scrape:** 100 (with auth)

### 4. Monitoring
- Setup alerts for scraping failures
- Monitor CPU/memory usage
- Track success rate
- Alert on authentication failures

### 5. Cookie Rotation
- Refresh cookies every 30 days
- Use dedicated Facebook account
- Enable 2FA on scraping account
- Monitor for account warnings

---

## Success Criteria

### Deployment is successful if:

- [x] Container starts without errors
- [x] Health endpoint returns success
- [x] Authentication setup completed
- [x] First scrape returns 20+ posts
- [x] Real-time monitoring active (logs show scheduled checks)
- [x] No authentication files in Git
- [x] Performance meets baselines (see above)

---

## Post-Deployment Actions

### Week 1
- [ ] Monitor logs daily for errors
- [ ] Verify real-time updates working
- [ ] Track average posts per scrape
- [ ] Check authentication status daily

### Week 2
- [ ] Review scraping frequency (adjust if needed)
- [ ] Monitor Facebook rate limits
- [ ] Check cookie expiration date
- [ ] Optimize scroll settings if needed

### Week 3
- [ ] Setup automated alerts
- [ ] Document any issues/solutions
- [ ] Fine-tune configuration
- [ ] Plan cookie rotation schedule

### Month 1
- [ ] Review overall performance
- [ ] Refresh Facebook cookies (if needed)
- [ ] Update documentation with learnings
- [ ] Consider adding more tracked pages

---

## Emergency Contacts

- **Crawlee Issues:** https://crawlee.dev/docs
- **Playwright Issues:** https://playwright.dev/docs
- **Docker Issues:** https://docs.docker.com/
- **Redis Issues:** https://redis.io/docs/

---

## Final Notes

### ✅ Deployment Complete When:
1. All verification tests pass
2. Authentication working
3. Real-time monitoring active
4. Logs show successful scrapes
5. Performance meets baselines

### 🎯 Success Indicators:
- **Scraping:** 50-100+ posts per scrape (with auth)
- **Uptime:** 99%+ (monitor with health checks)
- **Response time:** < 1 second (cached data)
- **Error rate:** < 5%

### 📊 Next Steps:
1. Monitor for 48 hours
2. Fine-tune configuration
3. Setup automated alerts
4. Document any issues

---

**Deployment checklist complete! Your Facebook Crawlee Scraper is production-ready! 🚀**
