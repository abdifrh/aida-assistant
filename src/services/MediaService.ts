import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { logService } from './LogService';

export class MediaService {
    /**
     * Download and store media from WhatsApp
     * Télécharger et stocker le média depuis WhatsApp
     */
    async downloadAndStoreMedia(
        mediaId: string,
        clinicId: string,
        accessToken: string,
        apiVersion: string = 'v18.0'
    ): Promise<{ filePath: string; mimeType: string } | null> {
        try {
            // Get media URL from WhatsApp API
            // Obtenir l'URL du média depuis l'API WhatsApp
            const mediaUrlData = await this.getMediaUrl(mediaId, accessToken, apiVersion);

            if (!mediaUrlData) {
                await logService.error('WHATSAPP', 'MEDIA_URL_FAILED',
                    `Failed to get media URL for ${mediaId}`, null, { clinic_id: clinicId });
                return null;
            }

            // Download the file
            // Télécharger le fichier
            const fileBuffer = await this.downloadFile(mediaUrlData.url, accessToken);

            // Save to disk
            // Sauvegarder sur le disque
            const filePath = this.saveFileToDisk(fileBuffer, clinicId, mediaId, mediaUrlData.mimeType);

            await logService.info('WHATSAPP', 'MEDIA_STORED',
                `Media stored successfully: ${mediaId}`,
                { clinic_id: clinicId, metadata: { file_path: filePath, mime_type: mediaUrlData.mimeType } });

            return { filePath, mimeType: mediaUrlData.mimeType };
        } catch (error) {
            await logService.error('WHATSAPP', 'MEDIA_DOWNLOAD_ERROR',
                `Error downloading media ${mediaId}`, error, { clinic_id: clinicId });
            return null;
        }
    }

    /**
     * Get media URL from WhatsApp API
     * Obtenir l'URL du média depuis l'API WhatsApp
     */
    private async getMediaUrl(
        mediaId: string,
        accessToken: string,
        apiVersion: string
    ): Promise<{ url: string; mimeType: string } | null> {
        try {
            const url = `https://graph.facebook.com/${apiVersion}/${mediaId}`;

            const response = await axios.get(url, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            });

            return {
                url: response.data.url,
                mimeType: response.data.mime_type || 'image/jpeg',
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                await logService.error('WHATSAPP', 'MEDIA_URL_REQUEST_FAILED',
                    `Failed to get media URL from WhatsApp API`, error,
                    { metadata: { media_id: mediaId, status: error.response?.status } });
            }
            return null;
        }
    }

    /**
     * Download file from URL
     * Télécharger le fichier depuis l'URL
     */
    private async downloadFile(url: string, accessToken: string): Promise<Buffer> {
        const response = await axios.get(url, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
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
        mediaId: string,
        mimeType: string
    ): string {
        // Ensure upload directory exists
        // S'assurer que le dossier existe
        this.ensureUploadDir(clinicId);

        // Get file extension from MIME type
        // Obtenir l'extension depuis le type MIME
        const extension = this.getExtensionFromMimeType(mimeType);

        // Create filename with timestamp
        // Créer le nom de fichier avec timestamp
        const timestamp = Date.now();
        const filename = `${timestamp}_${mediaId.substring(0, 20)}${extension}`;

        // Full path
        // Chemin complet
        const filePath = path.join(process.cwd(), 'uploads', 'images', clinicId, filename);

        // Write file
        // Écrire le fichier
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
        };

        return mimeToExt[mimeType] || '.jpg';
    }

    /**
     * Download and store document (PDF) from WhatsApp
     * Télécharger et stocker un document (PDF) depuis WhatsApp
     */
    async downloadAndStoreDocument(
        mediaId: string,
        clinicId: string,
        accessToken: string,
        apiVersion: string = 'v18.0'
    ): Promise<{ filePath: string; mimeType: string } | null> {
        try {
            // Get media URL from WhatsApp API
            const mediaUrlData = await this.getMediaUrl(mediaId, accessToken, apiVersion);

            if (!mediaUrlData) {
                await logService.error('WHATSAPP', 'MEDIA_URL_FAILED',
                    `Failed to get document URL for ${mediaId}`, null, { clinic_id: clinicId });
                return null;
            }

            // Download the file
            const fileBuffer = await this.downloadFile(mediaUrlData.url, accessToken);

            // Save to disk in documents folder
            const filePath = this.saveDocumentToDisk(fileBuffer, clinicId, mediaId, mediaUrlData.mimeType);

            await logService.info('WHATSAPP', 'DOCUMENT_STORED',
                `Document stored successfully: ${mediaId}`,
                { clinic_id: clinicId, metadata: { file_path: filePath, mime_type: mediaUrlData.mimeType } });

            return { filePath, mimeType: mediaUrlData.mimeType };
        } catch (error) {
            await logService.error('WHATSAPP', 'DOCUMENT_DOWNLOAD_ERROR',
                `Error downloading document ${mediaId}`, error, { clinic_id: clinicId });
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
        mediaId: string,
        mimeType: string
    ): string {
        // Ensure upload directory exists for documents
        this.ensureDocumentUploadDir(clinicId);

        // Get file extension from MIME type
        const extension = this.getExtensionFromMimeType(mimeType);

        // Create filename with timestamp
        const timestamp = Date.now();
        const filename = `${timestamp}_${mediaId.substring(0, 20)}${extension}`;

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
