import express from 'express';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import webhookRoutes from './routes/webhookRoutes';
import twilioWebhookRoutes from './routes/twilioWebhookRoutes';
import oauthRoutes from './routes/oauthRoutes';
import adminRoutes from './routes/adminRoutes';
import superAdminRoutes from './routes/superAdminRoutes';
import vapiRoutes from './routes/vapiRoutes';

const app = express();

// Trust proxy for correct protocol detection with ngrok/reverse proxies
app.set('trust proxy', true);

// Middleware to parse JSON bodies and capture raw body for signature verification
app.use(express.json({
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

// Middleware to parse URL-encoded bodies (for Twilio webhooks)
app.use(express.urlencoded({
    extended: true,
    verify: (req: any, res, buf) => {
        req.rawBody = buf;
    }
}));

// Request Logger for Webhooks
app.use('/webhook', (req, res, next) => {
    console.log(`[NETWORK] Incoming ${req.method} request to ${req.originalUrl}`);
    next();
});

// Middleware to ensure trailing slash on admin route (fixes relative paths)
app.use('/clinic/:clinicId/admin', (req, res, next) => {
    if (req.path === '/' || req.path === '') {
        if (!req.originalUrl.endsWith('/')) {
            return res.redirect(301, req.originalUrl + '/');
        }
    }
    next();
});

// Serve static files for admin dashboard (CSS, JS, etc.)
app.use('/clinic/:clinicId/admin', express.static(path.join(process.cwd(), 'public/admin')));
app.use('/superadmin', express.static(path.join(process.cwd(), 'public/superadmin')));

// Specific route to serve the dashboard index.html at the exact clinic admin path
app.get('/clinic/:clinicId/admin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/admin/index.html'));
});

// Specific route for superadmin dashboard
app.get('/superadmin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public/superadmin/index.html'));
});

// Routes
app.use('/webhook/whatsapp', webhookRoutes);  // WhatsApp Meta Business API (legacy)
app.use('/webhook/twilio', twilioWebhookRoutes);  // Twilio WhatsApp API (nouveau)
app.use('/webhook/vapi', vapiRoutes);
app.use('/oauth', oauthRoutes);
app.use('/api', adminRoutes);
app.use('/api/superadmin', superAdminRoutes);

// Health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Ensure uploads directories exist
// S'assurer que les dossiers uploads existent
const uploadsImagesDir = path.join(process.cwd(), 'uploads', 'images');
if (!fs.existsSync(uploadsImagesDir)) {
    fs.mkdirSync(uploadsImagesDir, { recursive: true });
    console.log('✓ Created uploads/images directory');
}

const uploadsDocumentsDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(uploadsDocumentsDir)) {
    fs.mkdirSync(uploadsDocumentsDir, { recursive: true });
    console.log('✓ Created uploads/documents directory');
}

// Start server
// Démarrer le serveur
app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    console.log(`Serveur en cours d'exécution sur le port ${config.port}`);
});
