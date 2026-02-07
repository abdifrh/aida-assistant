import { Router } from 'express';
import { twilioWhatsAppService } from '../services/TwilioWhatsAppService';
import { conversationManager } from '../services/ConversationManager';
import { logService } from '../services/LogService';
import prisma from '../database/client';
import path from 'path';

const router = Router();

/**
 * Webhook principal Twilio WhatsApp
 * Route: POST /webhook/twilio/whatsapp
 *
 * Gère TOUS les messages WhatsApp de TOUTES les cliniques
 * La clinique est identifiée via le numéro "To"
 */
router.post('/whatsapp', async (req, res) => {
    try {
        // Log all parameters received for debugging
        await logService.debug('TWILIO', 'WEBHOOK_PARAMS', 'Full webhook parameters', {
            metadata: {
                body: req.body,
                headers: req.headers
            }
        });

        const {
            From,           // whatsapp:+41767891234 (patient)
            To,             // whatsapp:+41223456789 (clinique)
            Body,           // Texte du message
            MessageSid,     // Identifiant unique du message
            NumMedia,       // Nombre de media attachés
            MediaUrl0,      // URL du premier media
            MediaContentType0, // Type MIME du media
            WaId            // WhatsApp ID (numéro sans le préfixe whatsapp:)
        } = req.body;

        await logService.info('TWILIO', 'WEBHOOK_RECEIVED', 'Received WhatsApp message', {
            metadata: {
                from: From,
                to: To,
                messageSid: MessageSid,
                hasMedia: NumMedia > 0,
                bodyParamCount: Object.keys(req.body).length
            }
        });

        // Valider la signature Twilio (sécurité)
        // Skip validation in development if SKIP_TWILIO_SIGNATURE_VALIDATION is set
        const skipValidation = process.env.SKIP_TWILIO_SIGNATURE_VALIDATION === 'true';

        if (!skipValidation) {
            const signature = req.headers['x-twilio-signature'] as string;

            // Use X-Forwarded-Proto for correct protocol detection with ngrok/reverse proxies
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.get('host');
            const url = `${protocol}://${host}${req.originalUrl}`;

            if (!twilioWhatsAppService.validateWebhookSignature(signature, url, req.body)) {
                await logService.warn('TWILIO', 'INVALID_SIGNATURE', 'Invalid webhook signature', {
                    metadata: {
                        from: From,
                        to: To,
                        expectedUrl: url,
                        protocol: req.protocol,
                        forwardedProto: req.headers['x-forwarded-proto'],
                        signature: signature
                    }
                });
                return res.status(403).send('Invalid signature');
            }

            await logService.info('TWILIO', 'SIGNATURE_VALID', 'Webhook signature validated successfully');
        } else {
            await logService.warn('TWILIO', 'SIGNATURE_VALIDATION_SKIPPED', 'Signature validation is disabled (development mode)');
        }

        // Parser les numéros (enlever le préfixe whatsapp:)
        const patientPhone = twilioWhatsAppService.parseWhatsAppNumber(From);
        const clinicPhone = twilioWhatsAppService.parseWhatsAppNumber(To);

        // Trouver la clinique via son numéro WhatsApp dans clinic_whatsapp_configs
        const whatsappConfig = await prisma.clinicWhatsAppConfig.findFirst({
            where: {
                phone_number: clinicPhone,
                is_active: true
            },
            include: {
                clinic: true
            }
        });

        if (!whatsappConfig || !whatsappConfig.clinic) {
            await logService.error('TWILIO', 'CLINIC_NOT_FOUND', `No clinic found for WhatsApp number ${clinicPhone}`, {
                metadata: { searchedNumber: clinicPhone }
            });
            return res.status(404).send('Clinic not found');
        }

        const clinic = whatsappConfig.clinic;

        await logService.info('TWILIO', 'CLINIC_IDENTIFIED', `Message for clinic: ${clinic.name}`, {
            metadata: { clinicId: clinic.id, clinicName: clinic.name }
        });

        // Gérer les media (images, PDF, etc.)
        let mediaPath: string | undefined;

        if (NumMedia && parseInt(NumMedia) > 0 && MediaUrl0 && clinic) {
            try {
                const mediaType = MediaContentType0 || 'application/octet-stream';
                const extension = getExtensionFromMimeType(mediaType);
                const filename = `${MessageSid}${extension}`;
                const uploadDir = path.join(process.cwd(), 'uploads', 'whatsapp', clinic.id);
                mediaPath = path.join(uploadDir, filename);

                // Télécharger le media depuis Twilio
                const downloadResult = await twilioWhatsAppService.downloadMedia(MediaUrl0, mediaPath);

                if (!downloadResult.success) {
                    await logService.error('TWILIO', 'MEDIA_DOWNLOAD_FAILED', 'Failed to download media', {
                        metadata: { mediaUrl: MediaUrl0, error: downloadResult.error }
                    });
                    mediaPath = undefined;
                } else {
                    await logService.info('TWILIO', 'MEDIA_DOWNLOADED', 'Media downloaded successfully', {
                        metadata: { path: mediaPath, type: mediaType }
                    });
                }
            } catch (error: any) {
                await logService.error('TWILIO', 'MEDIA_PROCESSING_ERROR', 'Error processing media', error);
                mediaPath = undefined;
            }
        }

        // Get or create conversation
        // Obtenir ou créer la conversation
        const conversation = await conversationManager.getOrCreateConversation(
            clinic.id,
            WaId || patientPhone.replace('+', ''),
            patientPhone
        );

        await logService.info('TWILIO', 'CONVERSATION_READY', `Conversation ${conversation.id} ready`, {
            metadata: { conversationId: conversation.id, waId: WaId, userPhone: patientPhone }
        });

        // Traiter le message via ConversationManager
        const response = await conversationManager.processMessageWithSophie(
            conversation.id,
            Body || '',
            clinic.name || 'Clinic',
            MessageSid,
            undefined,
            mediaPath
        );

        // Envoyer la réponse via Twilio
        if (response) {
            const sendResult = await twilioWhatsAppService.sendMessage(
                patientPhone,
                clinicPhone,
                response
            );

            if (!sendResult.success) {
                await logService.error('TWILIO', 'SEND_RESPONSE_FAILED', 'Failed to send response', {
                    metadata: { error: sendResult.error }
                });
            }
        }

        // Twilio attend une réponse 200 (même vide)
        res.status(200).send('OK');

    } catch (error: any) {
        await logService.error('TWILIO', 'WEBHOOK_ERROR', 'Error processing Twilio webhook', error, {
            metadata: { body: req.body }
        });
        res.status(500).send('Internal Server Error');
    }
});

