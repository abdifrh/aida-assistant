import express from 'express';
import { AdminController } from '../controllers/AdminController';
import { authenticateToken, validateClinicAccess, authenticateTokenFromQueryOrHeader } from '../middleware/auth';

const router = express.Router();
const adminController = new AdminController();

// Clinic-specific routes - format: /clinic/:clinicId/admin/*
// Public login route (still needs clinic ID)
router.post('/clinic/:clinicId/admin/login', (req, res) => adminController.login(req, res));

// Images endpoint - accepts token in query parameter or header
// Endpoint d'images - accepte le token dans les paramètres de requête ou le header
router.get('/clinic/:clinicId/admin/images/:filename',
    authenticateTokenFromQueryOrHeader,
    validateClinicAccess,
    (req, res) => adminController.serveImage(req, res));

// Protected routes - require authentication AND clinic access validation
router.use('/clinic/:clinicId/admin', authenticateToken, validateClinicAccess);

// Dashboard
router.get('/clinic/:clinicId/admin/dashboard/stats', (req, res) => adminController.getDashboardStats(req, res));

// Conversations
router.get('/clinic/:clinicId/admin/conversations', (req, res) => adminController.getConversations(req, res));
router.get('/clinic/:clinicId/admin/conversations/:conversationId', (req, res) => adminController.getConversationDetails(req, res));

// Practitioners
router.get('/clinic/:clinicId/admin/practitioners', (req, res) => adminController.getPractitioners(req, res));
router.get('/clinic/:clinicId/admin/practitioners/:practitionerId', (req, res) => adminController.getPractitionerDetails(req, res));
router.post('/clinic/:clinicId/admin/practitioners', (req, res) => adminController.createPractitioner(req, res));
router.put('/clinic/:clinicId/admin/practitioners/:practitionerId', (req, res) => adminController.updatePractitioner(req, res));
router.put('/clinic/:clinicId/admin/practitioners/:practitionerId/calendar', (req, res) => adminController.updateCalendarIntegration(req, res));

// Patients
router.get('/clinic/:clinicId/admin/patients', (req, res) => adminController.getPatients(req, res));

// Appointments
// Appointments
router.get('/clinic/:clinicId/admin/appointments', (req, res) => adminController.getAppointments(req, res));

// System Logs
router.get('/clinic/:clinicId/admin/logs', (req, res) => adminController.getSystemLogs(req, res));

// Clinic Settings
router.get('/clinic/:clinicId/admin/settings', (req, res) => adminController.getClinicDetails(req, res));
router.put('/clinic/:clinicId/admin/settings', (req, res) => adminController.updateClinicDetails(req, res));

// Treatment Types
router.get('/clinic/:clinicId/admin/treatments', (req, res) => adminController.getTreatmentTypes(req, res));
router.post('/clinic/:clinicId/admin/treatments', (req, res) => adminController.createTreatmentType(req, res));
router.put('/clinic/:clinicId/admin/treatments/:treatmentId', (req, res) => adminController.updateTreatmentType(req, res));
router.delete('/clinic/:clinicId/admin/treatments/:treatmentId', (req, res) => adminController.deleteTreatmentType(req, res));

// Practitioner-Treatment links
router.get('/clinic/:clinicId/admin/practitioners/:practitionerId/treatments', (req, res) => adminController.getPractitionerTreatments(req, res));
router.put('/clinic/:clinicId/admin/practitioners/:practitionerId/treatments', (req, res) => adminController.updatePractitionerTreatments(req, res));

export default router;
