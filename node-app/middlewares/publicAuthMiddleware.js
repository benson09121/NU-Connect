// Middleware for handling public API authentication
// Supports multiple auth methods: API key, subscription key, and bearer token

const publicAuthMiddleware = (req, res, next) => {
    console.log('🔑 PUBLIC AUTH MIDDLEWARE: Called for:', req.method, req.url);
    console.log('🔑 PUBLIC AUTH MIDDLEWARE: Headers received:', Object.keys(req.headers));
    
    const apiKey = req.headers['x-api-key'];
    const subscriptionKey = req.headers['ocp-apim-subscription-key'];
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    console.log('🔑 PUBLIC AUTH MIDDLEWARE: Auth headers found:', {
        apiKey: apiKey ? 'present' : 'missing',
        subscriptionKey: subscriptionKey ? 'present' : 'missing',
        bearerToken: bearerToken ? 'present' : 'missing'
    });

    // Define valid credentials
    const validCredentials = {
        apiKey: 'pk_live_7c23e1f4a8bd4cba9d7e53e6af21b98d',
        subscriptionKey: 'e4f04e28-4f4b-4a3b-9f4d-7a0f6b8c2d11',
        bearerToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhcHBsaWNhdGlvbklkIjoi bnVjb25uZWN0LXBhYmxpYyIsInR5cGUiOiJwdWJsaWMifQ.2nZC3yKfcF7tZpKpEo7E3l-Db0hKxW9WnVa6O0sY9yI'
    };

    // Check if any of the credentials match
    const isValidApiKey = apiKey === validCredentials.apiKey;
    const isValidSubscriptionKey = subscriptionKey === validCredentials.subscriptionKey;
    const isValidBearerToken = bearerToken === validCredentials.bearerToken;

    if (isValidApiKey || isValidSubscriptionKey || isValidBearerToken) {
        // Authentication successful, proceed to next middleware
        console.log('✅ PUBLIC API authentication successful');
        
        // Set a dummy user context to satisfy downstream controllers
        req.user = {
            email: 'public@system.local',
            role: 'public',
            permissions: ['PUBLIC_ACCESS']
        };
        
        next();
    } else {
        // Authentication failed
        console.log('❌ PUBLIC API authentication failed');
        console.log('Expected vs Received:');
        console.log('  API Key:', apiKey, '(expected:', validCredentials.apiKey, ')');
        console.log('  Subscription Key:', subscriptionKey, '(expected:', validCredentials.subscriptionKey, ')');
        console.log('  Bearer Token:', bearerToken ? `${bearerToken.substring(0, 20)}...` : 'missing', '(expected:', validCredentials.bearerToken.substring(0, 20), '...)');
        
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Valid API key, subscription key, or bearer token required',
            hint: 'Include one of: x-api-key, Ocp-Apim-Subscription-Key, or Authorization: Bearer headers'
        });
    }
};

module.exports = publicAuthMiddleware;