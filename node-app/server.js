const express = require('express');
const http = require('http');
const { initializeSocket } = require('./mobile/controllers/eventsController');
require('dotenv').config();
const db = require('./config/db');
const fileUpload = require('express-fileupload');
const { redisClient } = require('./config/redis');
// const { scanner } = require('./config/clamav');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

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
app.use(cors({
    origin: "http://localhost:5173",
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
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


// Routes on Mobile
app.use('/', indexRoutes);
app.use('/api/mobile', authRoutes);
app.use('/api/mobile', facebookRoutes);
app.use('/api/facebook-scraper', facebookScraperRoutes);
app.use('/api/mobile', eventRoutes);
app.use('/api/mobile', organizationRoutes);
app.use('/api/mobile', notification);
app.use('/api/mobile', termPaymentsMobile);
// Routes on Web
app.use('/api/web', authRoutesWeb);
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
app.use('/api/web', analytics);
app.use('/api/web', novaRoutes);
app.use('/api/web', termPaymentRoutes);
app.use('/api/web/term-payments', termPaymentRoutes); // Temporary fallback for old path
app.use('/api/web/public', publicRoutes);


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