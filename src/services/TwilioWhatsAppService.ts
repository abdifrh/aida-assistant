import twilio from 'twilio';
import { logService } from './LogService';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

/**
 * Service pour gérer WhatsApp via Twilio
 * Remplace WhatsAppService (Meta Business API)
 */
export class TwilioWhatsAppService {
    private client: twilio.Twilio;
    private accountSid: string;
    private authToken: string;

    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';

        if (!this.accountSid || !this.authToken) {
            console.error('[TWILIO] Missing credentials. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env');
        }

        this.client = twilio(this.accountSid, this.authToken);
    }

    /**
     * Envoyer un message WhatsApp via Twilio
     * @param to - Numéro destinataire (format: +41767891234)
     * @param from - Numéro émetteur / clinique (format: +41223456789)
     * @param message - Texte du message
     * @param mediaUrl - URL du media à envoyer (optionnel)
     */
    async sendMessage(
        to: string,
        from: string,
        message: string,
        mediaUrl?: string
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            // Formater les numéros au format WhatsApp
            const formattedTo = this.formatWhatsAppNumber(to);
            const formattedFrom = this.formatWhatsAppNumber(from);

            await logService.info('TWILIO', 'SENDING_MESSAGE', 'Sending WhatsApp message via Twilio', {
                metadata: { to: formattedTo, from: formattedFrom, messageLength: message.length, hasMedia: !!mediaUrl }
            });

            const messageData: any = {
                from: formattedFrom,
                to: formattedTo,
                body: message
            };

            // Ajouter media si fourni
            if (mediaUrl) {
                messageData.mediaUrl = [mediaUrl];
            }

            const twilioMessage = await this.client.messages.create(messageData);

            await logService.info('TWILIO', 'MESSAGE_SENT', 'Message sent successfully', {
                metadata: { messageId: twilioMessage.sid, status: twilioMessage.status }
            });

            return {
                success: true,
                messageId: twilioMessage.sid
            };

        } catch (error: any) {
            await logService.error('TWILIO', 'SEND_ERROR', 'Failed to send message', error, {
                metadata: { to, from, errorMessage: error.message }
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Télécharger un media depuis Twilio
     * @param mediaUrl - URL du media fournie par Twilio
     * @param outputPath - Chemin local où sauvegarder le fichier
     */
    async downloadMedia(mediaUrl: string, outputPath: string): Promise<{ success: boolean; path?: string; error?: string }> {
        try {
            await logService.info('TWILIO', 'DOWNLOADING_MEDIA', 'Downloading media from Twilio', {
                metadata: { mediaUrl }
            });

            // Télécharger avec authentification Twilio
            const response = await axios({
                method: 'GET',
                url: mediaUrl,
                auth: {
                    username: this.accountSid,
                    password: this.authToken
                },
                responseType: 'stream'
            });

            // Créer le répertoire si nécessaire
            const directory = path.dirname(outputPath);
            if (!fs.existsSync(directory)) {
                fs.mkdirSync(directory, { recursive: true });
            }

            // Sauvegarder le fichier
            const writer = fs.createWriteStream(outputPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    logService.info('TWILIO', 'MEDIA_DOWNLOADED', 'Media downloaded successfully', {
                        metadata: { path: outputPath }
                    });
                    resolve({ success: true, path: outputPath });
                });

                writer.on('error', (error) => {
                    logService.error('TWILIO', 'DOWNLOAD_ERROR', 'Failed to download media', error);
                    reject({ success: false, error: error.message });
                });
            });

        } catch (error: any) {
            await logService.error('TWILIO', 'DOWNLOAD_ERROR', 'Failed to download media', error, {
                metadata: { mediaUrl, errorMessage: error.message }
            });

            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Valider la signature du webhook Twilio (sécurité)
     * @param signature - Signature X-Twilio-Signature du header
     * @param url - URL complète du webhook
     * @param params - Paramètres POST reçus
     */
    validateWebhookSignature(signature: string, url: string, params: any): boolean {
        try {
            logService.debug('TWILIO', 'VALIDATING_SIGNATURE', 'Validating webhook signature', {
                metadata: {
                    url,
                    signature,
                    paramKeys: Object.keys(params),
                    params: JSON.stringify(params)
                }
            });

            const isValid = twilio.validateRequest(
                this.authToken,
                signature,
                url,
                params
            );

            logService.debug('TWILIO', 'VALIDATION_RESULT', `Signature validation: ${isValid ? 'VALID' : 'INVALID'}`);

            return isValid;
        } catch (error: any) {
            logService.error('TWILIO', 'VALIDATION_ERROR', 'Failed to validate webhook signature', error);
            return false;
        }
    }

    /**
     * Formater un numéro au format WhatsApp Twilio
     * @param phoneNumber - Numéro au format +41767891234 ou 0767891234
     */
    private formatWhatsAppNumber(phoneNumber: string): string {
        // Enlever espaces et tirets
        let cleaned = phoneNumber.replace(/[\s\-]/g, '');

        // Ajouter le préfixe whatsapp: si absent
        if (!cleaned.startsWith('whatsapp:')) {
            cleaned = `whatsapp:${cleaned}`;
        }

        // S'assurer que le numéro commence par +
        if (!cleaned.includes('+')) {
            cleaned = cleaned.replace('whatsapp:', 'whatsapp:+');
        }

        return cleaned;
    }

    /**
     * Parser un numéro WhatsApp Twilio vers format standard
     * @param twilioNumber - Numéro au format whatsapp:+41767891234
     */
    parseWhatsAppNumber(twilioNumber: string): string {
        return twilioNumber.replace('whatsapp:', '');
    }

    /**
     * Obtenir les détails d'un message
     * @param messageSid - SID du message Twilio
     */
    async getMessageStatus(messageSid: string): Promise<any> {
        try {
            const message = await this.client.messages(messageSid).fetch();
            return {
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateSent: message.dateSent,
                dateUpdated: message.dateUpdated
            };
        } catch (error: any) {
            await logService.error('TWILIO', 'FETCH_MESSAGE_ERROR', 'Failed to fetch message status', error);
            return null;
        }
    }

    /**
     * Envoyer un message template WhatsApp
     * Note: Les templates WhatsApp doivent être créés dans Twilio Console
     * @param to - Numéro destinataire
     * @param from - Numéro émetteur
     * @param contentSid - SID du template WhatsApp
     * @param contentVariables - Variables du template
     */
    async sendTemplate(
        to: string,
        from: string,
        contentSid: string,
        contentVariables?: Record<string, string>
    ): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            const formattedTo = this.formatWhatsAppNumber(to);
            const formattedFrom = this.formatWhatsAppNumber(from);

            const messageData: any = {
                from: formattedFrom,
                to: formattedTo,
                contentSid: contentSid
            };

            if (contentVariables) {
                messageData.contentVariables = JSON.stringify(contentVariables);
            }

            const twilioMessage = await this.client.messages.create(messageData);

            await logService.info('TWILIO', 'TEMPLATE_SENT', 'Template sent successfully', {
                metadata: { messageId: twilioMessage.sid, contentSid }
            });

            return {
                success: true,
                messageId: twilioMessage.sid
            };

        } catch (error: any) {
            await logService.error('TWILIO', 'TEMPLATE_ERROR', 'Failed to send template', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Vérifier si le service Twilio est configuré
     */
    isConfigured(): boolean {
        return !!(this.accountSid && this.authToken);
    }
}

// Export singleton
export const twilioWhatsAppService = new TwilioWhatsAppService();
