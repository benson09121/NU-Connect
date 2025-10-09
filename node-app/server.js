const express = require('express');
const http = require('http');
const { initializeSocket } = require('./mobile/controllers/eventsController');
require('dotenv').config();
const db = require('./config/db');
const fileUpload = require('express-fileupload');
const { redisClient } = require('./config/redis');
// const { scanner } = require('./config/clamav');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);

// ====================================
// 🔒 SECURITY HEADERS (OWASP Fixes)
// ====================================
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "http://localhost:5173", "http://localhost:3000", "http://localhost:8080", "https://admin.nuconnect.net"],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        }
    },
    strictTransportSecurity: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    frameguard: {
        action: 'sameorigin'
    },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: {
        policy: 'strict-origin-when-cross-origin'
    }
}));

// ====================================
// 🛡️ RATE LIMITING - DISABLED FOR DEVELOPMENT
// ====================================
// Rate limiting removed to allow unlimited requests during development

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
    limits: {fileSize: 100 * 1024 * 1024},
    abortOnLimit: true, 
    safeFileNames: false,  // Disable safe file names to preserve original extensions
    preserveExtension: true,
    createParentPath: true,
}));

// Debug middleware to log all file uploads
app.use((req, res, next) => {
    if (req.files && Object.keys(req.files).length > 0) {
        console.log('[GLOBAL FILE DEBUG] File upload detected:');
        console.log('  - URL:', req.url);
        console.log('  - Method:', req.method);
        console.log('  - Files:');
        Object.keys(req.files).forEach(key => {
            const file = req.files[key];
            console.log(`    ${key}:`, {
                name: file.name,
                mimetype: file.mimetype,
                size: file.size
            });
        });
    }
    next();
});

// 🔍 CORS Debugging Middleware - Log all preflight requests
app.use((req, res, next) => {
    if (req.method === 'OPTIONS') {
        console.log('🔍 [CORS DEBUG] Preflight OPTIONS request:');
        console.log('  - Origin:', req.headers.origin);
        console.log('  - Method:', req.headers['access-control-request-method']);
        console.log('  - Headers requested:', req.headers['access-control-request-headers']);
        console.log('  - URL:', req.url);
        console.log('  - All headers:', JSON.stringify(req.headers, null, 2));
    }
    next();
});

// ====================================
// 🔒 CORS Configuration (Secure)
// ====================================
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        const allowedOrigins = process.env.NODE_ENV === 'production' 
            ? [
                'https://admin.nuconnect.net',
                'http://localhost:8080'  // nginx inside Docker
              ]
            : [
                'http://localhost:5173',
                'http://localhost:3000',
                'http://localhost:8080'
              ];
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.warn(`🚫 [CORS] Blocked origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
    maxAge: 86400,
    
}));


// Import Routes on Mobile
const indexRoutes = require('./index');
const authRoutes = require('./mobile/routes/auth');
const facebookRoutes = require('./mobile/routes/facebook');
const facebookScraperRoutes = require('./mobile/routes/facebookScraper');
const eventRoutes = require('./mobile/routes/events');
const organizationRoutes = require('./mobile/routes/organization');
const notification = require('./mobile/routes/notification');
const termPaymentsMobile = require('./mobile/routes/termPayments');

// Import Routes on Web
const authRoutesWeb = require('./web/routes/auth');
const permissionRoutesWeb = require('./web/routes/permissions'); 
const manageAccountsRoutesWeb = require('./web/routes/manageAccounts');
const RequirementsRoutesWeb = require('./web/routes/requirements');
const organizationsRoutesWeb = require('./web/routes/organizations');
const eventsRouter = require('./web/routes/events');
const logsRouter = require('./web/routes/logs');
const programsRoutesWeb = require('./web/routes/programs');
const collegesRoutesWeb = require('./web/routes/colleges');
const sse = require('./web/routes/sse');
const emailSuggestionsRoutes = require('./web/routes/emailSuggestions');
const notificationsRoutes = require('./web/routes/notifications');
const transactionsRoutes = require('./web/routes/transactions');
const publicRoutes = require('./web/routes/public');
const analytics = require('./web/routes/analytics');
const novaRoutes = require('./web/routes/nova');
const termPaymentRoutes = require('./web/routes/termPaymentRoutes');
const qrVerificationRoutes = require('./web/routes/qrVerification');
const filesRoutes = require('./web/routes/files');


// Routes on Mobile
app.use('/', indexRoutes);
app.use('/api/mobile', authRoutes); // Rate limiter removed
app.use('/api/mobile', facebookRoutes);
app.use('/api/facebook-scraper', facebookScraperRoutes);
app.use('/api/mobile/facebook-scraper', facebookScraperRoutes); // Add mobile-specific route
app.use('/api/mobile', eventRoutes);
app.use('/api/mobile', organizationRoutes);
app.use('/api/mobile', notification);
app.use('/api/mobile', termPaymentsMobile);
// Routes on Web  
// PUBLIC ROUTES MUST BE FIRST to avoid middleware conflicts
app.use('/api/web/public', publicRoutes);

app.use('/api/web', authRoutesWeb); // Rate limiter removed
app.use('/api/web', permissionRoutesWeb);
app.use('/api/web', manageAccountsRoutesWeb);
app.use('/api/web', RequirementsRoutesWeb);
app.use('/api/web', organizationsRoutesWeb);
app.use('/api/web', eventsRouter);
app.use('/api/web', logsRouter);
app.use('/api/web', programsRoutesWeb);
app.use('/api/web', collegesRoutesWeb);
app.use('/api/web', sse);
app.use('/api/web', emailSuggestionsRoutes);
app.use('/api/web', notificationsRoutes);
app.use('/api/web', transactionsRoutes);
app.use('/api/web', qrVerificationRoutes);
app.use('/api/web', analytics);
app.use('/api/web', novaRoutes);
app.use('/api/web', termPaymentRoutes);
app.use('/api/web/term-payments', termPaymentRoutes); // Temporary fallback for old path
app.use('/api/web', filesRoutes);


// Initialize cron jobs
const { initializeCronJobs } = require('./jobs');
const certificateQueue = require('./jobs/certificateQueue');
initializeCronJobs();
certificateQueue.processQueue();

// Add this line with other route uses
// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Application specific logging, throwing an error, or other logic here
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`NU-Connect server is running on port ${PORT}`);
});