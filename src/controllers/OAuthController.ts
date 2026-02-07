import { Request, Response } from 'express';
import { google } from 'googleapis';
import prisma from '../database/client';
import { config } from '../config';

export class OAuthController {
    private getOAuth2Client() {
        return new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.redirectUri
        );
    }

    /**
     * Start OAuth flow for a practitioner
     * Démarrer le flux OAuth pour un praticien
     * 
     * GET /oauth/authorize?practitionerId=...
     */
    async authorize(req: Request, res: Response) {
        const { practitionerId } = req.query;

        if (!practitionerId || typeof practitionerId !== 'string') {
            return res.status(400).send('practitionerId is required');
        }

        // Verify practitioner exists
        const practitioner = await prisma.practitioner.findUnique({
            where: { id: practitionerId }
        });

        if (!practitioner) {
            return res.status(404).send('Practitioner not found');
        }

        const oauth2Client = this.getOAuth2Client();

        // Scopes for Google Calendar
        const scopes = [
            'https://www.googleapis.com/auth/calendar.events',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.freebusy'
        ];

        // Generate URL
        const url = oauth2Client.generateAuthUrl({
            access_type: 'offline', // Get refresh token
            scope: scopes,
            state: practitionerId, // Pass practitionerId in state to retrieve it in callback
            prompt: 'consent' // Force consent to ensure we get a refresh token
        });

        res.redirect(url);
    }

    /**
     * Handle OAuth callback from Google
     * Gérer le rappel OAuth de Google
     * 
     * GET /oauth/callback?code=...&state=practitionerId
     */
    async callback(req: Request, res: Response) {
        const { code, state: practitionerId } = req.query;

        if (!code || typeof code !== 'string' || !practitionerId || typeof practitionerId !== 'string') {
            return res.status(400).send('Invalid callback parameters');
        }

        try {
            const oauth2Client = this.getOAuth2Client();
            const { tokens } = await oauth2Client.getToken(code);

            if (!tokens.access_token || !tokens.refresh_token) {
                throw new Error('Failed to retrieve access or refresh tokens');
            }

            // Save or update integration in database
            // Sauvegarder ou mettre à jour l'intégration dans la base de données

            // For the purpose of this demo/MVP, we use the primary calendar or we could fetch the list
            // Pour ce MVP, on utilise l'ID du praticien ou 'primary'
            const practitioner = await prisma.practitioner.findUnique({
                where: { id: practitionerId }
            });

            if (!practitioner) throw new Error('Practitioner not found');

            await prisma.practitionerCalendarIntegration.upsert({
                where: { practitioner_id: practitionerId },
                update: {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    calendar_id: practitioner.google_calendar_id || 'primary',
                    is_active: true
                },
                create: {
                    practitioner_id: practitionerId,
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    calendar_id: practitioner.google_calendar_id || 'primary',
                    provider: 'google'
                }
            });

            res.send('<h1>Connexion réussie !</h1><p>Votre calendrier Google est maintenant lié à l\'assistant médical. Vous pouvez fermer cette fenêtre.</p>');
        } catch (error) {
            console.error('OAuth Callback Error:', error);
            res.status(500).send('Authentication failed');
        }
    }
}

export const oauthController = new OAuthController();
