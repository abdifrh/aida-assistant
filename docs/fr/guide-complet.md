# 📚 Guide Complet du Système Sophie - Assistant Médical IA

> **Version**: 3.0
> **Dernière mise à jour**: 28 janvier 2026
> **Équipe**: AIDA Medical

---

## 📋 Table des Matières

1. [Vue d'ensemble et Architecture](#1-vue-densemble-et-architecture)
2. [Flux de Collecte des Données Patient](#2-flux-de-collecte-des-données-patient)
3. [Gestion des Médias (Images et PDFs)](#3-gestion-des-médias-images-et-pdfs)
4. [Système de Prise de Rendez-vous](#4-système-de-prise-de-rendez-vous)
5. [Machine à États (FSM)](#5-machine-à-états-fsm)
6. [Tableaux de Bord Administrateur](#6-tableaux-de-bord-administrateur)
7. [Installation et Configuration](#7-installation-et-configuration)
8. [Sécurité](#8-sécurité)
9. [Exemples de Code](#9-exemples-de-code)

---

## 1. 🏗️ Vue d'ensemble et Architecture

### 1.1 Introduction

**Sophie** est une secrétaire médicale intelligente alimentée par IA, conçue pour automatiser entièrement la gestion des rendez-vous via WhatsApp. Le système combine la puissance des modèles de langage (LLM) avec une machine à états finis (FSM) rigoureuse pour offrir une expérience conversationnelle naturelle, sécurisée et fiable.

### 1.2 Fonctionnalités Principales

- 🤖 **IA Conversationnelle** : Compréhension du langage naturel pour dates relatives
- 📅 **Planification Intelligente** : Suggestions de créneaux en temps réel
- 🔄 **Machine à États Robuste** : Transitions fluides entre états
- 🏥 **Architecture SaaS Multi-Tenant** : Isolation complète par clinique
- 📸 **Gestion des Médias** : Téléchargement automatique d'images et PDFs
- 🔐 **Sécurité Avancée** : Validation HMAC SHA-256, authentification JWT
- 📊 **Tableaux de Bord Complets** : Interfaces admin et super-admin
- 🌐 **Synchronisation Temps Réel** : Intégration bidirectionnelle Google Calendar

### 1.3 Stack Technique

```
🖥️  Runtime          : Node.js v20+ avec TypeScript
🗄️  Base de données  : PostgreSQL via Prisma ORM
🧠  LLM             : Ollama (Qwen 2.5) - modèle aida-medical-v1
💬  Interface client : WhatsApp Business Cloud API (Meta)
🎨  Dashboard       : HTML/CSS/JS natif + API Express
🐳  Infrastructure  : Docker pour PostgreSQL et services
```

### 1.4 Architecture du Projet

```
PROECTASSISTANT/
│
├── 📁 src/
│   ├── 📁 services/              # Couche logique métier
│   │   ├── ConversationManager.ts    # ⚙️ FSM & orchestration
│   │   ├── SophieService.ts          # 🧠 Intégration LLM
│   │   ├── CalendarService.ts        # 📅 Sync Google Calendar
│   │   ├── WhatsAppService.ts        # 💬 API WhatsApp Business
│   │   ├── MediaService.ts           # 📸 Téléchargement médias
│   │   ├── LLMService.ts             # 🤖 Communication Ollama
│   │   ├── TreatmentService.ts       # 💉 Gestion des traitements
│   │   └── LogService.ts             # 📝 Logging structuré
│   │
│   ├── 📁 controllers/           # Logique de traitement
│   ├── 📁 routes/                # Points d'entrée API
│   ├── 📁 middleware/            # Middleware Express
│   ├── 📁 utils/                 # Utilitaires
│   └── 📁 types/                 # Définitions TypeScript
│
├── 📁 prisma/                    # Schéma base de données
├── 📁 public/                    # Frontend dashboards
├── 📁 uploads/                   # Stockage médias
└── 📁 docs/                      # Documentation
```

---

## 2. 📋 Flux de Collecte des Données Patient

### 2.1 Informations Obligatoires

| Champ | Format | Exemple |
|-------|--------|---------|
| **Prénom** | Texte | "Marie" |
| **Nom** | Texte | "Dubois" |
| **Date de naissance** | JJ/MM/AAAA | "15/05/1980" |
| **Email** | Format email | "marie@email.com" |
| **Carte d'assurance** | Image JPEG/PNG | Photo de la carte |

### 2.2 Assurance Sociale (Optionnel)

Après réception de la carte d'assurance, Sophie demande :

```
💬 Sophie: "Bénéficiez-vous d'une assurance sociale
           (Hospice générale ou SPC) ?"

→ Si OUI:
  💬 "De quel type ?"
     "1. Hospice générale"
     "2. SPC"

  💬 "Veuillez fournir votre numéro de bénéficiaire
     ou envoyez le document de garantie en PDF."

→ Si NON:
  💬 "Passons à la prise de rendez-vous."
```

### 2.3 Code Exemple : Collecte Patient

**Fichier**: `src/services/ConversationManager.ts`

```typescript
// État: COLLECTING_PATIENT_DATA
if (currentState === ConversationState.COLLECTING_PATIENT_DATA) {
    const entities = llmResponse.entities || {};

    // Mise à jour du contexte
    if (entities.first_name) {
        currentContext.patient!.first_name = entities.first_name;
    }
    if (entities.last_name) {
        currentContext.patient!.last_name = entities.last_name;
    }
    if (entities.birth_date) {
        currentContext.patient!.birth_date = entities.birth_date;
    }
    if (entities.email) {
        currentContext.patient!.email = entities.email;
    }

    // Gestion photo carte d'assurance
    if (imagePath && !currentContext.patient?.insurance_card_url) {
        currentContext.patient!.insurance_card_url = imagePath;
        currentContext.patient!.awaiting_social_insurance_response = true;

        await this.updateConversationContext(conversationId, currentContext);

        return "Photo reçue, merci ! " +
               "Bénéficiez-vous d'une assurance sociale ?";
    }

    // Traitement réponse assurance sociale
    if (currentContext.patient?.awaiting_social_insurance_response) {
        const isYes = /\b(oui|yes|si)\b/i.test(userMessage);
        const isNo = /\b(non|no|pas)\b/i.test(userMessage);

        if (isYes) {
            currentContext.patient.has_social_insurance = true;
            currentContext.patient.awaiting_social_insurance_type = true;
            return "De quel type ? (Hospice générale ou SPC)";
        } else if (isNo) {
            currentContext.patient.has_social_insurance = false;
            // Continuer vers rendez-vous
        }
    }

    // Vérifier champs manquants
    const missing = this.checkMissingPatientFields(currentContext.patient!);
    if (missing.length > 0) {
        return this.askForMissingField(missing[0], language);
    }

    // Sauvegarder et passer à l'état suivant
    await this.saveOrUpdatePatient(clinicId, currentContext.patient!, userPhone);
    newState = ConversationState.COLLECTING_APPOINTMENT_DATA;
}
```

---

## 3. 📸 Gestion des Médias (Images et PDFs)

### 3.1 Architecture MediaService

**Fichier**: `src/services/MediaService.ts`

Le `MediaService` gère le téléchargement automatique depuis WhatsApp.

### 3.2 Structure de Stockage

```
uploads/
├── images/                    # Cartes d'assurance
│   └── {clinic_id}/
│       └── {timestamp}_{mediaId}.jpg
│
└── documents/                 # Documents de garantie
    └── {clinic_id}/
        └── {timestamp}_{mediaId}.pdf
```

### 3.3 Code Complet : MediaService

```typescript
export class MediaService {
    /**
     * Télécharger et stocker une image depuis WhatsApp
     */
    async downloadAndStoreMedia(
        mediaId: string,
        clinicId: string,
        accessToken: string,
        apiVersion: string = 'v18.0'
    ): Promise<{ filePath: string; mimeType: string } | null> {
        try {
            // Étape 1: Obtenir l'URL du média
            const mediaUrlData = await this.getMediaUrl(
                mediaId, accessToken, apiVersion
            );

            if (!mediaUrlData) return null;

            // Étape 2: Télécharger le fichier
            const fileBuffer = await this.downloadFile(
                mediaUrlData.url, accessToken
            );

            // Étape 3: Sauvegarder sur disque
            const filePath = this.saveFileToDisk(
                fileBuffer, clinicId, mediaId, mediaUrlData.mimeType
            );

            await logService.info('WHATSAPP', 'MEDIA_STORED',
                `Média stocké: ${mediaId}`,
                { clinic_id: clinicId, metadata: { file_path: filePath } }
            );

            return { filePath, mimeType: mediaUrlData.mimeType };
        } catch (error) {
            await logService.error('WHATSAPP', 'MEDIA_DOWNLOAD_ERROR',
                `Erreur téléchargement: ${mediaId}`, error,
                { clinic_id: clinicId }
            );
            return null;
        }
    }

    private async getMediaUrl(
        mediaId: string,
        accessToken: string,
        apiVersion: string
    ): Promise<{ url: string; mimeType: string } | null> {
        const url = `https://graph.facebook.com/${apiVersion}/${mediaId}`;

        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        return {
            url: response.data.url,
            mimeType: response.data.mime_type || 'image/jpeg'
        };
    }

    private async downloadFile(
        url: string,
        accessToken: string
    ): Promise<Buffer> {
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            responseType: 'arraybuffer'
        });
        return Buffer.from(response.data);
    }

    private saveFileToDisk(
        buffer: Buffer,
        clinicId: string,
        mediaId: string,
        mimeType: string
    ): string {
        this.ensureUploadDir(clinicId);

        const extension = this.getExtensionFromMimeType(mimeType);
        const timestamp = Date.now();
        const filename = `${timestamp}_${mediaId.substring(0, 20)}${extension}`;

        const filePath = path.join(
            process.cwd(), 'uploads', 'images', clinicId, filename
        );

        fs.writeFileSync(filePath, buffer);
        return filePath;
    }

    private getExtensionFromMimeType(mimeType: string): string {
        const mimeToExt: { [key: string]: string } = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
            'application/pdf': '.pdf'
        };
        return mimeToExt[mimeType] || '.jpg';
    }
}
```

---

## 4. 📅 Système de Prise de Rendez-vous

### 4.1 Flux de Réservation

```
👤 "Je voudrais un rendez-vous"

💬 "Quel type de traitement ?
   1. Nettoyage dentaire (45 min)
   2. Consultation (30 min)"

👤 "Nettoyage"

💬 "Quel praticien ?
   - Dr. Rufenacht
   - Dr. Smith"

👤 "Dr. Rufenacht"

💬 "Quand souhaitez-vous venir ?"

👤 "Demain à 14h"

💬 "Créneaux disponibles :
   1. 14:00 - 14:45
   2. 15:00 - 15:45"

👤 "14h00"

💬 "✅ Confirmez-vous ?
   📅 29 janvier 2026 à 14:00
   💉 Nettoyage dentaire
   👨‍⚕️ Dr. Rufenacht"

👤 "Oui"

💬 "✅ Rendez-vous confirmé !"
```

### 4.2 Schéma Base de Données

**Fichier**: `prisma/schema.prisma`

```prisma
model TreatmentType {
  id               String   @id @default(uuid())
  name             String   @db.VarChar
  name_en          String?  @db.VarChar
  description      String?  @db.Text
  duration_minutes Int      @default(30)
  is_active        Boolean  @default(true)

  practitioners    PractitionerTreatment[]
  appointments     Appointment[]
}

model PractitionerTreatment {
  id                String   @id @default(uuid())
  practitioner_id   String   @db.Uuid
  treatment_type_id String   @db.Uuid
  is_active         Boolean  @default(true)

  practitioner      Practitioner  @relation(...)
  treatment_type    TreatmentType @relation(...)

  @@unique([practitioner_id, treatment_type_id])
}

model Appointment {
  id                String         @id @default(uuid())
  practitioner_id   String         @db.Uuid
  patient_id        String         @db.Uuid
  treatment_type_id String?        @db.Uuid
  start_time        DateTime
  end_time          DateTime
  status            String         @default("CONFIRMED")
  google_event_id   String?        @db.VarChar

  practitioner      Practitioner   @relation(...)
  patient           Patient        @relation(...)
  treatment_type    TreatmentType? @relation(...)
}
```

### 4.3 Code : TreatmentService

**Fichier**: `src/services/TreatmentService.ts`

```typescript
export class TreatmentService {
    /**
     * Obtenir traitements disponibles pour une clinique
     */
    async getAvailableTreatmentsForClinic(clinicId: string) {
        const practitioners = await prisma.practitioner.findMany({
            where: { clinic_id: clinicId, is_active: true },
            include: {
                treatments: {
                    where: { is_active: true },
                    include: { treatment_type: true }
                }
            }
        });

        // Extraire types de traitements uniques
        const treatmentTypesMap = new Map();
        for (const practitioner of practitioners) {
            for (const pt of practitioner.treatments) {
                if (pt.treatment_type.is_active) {
                    treatmentTypesMap.set(
                        pt.treatment_type.id,
                        pt.treatment_type
                    );
                }
            }
        }

        return Array.from(treatmentTypesMap.values());
    }

    /**
     * Obtenir praticiens pour un type de traitement
     */
    async getPractitionersForTreatment(
        clinicId: string,
        treatmentTypeId: string
    ) {
        return await prisma.practitioner.findMany({
            where: {
                clinic_id: clinicId,
                is_active: true,
                treatments: {
                    some: {
                        treatment_type_id: treatmentTypeId,
                        is_active: true
                    }
                }
            },
            include: {
                treatments: {
                    where: { treatment_type_id: treatmentTypeId },
                    include: { treatment_type: true }
                }
            }
        });
    }

    /**
     * Formater pour affichage
     */
    formatTreatmentsForDisplay(
        treatments: any[],
        language: string = 'fr'
    ): string {
        if (treatments.length === 0) {
            return "Aucun traitement disponible.";
        }

        const treatmentList = treatments.map((t, index) => {
            const name = language === 'en' && t.name_en
                ? t.name_en
                : t.name;
            return `${index + 1}. ${name} (${t.duration_minutes} min)`;
        }).join('\n');

        return "Traitements disponibles :\n" + treatmentList;
    }
}
```

---

## 5. 🔄 Machine à États (FSM)

### 5.1 États Définis

**Fichier**: `src/types/conversation.ts`

```typescript
export enum ConversationState {
    IDLE = 'IDLE',                          // 🟢 Attente
    COLLECTING_PATIENT_DATA = 'COLLECTING_PATIENT_DATA',
    COLLECTING_APPOINTMENT_DATA = 'COLLECTING_APPOINTMENT_DATA',
    CONFIRMATION = 'CONFIRMATION',          // ✅ Validation
    COMPLETED = 'COMPLETED',                // ✔️ Terminé
    EMERGENCY = 'EMERGENCY'                 // 🚨 Urgence
}
```

### 5.2 Table de Transition

| État Actuel | Déclencheur | État Suivant | Action |
|-------------|-------------|--------------|--------|
| IDLE | BOOK_APPOINTMENT + Nouveau patient | COLLECTING_PATIENT_DATA | Demander prénom |
| IDLE | BOOK_APPOINTMENT + Patient connu | COLLECTING_APPOINTMENT_DATA | Demander traitement |
| COLLECTING_PATIENT_DATA | Données complètes | COLLECTING_APPOINTMENT_DATA | Sauvegarder patient |
| COLLECTING_APPOINTMENT_DATA | Date + Praticien OK | CONFIRMATION | Afficher récap |
| CONFIRMATION | AFFIRMATIVE | COMPLETED | Créer RDV |
| CONFIRMATION | NEGATIVE | IDLE | Annuler |

### 5.3 Code : Gestion États

```typescript
async processMessageWithSophie(
    conversationId: string,
    userMessage: string,
    clinicName: string
): Promise<string> {
    // Récupérer conversation
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { clinic: true }
    });

    let currentContext = conversation.context_data as any || {};
    let currentState = conversation.current_state as ConversationState;

    // Vérifier urgence
    if (isEmergencyMessage(userMessage)) {
        await this.updateConversationState(
            conversationId,
            ConversationState.EMERGENCY,
            currentContext
        );
        return "🚨 URGENCE : Appelez le 112 immédiatement !";
    }

    // Extraire entités via LLM
    const llmResponse = await llmService.extractEntities(
        userMessage, clinicName, language, { state: currentState }
    );

    let newState = currentState;
    let responseMessage = '';

    // -------- TRANSITIONS --------

    if (currentState === ConversationState.IDLE) {
        if (llmResponse.intent === Intent.BOOK_APPOINTMENT) {
            const existingPatient = await this.findPatient(
                conversation.clinic_id,
                conversation.user_phone
            );

            if (existingPatient) {
                newState = ConversationState.COLLECTING_APPOINTMENT_DATA;
                responseMessage = "Quel type de traitement ?";
            } else {
                newState = ConversationState.COLLECTING_PATIENT_DATA;
                responseMessage = "Quel est votre prénom ?";
            }
        }
    }

    else if (currentState === ConversationState.COLLECTING_PATIENT_DATA) {
        // (Code de collecte patient)
        responseMessage = await this.handlePatientDataCollection(...);
    }

    else if (currentState === ConversationState.COLLECTING_APPOINTMENT_DATA) {
        // (Code de collecte RDV)
        responseMessage = await this.handleAppointmentDataCollection(...);
    }

    else if (currentState === ConversationState.CONFIRMATION) {
        if (llmResponse.intent === Intent.AFFIRMATIVE) {
            await this.createAppointment(context);
            newState = ConversationState.COMPLETED;
            responseMessage = "✅ Rendez-vous confirmé !";
        }
    }

    await this.updateConversationState(conversationId, newState, currentContext);
    return responseMessage;
}
```

---

## 6. 📊 Tableaux de Bord Administrateur

### 6.1 Dashboard Clinique

**URL**: `https://domaine.com/clinic/{clinicId}/admin`

**Fonctionnalités**:
- 📊 Statistiques (patients, conversations, RDV)
- 💬 Conversations avec images inline
- 👥 Gestion patients
- 📅 Calendrier rendez-vous
- 👨‍⚕️ Gestion praticiens
- 💉 Configuration traitements
- 🔍 Logs système

### 6.2 Code : Endpoint Statistiques

```typescript
// src/controllers/AdminController.ts
async getDashboardStats(req: AuthRequest, res: Response) {
    const clinicId = req.params.clinicId;

    const [
        totalPatients,
        totalConversations,
        totalAppointments,
        activePractitioners
    ] = await Promise.all([
        prisma.patient.count({ where: { clinic_id: clinicId } }),
        prisma.conversation.count({ where: { clinic_id: clinicId } }),
        prisma.appointment.count({
            where: { practitioner: { clinic_id: clinicId } }
        }),
        prisma.practitioner.count({
            where: { clinic_id: clinicId, is_active: true }
        })
    ]);

    res.json({
        stats: {
            totalPatients,
            totalConversations,
            totalAppointments,
            activePractitioners
        }
    });
}
```

### 6.3 Dashboard Super Admin

**URL**: `https://domaine.com/superadmin`

**Fonctionnalités**:
- 🏢 Gestion multi-cliniques
- 📊 Analytiques globales
- 👥 Gestion utilisateurs
- 🔧 Config WhatsApp par clinique
- 🗄️ Administration base de données

---

## 7. 🛠️ Installation et Configuration

### 7.1 Prérequis

```bash
Node.js: v20+
PostgreSQL: v14+
Ollama: v0.1.22+
```

### 7.2 Installation

```bash
# Cloner
git clone https://github.com/org/sophie.git
cd sophie

# Installer dépendances
npm install

# Configurer DB
createdb medical_assistant
npx prisma db push
npx prisma generate

# Configurer LLM
ollama create aida-medical-v1 -f Modelfile.optimized

# Démarrer
npm run dev
```

### 7.3 Configuration .env

```bash
# Serveur
PORT=3000

# Base de données
DATABASE_URL="postgresql://user:pass@localhost:5432/medical_assistant"

# LLM
LLM_API_URL="http://localhost:11434/api/generate"

# JWT
JWT_SECRET="secret_securise_32_caracteres_minimum"

# Google Calendar
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"

# Super Admin
SUPER_ADMIN_USERNAME="admin"
SUPER_ADMIN_PASSWORD="$2a$10$hash_bcrypt..."
```

---

## 8. 🔐 Sécurité

### 8.1 Validation Webhook HMAC

```typescript
// src/routes/webhookRoutes.ts
router.post('/webhook/whatsapp/:clinicId',
    express.json({ verify: captureRawBody }),
    async (req, res) => {
        const signature = req.headers['x-hub-signature-256'];
        const rawBody = (req as any).rawBody;

        const config = await getClinicConfig(clinicId);
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', config.webhook_secret)
            .update(rawBody)
            .digest('hex');

        if (signature !== expectedSignature) {
            return res.status(403).send('Invalid signature');
        }

        await whatsAppService.handleIncomingMessage(req.body, clinicId);
        res.sendStatus(200);
    }
);
```

### 8.2 Protection Directory Traversal

```typescript
async serveImage(req: AuthRequest, res: Response) {
    const filename = req.params.filename;

    // Bloquer caractères dangereux
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(
        process.cwd(), 'uploads', 'images', clinicId, filename
    );

    // Vérifier isolation clinique
    const realPath = fs.realpathSync(filePath);
    const expectedDir = path.join(
        process.cwd(), 'uploads', 'images', clinicId
    );

    if (!realPath.startsWith(expectedDir)) {
        return res.status(403).json({ error: 'Access denied' });
    }

    res.sendFile(realPath);
}
```

---

## 9. 💻 Exemples de Code

### 9.1 Création Rendez-vous Complète

```typescript
async createAppointment(
    clinicId: string,
    context: ConversationContext,
    userPhone: string
): Promise<boolean> {
    try {
        // Récupérer patient
        const patient = await prisma.patient.findUnique({
            where: {
                clinic_id_phone: { clinic_id: clinicId, phone: userPhone }
            }
        });

        // Récupérer traitement
        const treatmentType = await prisma.treatmentType.findUnique({
            where: { id: context.appointment!.treatment_type_id! }
        });

        // Parser date/heure avec timezone
        const appointmentStart = parseInTimezone(
            context.appointment!.date!,
            context.appointment!.time!,
            clinic.timezone || 'Europe/Paris'
        );

        const appointmentEnd = new Date(
            appointmentStart.getTime() +
            treatmentType.duration_minutes * 60000
        );

        // Vérifier disponibilité
        const isAvailable = await calendarService.checkAvailability(
            context.appointment!.practitioner_id!,
            appointmentStart,
            appointmentEnd
        );

        if (!isAvailable) return false;

        // Créer dans Google Calendar
        const googleEventId = await calendarService.createEvent(
            context.appointment!.practitioner_id!,
            `${patient.first_name} ${patient.last_name}`,
            patient.phone,
            appointmentStart,
            appointmentEnd,
            treatmentType.name,
            clinic.timezone
        );

        // Créer en base de données
        await prisma.appointment.create({
            data: {
                practitioner_id: context.appointment!.practitioner_id!,
                patient_id: patient.id,
                treatment_type_id: treatmentType.id,
                start_time: appointmentStart,
                end_time: appointmentEnd,
                status: 'CONFIRMED',
                google_event_id: googleEventId
            }
        });

        await logService.info('APPOINTMENT', 'CREATED',
            'RDV créé avec succès',
            { clinic_id: clinicId, metadata: { google_event_id: googleEventId } }
        );

        return true;
    } catch (error) {
        await logService.error('APPOINTMENT', 'CREATION_ERROR',
            'Erreur création RDV', error, { clinic_id: clinicId }
        );
        return false;
    }
}
```

### 9.2 Appel API WhatsApp

```bash
# Envoyer message via WhatsApp Business API
curl -X POST \
  'https://graph.facebook.com/v18.0/123456789/messages' \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{
    "messaging_product": "whatsapp",
    "to": "33612345678",
    "type": "text",
    "text": {
      "body": "Votre rendez-vous est confirmé !"
    }
  }'
```

---

## 📌 Conclusion

Ce guide couvre l'ensemble du système Sophie. Pour plus de détails :

- **[Configuration Multi-Clinique](./configuration-multi-clinique.md)**
- **[Système de Traitements](./systeme-traitements.md)**
- **[Guide d'Intégration](./guide-integration.md)**

---

**Développé avec ❤️ par AIDA Medical**
**Support**: support@aida-medical.com
**Documentation**: https://docs.aida-medical.com
