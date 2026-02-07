# 🏥 Configuration Multi-Clinique - Architecture SaaS

> **Version**: 3.0
> **Dernière mise à jour**: 28 janvier 2026
> **Équipe**: AIDA Medical

---

## 📋 Table des Matières

1. [Architecture SaaS et Isolation](#1-architecture-saas-et-isolation)
2. [Schéma Base de Données Multi-Tenant](#2-schéma-base-de-données-multi-tenant)
3. [Configuration d'une Nouvelle Clinique](#3-configuration-dune-nouvelle-clinique)
4. [Configuration WhatsApp Business par Clinique](#4-configuration-whatsapp-business-par-clinique)
5. [Configuration Google Calendar par Praticien](#5-configuration-google-calendar-par-praticien)
6. [Exemples de Code](#6-exemples-de-code)

---

## 1. 🏗️ Architecture SaaS et Isolation

### 1.1 Principe Fondamental

Sophie est nativement conçue comme une solution **SaaS (Software as a Service)**. Une seule instance du serveur peut gérer un nombre illimité de cliniques avec une **isolation totale** des données.

### 1.2 Mécanisme d'Isolation

L'isolation repose sur le champ `clinic_id` (UUID) présent dans toutes les tables critiques :

```
┌─────────────────────────────────────────┐
│         Instance Sophie Unique          │
│                                         │
│  ┌────────────┐  ┌────────────┐       │
│  │ Clinique A │  │ Clinique B │  ...  │
│  ├────────────┤  ├────────────┤       │
│  │ clinic_id: │  │ clinic_id: │       │
│  │ abc-123    │  │ def-456    │       │
│  │            │  │            │       │
│  │ • Patients │  │ • Patients │       │
│  │ • RDV      │  │ • RDV      │       │
│  │ • Convos   │  │ • Convos   │       │
│  │ • WhatsApp │  │ • WhatsApp │       │
│  └────────────┘  └────────────┘       │
└─────────────────────────────────────────┘
```

### 1.3 Points d'Isolation

| Composant | Mécanisme d'Isolation |
|-----------|----------------------|
| **Base de Données** | Toutes les requêtes incluent `WHERE clinic_id = ?` |
| **WhatsApp API** | Chaque clinique a ses propres credentials (token, phone number) |
| **Google Calendar** | Chaque praticien a son propre OAuth token |
| **Webhooks** | URL unique par clinique : `/webhook/whatsapp/{clinicId}` |
| **Dashboard Admin** | Authentification JWT avec `clinicId` embedé |
| **Uploads** | Stockage fichiers dans `uploads/{media-type}/{clinicId}/` |

### 1.4 Avantages de l'Architecture

- ✅ **Scalabilité** : Ajout de nouvelles cliniques sans modification du code
- ✅ **Sécurité** : Isolation complète des données par design
- ✅ **Maintenance** : Une seule instance à déployer et maintenir
- ✅ **Coûts** : Mutualisation de l'infrastructure
- ✅ **Updates** : Déploiement simultané pour toutes les cliniques

---

## 2. 🗄️ Schéma Base de Données Multi-Tenant

### 2.1 Tables Principales avec clinic_id

**Fichier**: `prisma/schema.prisma`

```prisma
// ==========================================
// TABLE MAÎTRE : Clinique
// ==========================================
model Clinic {
  id                String   @id @default(uuid()) @db.Uuid
  name              String?  @db.VarChar
  timezone          String?  @db.VarChar            // Ex: "Europe/Paris"
  default_language  String?  @default("fr") @db.VarChar
  phone             String?  @db.VarChar
  address           String?  @db.Text
  email             String?  @db.VarChar
  website           String?  @db.VarChar
  opening_hours     String?  @db.Text              // Ex: "Lun-Ven: 9h-18h"
  emergency_message String?  @db.Text
  onboarding_form_url String?  @db.Text
  is_active         Boolean  @default(true)
  created_at        DateTime @default(now()) @db.Timestamp

  // Relations (toutes les données appartiennent à une clinique)
  practitioners     Practitioner[]
  whatsapp_configs  ClinicWhatsAppConfig[]
  conversations     Conversation[]
  patients          Patient[]
  logs              SystemLog[]
  users             ClinicUser[]

  @@map("clinics")
}

// ==========================================
// UTILISATEURS (ADMINS DE CLINIQUE)
// ==========================================
model ClinicUser {
  id        String   @id @default(uuid()) @db.Uuid
  clinic_id String   @db.Uuid                    // 🔑 Clé d'isolation
  username  String   @unique @db.VarChar
  password  String   @db.VarChar                 // Hash bcrypt
  role      String   @default("ADMIN") @db.VarChar // ADMIN ou SUPERADMIN
  created_at DateTime @default(now())

  clinic    Clinic   @relation(fields: [clinic_id], references: [id])

  @@map("clinic_users")
}

// ==========================================
// PRATICIENS
// ==========================================
model Practitioner {
  id                  String   @id @default(uuid()) @db.Uuid
  clinic_id           String   @db.Uuid            // 🔑 Clé d'isolation
  first_name          String?  @db.VarChar
  last_name           String?  @db.VarChar
  specialty           String?  @db.VarChar
  google_calendar_id  String   @db.VarChar         // ID du calendrier Google
  is_active           Boolean  @default(true)
  created_at          DateTime @default(now()) @db.Timestamp

  clinic              Clinic   @relation(fields: [clinic_id], references: [id])
  calendar_integration PractitionerCalendarIntegration?
  appointments        Appointment[]
  treatments          PractitionerTreatment[]

  @@map("practitioners")
}

// ==========================================
// CONFIGURATION WHATSAPP PAR CLINIQUE
// ==========================================
model ClinicWhatsAppConfig {
  id              String   @id @default(uuid()) @db.Uuid
  clinic_id       String   @db.Uuid                // 🔑 Clé d'isolation
  phone_number    String   @unique @db.VarChar     // Phone Number ID (Meta)
  verify_token    String   @db.VarChar             // Pour vérification webhook
  access_token    String   @db.Text                // Token Meta permanent
  webhook_secret  String?  @db.VarChar             // Pour HMAC validation
  api_version     String   @default("v18.0") @db.VarChar
  provider        String   @default("meta") @db.VarChar
  is_active       Boolean  @default(true)
  created_at      DateTime @default(now()) @db.Timestamp

  clinic          Clinic   @relation(fields: [clinic_id], references: [id])

  @@map("clinic_whatsapp_configs")
}

// ==========================================
// CONVERSATIONS
// ==========================================
model Conversation {
  id                String   @id @default(uuid()) @db.Uuid
  clinic_id         String   @db.Uuid                // 🔑 Clé d'isolation
  user_phone        String   @db.VarChar
  wa_id             String   @db.VarChar
  current_state     String   @default("IDLE") @db.VarChar
  detected_language String?  @default("fr") @db.VarChar
  context_data      Json?
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  clinic            Clinic   @relation(fields: [clinic_id], references: [id])
  messages          Message[]
  logs              SystemLog[]

  @@unique([clinic_id, wa_id])                      // Une conversation par patient par clinique
  @@map("conversations")
}

// ==========================================
// PATIENTS
// ==========================================
model Patient {
  id                        String   @id @default(uuid()) @db.Uuid
  clinic_id                 String   @db.Uuid        // 🔑 Clé d'isolation
  first_name                String?  @db.VarChar
  last_name                 String?  @db.VarChar
  phone                     String   @db.VarChar
  email                     String?  @db.VarChar
  birth_date                DateTime? @db.Date
  insurance_card_url        String? @db.Text
  has_social_insurance      Boolean?
  social_insurance_type     String?  @db.VarChar
  beneficiary_number        String?  @db.VarChar
  guarantee_number          String?  @db.VarChar
  guarantee_document_path   String?  @db.Text
  created_at                DateTime @default(now()) @db.Timestamp

  clinic          Clinic   @relation(fields: [clinic_id], references: [id])
  appointments    Appointment[]

  @@unique([clinic_id, phone])                      // Un patient par téléphone par clinique
  @@map("patients")
}
```

### 2.2 Stratégie d'Index pour Performance

```sql
-- Index sur clinic_id pour toutes les tables principales
CREATE INDEX idx_conversations_clinic ON conversations(clinic_id);
CREATE INDEX idx_patients_clinic ON patients(clinic_id);
CREATE INDEX idx_practitioners_clinic ON practitioners(clinic_id);
CREATE INDEX idx_appointments_clinic ON appointments(practitioner_id);
CREATE INDEX idx_logs_clinic ON system_logs(clinic_id);

-- Index composites pour requêtes fréquentes
CREATE INDEX idx_conversation_clinic_phone ON conversations(clinic_id, user_phone);
CREATE INDEX idx_patient_clinic_phone ON patients(clinic_id, phone);
```

---

## 3. 🆕 Configuration d'une Nouvelle Clinique

### 3.1 Via Dashboard Super Admin

**URL**: `https://domaine.com/superadmin`

1. Se connecter en tant que Super Admin
2. Aller dans "Gestion des Cliniques"
3. Cliquer sur "Créer une Nouvelle Clinique"
4. Remplir le formulaire :

```typescript
{
  name: "Clinique Dentaire du Centre",
  timezone: "Europe/Paris",           // Important pour gestion des RDV
  phone: "+33 1 23 45 67 89",
  address: "123 Avenue de la République, 75011 Paris",
  email: "contact@clinique-centre.fr",
  website: "https://clinique-centre.fr",
  opening_hours: "Lundi-Vendredi: 9h-18h, Samedi: 9h-13h",
  emergency_message: "Pour les urgences, appelez le 15.",
  default_language: "fr"
}
```

### 3.2 Via API REST

**Endpoint**: `POST /api/superadmin/clinics`

```bash
curl -X POST https://domaine.com/api/superadmin/clinics \
  -H 'Authorization: Bearer SUPER_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Clinique Dentaire du Centre",
    "timezone": "Europe/Paris",
    "phone": "+33 1 23 45 67 89",
    "address": "123 Avenue de la République, 75011 Paris",
    "email": "contact@clinique-centre.fr",
    "opening_hours": "Lundi-Vendredi: 9h-18h, Samedi: 9h-13h",
    "default_language": "fr"
  }'
```

**Réponse**:
```json
{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "name": "Clinique Dentaire du Centre",
  "timezone": "Europe/Paris",
  "is_active": true,
  "created_at": "2026-01-28T10:30:00.000Z"
}
```

### 3.3 Via SQL Direct

```sql
-- Créer la clinique
INSERT INTO clinics (
  id,
  name,
  timezone,
  phone,
  address,
  email,
  opening_hours,
  default_language,
  is_active
) VALUES (
  gen_random_uuid(),
  'Clinique Dentaire du Centre',
  'Europe/Paris',
  '+33 1 23 45 67 89',
  '123 Avenue de la République, 75011 Paris',
  'contact@clinique-centre.fr',
  'Lundi-Vendredi: 9h-18h, Samedi: 9h-13h',
  'fr',
  true
)
RETURNING id;

-- Récupérer l'ID généré pour les étapes suivantes
-- Exemple: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### 3.4 Créer un Compte Admin pour la Clinique

```bash
# Générer le hash du mot de passe
node -e "const bcrypt = require('bcryptjs'); console.log(bcrypt.hashSync('MotDePasseAdmin123', 10));"

# Copier le hash généré
# Exemple: $2a$10$N9qo8uLOickgx2ZMRZoMye6p5n0uX3Yq...
```

```sql
INSERT INTO clinic_users (
  id,
  clinic_id,
  username,
  password,
  role
) VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- ID de la clinique créée
  'admin@clinique-centre',
  '$2a$10$N9qo8uLOickgx2ZMRZoMye6p5n0uX3Yq...',
  'ADMIN'
);
```

---

## 4. 📱 Configuration WhatsApp Business par Clinique

### 4.1 Prérequis Meta

1. Créer une application Meta Developer : https://developers.facebook.com/apps
2. Ajouter le produit "WhatsApp"
3. Obtenir :
   - **Phone Number ID** (identifiant du numéro)
   - **Access Token** (token d'accès permanent)
   - **Webhook Verify Token** (token de vérification personnalisé)

### 4.2 Configuration dans Sophie

#### Via Dashboard Super Admin

1. Se connecter sur `https://domaine.com/superadmin`
2. Sélectionner la clinique
3. Aller dans "Configuration WhatsApp"
4. Remplir :

```typescript
{
  phone_number_id: "123456789012345",           // De Meta Business
  access_token: "EAAG...(long_token)",          // Token permanent Meta
  verify_token: "wh_verify_AbCd1234",           // Token personnalisé
  webhook_secret: "secret_hmac_validation",     // Pour sécurité HMAC
  api_version: "v18.0"                          // Version API Meta
}
```

#### Via SQL

```sql
INSERT INTO clinic_whatsapp_configs (
  id,
  clinic_id,
  phone_number,
  verify_token,
  access_token,
  webhook_secret,
  api_version,
  is_active
) VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',      -- ID de la clinique
  '123456789012345',                            -- Phone Number ID Meta
  'wh_verify_AbCd1234',                         -- Token de vérification
  'EAAG...(long_token)',                        -- Access Token Meta
  'secret_hmac_validation_key',                 -- Secret pour HMAC
  'v18.0',
  true
);
```

### 4.3 Configuration du Webhook Meta

**URL du Webhook** : `https://votre-domaine.com/webhook/whatsapp/{clinicId}`

Exemple pour la clinique créée :
```
https://api.sophie-medical.com/webhook/whatsapp/a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Dans Meta Developer Console**:

1. Aller dans "WhatsApp" → "Configuration"
2. Section "Webhook"
3. Cliquer sur "Modifier"
4. URL de rappel : `https://votre-domaine.com/webhook/whatsapp/{clinicId}`
5. Token de vérification : `wh_verify_AbCd1234` (même que dans la DB)
6. Cliquer sur "Vérifier et enregistrer"
7. S'abonner aux événements : `messages`

### 4.4 Code : Gestion Multi-Clinique dans Webhook

**Fichier**: `src/routes/webhookRoutes.ts`

```typescript
router.post('/webhook/whatsapp/:clinicId',
    express.json({ verify: captureRawBody }),
    async (req, res) => {
        const clinicId = req.params.clinicId;

        try {
            // 1. Charger la configuration de la clinique
            const clinicConfig = await prisma.clinicWhatsAppConfig.findFirst({
                where: {
                    clinic_id: clinicId,
                    is_active: true
                },
                include: { clinic: true }
            });

            if (!clinicConfig) {
                await logService.error('WEBHOOK', 'CONFIG_NOT_FOUND',
                    `Aucune config WhatsApp pour clinique ${clinicId}`,
                    null,
                    { clinic_id: clinicId }
                );
                return res.status(404).send('Clinic config not found');
            }

            // 2. Valider la signature HMAC
            const signature = req.headers['x-hub-signature-256'];
            const rawBody = (req as any).rawBody;

            if (clinicConfig.webhook_secret) {
                const expectedSignature = 'sha256=' + crypto
                    .createHmac('sha256', clinicConfig.webhook_secret)
                    .update(rawBody)
                    .digest('hex');

                if (signature !== expectedSignature) {
                    return res.status(403).send('Invalid signature');
                }
            }

            // 3. Traiter le message dans le contexte de la clinique
            await whatsAppService.handleIncomingMessage(
                req.body,
                clinicId
            );

            res.sendStatus(200);
        } catch (error) {
            console.error('Webhook error:', error);
            res.sendStatus(500);
        }
    }
);

// Vérification webhook (GET)
router.get('/webhook/whatsapp/:clinicId', async (req, res) => {
    const clinicId = req.params.clinicId;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe') {
        // Vérifier le token de la clinique
        const config = await prisma.clinicWhatsAppConfig.findFirst({
            where: {
                clinic_id: clinicId,
                is_active: true
            }
        });

        if (config && token === config.verify_token) {
            return res.status(200).send(challenge);
        }
    }

    res.sendStatus(403);
});
```

### 4.5 Isolation des Conversations

**Fichier**: `src/services/WhatsAppService.ts`

```typescript
async handleIncomingMessage(payload: any, clinicId: string) {
    const entry = payload.entry?.[0];
    const message = entry?.changes?.[0]?.value?.messages?.[0];

    if (!message) return;

    const userPhone = message.from;
    const waId = message.from;

    // Créer ou récupérer la conversation DANS LE CONTEXTE DE LA CLINIQUE
    const conversation = await conversationManager.getOrCreateConversation(
        clinicId,          // 🔑 Clé d'isolation
        waId,
        userPhone
    );

    // Toute la logique suivante est isolée par clinic_id
    const responseMessage = await conversationManager.processMessageWithSophie(
        conversation.id,
        message.text?.body || '',
        conversation.clinic.name  // Nom de LA clinique spécifique
    );

    // Envoyer la réponse avec les credentials de CETTE clinique
    await this.sendMessage(
        userPhone,
        responseMessage,
        clinicConfig,
        conversation.id
    );
}
```

---

## 5. 📅 Configuration Google Calendar par Praticien

### 5.1 Prérequis Google Cloud

1. Créer un projet Google Cloud : https://console.cloud.google.com/
2. Activer "Google Calendar API"
3. Créer des identifiants OAuth 2.0 :
   - Type : Application Web
   - URI de redirection : `https://domaine.com/oauth/callback`
4. Copier Client ID et Client Secret dans `.env`

### 5.2 Flux OAuth par Praticien

**Chaque praticien doit lier son propre calendrier Google.**

#### Étape 1 : Créer le Praticien

```sql
INSERT INTO practitioners (
  id,
  clinic_id,
  first_name,
  last_name,
  specialty,
  google_calendar_id,
  is_active
) VALUES (
  gen_random_uuid(),
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890',  -- ID de la clinique
  'Anna',
  'Rufenacht',
  'Dentiste',
  'primary',                                -- 'primary' = calendrier principal
  true
)
RETURNING id;

-- Exemple d'ID généré: p1p2p3p4-p5p6-p789-p0ab-pdef01234567
```

#### Étape 2 : Lier Google Calendar

1. Dans le dashboard admin de la clinique
2. Aller dans "Praticiens"
3. Cliquer sur "Dr. Rufenacht"
4. Cliquer sur "Connecter Google Calendar"
5. Autoriser l'application Sophie
6. Les tokens sont automatiquement stockés

#### Code : OAuth Flow

**Fichier**: `src/controllers/OAuthController.ts`

```typescript
export class OAuthController {
    // Étape 1: Rediriger vers Google
    async initiateAuth(req: Request, res: Response) {
        const practitionerId = req.query.practitioner_id as string;
        const clinicId = req.query.clinic_id as string;

        // Générer l'URL d'autorisation Google
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/calendar'],
            state: JSON.stringify({ practitionerId, clinicId })
        });

        res.redirect(authUrl);
    }

    // Étape 2: Callback après autorisation
    async handleCallback(req: Request, res: Response) {
        const code = req.query.code as string;
        const state = JSON.parse(req.query.state as string);

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        // Échanger le code contre des tokens
        const { tokens } = await oauth2Client.getToken(code);

        // Récupérer le praticien
        const practitioner = await prisma.practitioner.findUnique({
            where: { id: state.practitionerId }
        });

        if (!practitioner) {
            return res.status(404).send('Practitioner not found');
        }

        // Stocker les tokens dans la base de données
        await prisma.practitionerCalendarIntegration.upsert({
            where: { practitioner_id: state.practitionerId },
            create: {
                practitioner_id: state.practitionerId,
                provider: 'google',
                calendar_id: practitioner.google_calendar_id,
                access_token: tokens.access_token!,
                refresh_token: tokens.refresh_token!,
                token_expiry: tokens.expiry_date
                    ? new Date(tokens.expiry_date)
                    : null,
                is_active: true
            },
            update: {
                access_token: tokens.access_token!,
                refresh_token: tokens.refresh_token!,
                token_expiry: tokens.expiry_date
                    ? new Date(tokens.expiry_date)
                    : null,
                is_active: true
            }
        });

        // Rediriger vers le dashboard avec succès
        res.redirect(
            `/clinic/${state.clinicId}/admin/practitioners?success=true`
        );
    }
}
```

#### Stockage des Tokens

```prisma
model PractitionerCalendarIntegration {
  id              String   @id @default(uuid()) @db.Uuid
  practitioner_id String   @unique @db.Uuid
  provider        String   @default("google") @db.VarChar
  calendar_id     String   @db.VarChar           // Ex: "primary" ou un ID spécifique
  access_token    String   @db.Text             // Token d'accès temporaire
  refresh_token   String   @db.Text             // Token de rafraîchissement
  token_expiry    DateTime? @db.Timestamp       // Expiration du access_token
  is_active       Boolean  @default(true)
  created_at      DateTime @default(now()) @db.Timestamp

  practitioner    Practitioner @relation(fields: [practitioner_id], references: [id])

  @@map("practitioner_calendar_integrations")
}
```

### 5.3 Rafraîchissement Automatique des Tokens

**Fichier**: `src/services/CalendarService.ts`

```typescript
private async getOAuth2Client(practitionerId: string) {
    const integration = await prisma.practitionerCalendarIntegration.findUnique({
        where: { practitioner_id: practitionerId }
    });

    if (!integration || !integration.is_active) {
        throw new Error('No active calendar integration');
    }

    const oauth2Client = new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
    );

    oauth2Client.setCredentials({
        access_token: integration.access_token,
        refresh_token: integration.refresh_token,
        expiry_date: integration.token_expiry?.getTime()
    });

    // ✅ Auto-refresh automatique
    oauth2Client.on('tokens', async (tokens) => {
        if (tokens.refresh_token) {
            // Mettre à jour la base de données avec les nouveaux tokens
            await prisma.practitionerCalendarIntegration.update({
                where: { practitioner_id: practitionerId },
                data: {
                    access_token: tokens.access_token!,
                    refresh_token: tokens.refresh_token,
                    token_expiry: tokens.expiry_date
                        ? new Date(tokens.expiry_date)
                        : null
                }
            });
        }
    });

    return oauth2Client;
}
```

---

## 6. 💻 Exemples de Code

### 6.1 Requêtes Isolées par Clinique

**Mauvais** (pas d'isolation) :
```typescript
// ❌ DANGER : Récupère TOUS les patients de TOUTES les cliniques
const patients = await prisma.patient.findMany();
```

**Bon** (avec isolation) :
```typescript
// ✅ Récupère uniquement les patients de LA clinique spécifiée
const patients = await prisma.patient.findMany({
    where: { clinic_id: clinicId }
});
```

### 6.2 Middleware d'Authentification avec Isolation

**Fichier**: `src/middleware/auth.ts`

```typescript
export const authenticateJWT = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const token = req.headers.authorization?.split(' ')[1] || req.query.token;

    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;

        req.user = {
            userId: decoded.userId,
            clinicId: decoded.clinicId,    // 🔑 Clé d'isolation embedée
            role: decoded.role
        };

        next();
    } catch (error) {
        return res.status(403).json({ error: 'Token invalide' });
    }
};

// Vérifier que l'utilisateur accède bien à SA clinique
export const verifyClinicAccess = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const clinicIdFromUrl = req.params.clinicId;
    const userClinicId = req.user?.clinicId;
    const userRole = req.user?.role;

    // Super admins ont accès à toutes les cliniques
    if (userRole === 'SUPERADMIN') {
        return next();
    }

    // Admins normaux : vérification stricte
    if (userClinicId !== clinicIdFromUrl) {
        return res.status(403).json({
            error: 'Accès refusé : vous n\'appartenez pas à cette clinique'
        });
    }

    next();
};
```

### 6.3 Exemple d'Utilisation dans Routes

```typescript
// src/routes/adminRoutes.ts

router.get(
    '/clinic/:clinicId/admin/patients',
    authenticateJWT,           // 1. Vérifier token JWT
    verifyClinicAccess,        // 2. Vérifier accès à la clinique
    adminController.getPatients
);

// Dans le controller
async getPatients(req: AuthRequest, res: Response) {
    const clinicId = req.params.clinicId;  // Déjà vérifié par middleware

    const patients = await prisma.patient.findMany({
        where: { clinic_id: clinicId }     // 🔑 Isolation garantie
    });

    res.json({ patients });
}
```

### 6.4 Statistiques Multi-Cliniques (Super Admin)

```typescript
// src/controllers/SuperAdminController.ts

async getGlobalStats(req: AuthRequest, res: Response) {
    // Statistiques agrégées par clinique
    const clinicStats = await prisma.clinic.findMany({
        where: { is_active: true },
        include: {
            _count: {
                select: {
                    patients: true,
                    conversations: true,
                    practitioners: true
                }
            }
        }
    });

    // Statistiques globales
    const globalStats = {
        total_clinics: clinicStats.length,
        total_patients: clinicStats.reduce((sum, c) => sum + c._count.patients, 0),
        total_conversations: clinicStats.reduce((sum, c) => sum + c._count.conversations, 0),
        total_practitioners: clinicStats.reduce((sum, c) => sum + c._count.practitioners, 0)
    };

    res.json({
        global: globalStats,
        by_clinic: clinicStats.map(c => ({
            clinic_id: c.id,
            clinic_name: c.name,
            patients: c._count.patients,
            conversations: c._count.conversations,
            practitioners: c._count.practitioners
        }))
    });
}
```

---

## 📌 Conclusion

L'architecture multi-clinique de Sophie garantit :

- ✅ **Isolation totale** des données par `clinic_id`
- ✅ **Scalabilité** horizontale illimitée
- ✅ **Sécurité** par design avec validation à chaque couche
- ✅ **Flexibilité** dans la configuration WhatsApp et Google Calendar

Pour plus de détails :

- **[Guide Complet](./guide-complet.md)**
- **[Système de Traitements](./systeme-traitements.md)**
- **[Guide d'Intégration](./guide-integration.md)**

---

**Développé avec ❤️ par AIDA Medical**
**Support**: support@aida-medical.com
