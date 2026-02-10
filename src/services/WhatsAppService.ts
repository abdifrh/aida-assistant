import prisma from '../database/client';
import { conversationManager } from './ConversationManager';
import { logService } from './LogService';
import { twilioWhatsAppService } from './TwilioWhatsAppService';
import { mediaService } from './MediaService';

/**
 * Service principal pour gérer les messages WhatsApp via Twilio
 * Main service to handle WhatsApp messages via Twilio
 */
export class WhatsAppService {

    /**
     * Handle incoming message from Twilio webhook
     * Gérer le message entrant du webhook Twilio
     */
    async handleIncomingMessage(payload: any, clinicId: string) {
        console.log(`[DEBUG] Twilio payload for clinic ${clinicId}:`, JSON.stringify(payload, null, 2));

        await logService.info('WHATSAPP', 'WEBHOOK_RECEIVED', `Webhook received for clinic ${clinicId}`, {
            clinic_id: clinicId,
            metadata: { from: payload.From, to: payload.To }
        });

        // Extract Twilio fields
        const messageText = payload.Body || '';
        const fromNumber = twilioWhatsAppService.parseWhatsAppNumber(payload.From || '');
        const toNumber = twilioWhatsAppService.parseWhatsAppNumber(payload.To || '');
        const messageSid = payload.MessageSid;
        const numMedia = parseInt(payload.NumMedia || '0');
        const mediaUrl = payload.MediaUrl0;
        const mediaType = payload.MediaContentType0;

        // Allow empty Body if there's media (image/document)
        if (!fromNumber || (!messageText && numMedia === 0)) {
            await logService.error('WHATSAPP', 'INVALID_PAYLOAD', 'Missing From or Body/Media in payload', null, {
                clinic_id: clinicId,
                metadata: { payload }
            });
            return;
        }

        // Find clinic config
        const clinicConfig = await prisma.clinicWhatsAppConfig.findFirst({
            where: {
                clinic_id: clinicId,
                is_active: true
            },
            include: { clinic: true },
        });

        if (!clinicConfig) {
            await logService.error('WHATSAPP', 'CONFIG_NOT_FOUND', `No clinic config found for clinic: ${clinicId}`, null, { clinic_id: clinicId });
            return;
        }

        const logContext = {
            clinic_id: clinicId,
            user_phone: fromNumber,
            metadata: { messageSid, numMedia, hasMedia: numMedia > 0 }
        };

        // De-duplication check
        if (messageSid) {
            const existingMessage = await prisma.message.findFirst({
                where: { wamid: messageSid }
            });

            if (existingMessage) {
                await logService.info('WHATSAPP', 'DUPLICATE_MESSAGE', `Duplicate message detected (sid: ${messageSid}), skipping`, logContext);
                return;
            }
        }

        // Handle media message (image/document)
        let imagePath: string | undefined;
        let effectiveMessage = messageText;

        if (numMedia > 0 && mediaUrl) {
            try {
                // Download and store media from Twilio
                const mediaResult = await mediaService.downloadAndStoreMedia(
                    mediaUrl,
                    clinicId,
                    mediaType || 'image/jpeg'
                );

                if (mediaResult) {
                    imagePath = mediaResult.filePath;
                    await logService.info('WHATSAPP', 'MEDIA_DOWNLOADED',
                        `Media downloaded from Twilio`, { ...logContext, metadata: { ...logContext.metadata, imagePath } });
                }

                // If no text, indicate it's an image
                if (!messageText) {
                    effectiveMessage = '[IMAGE]';
                }
            } catch (error) {
                await logService.error('WHATSAPP', 'MEDIA_DOWNLOAD_FAILED',
                    `Failed to download media from Twilio`, error, logContext);
            }
        }

        await logService.info('WHATSAPP', 'PROCESSING_MESSAGE', `Processing message from ${fromNumber}`, {
            ...logContext,
            message: `User said: ${effectiveMessage}`,
            metadata: { ...logContext.metadata, mediaUrl, mediaType }
        });

        let conversation: any = null;

        try {
            conversation = await conversationManager.getOrCreateConversation(
                clinicId,
                fromNumber,
                fromNumber
            );

            // Process with Sophie/LLM
            const responseMessage = await conversationManager.processMessageWithSophie(
                conversation.id,
                effectiveMessage,
                clinicConfig.clinic?.name || 'Clinique',
                messageSid,
                undefined,  // imageId (not used with Twilio)
                imagePath,  // imagePath (local file path)
                undefined,  // documentId
                undefined   // documentPath
            );

            // Send response via Twilio
            const twilioNumber = clinicConfig.phone_number || process.env.TWILIO_PHONE_NUMBER || '';
            await twilioWhatsAppService.sendMessage(fromNumber, twilioNumber, responseMessage);

        } catch (error) {
            if ((error as any).code === 'P2002') return;

            const errorMessage = "Désolé, une erreur s'est produite. Veuillez réessayer.";

            await logService.error('SYSTEM', 'PROCESSING_ERROR', 'Error processing message', error, logContext);

            if (conversation?.id) {
                try {
                    await prisma.message.create({
                        data: {
                            conversation_id: conversation.id,
                            role: 'assistant',
                            content: errorMessage,
                        }
                    });
                } catch (dbError) {
                    await logService.error('DATABASE', 'MESSAGE_SAVE_FAILED', 'Failed to save error message', dbError, { ...logContext, conversation_id: conversation.id });
                }
            }

            const twilioNumber = clinicConfig.phone_number || process.env.TWILIO_PHONE_NUMBER || '';
            await twilioWhatsAppService.sendMessage(fromNumber, twilioNumber, errorMessage);
        }
    }

    /**
     * Send message via Twilio (legacy compatibility)
     */
    async sendMessage(to: string, content: string, clinicConfig: any, conversationId?: string) {
        const twilioNumber = clinicConfig.phone_number || process.env.TWILIO_PHONE_NUMBER || '';
        return twilioWhatsAppService.sendMessage(to, twilioNumber, content);
    }

    /**
     * Send message by clinic ID
     */
    async sendMessageByClinicId(to: string, content: string, clinicId: string) {
        const config = await prisma.clinicWhatsAppConfig.findFirst({
            where: { clinic_id: clinicId, is_active: true },
        });

        if (!config) {
            throw new Error(`No active WhatsApp config found for clinic ${clinicId}`);
        }

        const twilioNumber = config.phone_number || process.env.TWILIO_PHONE_NUMBER || '';
        return twilioWhatsAppService.sendMessage(to, twilioNumber, content);
    }
}

export const whatsAppService = new WhatsAppService();
