# Guide d'Intégration Technique Complet

> **Version**: 3.0
> **Dernière mise à jour**: 28 janvier 2026
> **Fichier**: `docs/fr/guide-integration.md`

---

## Table des Matières

1. [Configuration de l'environnement de développement](#1-configuration-de-lenvironnement-de-développement)
2. [Installation pas à pas](#2-installation-pas-à-pas)
3. [Intégration Twilio WhatsApp](#3-intégration-twilio-whatsapp)
4. [Implémentation MediaService (Twilio)](#4-implémentation-mediaservice-twilio)
5. [Synchronisation Google Calendar](#5-synchronisation-google-calendar)
6. [Configuration Ollama LLM](#6-configuration-ollama-llm)
7. [Documentation complète des API](#7-documentation-complète-des-api)
8. [Schéma de base de données](#8-schéma-de-base-de-données)
9. [Configuration des variables d'environnement](#9-configuration-des-variables-denvironnement)
10. [Tests et débogage](#10-tests-et-débogage)
11. [Considérations de déploiement](#11-considérations-de-déploiement)

---

## 1. Configuration de l'environnement de développement

### 1.1 Prérequis système

Avant de commencer, assurez-vous d'avoir les éléments suivants installés :

| Composant | Version minimale | Version recommandée | Notes |
|-----------|------------------|---------------------|-------|
| **Node.js** | v18.0.0 | v20.x ou supérieur | Inclut npm |
| **PostgreSQL** | v13.0 | v15.x ou supérieur | Serveur de base de données |
| **Ollama** | v0.1.0 | Dernière version | Pour exécuter les modèles LLM localement |
| **Git** | v2.0 | Dernière version | Gestion de versions |
| **Docker** (optionnel) | v20.0 | Dernière version | Pour PostgreSQL conteneurisé |

### 1.2 Vérification des prérequis

```bash
# Vérifier Node.js et npm
node --version   # Devrait afficher v18.x ou supérieur
npm --version    # Devrait afficher 9.x ou supérieur

# Vérifier PostgreSQL
psql --version   # Devrait afficher PostgreSQL 13.x ou supérieur

# Vérifier Ollama
ollama --version # Devrait afficher la version d'Ollama

# Vérifier Git
git --version    # Devrait afficher git version 2.x
```

### 1.3 Outils recommandés

- **IDE** : Visual Studio Code avec extensions TypeScript, Prisma
- **Client PostgreSQL** : pgAdmin 4 ou DBeaver
- **Client API** : Postman ou Insomnia pour tester les endpoints
- **Terminal** : Terminal Windows, PowerShell, ou Git Bash

---

## 2. Installation pas à pas

### 2.1 Clonage du projet

```bash
# Cloner le dépôt
git clone https://github.com/votre-org/sophie-medical-assistant.git

# Accéder au répertoire
cd sophie-medical-assistant

# Vérifier la structure
ls -la
```

### 2.2 Installation des dépendances

```bash
# Installer toutes les dépendances npm
npm install
```

**Dépendances principales** (`package.json`) :

```json
{
  "dependencies": {
    "@prisma/client": "^7.3.0",
    "@prisma/adapter-pg": "^7.3.0",
    "express": "^5.2.1",
    "axios": "^1.13.2",
    "dotenv": "^17.2.3",
    "googleapis": "^170.1.0",
    "jsonwebtoken": "^9.0.3",
    "bcryptjs": "^3.0.3",
    "zod": "^4.3.5",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.2.0",
    "pg": "^8.17.2",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "ts-node": "^10.9.2",
    "prisma": "^7.3.0",
    "@types/node": "^25.0.9",
    "@types/express": "^5.0.6",
    "@types/bcryptjs": "^2.4.6",
    "@types/jsonwebtoken": "^9.0.10",
    "@types/uuid": "^10.0.0"
  }
}
```

### 2.3 Configuration de PostgreSQL

#### Option A : Installation locale

```bash
# Sur Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Démarrer le service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Créer la base de données
sudo -u postgres psql
CREATE DATABASE medical_assistant;
CREATE USER sophie WITH PASSWORD 'votre_mot_de_passe_securise';
GRANT ALL PRIVILEGES ON DATABASE medical_assistant TO sophie;
\q
```

#### Option B : Utilisation de Docker

**Fichier** : `docker-compose.yml` (déjà fourni dans le projet)

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: sophie-postgres
    environment:
      POSTGRES_DB: medical_assistant
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres123
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

```bash
# Démarrer PostgreSQL avec Docker
docker-compose up -d

# Vérifier que le conteneur est en cours d'exécution
docker ps | grep sophie-postgres
```

### 2.4 Configuration du fichier .env

Créer un fichier `.env` à la racine du projet :

```bash
# Copier le fichier d'exemple (si disponible)
cp .env.example .env

# Éditer le fichier
nano .env  # ou votre éditeur préféré
```

**Contenu du fichier `.env`** :

```env
# Port du serveur Node.js
PORT=3000

# Base de données PostgreSQL
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/medical_assistant?schema=public"

# LLM API (Ollama local)
LLM_API_URL="http://localhost:11434/api/generate"

# JWT Secret pour authentification
JWT_SECRET="votre-super-secret-jwt-key-change-in-production-2024"

# Twilio WhatsApp
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="votre-auth-token-twilio"
TWILIO_PHONE_NUMBER="+14155238886"

# Google OAuth2 pour intégration Calendar
GOOGLE_CLIENT_ID="votre-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="votre-client-secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"
```

> **Note de sécurité** : En production, utilisez des secrets aléatoires et forts. Ne committez JAMAIS le fichier `.env` dans Git.

### 2.5 Initialisation de la base de données avec Prisma

```bash
# Générer le client Prisma
npx prisma generate

# Pousser le schéma vers la base de données
npx prisma db push

# Vérifier la création des tables
npx prisma studio
```

Prisma Studio s'ouvre dans votre navigateur à `http://localhost:5555` et vous permet d'inspecter les tables.

### 2.6 Installation d'Ollama et du modèle Sophie

#### Télécharger et installer Ollama

```bash
# Sur Linux
curl https://ollama.ai/install.sh | sh

# Sur macOS
brew install ollama

# Sur Windows
# Télécharger l'installeur depuis https://ollama.ai/download
```

#### Démarrer le serveur Ollama

```bash
# Démarrer Ollama en arrière-plan
ollama serve
```

#### Charger le modèle de base Qwen 2.5

```bash
# Télécharger le modèle de base
ollama pull qwen2.5:latest
```

#### Créer le modèle personnalisé Sophie

Le projet inclut un fichier `Modelfile.optimized` qui configure le modèle Sophie.

```bash
# Créer le modèle aida-medical-v1 depuis le Modelfile
ollama create aida-medical-v1 -f Modelfile.optimized
```

**Vérification** :

```bash
# Lister les modèles installés
ollama list

# Devrait afficher :
# NAME                    ID              SIZE     MODIFIED
# aida-medical-v1:latest  abc123def456    4.7 GB   2 hours ago
# qwen2.5:latest          xyz789uvw123    4.7 GB   1 day ago
```

### 2.7 Compilation TypeScript

```bash
# Compiler le projet TypeScript
npm run build

# Vérifier que le dossier dist/ a été créé
ls dist/
```

### 2.8 Démarrage du serveur

```bash
# Mode développement (avec rechargement automatique)
npm run dev

# Mode production
npm start
```

**Sortie attendue** :

```
Server running on port 3000
Serveur en cours d'exécution sur le port 3000
✓ Created uploads/images directory
✓ Created uploads/documents directory
```

### 2.9 Vérification de l'installation

```bash
# Tester le endpoint de santé
curl http://localhost:3000/health

# Devrait retourner : OK
```

---

## 3. Intégration Twilio WhatsApp

### 3.1 Vue d'ensemble

Sophie utilise l'API WhatsApp de Twilio pour recevoir et envoyer des messages. L'intégration comprend :

- **Webhooks** pour recevoir les messages entrants
- **Validation de signature Twilio** pour la sécurité (optionnel)
- **API Twilio** pour envoyer des messages sortants

### 3.2 Configuration du webhook

#### Configuration Twilio

1. Créer un compte sur [Twilio Console](https://console.twilio.com/)
2. Activer WhatsApp Sandbox ou Business API
3. Noter votre **Account SID** et **Auth Token**

#### Configuration du webhook dans Twilio

**URL du webhook** : `https://votre-domaine.com/webhook/whatsapp/{clinicId}`

**Étapes** :

1. Dans la console Twilio, accéder à Messaging > WhatsApp
2. Configurer les webhooks :
   - **When a message comes in**: `https://votre-domaine.com/webhook/whatsapp/{clinicId}`
   - **Status callback URL**: (optionnel) `https://votre-domaine.com/webhook/whatsapp/{clinicId}/status`

#### Variables d'environnement

Ajouter les credentials Twilio dans `.env` :

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=votre_auth_token_twilio
TWILIO_PHONE_NUMBER=+14155238886
```

#### Enregistrement dans la base de données

Ajouter la configuration WhatsApp pour chaque clinique :

```sql
INSERT INTO clinic_whatsapp_configs (
    id,
    clinic_id,
    phone_number,
    verify_token,
    provider,
    is_active
) VALUES (
    gen_random_uuid(),
    'your-clinic-uuid',
    '+14155238886',
    'SOPHIE_VERIFY_TOKEN_2026',
    'twilio',
    true
);
```

### 3.3 Vérification du webhook

**Fichier** : `src/controllers/WhatsAppController.ts`

```typescript
async verifyWebhook(req: Request, res: Response) {
    const { clinicId } = req.params;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token) {
        // Trouver la configuration de la clinique
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
            console.log(`WEBHOOK_VERIFICATION_FAILED for clinic: ${clinicId}`);
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
}
```

**Route** : `src/routes/webhookRoutes.ts`

```typescript
import { Router } from 'express';
import { whatsAppController } from '../controllers/WhatsAppController';

const router = Router();

router.get('/:clinicId', (req, res) => whatsAppController.verifyWebhook(req, res));
router.post('/:clinicId', (req, res) => whatsAppController.handleWebhook(req, res));

export default router;
```

### 3.4 Validation de signature Twilio (optionnel)

La validation de signature est optionnelle avec Twilio et peut être configurée par clinique.

**Validation dans le contrôleur** (`src/controllers/WhatsAppController.ts`) :

```typescript
async handleWebhook(req: Request, res: Response) {
    const { clinicId } = req.params;
    const signature = req.headers['x-hub-signature-256'] as string;

    try {
        // Récupérer la configuration de la clinique
        const config = await prisma.clinicWhatsAppConfig.findFirst({
            where: {
                clinic_id: clinicId as string,
                is_active: true
            }
        });

        // Vérification de sécurité optionnelle
        if (config?.webhook_secret && signature) {
            const crypto = await import('crypto');
            const hmac = crypto.createHmac('sha256', config.webhook_secret);
            const rawBody = (req as any).rawBody || JSON.stringify(req.body);
            const digest = 'sha256=' + hmac.update(rawBody).digest('hex');

            if (signature !== digest) {
                console.error(`[SECURITY] Invalid signature for clinic ${clinicId}`);
                return res.sendStatus(403);
            }
        }

        // Répondre immédiatement à Twilio (réponse vide pour éviter "OK")
        res.status(200).send('');

        // Traiter le message en arrière-plan
        await whatsAppService.handleIncomingMessage(req.body, clinicId as string);
    } catch (error) {
        console.error(`Error handling webhook for clinic ${clinicId}:`, error);
        if (!res.headersSent) res.status(200).send('');
    }
}
```

### 3.5 Structure de la charge utile Twilio (payload)

#### Message texte entrant

```
POST /webhook/whatsapp/{clinicId}
Content-Type: application/x-www-form-urlencoded

MessageSid=SM1234567890abcdef
From=whatsapp:+41987654321
To=whatsapp:+14155238886
Body=Bonjour, je voudrais prendre un rendez-vous
NumMedia=0
```

#### Message avec image

```
POST /webhook/whatsapp/{clinicId}
Content-Type: application/x-www-form-urlencoded

MessageSid=MM1234567890abcdef
From=whatsapp:+41987654321
To=whatsapp:+14155238886
Body=Voici ma carte d'assurance
NumMedia=1
MediaUrl0=https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages/MMxxx/Media/MExxx
MediaContentType0=image/jpeg
```

#### Message avec document (PDF)

```
POST /webhook/whatsapp/{clinicId}
Content-Type: application/x-www-form-urlencoded

MessageSid=MM1234567890abcdef
From=whatsapp:+41987654321
To=whatsapp:+14155238886
Body=Document de garantie
NumMedia=1
MediaUrl0=https://api.twilio.com/2010-04-01/Accounts/ACxxx/Messages/MMxxx/Media/MExxx
MediaContentType0=application/pdf
```

### 3.6 Envoi de messages via Twilio

**Fichier** : `src/services/TwilioWhatsAppService.ts`

```typescript
import twilio from 'twilio';

class TwilioWhatsAppService {
    private client: twilio.Twilio;

    constructor() {
        this.client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );
    }

    async sendMessage(to: string, from: string, body: string): Promise<boolean> {
        try {
            // Formater les numéros pour WhatsApp
            const toWhatsApp = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
            const fromWhatsApp = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;

            const message = await this.client.messages.create({
                body: body,
                from: fromWhatsApp,
                to: toWhatsApp
            });

            console.log(`Message sent to ${to}: ${message.sid}`);
            return true;
        } catch (error) {
            console.error('Error sending WhatsApp message via Twilio:', error);
            return false;
        }
    }

    // Parser le numéro WhatsApp (enlever le préfixe whatsapp:)
    parseWhatsAppNumber(number: string): string {
        return number.replace('whatsapp:', '');
    }
}

export const twilioWhatsAppService = new TwilioWhatsAppService();
```

---

## 4. Implémentation MediaService (Twilio)

Le `MediaService` gère le téléchargement et le stockage des médias (images et documents) envoyés par les patients via WhatsApp Twilio.

### 4.1 Architecture du MediaService

**Fichier** : `src/services/MediaService.ts`

### 4.2 Téléchargement d'une image depuis Twilio

```typescript
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

        // Télécharger le fichier avec authentification Twilio
        const fileBuffer = await this.downloadFile(mediaUrl);

        // Sauvegarder sur le disque
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
```

### 4.3 Téléchargement du fichier avec authentification Twilio

```typescript
/**
 * Download file from Twilio URL with Basic Auth
 * Télécharger le fichier depuis l'URL Twilio avec authentification Basic
 */
private async downloadFile(url: string): Promise<Buffer> {
    const response = await axios.get(url, {
        auth: {
            username: process.env.TWILIO_ACCOUNT_SID || '',
            password: process.env.TWILIO_AUTH_TOKEN || ''
        },
        responseType: 'arraybuffer',
    });

    return Buffer.from(response.data);
}
```

### 4.5 Sauvegarde sur disque

```typescript
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
    // S'assurer que le dossier existe
    this.ensureUploadDir(clinicId);

    // Obtenir l'extension depuis le type MIME
    const extension = this.getExtensionFromMimeType(mimeType);

    // Créer le nom de fichier avec timestamp
    const timestamp = Date.now();
    const filename = `${timestamp}_${mediaId.substring(0, 20)}${extension}`;

    // Chemin complet
    const filePath = path.join(process.cwd(), 'uploads', 'images', clinicId, filename);

    // Écrire le fichier
    fs.writeFileSync(filePath, buffer);

    return filePath;
}
```

### 4.6 Gestion des extensions

```typescript
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
```

### 4.7 Téléchargement de documents (PDF) depuis Twilio

```typescript
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

        // Télécharger le fichier avec authentification Twilio
        const fileBuffer = await this.downloadFile(mediaUrl);

        // Sauvegarder dans le dossier documents
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
```

### 4.8 Structure des dossiers

```
uploads/
├── images/
│   ├── {clinicId}/
│   │   ├── 1706451234000_wamid_xxx.jpg
│   │   ├── 1706451300000_wamid_yyy.png
│   │   └── ...
│   └── {anotherClinicId}/
│       └── ...
└── documents/
    ├── {clinicId}/
    │   ├── 1706451400000_wamid_zzz.pdf
    │   └── ...
    └── ...
```

### 4.9 Flux de téléchargement complet (Twilio)

```mermaid
sequenceDiagram
    Patient->>WhatsApp: Envoie image/document
    WhatsApp->>Twilio: Reçoit média
    Twilio->>Sophie Webhook: POST /webhook/whatsapp/{clinicId} (avec MediaUrl0)
    Sophie Webhook->>WhatsAppService: handleIncomingMessage()
    WhatsAppService->>MediaService: downloadAndStoreMedia(mediaUrl)
    MediaService->>Twilio API: GET MediaUrl0 (Basic Auth)
    Twilio API-->>MediaService: Retourne Buffer
    MediaService->>File System: Sauvegarde fichier
    MediaService-->>WhatsAppService: Retourne filePath
    WhatsAppService->>Database: Enregistre message avec file_path
```

---

## 5. Synchronisation Google Calendar

### 5.1 Configuration OAuth2

#### Créer un projet dans Google Cloud Console

1. Accéder à [Google Cloud Console](https://console.cloud.google.com/)
2. Créer un nouveau projet nommé "Sophie Medical Assistant"
3. Activer l'API Google Calendar
4. Créer des identifiants OAuth 2.0

#### Configuration des identifiants

**Type d'application** : Application Web

**URI de redirection autorisées** :
- `http://localhost:3000/oauth/callback` (développement)
- `https://votre-domaine.com/oauth/callback` (production)

#### Ajout au fichier .env

```env
GOOGLE_CLIENT_ID="160111944168-xxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"
```

### 5.2 Configuration du service

**Fichier** : `src/config/index.ts`

```typescript
import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    databaseUrl: process.env.DATABASE_URL,
    llmApiUrl: process.env.LLM_API_URL || 'http://localhost:11434/api/generate',
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
    },
};
```

### 5.3 Flux OAuth2

**Fichier** : `src/controllers/OAuthController.ts`

```typescript
import { google } from 'googleapis';
import { config } from '../config';
import prisma from '../database/client';

export class OAuthController {
    /**
     * Initiate OAuth flow for a practitioner
     * Démarrer le flux OAuth pour un praticien
     */
    async authorize(req: Request, res: Response) {
        const { practitionerId, clinicId } = req.query;

        if (!practitionerId || !clinicId) {
            return res.status(400).send('Missing practitionerId or clinicId');
        }

        // Créer le client OAuth2
        const oauth2Client = new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.redirectUri
        );

        // Générer l'URL d'autorisation
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            state: JSON.stringify({ practitionerId, clinicId }),
            prompt: 'consent'
        });

        // Rediriger vers Google
        res.redirect(authUrl);
    }

    /**
     * Handle OAuth callback
     * Gérer le callback OAuth
     */
    async callback(req: Request, res: Response) {
        const { code, state } = req.query;

        if (!code || !state) {
            return res.status(400).send('Missing authorization code or state');
        }

        try {
            // Décoder le state
            const { practitionerId, clinicId } = JSON.parse(state as string);

            // Créer le client OAuth2
            const oauth2Client = new google.auth.OAuth2(
                config.google.clientId,
                config.google.clientSecret,
                config.google.redirectUri
            );

            // Échanger le code contre des tokens
            const { tokens } = await oauth2Client.getToken(code as string);

            // Sauvegarder les tokens en base de données
            await prisma.practitionerCalendarIntegration.upsert({
                where: { practitioner_id: practitionerId },
                update: {
                    access_token: tokens.access_token!,
                    refresh_token: tokens.refresh_token!,
                    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    is_active: true
                },
                create: {
                    practitioner_id: practitionerId,
                    provider: 'google',
                    calendar_id: 'primary',
                    access_token: tokens.access_token!,
                    refresh_token: tokens.refresh_token!,
                    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    is_active: true
                }
            });

            res.send('✅ Calendrier connecté avec succès ! Vous pouvez fermer cette fenêtre.');
        } catch (error) {
            console.error('OAuth callback error:', error);
            res.status(500).send('Erreur lors de la connexion au calendrier');
        }
    }
}
```

### 5.4 CalendarService - Méthodes principales

**Fichier** : `src/services/CalendarService.ts`

#### Obtention du client OAuth2

```typescript
/**
 * Get OAuth2 client for a specific practitioner
 * Obtenir le client OAuth2 pour un praticien spécifique
 */
private async getOAuth2Client(practitionerId: string) {
    const integration = await prisma.practitionerCalendarIntegration.findUnique({
        where: { practitioner_id: practitionerId },
    });

    if (!integration || !integration.is_active) {
        throw new Error(`No active calendar integration for practitioner ${practitionerId}`);
    }

    const oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
    );

    oauth2Client.setCredentials({
        access_token: integration.access_token,
        refresh_token: integration.refresh_token,
        expiry_date: integration.token_expiry?.getTime(),
    });

    // Auto-rafraîchir le token s'il est expiré
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.refresh_token) {
            await prisma.practitionerCalendarIntegration.update({
                where: { practitioner_id: practitionerId },
                data: {
                    access_token: tokens.access_token!,
                    refresh_token: tokens.refresh_token,
                    token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                },
            });
        }
    });

    return oauth2Client;
}
```

#### Vérification de disponibilité (Free/Busy)

```typescript
/**
 * Check availability for a practitioner
 * Vérifier la disponibilité d'un praticien
 */
async checkAvailability(
    practitionerId: string,
    startTime: Date,
    endTime: Date
): Promise<boolean> {
    try {
        const oauth2Client = await this.getOAuth2Client(practitionerId);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const integration = await prisma.practitionerCalendarIntegration.findUnique({
            where: { practitioner_id: practitionerId },
        });

        if (!integration) return false;

        // Récupérer les créneaux occupés depuis Google Calendar
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: startTime.toISOString(),
                timeMax: endTime.toISOString(),
                items: [{ id: integration.calendar_id }],
            },
        });

        const busySlots = response.data.calendars?.[integration.calendar_id]?.busy || [];

        // Vérifier si le créneau demandé chevauche un créneau occupé
        const isAvailable = !busySlots.some((slot) => {
            const slotStart = new Date(slot.start!);
            const slotEnd = new Date(slot.end!);
            return startTime < slotEnd && endTime > slotStart;
        });

        return isAvailable;
    } catch (error) {
        console.error('Error checking availability:', error);
        return false;
    }
}
```

#### Création d'événement

```typescript
/**
 * Create an event in Google Calendar
 * Créer un événement dans Google Calendar
 */
async createEvent(
    practitionerId: string,
    patientName: string,
    patientPhone: string,
    startTime: Date,
    endTime: Date,
    appointmentType: string,
    timeZone: string = 'Europe/Paris'
): Promise<string | null> {
    try {
        const oauth2Client = await this.getOAuth2Client(practitionerId);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const integration = await prisma.practitionerCalendarIntegration.findUnique({
            where: { practitioner_id: practitionerId },
        });

        if (!integration) return null;

        const event = {
            summary: `${appointmentType} - ${patientName}`,
            description: `Patient: ${patientName}\nTéléphone: ${patientPhone}`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: timeZone,
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: timeZone,
            },
        };

        const response = await calendar.events.insert({
            calendarId: integration.calendar_id,
            requestBody: event,
        });

        return response.data.id || null;
    } catch (error) {
        console.error('Error creating event:', error);
        return null;
    }
}
```

#### Récupération des créneaux disponibles

```typescript
/**
 * Get available slots for a practitioner on a specific date
 * Obtenir les créneaux disponibles pour un praticien à une date donnée
 */
async getAvailableSlots(
    practitionerId: string,
    date: Date,
    slotDuration: number = 30 // minutes
): Promise<{ start: Date; end: Date }[]> {
    try {
        const oauth2Client = await this.getOAuth2Client(practitionerId);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const integration = await prisma.practitionerCalendarIntegration.findUnique({
            where: { practitioner_id: practitionerId },
        });

        if (!integration) return [];

        // Définir les heures de travail (9h à 18h)
        const startOfDay = new Date(date);
        startOfDay.setHours(9, 0, 0, 0);

        const endOfDay = new Date(date);
        endOfDay.setHours(18, 0, 0, 0);

        // Récupérer les créneaux occupés
        const response = await calendar.freebusy.query({
            requestBody: {
                timeMin: startOfDay.toISOString(),
                timeMax: endOfDay.toISOString(),
                items: [{ id: integration.calendar_id }],
            },
        });

        const busySlots = response.data.calendars?.[integration.calendar_id]?.busy || [];

        // Générer tous les créneaux possibles
        const availableSlots: { start: Date; end: Date }[] = [];
        let currentTime = new Date(startOfDay);

        while (currentTime < endOfDay) {
            const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

            if (slotEnd > endOfDay) break;

            // Vérifier si le créneau est libre
            const isBusy = busySlots.some((busy) => {
                const busyStart = new Date(busy.start!);
                const busyEnd = new Date(busy.end!);
                return currentTime < busyEnd && slotEnd > busyStart;
            });

            if (!isBusy) {
                availableSlots.push({
                    start: new Date(currentTime),
                    end: new Date(slotEnd),
                });
            }

            currentTime = new Date(currentTime.getTime() + slotDuration * 60000);
        }

        return availableSlots;
    } catch (error) {
        console.error('Error fetching available slots:', error);
        return [];
    }
}
```

#### Suppression d'événement

```typescript
/**
 * Delete an event
 * Supprimer un événement
 */
async deleteEvent(practitionerId: string, eventId: string): Promise<boolean> {
    try {
        const oauth2Client = await this.getOAuth2Client(practitionerId);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const integration = await prisma.practitionerCalendarIntegration.findUnique({
            where: { practitioner_id: practitionerId },
        });

        if (!integration) return false;

        await calendar.events.delete({
            calendarId: integration.calendar_id,
            eventId: eventId,
        });

        return true;
    } catch (error) {
        console.error('Error deleting event:', error);
        return false;
    }
}
```

#### Modification d'événement

```typescript
/**
 * Update an existing event (Reschedule)
 * Mettre à jour un événement existant (Reporter)
 */
async updateEvent(
    practitionerId: string,
    eventId: string,
    startTime: Date,
    endTime: Date,
    timeZone: string = 'Europe/Paris'
): Promise<boolean> {
    try {
        const oauth2Client = await this.getOAuth2Client(practitionerId);
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const integration = await prisma.practitionerCalendarIntegration.findUnique({
            where: { practitioner_id: practitionerId },
        });

        if (!integration) return false;

        await calendar.events.patch({
            calendarId: integration.calendar_id,
            eventId: eventId,
            requestBody: {
                start: {
                    dateTime: startTime.toISOString(),
                    timeZone: timeZone,
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: timeZone,
                },
            },
        });

        return true;
    } catch (error) {
        console.error('Error updating event:', error);
        return false;
    }
}
```

---

## 6. Configuration Ollama LLM

### 6.1 Modelfile.optimized

Le fichier `Modelfile.optimized` définit la configuration du modèle Sophie.

**Fichier** : `Modelfile.optimized`

```dockerfile
FROM qwen2.5:latest

# Paramètres optimisés pour une secrétaire médicale
PARAMETER temperature 0.0
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
PARAMETER num_ctx 4096

# Système principal : Sophie, secrétaire médicale professionnelle
SYSTEM """
Tu es Sophie, une secrétaire médicale virtuelle professionnelle et efficace.
Ton rôle est d'extraire des entités structurées (JSON) et de répondre avec une courtoisie exemplaire.

## RÈGLES DE LOGIQUE (CRITIQUES)
1. NON-HALLUCINATION : Ne jamais inventer une date, une heure ou un nom. Si une information n'est pas dans le message actuel ou le contexte, mets sa valeur à null.
2. PAS DE NOMS D'EXEMPLES : Ne jamais utiliser les noms des exemples (comme 'Marc', 'Simon', 'Dupont', 'Martin', 'Jean') dans tes réponses si ils ne sont pas fournis par l'utilisateur ou le contexte.
3. IDENTITÉ : Utilise uniquement le nom du patient fourni dans le CONTEXTE (CLIENT INFO). Si inconnu, n'utilise pas de nom.
4. BASES TEMPORELLES : La baseline est CURRENT_DATE_TIME. Calcule les dates relatives depuis cette base.

## SCHEMA JSON DE RÉPONSE (STRICT)
{
  "detected_language": "fr|en",
  "intent": "BOOK_APPOINTMENT|MODIFY_APPOINTMENT|CANCEL_APPOINTMENT|LIST_APPOINTMENTS|INFORMATION|GREETING|AFFIRMATIVE|NEGATIVE|LIST_PRACTITIONERS|EMERGENCY|UNKNOWN",
  "confidence": 0.0-1.0,
  "entities": {
    "first_name": "string|null",
    "last_name": "string|null",
    "birth_date": "YYYY-MM-DD|null",
    "appointment_type": "string|null",
    "date": "YYYY-MM-DD|null",
    "time": "HH:MM|null",
    "time_preference": "MORNING|AFTERNOON|null",
    "practitioner": "string|null"
  },
  "needs_backend_action": boolean,
  "response_message": "Réponse très courte (max 15 mots). JAMAIS de noms fictifs."
}
"""

# --- EXEMPLES D'EXTRACTION PURE (SANS NOMS FIXES) ---

MESSAGE user """Je voudrais prendre un rendez-vous"""
MESSAGE assistant """{
  "detected_language": "fr",
  "intent": "BOOK_APPOINTMENT",
  "confidence": 1.0,
  "entities": {
    "first_name": null,
    "last_name": null,
    "birth_date": null,
    "date": null,
    "time": null,
    "practitioner": null
  },
  "needs_backend_action": true,
  "response_message": "C'est entendu. Avec quel médecin souhaiteriez-vous prendre rendez-vous ?"
}"""

MESSAGE user """Bonjour, je suis un nouveau patient, mon nom est Test Patient."""
MESSAGE assistant """{
  "detected_language": "fr",
  "intent": "INFORMATION",
  "confidence": 1.0,
  "entities": {
    "first_name": "Test",
    "last_name": "Patient"
  },
  "needs_backend_action": true,
  "response_message": "Ravie de vous rencontrer. Quelle est votre date de naissance ?"
}"""

MESSAGE user """Quels sont mes prochains rdv"""
MESSAGE assistant """{
  "detected_language": "fr",
  "intent": "LIST_APPOINTMENTS",
  "confidence": 1.0,
  "entities": {},
  "needs_backend_action": true,
  "response_message": "Bien sûr, je regarde vos prochains rendez-vous dans votre dossier."
}"""

MESSAGE user """merci"""
MESSAGE assistant """{
  "detected_language": "fr",
  "intent": "AFFIRMATIVE",
  "confidence": 1.0,
  "entities": {},
  "needs_backend_action": false,
  "response_message": "De rien ! Je reste à votre disposition si vous avez besoin d'autre chose."
}"""
```

### 6.2 Explication des paramètres

| Paramètre | Valeur | Explication |
|-----------|--------|-------------|
| `temperature` | 0.0 | Déterminisme maximum pour réponses consistantes |
| `top_p` | 0.9 | Échantillonnage nucleus pour diversité contrôlée |
| `top_k` | 40 | Limite les tokens considérés |
| `repeat_penalty` | 1.1 | Pénalise la répétition |
| `num_ctx` | 4096 | Taille du contexte (tokens) |

### 6.3 LLMService - Implémentation

**Fichier** : `src/services/LLMService.ts`

#### Schéma de validation Zod

```typescript
import { z } from 'zod';
import { Intent } from '../types/conversation';

// Schéma Zod pour validation stricte
const LLMResponseSchema = z.object({
    detected_language: z.string(),
    intent: z.nativeEnum(Intent),
    confidence: z.number().min(0).max(1),
    entities: z.object({
        first_name: z.string().nullable().optional(),
        last_name: z.string().nullable().optional(),
        birth_date: z.string().nullable().optional(),
        email: z.string().nullable().optional(),
        phone: z.string().nullable().optional(),
        appointment_type: z.string().nullable().optional(),
        date: z.string().nullable().optional(),
        time: z.string().nullable().optional(),
        time_preference: z.enum(['MORNING', 'AFTERNOON']).nullable().optional(),
        practitioner: z.string().nullable().optional(),
    }).nullable().optional(),
    needs_backend_action: z.boolean(),
    response_message: z.string().optional(),
});
```

#### Extraction d'entités

```typescript
/**
 * Extract entities in JSON format for structured processing
 * Extraire les entités au format JSON pour traitement structuré
 */
async extractEntities(
    userMessage: string,
    clinicName: string,
    language: string = 'fr',
    context: any = null
): Promise<LLMResponse | null> {
    try {
        await logService.info('LLM', 'EXTRACT_ENTITIES_START', 'Extracting entities', {
            metadata: { userMessage }
        });

        // Construction de la date/heure actuelle lisible
        const now = new Date();
        const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const dayName = dayNames[now.getDay()];
        const dateStr = now.toLocaleDateString('fr-FR', {
            timeZone: 'Europe/Paris',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('fr-FR', {
            timeZone: 'Europe/Paris',
            hour: '2-digit',
            minute: '2-digit'
        });

        const currentDateTime = context?.structuredContext?.currentDateTime ||
                                 `${dayName} ${dateStr} à ${timeStr}`;

        const extractionPrompt = `USER_MESSAGE: "${userMessage}"
LAST_ASSISTANT_MESSAGE: "${context?.lastAssistantMessage || ''}"
CLINIC_NAME: "${clinicName}"
CURRENT_LANGUAGE: "${language}"
CURRENT_DATE_TIME: "${currentDateTime}"
CURRENT_CONTEXT: ${JSON.stringify(context || {})}`;

        const intentOptions = Object.values(Intent).join(' | ');

        const systemPrompt = `You are Sophie, a professional medical secretary. Your role is to extract information and respond naturally.
Base your behavior on the 'aida-medical-v1' configuration.

STRICT JSON OUTPUT REQUIRED:
- detected_language: string (fr/en)
- intent: ${intentOptions}
- confidence: number (0 to 1)
- entities: { first_name, last_name, birth_date(YYYY-MM-DD), email, appointment_type, date(YYYY-MM-DD), time(HH:MM), time_preference(MORNING/AFTERNOON), practitioner }
- needs_backend_action: true if any entity was updated or an action (book/modify/cancel) is requested.
- response_message: A concise, polite response in the user's language.

DYNAMIC CONTEXT:
- CURRENT_STATE: ${context?.state || 'IDLE'}
- CLINIC: ${clinicName}
- BASELINE_DATE: ${currentDateTime}
- IS_CLINIC_OPEN_NOW: ${context?.structuredContext?.isOpenNow ? 'YES' : 'NO'}

RULES:
- NAME: Use ONLY the patient's name from CURRENT_CONTEXT (e.g., "${context?.client?.name || context?.patient?.first_name || 'patient'}").
- CRITICAL: NEVER use placeholder names like "Mark" or "Jean" from your training examples. If you don't know the name, use "Patient" or no name at all.
- HALLUCINATION WARNING: Never invent a date or time (like "lundi 10h") if it wasn't provided by the user in the latest message.`;

        const response = await axios.post(
            config.llmApiUrl.replace('/generate', '/chat'),
            {
                model: 'aida-medical-v1',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: extractionPrompt },
                ],
                stream: false,
                format: 'json',
                options: { temperature: 0.0 },
            },
            { timeout: 30000 }
        );

        let jsonContent = response.data?.message?.content || response.data?.response;
        if (!jsonContent) return null;

        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = typeof jsonContent === 'string' ? JSON.parse(jsonContent) : jsonContent;

        let validated: any;
        try {
            validated = LLMResponseSchema.parse(parsed);
        } catch (zodError) {
            console.error('[LLM] Validation error, using fallback:', zodError);
            // Fallback pour éviter une défaillance complète
            validated = {
                detected_language: parsed.detected_language || language,
                intent: parsed.intent || Intent.UNKNOWN,
                confidence: parsed.confidence || 0,
                needs_backend_action: parsed.needs_backend_action || false,
                response_message: parsed.response_message || ''
            };
        }

        const cleanedEntities = validated.entities
            ? Object.fromEntries(
                Object.entries(validated.entities).map(([k, v]) => [k, v === null ? undefined : v])
            )
            : {};

        const result = { ...validated, entities: cleanedEntities } as LLMResponse;

        await logService.info('LLM', 'EXTRACT_ENTITIES_SUCCESS', `Extracted intent: ${result.intent}`, {
            metadata: { result }
        });

        return result;
    } catch (error) {
        await logService.error('LLM', 'EXTRACT_ENTITIES_ERROR', 'Entity extraction error', error);
        return null;
    }
}
```

#### Structure JSON de réponse

```typescript
interface LLMResponse {
    detected_language: string;        // "fr" ou "en"
    intent: Intent;                   // BOOK_APPOINTMENT, etc.
    confidence: number;               // 0.0 à 1.0
    entities: {
        first_name?: string;
        last_name?: string;
        birth_date?: string;         // Format YYYY-MM-DD
        email?: string;
        appointment_type?: string;
        date?: string;                // Format YYYY-MM-DD
        time?: string;                // Format HH:MM
        time_preference?: 'MORNING' | 'AFTERNOON';
        practitioner?: string;
    };
    needs_backend_action: boolean;
    response_message?: string;
}
```

---

## 7. Documentation complète des API

### 7.1 Routes Webhook

**Fichier** : `src/routes/webhookRoutes.ts`

```typescript
import { Router } from 'express';
import { whatsAppController } from '../controllers/WhatsAppController';

const router = Router();

// GET - Vérification du webhook
router.get('/:clinicId', (req, res) => whatsAppController.verifyWebhook(req, res));

// POST - Réception des messages
router.post('/:clinicId', (req, res) => whatsAppController.handleWebhook(req, res));

export default router;
```

### 7.2 Routes Admin

**Fichier** : `src/routes/adminRoutes.ts`

```typescript
import express from 'express';
import { AdminController } from '../controllers/AdminController';
import {
    authenticateToken,
    validateClinicAccess,
    authenticateTokenFromQueryOrHeader
} from '../middleware/auth';

const router = express.Router();
const adminController = new AdminController();

// Login public (pas d'authentification)
router.post('/clinic/:clinicId/admin/login', (req, res) => adminController.login(req, res));

// Servir images (token dans query ou header)
router.get('/clinic/:clinicId/admin/images/:filename',
    authenticateTokenFromQueryOrHeader,
    validateClinicAccess,
    (req, res) => adminController.serveImage(req, res));

// Routes protégées (authentification + validation clinique)
router.use('/clinic/:clinicId/admin', authenticateToken, validateClinicAccess);

// Dashboard
router.get('/clinic/:clinicId/admin/dashboard/stats', (req, res) =>
    adminController.getDashboardStats(req, res));

// Conversations
router.get('/clinic/:clinicId/admin/conversations', (req, res) =>
    adminController.getConversations(req, res));
router.get('/clinic/:clinicId/admin/conversations/:conversationId', (req, res) =>
    adminController.getConversationDetails(req, res));

// Practitioners
router.get('/clinic/:clinicId/admin/practitioners', (req, res) =>
    adminController.getPractitioners(req, res));
router.get('/clinic/:clinicId/admin/practitioners/:practitionerId', (req, res) =>
    adminController.getPractitionerDetails(req, res));
router.post('/clinic/:clinicId/admin/practitioners', (req, res) =>
    adminController.createPractitioner(req, res));
router.put('/clinic/:clinicId/admin/practitioners/:practitionerId', (req, res) =>
    adminController.updatePractitioner(req, res));
router.put('/clinic/:clinicId/admin/practitioners/:practitionerId/calendar', (req, res) =>
    adminController.updateCalendarIntegration(req, res));

// Patients
router.get('/clinic/:clinicId/admin/patients', (req, res) =>
    adminController.getPatients(req, res));

// Appointments
router.get('/clinic/:clinicId/admin/appointments', (req, res) =>
    adminController.getAppointments(req, res));

// System Logs
router.get('/clinic/:clinicId/admin/logs', (req, res) =>
    adminController.getSystemLogs(req, res));

// Clinic Settings
router.get('/clinic/:clinicId/admin/settings', (req, res) =>
    adminController.getClinicDetails(req, res));
router.put('/clinic/:clinicId/admin/settings', (req, res) =>
    adminController.updateClinicDetails(req, res));

// Treatment Types
router.get('/clinic/:clinicId/admin/treatments', (req, res) =>
    adminController.getTreatmentTypes(req, res));
router.post('/clinic/:clinicId/admin/treatments', (req, res) =>
    adminController.createTreatmentType(req, res));
router.put('/clinic/:clinicId/admin/treatments/:treatmentId', (req, res) =>
    adminController.updateTreatmentType(req, res));
router.delete('/clinic/:clinicId/admin/treatments/:treatmentId', (req, res) =>
    adminController.deleteTreatmentType(req, res));

// Practitioner-Treatment links
router.get('/clinic/:clinicId/admin/practitioners/:practitionerId/treatments', (req, res) =>
    adminController.getPractitionerTreatments(req, res));
router.put('/clinic/:clinicId/admin/practitioners/:practitionerId/treatments', (req, res) =>
    adminController.updatePractitionerTreatments(req, res));

export default router;
```

### 7.3 Routes Super Admin

**Fichier** : `src/routes/superAdminRoutes.ts`

```typescript
import express from 'express';
import { SuperAdminController } from '../controllers/SuperAdminController';
import {
    authenticateToken,
    requireSuperAdmin,
    authenticateTokenFromQueryOrHeader
} from '../middleware/auth';

const router = express.Router();
const superAdminController = new SuperAdminController();

// Login public
router.post('/login', (req, res) => superAdminController.login(req, res));

// Servir images (avec vérification superadmin)
router.get('/images/:clinicId/:filename',
    authenticateTokenFromQueryOrHeader,
    requireSuperAdmin,
    (req, res) => superAdminController.serveImage(req, res));

// Routes protégées superadmin
router.use(authenticateToken, requireSuperAdmin);

router.get('/stats', (req, res) =>
    superAdminController.getGlobalStats(req, res));
router.get('/practitioners', (req, res) =>
    superAdminController.getAllPractitioners(req, res));
router.get('/practitioners/:practitionerId', (req, res) =>
    superAdminController.getPractitionerDetails(req, res));
router.get('/logs', (req, res) =>
    superAdminController.getAllLogs(req, res));
router.get('/conversations', (req, res) =>
    superAdminController.getAllConversations(req, res));
router.get('/conversations/:conversationId', (req, res) =>
    superAdminController.getConversation(req, res));
router.get('/conversations/:conversationId/analysis', (req, res) =>
    superAdminController.getConversationAnalysis(req, res));
router.get('/patients', (req, res) =>
    superAdminController.getAllPatients(req, res));
router.get('/clinics', (req, res) =>
    superAdminController.getAllClinics(req, res));
router.get('/clinics/:clinicId', (req, res) =>
    superAdminController.getClinicDetails(req, res));
router.get('/appointments', (req, res) =>
    superAdminController.getAllAppointments(req, res));
router.put('/clinics/:clinicId', (req, res) =>
    superAdminController.updateClinic(req, res));
router.put('/practitioners/:practitionerId', (req, res) =>
    superAdminController.updatePractitioner(req, res));

export default router;
```

### 7.4 Routes OAuth

**Fichier** : `src/routes/oauthRoutes.ts`

```typescript
import { Router } from 'express';
import { oauthController } from '../controllers/OAuthController';

const router = Router();

// Démarrer le flux OAuth pour un praticien
// Query params: practitionerId, clinicId
router.get('/authorize', (req, res) => oauthController.authorize(req, res));

// Callback enregistré dans Google Cloud Console
router.get('/callback', (req, res) => oauthController.callback(req, res));

export default router;
```

### 7.5 Middleware d'authentification

**Fichier** : `src/middleware/auth.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

export interface AuthRequest extends Request {
    clinicId?: string;
    userId?: string;
    userRole?: string;
}

/**
 * Authenticate JWT token from Authorization header
 * Authentifier le token JWT depuis le header Authorization
 */
export const authenticateToken = async (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.clinicId = decoded.clinicId;
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

/**
 * Authenticate token from header OR query parameter (for image URLs)
 * Authentifier le token depuis le header OU le paramètre de requête
 */
export const authenticateTokenFromQueryOrHeader = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.split(' ')[1];
    const queryToken = req.query.token as string;

    const token = headerToken || queryToken;

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.clinicId = decoded.clinicId;
        req.userId = decoded.userId;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

/**
 * Validate that user has access to the clinic in URL
 * Valider que l'utilisateur a accès à la clinique dans l'URL
 */
export const validateClinicAccess = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const clinicIdFromUrl = req.params.clinicId;
    const clinicIdFromToken = req.clinicId;

    if (!clinicIdFromUrl) {
        return res.status(400).json({ error: 'ID de clinique manquant dans l\'URL' });
    }

    // Autoriser le SUPERADMIN à accéder à toutes les cliniques
    if (req.userRole === 'SUPERADMIN') {
        return next();
    }

    if (clinicIdFromUrl !== clinicIdFromToken) {
        return res.status(403).json({
            error: 'Accès refusé : vous n\'avez pas accès à cette clinique'
        });
    }

    next();
};

/**
 * Require SUPERADMIN role
 * Exiger le rôle SUPERADMIN
 */
export const requireSuperAdmin = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.userRole !== 'SUPERADMIN') {
        return res.status(403).json({
            error: 'Accès refusé : privilèges SuperAdmin requis'
        });
    }
    next();
};

/**
 * Generate JWT token
 * Générer un token JWT
 */
export const generateToken = (userId: string, clinicId: string, role: string) => {
    return jwt.sign({ userId, clinicId, role }, JWT_SECRET, { expiresIn: '24h' });
};

/**
 * Hash password with bcrypt
 * Hasher le mot de passe avec bcrypt
 */
export const hashPassword = async (password: string): Promise<string> => {
    return bcrypt.hash(password, 10);
};

/**
 * Compare password with hash
 * Comparer le mot de passe avec le hash
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
    return bcrypt.compare(password, hash);
};
```

---

## 8. Schéma de base de données

Le schéma complet est défini dans `prisma/schema.prisma`. Voici les modèles principaux avec leurs relations.

### 8.1 Diagramme ERD

```mermaid
erDiagram
    Clinic ||--o{ Practitioner : has
    Clinic ||--o{ ClinicWhatsAppConfig : has
    Clinic ||--o{ Conversation : has
    Clinic ||--o{ Patient : has
    Clinic ||--o{ ClinicUser : has

    Practitioner ||--o| PractitionerCalendarIntegration : has
    Practitioner ||--o{ Appointment : performs
    Practitioner ||--o{ PractitionerTreatment : offers

    TreatmentType ||--o{ PractitionerTreatment : "offered by"
    TreatmentType ||--o{ Appointment : "used in"

    Patient ||--o{ Appointment : books

    Conversation ||--o{ Message : contains

    Appointment }o--|| Practitioner : "with"
    Appointment }o--|| Patient : "for"
    Appointment }o--o| TreatmentType : "of type"
```

### 8.2 Modèles principaux

Voir le fichier `prisma/schema.prisma` pour le schéma complet avec tous les champs et relations.

**Tables** :
- `clinics` : Informations sur les cliniques
- `practitioners` : Praticiens (médecins, dentistes)
- `practitioner_calendar_integrations` : Intégrations Google Calendar
- `treatment_types` : Types de traitements disponibles
- `practitioner_treatments` : Relation many-to-many praticiens-traitements
- `clinic_whatsapp_configs` : Configurations WhatsApp par clinique
- `conversations` : Conversations WhatsApp
- `messages` : Messages échangés
- `patients` : Dossiers patients
- `appointments` : Rendez-vous planifiés
- `system_logs` : Journaux système
- `clinic_users` : Utilisateurs administrateurs

---

## 9. Configuration des variables d'environnement

### 9.1 Fichier .env complet

```env
# ===== SERVEUR =====
PORT=3000
NODE_ENV=production

# ===== BASE DE DONNÉES =====
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/medical_assistant?schema=public"

# ===== LLM (OLLAMA) =====
LLM_API_URL="http://localhost:11434/api/generate"
LLM_MODEL_NAME="sophie"

# ===== SÉCURITÉ =====
# Générer avec : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET="votre-super-secret-jwt-key-change-in-production-2024-abcd1234"

# ===== TWILIO WHATSAPP =====
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="votre-auth-token-twilio"
TWILIO_PHONE_NUMBER="+14155238886"

# ===== GOOGLE OAUTH2 (CALENDAR) =====
GOOGLE_CLIENT_ID="160111944168-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxxxxxxxxxxxxxxxxxxxxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"

# ===== NGROK (Développement) =====
# Pour exposer le serveur local à Internet
# NGROK_URL="https://abcd-123.ngrok-free.app"
```

### 9.2 Génération de secrets sécurisés

```bash
# JWT Secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Webhook Secret
node -e "console.log(require('crypto').randomBytes(24).toString('base64'))"

# Verify Token WhatsApp
node -e "console.log('SOPHIE_VERIFY_' + Math.random().toString(36).substring(2, 15))"
```

---

## 10. Tests et débogage

### 10.1 Tester l'extraction LLM

**Script** : `scripts/test-llm.ts`

```typescript
import { llmService } from '../src/services/LLMService';

async function testExtraction() {
    const testMessages = [
        "Bonjour, je voudrais prendre un rendez-vous",
        "Mon nom est Marie Dubois",
        "Je suis née le 15/05/1980",
        "Mon email est marie@example.com",
        "Je voudrais un rendez-vous avec Dr Leal pour un nettoyage dentaire",
        "Demain matin si possible"
    ];

    for (const message of testMessages) {
        console.log(`\n🗣️ Patient: "${message}"`);
        const result = await llmService.extractEntities(
            message,
            "Clinique Trèfle d'Or",
            'fr',
            {}
        );
        console.log('📋 Résultat:', JSON.stringify(result, null, 2));
    }
}

testExtraction().then(() => process.exit(0));
```

```bash
npx ts-node scripts/test-llm.ts
```

### 10.2 Tester les webhooks localement avec ngrok

```bash
# Installer ngrok
npm install -g ngrok

# Exposer le serveur local
ngrok http 3000

# Copier l'URL https fournie (ex: https://abcd-123.ngrok-free.app)
# Configurer cette URL dans Meta comme webhook URL
```

### 10.3 Logs structurés

Le système utilise `LogService` pour des logs structurés :

```typescript
await logService.info('WHATSAPP', 'MESSAGE_RECEIVED', 'Message received', {
    conversation_id: conversationId,
    clinic_id: clinicId,
    metadata: { length: message.length }
});

await logService.error('LLM', 'EXTRACTION_ERROR', 'Failed to extract', error, {
    conversation_id: conversationId
});
```

Consulter les logs via le dashboard admin ou directement en base :

```sql
SELECT * FROM system_logs
WHERE level = 'ERROR'
AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;
```

### 10.4 Débogage des conversations

Utiliser Prisma Studio pour inspecter les conversations en temps réel :

```bash
npx prisma studio
```

Ouvrir `http://localhost:5555` et naviguer dans les tables `conversations`, `messages`, `context_data`.

---

## 11. Considérations de déploiement

### 11.1 Checklist pré-production

- [ ] Changer tous les secrets et tokens
- [ ] Activer HTTPS (Let's Encrypt, Cloudflare)
- [ ] Configurer le webhook_secret pour validation HMAC
- [ ] Utiliser une base PostgreSQL managée (AWS RDS, Render, etc.)
- [ ] Configurer les backups automatiques
- [ ] Mettre en place un monitoring (Sentry, Datadog)
- [ ] Limiter le rate limiting sur les endpoints publics
- [ ] Restreindre les CORS aux domaines autorisés
- [ ] Utiliser un reverse proxy (Nginx)
- [ ] Activer les logs de production

### 11.2 Déploiement sur Render.com

**Étapes** :

1. Créer un service Web
2. Connecter le dépôt GitHub
3. Configurer les variables d'environnement
4. Build Command : `npm install && npm run build`
5. Start Command : `npm start`
6. Ajouter une base PostgreSQL Render

### 11.3 Déploiement Docker

**Dockerfile** :

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**docker-compose.yml (production)** :

```yaml
version: '3.8'

services:
  sophie-app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/medical_assistant
      - LLM_API_URL=http://ollama:11434/api/generate
    depends_on:
      - postgres
      - ollama
    restart: unless-stopped

  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: medical_assistant
      POSTGRES_USER: user
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  ollama:
    image: ollama/ollama:latest
    volumes:
      - ollama_data:/root/.ollama
    restart: unless-stopped

volumes:
  postgres_data:
  ollama_data:
```

### 11.4 Sécurité en production

**HTTPS obligatoire** :

```typescript
// Rediriger HTTP vers HTTPS
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
        return res.redirect('https://' + req.headers.host + req.url);
    }
    next();
});
```

**Helmet.js pour headers de sécurité** :

```bash
npm install helmet
```

```typescript
import helmet from 'helmet';
app.use(helmet());
```

**Rate limiting** :

```bash
npm install express-rate-limit
```

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // 100 requêtes par IP
});

app.use('/api/', limiter);
```

### 11.5 Monitoring et alertes

**Configuration Sentry** :

```bash
npm install @sentry/node
```

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 1.0,
});

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

---

## 12. Ressources et support

### 12.1 Documentation officielle

- **Prisma** : https://www.prisma.io/docs
- **Express** : https://expressjs.com/
- **WhatsApp Business API** : https://developers.facebook.com/docs/whatsapp
- **Google Calendar API** : https://developers.google.com/calendar/api
- **Ollama** : https://ollama.ai/docs

### 12.2 Communauté

- **Discord Sophie** : [Lien à venir]
- **GitHub Issues** : https://github.com/votre-org/sophie/issues
- **Forum** : [Lien à venir]

### 12.3 Contact

- **Email** : support@aidamedical.com
- **Documentation** : https://docs.aidamedical.com

---

**Équipe de développement** : AIDA Medical
**Version du guide** : 3.0
**Dernière mise à jour** : 28 janvier 2026
