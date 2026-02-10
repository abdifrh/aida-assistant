import { Request, Response } from 'express';
import { whatsAppService } from '../services/WhatsAppService';
import prisma from '../database/client';

export class WhatsAppController {
    // Verify Webhook
    // Vérifier le Webhook
    async verifyWebhook(req: Request, res: Response) {
        const { clinicId } = req.params;
        const mode = req.query['hub.mode'];
        const token = req.query['hub.verify_token'];
        const challenge = req.query['hub.challenge'];

        if (mode === 'subscribe' && token) {
            // Find clinic config by clinicId AND verify token
            // Trouver la configuration de la clinique par ID et jeton de vérification
            const config = await prisma.clinicWhatsAppConfig.findFirst({
                where: {
                    clinic_id: clinicId as string,
                    verify_token: token as string,
                    is_active: true
                }
            });

            if (config) {
                console.log(`WEBHOOK_VERIFIED for clinic: ${clinicId}`);
                res.status(200).send(challenge);
            } else {
                console.log(`WEBHOOK_VERIFICATION_FAILED for clinic: ${clinicId} - Invalid token or ID`);
                res.sendStatus(403);
            }
        } else {
            res.sendStatus(400);
        }
    }

    // Handle Webhook Event
    // Gérer l'événement Webhook
    async handleWebhook(req: Request, res: Response) {
        const { clinicId } = req.params;
        const signature = req.headers['x-hub-signature-256'] as string;

        console.log(`[DEBUG] Webhook POST received for clinicId: ${clinicId}`);
        console.log(`[DEBUG] Headers:`, JSON.stringify(req.headers));

        try {
            // Find clinic config to get webhook_secret
            const config = await prisma.clinicWhatsAppConfig.findFirst({
                where: {
                    clinic_id: clinicId as string,
                    is_active: true
                }
            });

            // Security check: Verify signature if webhook_secret is configured
            if (config?.webhook_secret) {
                if (!signature) {
                    console.error(`[SECURITY] Rejected unsigned webhook for clinic ${clinicId}`);
                    return res.sendStatus(403);
                }

                const crypto = await import('crypto');
                const hmac = crypto.createHmac('sha256', config.webhook_secret);
                const rawBody = (req as any).rawBody;

                // If rawBody is missing, we use JSON.stringify as fallback (less reliable)
                const bodyToVerify = rawBody || JSON.stringify(req.body);
                const digest = 'sha256=' + hmac.update(bodyToVerify).digest('hex');

                if (signature !== digest) {
                    console.error(`[SECURITY] Invalid signature for clinic ${clinicId}. Expected ${digest} but got ${signature}`);
                    return res.sendStatus(403);
                }
            }

            // Respond immediately to Twilio with empty response (no "OK" text)
            res.status(200).send('');

            // Process message in background
            await whatsAppService.handleIncomingMessage(req.body, clinicId as string);
        } catch (error) {
            console.error(`Error handling webhook for clinic ${clinicId}:`, error);
            // If we haven't sent a response yet, send empty 200
            if (!res.headersSent) res.status(200).send('');
        }
    }
}

export const whatsAppController = new WhatsAppController();
