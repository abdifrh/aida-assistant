import { Router } from 'express';
import { whatsAppController } from '../controllers/WhatsAppController';

const router = Router();

router.get('/:clinicId', (req, res) => whatsAppController.verifyWebhook(req, res));
router.post('/:clinicId', (req, res) => whatsAppController.handleWebhook(req, res));

export default router;
