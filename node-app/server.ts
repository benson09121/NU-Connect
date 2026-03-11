import express, { Application, Request, Response, NextFunction } from 'express';
import http from 'http';
import path from 'path';
import 'dotenv/config';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import helmet from 'helmet';

// JS modules — to be migrated to TypeScript incrementally
// const { initializeSocket } = require('./mobile/controllers/eventsController');\
import { initWebSocket } from './services/websocketService';

// Routes on Mobile
// const indexRoutes = require('./index');
// const authRoutes = require('./mobile/routes/auth');
// const eventRoutes = require('./mobile/routes/events');
// const organizationRoutes = require('./mobile/routes/organization');
// const notification = require('./mobile/routes/notification');
// const termPaymentsMobile = require('./mobile/routes/termPayments');

// Routes on Web
import authRoutesWeb from './web/routes/auth';
import permissionRoutesWeb from './web/routes/permissions';
import publicRoutesWeb from './web/routes/public';
import dashboardRoutesWeb from './web/routes/dashboard';
import organizationsPageRoutesWeb from './web/routes/organizationsPage';
import approvalRoutesWeb from './web/routes/approval';
import esignatureRoutesWeb from './web/routes/esignature';
import notificationRoutesWeb from './web/routes/notification';
import logRoutesWeb from './web/routes/log';
import accountRoutesWeb from './web/routes/accounts';
import orgHubRoutesWeb from './web/routes/orgHub';
import emailSuggestionsRoutesWeb from './web/routes/emailSuggestions';
import eventsRoutesWeb from './web/routes/eventsRoutes';
import venuesRoutesWeb from './web/routes/venuesRoutes';
import termsRoutesWeb from './web/routes/termsRoutes';
import { initDashboardBridge } from './services/dashboardBroadcastService';
// const manageAccountsRoutesWeb = require('./web/routes/manageAccounts');
// const RequirementsRoutesWeb = require('./web/routes/requirements');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const organizationsRoutesWeb = require('./web/routes/organizations');
const eventsRouter = require('./web/routes/events');
// const logsRouter = require('./web/routes/logs');
// const programsRoutesWeb = require('./web/routes/programs');
// const collegesRoutesWeb = require('./web/routes/colleges');
// const sectionsRoutesWeb = require('./web/routes/sections');
// const sse = require('./web/routes/sse');
// const emailSuggestionsRoutes = require('./web/routes/emailSuggestions');
// const notificationsRoutes = require('./web/routes/notifications');
// const transactionsRoutes = require('./web/routes/transactions');
// const publicRoutes = require('./web/routes/public');
// const analytics = require('./web/routes/analytics');
// const novaRoutes = require('./web/routes/nova');
// const termPaymentRoutes = require('./web/routes/termPaymentRoutes');
// const qrVerificationRoutes = require('./web/routes/qrVerification');
// const filesRoutes = require('./web/routes/files');
// const esignatureRoutes = require('./web/routes/esignature');
// const approvalRoutes = require('./web/routes/approval');

const app: Application = express();
const server = http.createServer(app);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Selective file upload middleware (skip multer routes)
app.use((req: Request, res: Response, next: NextFunction) => {
  const multerRoutes = [
    '/api/web/esignature/upload',
    '/approval-signature',
  ];

  const isMulterRoute = multerRoutes.some((route) => req.path.includes(route));

  if (isMulterRoute) {
    console.log(`🔄 [MULTER ROUTE] Skipping express-fileupload for: ${req.path}`);
    return next();
  }

  fileUpload({
    limits: { fileSize: 100 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: false,
    preserveExtension: true,
    createParentPath: true,
  })(req, res, next);
});

const corsOptions = {
  origin: [
    'http://localhost:5173',  // Vite dev server
    'http://localhost:3000',
    ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : []),
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'x-api-key',
    'Ocp-Apim-Subscription-Key',
  ],
};

// Handle CORS preflight for all routes before any auth middleware runs
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// Routes on Mobile
// app.use('/', indexRoutes);
// app.use('/api/mobile', authRoutes);
// app.use('/api/mobile', eventRoutes);
// app.use('/api/mobile', organizationRoutes);
// app.use('/api/mobile', notification);
// app.use('/api/mobile', termPaymentsMobile);

// Routes on Web — PUBLIC must be first (no Azure JWT required)
app.use('/api/web/public', publicRoutesWeb);

app.use('/api/web', authRoutesWeb);
app.use('/api/web', permissionRoutesWeb);
app.use('/api/web', dashboardRoutesWeb);
app.use('/api/web', organizationsPageRoutesWeb);
app.use('/api/web/approvals', approvalRoutesWeb);
app.use('/api/web/esignature', esignatureRoutesWeb);
app.use('/api/web/notifications', notificationRoutesWeb);
app.use('/api/web/logs', logRoutesWeb);
app.use('/api/web', accountRoutesWeb);
app.use('/api/web', orgHubRoutesWeb);
app.use('/api/web', emailSuggestionsRoutesWeb);
// app.use('/api/web', manageAccountsRoutesWeb);
// app.use('/api/web', RequirementsRoutesWeb);
app.use('/api/web', organizationsRoutesWeb);
app.use('/api/web', eventsRoutesWeb); // TypeScript refactored — takes precedence for its routes
app.use('/api/web', venuesRoutesWeb); // TypeScript — venue management
app.use('/api/web', eventsRouter);   // Legacy JS — handles all other event endpoints
app.use('/api/web/term-payments', termsRoutesWeb); // TypeScript refactored term management
// app.use('/api/web', logsRouter);
// app.use('/api/web', programsRoutesWeb);
// app.use('/api/web', collegesRoutesWeb);
// app.use('/api/web', sectionsRoutesWeb);
// app.use('/api/web', sse);
// app.use('/api/web', emailSuggestionsRoutes);
// app.use('/api/web', notificationsRoutes);
// app.use('/api/web', transactionsRoutes);
// app.use('/api/web', qrVerificationRoutes);
// app.use('/api/web', analytics);
// app.use('/api/web', novaRoutes);
// app.use('/api/web', termPaymentRoutes);
// app.use('/api/web/term-payments', termPaymentRoutes);
// app.use('/api/web/esignature', esignatureRoutes);
// app.use('/api/web/approvals', approvalRoutes);
// app.use('/api/web', filesRoutes);

// WebSocket
initWebSocket(server);
initDashboardBridge();

// Start server
const PORT: number = parseInt(process.env.PORT || '3000', 10);
server.listen(PORT, () => {
  console.log(`NU-Connect server is running on port ${PORT}`);
});
