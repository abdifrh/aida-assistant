import prisma from '../database/client';
import axios from 'axios';
import { conversationManager } from './ConversationManager';
import { logService } from './LogService';
import { mediaService } from './MediaService';

export class WhatsAppService {
    // Handle incoming message
    // Gérer le message entrant
    async handleIncomingMessage(payload: any, clinicId: string) {
        // console.log(`Received payload for clinic ${clinicId}:`, JSON.stringify(payload, null, 2));

        // Log minimal info about reception
        // Enregistrer une info minimale sur la réception
        await logService.info('WHATSAPP', 'WEBHOOK_RECEIVED', `Webhook received for clinic ${clinicId}`, {
            clinic_id: clinicId,
            metadata: { payload_summary: { object: payload.object, entries: payload.entry?.length } }
        });

        // Extract phone number ID and identify clinic
        // Extraire l'ID du numéro de téléphone et identifier la clinique
        const entry = payload.entry?.[0];
        const changes = entry?.changes?.[0];
        const value = changes?.value;

        if (!value) return;

        const phoneNumberId = value.metadata?.phone_number_id;

        if (!phoneNumberId) {
            await logService.error('WHATSAPP', 'MISSING_PHONE_ID', 'No phone number ID found in payload', null, { clinic_id: clinicId, metadata: { payload } });
            return;
        }

        // Find clinic config by ID and phone number
        // Trouver la configuration de la clinique par ID et numéro de téléphone
        const clinicConfig = await prisma.clinicWhatsAppConfig.findFirst({
            where: {
                clinic_id: clinicId,
                phone_number: phoneNumberId,
                is_active: true
            },
            include: { clinic: true },
        });

        if (!clinicConfig) {
            await logService.error('WHATSAPP', 'CONFIG_NOT_FOUND', `No clinic found for phone number ID: ${phoneNumberId}`, null, { clinic_id: clinicId });
            return;
        }

        // Process messages
        // Traiter les messages
        if (value.messages) {
            for (const message of value.messages) {
                await this.processMessage(message, clinicConfig);
            }
        }
    }

    // Process individual message
    // Traiter un message individuel
    private async processMessage(message: any, clinicConfig: any) {
        const userPhone = message.from;
        const waId = message.from; // WhatsApp ID
        const messageText = message.text?.body ||
                          (message.type === 'image' ? '[IMAGE]' : null) ||
                          (message.type === 'document' ? '[DOCUMENT]' : null);
        const wamid = message.id;
        const imageId = message.image?.id;
        const documentId = message.document?.id;

        const logContext = {
            clinic_id: clinicConfig.clinic_id,
            user_phone: userPhone,
            metadata: { wamid, message_type: message.type, image_id: imageId, document_id: documentId }
        };

        if (!messageText && message.type !== 'image' && message.type !== 'document') {
            await logService.warn('WHATSAPP', 'UNSUPPORTED_MESSAGE_TYPE', `Message type ${message.type} received, skipping`, logContext);
            return;
        }

        // De-duplication check
        if (wamid) {
            const existingMessage = await prisma.message.findUnique({
                where: { wamid }
            });

            if (existingMessage) {
                await logService.info('WHATSAPP', 'DUPLICATE_MESSAGE', `Duplicate message detected (wamid: ${wamid}), skipping`, logContext);
                return;
            }
        }

        // Timestamp check
        const msgTimestamp = parseInt(message.timestamp);
        const nowTimestamp = Math.floor(Date.now() / 1000);
        if (nowTimestamp - msgTimestamp > 300) {
            await logService.warn('SECURITY', 'OLD_MESSAGE', `Ignoring old message from ${userPhone}`, logContext);
            return;
        }

        await logService.info('WHATSAPP', 'PROCESSING_MESSAGE', `Processing message from ${userPhone}`, {
            ...logContext,
            message: message.type === 'image' ? 'User sent an image' : `User said: ${messageText}`
        });

        // Declare conversation outside try block for error handling
        let conversation: any = null;

        try {
            conversation = await conversationManager.getOrCreateConversation(
                clinicConfig.clinic_id,
                waId,
                userPhone
            );

            // Pass resolved conversation ID to logs
            const contextWithConv = { ...logContext, conversation_id: conversation.id };

            // Download image if present
            // Télécharger l'image si présente
            let imagePath: string | undefined;
            if (imageId) {
                try {
                    const mediaResult = await mediaService.downloadAndStoreMedia(
                        imageId,
                        clinicConfig.clinic_id,
                        clinicConfig.access_token,
                        clinicConfig.api_version
                    );

                    if (mediaResult) {
                        imagePath = mediaResult.filePath;
                        await logService.info('WHATSAPP', 'MEDIA_DOWNLOADED',
                            `Image downloaded: ${imageId}`, contextWithConv);
                    }
                } catch (error) {
                    await logService.error('WHATSAPP', 'MEDIA_DOWNLOAD_FAILED',
                        `Failed to download: ${imageId}`, error, contextWithConv);
                    // Continue processing - don't fail message handling
                }
            }

            // Download document if present (PDF, etc.)
            // Télécharger le document si présent (PDF, etc.)
            let documentPath: string | undefined;
            if (documentId) {
                try {
                    const docResult = await mediaService.downloadAndStoreDocument(
                        documentId,
                        clinicConfig.clinic_id,
                        clinicConfig.access_token,
                        clinicConfig.api_version
                    );

                    if (docResult) {
                        documentPath = docResult.filePath;
                        await logService.info('WHATSAPP', 'DOCUMENT_DOWNLOADED',
                            `Document downloaded: ${documentId}`, contextWithConv);
                    }
                } catch (error) {
                    await logService.error('WHATSAPP', 'DOCUMENT_DOWNLOAD_FAILED',
                        `Failed to download document: ${documentId}`, error, contextWithConv);
                    // Continue processing - don't fail message handling
                }
            }

            const responseMessage = await conversationManager.processMessageWithSophie(
                conversation.id,
                messageText || '',
                clinicConfig.clinic.name,
                wamid,
                imageId,
                imagePath,
                documentId,
                documentPath
            );

            await this.sendMessage(userPhone, responseMessage, clinicConfig, conversation.id);
        } catch (error) {
            if ((error as any).code === 'P2002') return;

            const errorMessage = "Désolé, une erreur s'est produite.";

            await logService.error('SYSTEM', 'PROCESSING_ERROR', 'Error processing message', error, logContext);

            // Save error message to database before sending (only if conversation exists)
            if (conversation && conversation.id) {
                try {
                    await prisma.message.create({
                        data: {
                            conversation_id: conversation.id,
                            role: 'assistant',
                            content: errorMessage,
                        }
                    });
                } catch (dbError) {
                    // If we can't save, at least log it
                    await logService.error('DATABASE', 'MESSAGE_SAVE_FAILED',
                        'Failed to save error message to database', dbError, { ...logContext, conversation_id: conversation.id });
                }
            }

            await this.sendMessage(userPhone, errorMessage, clinicConfig, conversation?.id);
        }
    }