/**
 * Webhook pour les statuts de message (delivery, read, failed, etc.)
 * Route: POST /webhook/twilio/whatsapp/status
 */
router.post('/whatsapp/status', async (req, res) => {
    try {
        const {
            MessageSid,
            MessageStatus,  // sent, delivered, read, failed, undelivered
            ErrorCode,
            ErrorMessage
        } = req.body;

        await logService.info('TWILIO', 'STATUS_UPDATE', `Message ${MessageSid} status: ${MessageStatus}`, {
            metadata: { messageSid: MessageSid, status: MessageStatus, errorCode: ErrorCode, errorMessage: ErrorMessage }
        });

        // Vous pouvez mettre à jour la BDD ici si vous stockez les messages
        // await prisma.message.update({
        //     where: { twilio_sid: MessageSid },
        //     data: { status: MessageStatus, error: ErrorMessage }
        // });

        res.status(200).send('OK');

    } catch (error: any) {
        await logService.error('TWILIO', 'STATUS_WEBHOOK_ERROR', 'Error processing status webhook', error);
        res.status(500).send('Internal Server Error');
    }
});

/**
 * Helper: Obtenir l'extension de fichier depuis le type MIME
 */
function getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'application/pdf': '.pdf',
        'video/mp4': '.mp4',
        'audio/mpeg': '.mp3',
        'audio/ogg': '.ogg',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/msword': '.doc'
    };

    return mimeMap[mimeType] || '.bin';
}

export default router;
