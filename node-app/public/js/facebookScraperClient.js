// Example client-side usage of the Facebook Scraper API

class FacebookScraperClient {
    constructor(baseUrl = '/api/facebook-scraper') {
        this.baseUrl = baseUrl;
    }

    // Get posts for a page (checks cache first, scrapes if needed)
    async getPagePosts(pageId, pageUrl, options = {}) {
        try {
            // First, try to get cached data
            const cachedResponse = await fetch(`${this.baseUrl}/cached/${pageId}`);
            const cachedResult = await cachedResponse.json();

            // If cached data exists and is fresh (less than 30 minutes old)
            if (cachedResult.success && cachedResult.data.cacheAge < 30 * 60 * 1000) {
                console.log('📦 Serving cached Facebook data');
                return {
                    success: true,
                    data: cachedResult.data,
                    source: 'cache'
                };
            }

            // If no cached data or data is stale, trigger scraping
            console.log('🔄 Cached data not available or stale, triggering scrape...');
            
            const scrapeResponse = await fetch(`${this.baseUrl}/scrape?useCache=true&maxPosts=${options.maxPosts || 20}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pageId: pageId,
                    pageUrl: pageUrl
                })
            });

            const scrapeResult = await scrapeResponse.json();
            
            if (scrapeResult.success) {
                return {
                    success: true,
                    data: scrapeResult.data,
                    source: scrapeResult.data.fromCache ? 'cache' : 'fresh_scrape'
                };
            } else {
                throw new Error(scrapeResult.message);
            }

        } catch (error) {
            console.error('Error getting Facebook posts:', error);
            return {
                success: false,
                error: error.message,
                fallback: 'Consider using Facebook API or other data sources'
            };
        }
    }

    // Add a page to the tracking system (for automatic updates)
    async trackPage(pageId, pageUrl) {
        try {
            const response = await fetch(`${this.baseUrl}/track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    pageId: pageId,
                    pageUrl: pageUrl
                })
            });

            return await response.json();
        } catch (error) {
            console.error('Error tracking page:', error);
            return { success: false, error: error.message };
        }
    }

    // Get system status
    async getStatus() {
        try {
            const response = await fetch(`${this.baseUrl}/status`);
            return await response.json();
        } catch (error) {
            console.error('Error getting status:', error);
            return { success: false, error: error.message };
        }
    }
}

// Usage examples:

// Example 1: Get posts from a Facebook page
async function loadFacebookPosts(pageId, pageUrl) {
    const scraper = new FacebookScraperClient();
    
    const result = await scraper.getPagePosts(pageId, pageUrl, { maxPosts: 10 });
    
    if (result.success) {
        console.log(`📱 Loaded ${result.data.posts.length} posts from ${result.source}`);
        
        // Display posts in your UI
        result.data.posts.forEach(post => {
            console.log('Post:', {
                content: post.content.substring(0, 100) + '...',
                timestamp: post.timestamp,
                images: post.images.length,
                url: post.url
            });
        });
        
        return result.data.posts;
    } else {
        console.error('Failed to load posts:', result.error);
        return [];
    }
}

// Example 2: Track multiple pages
async function setupPageTracking() {
    const scraper = new FacebookScraperClient();
    
    const pagesToTrack = [
        { id: 'nike', url: 'https://facebook.com/nike' },
        { id: 'nasa', url: 'https://facebook.com/NASA' },
        { id: 'natgeo', url: 'https://facebook.com/natgeo' }
    ];
    
    for (const page of pagesToTrack) {
        const result = await scraper.trackPage(page.id, page.url);
        console.log(`Tracking ${page.id}:`, result.success ? '✅' : '❌');
    }
}

// Example 3: Display system status
async function showScraperStatus() {
    const scraper = new FacebookScraperClient();
    const status = await scraper.getStatus();
    
    if (status.success) {
        console.log('📊 Scraper Status:', {
            isActive: status.status.isScrapingInProgress,
            trackedPages: status.status.trackedPagesCount,
            pages: status.status.trackedPages
        });
    }
}

// Example 4: React component usage
/*
function FacebookPosts({ pageId, pageUrl }) {
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [source, setSource] = useState('');

    useEffect(() => {
        async function loadPosts() {
            const scraper = new FacebookScraperClient();
            const result = await scraper.getPagePosts(pageId, pageUrl);
            
            if (result.success) {
                setPosts(result.data.posts);
                setSource(result.source);
            }
            setLoading(false);
        }

        loadPosts();
    }, [pageId, pageUrl]);

    if (loading) {
        return <div>Loading Facebook posts...</div>;
    }

    return (
        <div>
            <h3>Facebook Posts ({source})</h3>
            {posts.map((post, index) => (
                <div key={post.id || index} className="facebook-post">
                    <p>{post.content}</p>
                    <small>{post.timestamp}</small>
                    {post.images.map(img => (
                        <img key={img} src={img} alt="Post" style={{maxWidth: '100px'}} />
                    ))}
                </div>
            ))}
        </div>
    );
}
*/

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FacebookScraperClient;
}