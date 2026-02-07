import { Router } from 'express';
import { oauthController } from '../controllers/OAuthController';

const router = Router();

// Route to start the OAuth flow for a specific practitioner
// Route pour démarrer le flux OAuth pour un praticien spécifique
// Query params: practitionerId, clinicId
router.get('/authorize', (req, res) => oauthController.authorize(req, res));

// URL registered in Google Cloud Console as Redirect URI
// URL enregistrée dans la console Google Cloud comme URI de redirection
router.get('/callback', (req, res) => oauthController.callback(req, res));

export default router;
