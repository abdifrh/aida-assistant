import express from 'express';
import { SuperAdminController } from '../controllers/SuperAdminController';
import { authenticateToken, requireSuperAdmin, authenticateTokenFromQueryOrHeader } from '../middleware/auth';

const router = express.Router();
const superAdminController = new SuperAdminController();

// Public login
router.post('/login', (req, res) => superAdminController.login(req, res));

// Images endpoint - accepts token in query parameter or header
// Endpoint d'images - accepte le token dans les paramètres de requête ou le header
router.get('/images/:clinicId/:filename',
    authenticateTokenFromQueryOrHeader,
    requireSuperAdmin,
    (req, res) => superAdminController.serveImage(req, res));

// Apply authentication and superadmin check to all other routes
router.use(authenticateToken, requireSuperAdmin);

router.get('/stats', (req, res) => superAdminController.getGlobalStats(req, res));
router.get('/stats/detailed', (req, res) => superAdminController.getDetailedStats(req, res));
router.get('/practitioners', (req, res) => superAdminController.getAllPractitioners(req, res));
router.get('/practitioners/:practitionerId', (req, res) => superAdminController.getPractitionerDetails(req, res));
router.get('/logs', (req, res) => superAdminController.getAllLogs(req, res));
router.get('/conversations', (req, res) => superAdminController.getAllConversations(req, res));
router.get('/conversations/:conversationId', (req, res) => superAdminController.getConversation(req, res));
router.post('/conversations/:conversationId/analysis', (req, res) => superAdminController.getConversationAnalysis(req, res));
router.get('/conversations/:conversationId/analysis/history', (req, res) => superAdminController.getConversationAnalysisHistory(req, res));

router.get('/analyses', (req, res) => superAdminController.getAllAnalyses(req, res));

router.get('/patients', (req, res) => superAdminController.getAllPatients(req, res));
router.get('/clinics', (req, res) => superAdminController.getAllClinics(req, res));
router.get('/clinics/:clinicId', (req, res) => superAdminController.getClinicDetails(req, res));
router.get('/appointments', (req, res) => superAdminController.getAllAppointments(req, res));
router.put('/clinics/:clinicId', (req, res) => superAdminController.updateClinic(req, res));
router.put('/practitioners/:practitionerId', (req, res) => superAdminController.updatePractitioner(req, res));

export default router;