    // Send message via WhatsApp Business API
    // Envoyer un message via l'API WhatsApp Business
    async sendMessage(to: string, content: string, clinicConfig: any, conversationId?: string) {
        const logContext = {
            clinic_id: clinicConfig.clinic_id,
            conversation_id: conversationId,
            user_phone: to,
            metadata: { content_preview: content.substring(0, 50) + "..." }
        };

        try {
            const url = `https://graph.facebook.com/${clinicConfig.api_version}/${clinicConfig.phone_number}/messages`;

            const response = await axios.post(
                url,
                {
                    messaging_product: 'whatsapp',
                    to: to,
                    type: 'text',
                    text: {
                        body: content,
                    },
                },
                {
                    headers: {
                        Authorization: `Bearer ${clinicConfig.access_token}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            await logService.info('WHATSAPP', 'MESSAGE_SENT', `Message sent to ${to}`, {
                ...logContext,
                message: content, // Log full content in message field usually, or just metadata
                metadata: { ...logContext.metadata, wa_response: response.data }
            });

            return response.data;
        } catch (error) {
            await logService.error('WHATSAPP', 'SEND_ERROR', `Error sending message to ${to}`, error, {
                ...logContext,
                metadata: { ...logContext.metadata, api_error: axios.isAxiosError(error) ? error.response?.data : null }
            });
            throw error;
        }
    }

    // Send message by clinic ID (helper method)
    // Envoyer un message par ID de clinique (méthode auxiliaire)
    async sendMessageByClinicId(to: string, content: string, clinicId: string) {
        const config = await prisma.clinicWhatsAppConfig.findFirst({
            where: {
                clinic_id: clinicId,
                is_active: true
            },
        });

        if (!config) {
            await logService.error('SYSTEM', 'CONFIG_ERROR', `No active WhatsApp config found for clinic ${clinicId}`, null, { clinic_id: clinicId });
            throw new Error(`No active WhatsApp config found for clinic ${clinicId}`);
        }

        return this.sendMessage(to, content, config);
    }
}

export const whatsAppService = new WhatsAppService();
