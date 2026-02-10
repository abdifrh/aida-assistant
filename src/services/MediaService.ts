import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logService } from './LogService';

/**
 * Service pour gérer les médias via Twilio WhatsApp
 * Media service for Twilio WhatsApp
 */
export class MediaService {
    private accountSid: string;
    private authToken: string;

    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    }

    /**
     * Download and store media from Twilio WhatsApp
     * Télécharger et stocker le média depuis Twilio WhatsApp
     */
    async downloadAndStoreMedia(
        mediaUrl: string,
        clinicId: string,
        mimeType: string = 'image/jpeg'
    ): Promise<{ filePath: string; mimeType: string } | null> {
        try {
            await logService.info('TWILIO', 'MEDIA_DOWNLOAD_START',
                `Downloading media from Twilio`, { clinic_id: clinicId, metadata: { mediaUrl } });

            // Download the file with Twilio authentication
            const fileBuffer = await this.downloadFile(mediaUrl);

            // Save to disk
            const filePath = this.saveFileToDisk(fileBuffer, clinicId, mimeType);

            await logService.info('TWILIO', 'MEDIA_STORED',
                `Media stored successfully`,
                { clinic_id: clinicId, metadata: { file_path: filePath, mime_type: mimeType } });

            return { filePath, mimeType };
        } catch (error) {
            await logService.error('TWILIO', 'MEDIA_DOWNLOAD_ERROR',
                `Error downloading media`, error, { clinic_id: clinicId });
            return null;
        }
    }

    /**
     * Download file from Twilio URL with authentication
     * Télécharger le fichier depuis l'URL Twilio avec authentification
     */
    private async downloadFile(url: string): Promise<Buffer> {
        const response = await axios.get(url, {
            auth: {
                username: this.accountSid,
                password: this.authToken
            },
            responseType: 'arraybuffer',
        });

        return Buffer.from(response.data);
    }

    /**
     * Save file to disk with proper naming
     * Sauvegarder le fichier sur le disque avec un nom approprié
     */
    private saveFileToDisk(
        buffer: Buffer,
        clinicId: string,
        mimeType: string
    ): string {
        // Ensure upload directory exists
        this.ensureUploadDir(clinicId);

        // Get file extension from MIME type
        const extension = this.getExtensionFromMimeType(mimeType);

        // Create filename with timestamp
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const filename = `${timestamp}_${randomId}${extension}`;

        // Full path
        const filePath = path.join(process.cwd(), 'uploads', 'images', clinicId, filename);

        // Write file
        fs.writeFileSync(filePath, buffer);

        return filePath;
    }

    /**
     * Ensure upload directory exists
     * S'assurer que le dossier d'upload existe
     */
    private ensureUploadDir(clinicId: string): void {
        const dir = path.join(process.cwd(), 'uploads', 'images', clinicId);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    /**
     * Get file extension from MIME type
     * Obtenir l'extension depuis le type MIME
     */
    private getExtensionFromMimeType(mimeType: string): string {
        const mimeToExt: { [key: string]: string } = {
            'image/jpeg': '.jpg',
            'image/jpg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'image/gif': '.gif',
            'application/pdf': '.pdf',
            'audio/ogg': '.ogg',
            'audio/mpeg': '.mp3',
            'video/mp4': '.mp4',
        };

        return mimeToExt[mimeType] || '.jpg';
    }

    /**
     * Download and store document (PDF) from Twilio WhatsApp
     * Télécharger et stocker un document (PDF) depuis Twilio WhatsApp
     */
    async downloadAndStoreDocument(
        mediaUrl: string,
        clinicId: string,
        mimeType: string = 'application/pdf'
    ): Promise<{ filePath: string; mimeType: string } | null> {
        try {
            await logService.info('TWILIO', 'DOCUMENT_DOWNLOAD_START',
                `Downloading document from Twilio`, { clinic_id: clinicId });

            // Download the file
            const fileBuffer = await this.downloadFile(mediaUrl);

            // Save to disk in documents folder
            const filePath = this.saveDocumentToDisk(fileBuffer, clinicId, mimeType);

            await logService.info('TWILIO', 'DOCUMENT_STORED',
                `Document stored successfully`,
                { clinic_id: clinicId, metadata: { file_path: filePath, mime_type: mimeType } });

            return { filePath, mimeType };
        } catch (error) {
            await logService.error('TWILIO', 'DOCUMENT_DOWNLOAD_ERROR',
                `Error downloading document`, error, { clinic_id: clinicId });
            return null;
        }
    }

    /**
     * Save document to disk (for PDFs and other documents)
     * Sauvegarder le document sur le disque (pour PDFs et autres documents)
     */
    private saveDocumentToDisk(
        buffer: Buffer,
        clinicId: string,
        mimeType: string
    ): string {
        // Ensure upload directory exists for documents
        this.ensureDocumentUploadDir(clinicId);

        // Get file extension from MIME type
        const extension = this.getExtensionFromMimeType(mimeType);

        // Create filename with timestamp
        const timestamp = Date.now();
        const randomId = Math.random().toString(36).substring(7);
        const filename = `${timestamp}_${randomId}${extension}`;

        // Full path
        const filePath = path.join(process.cwd(), 'uploads', 'documents', clinicId, filename);

        // Write file
        fs.writeFileSync(filePath, buffer);

        return filePath;
    }

    /**
     * Ensure document upload directory exists
     * S'assurer que le dossier d'upload de documents existe
     */
    private ensureDocumentUploadDir(clinicId: string): void {
        const dir = path.join(process.cwd(), 'uploads', 'documents', clinicId);

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
}

export const mediaService = new MediaService();
