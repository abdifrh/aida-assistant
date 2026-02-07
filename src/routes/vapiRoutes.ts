import express from 'express';
import { vapiController } from '../controllers/VapiController';

const router = express.Router();

/**
 * Vapi webhook endpoint - receives all events from Vapi
 * This endpoint must be publicly accessible (use ngrok for development)
 */
router.post('/webhook', (req, res) => vapiController.handleVapiWebhook(req, res));

/**
 * Get Vapi assistant configuration for a specific clinic
 * Use this to create/update your Vapi assistant via their API
 */
router.get('/assistant-config/:clinicId', (req, res) => vapiController.getAssistantConfig(req, res));

export default router;
