# Sophie - AI Medical Secretary (WhatsApp & Web Dashboard)

🇫🇷 [Version française](#version-française) | 🇬🇧 English version below

---

## 🇬🇧 English Version

### Overview

**Sophie** is an intelligent medical secretary powered by AI, designed to fully automate appointment management via WhatsApp. This project combines the power of Large Language Models (LLM) with a rigorous Finite State Machine (FSM) to deliver a seamless, human-like, and secure experience.

### Key Features

- **🤖 Conversational AI**: Natural language understanding for relative dates and time preferences ("tomorrow afternoon", "next week")
- **📅 Smart Scheduling**: Real-time slot suggestions based on morning/afternoon preferences and actual calendar availability
- **🔄 Robust State Machine**: Smooth transitions between booking, modification, cancellation, and automatic patient data collection
- **🏥 Multi-Tenant SaaS**: Isolated architecture per clinic with specific settings (timezones, opening hours, treatments)
- **📸 Media Handling**: Automatic download and storage of insurance cards and guarantee documents (images & PDFs)
- **🔐 Advanced Security**: Twilio webhook signature validation and emergency filtering
- **📊 Admin Dashboards**: Complete management interface for clinics and super admins
- **🌐 Real-Time Sync**: Native bidirectional integration with Google Calendar

---

### Technical Stack

- **Runtime**: Node.js v20+ with TypeScript
- **Database**: PostgreSQL via Prisma ORM
- **LLM**: Ollama (Qwen 2.5) with optimized Modelfile for JSON entity extraction
- **Client Interface**: Twilio WhatsApp API with webhook signature validation
- **Admin Dashboard**: Centralized management interface (Native HTML/CSS/JS + Express API)
- **Super Admin**: Multi-clinic oversight with comprehensive analytics
- **Infrastructure**: Docker for database and third-party services

---

### Project Architecture

```
PROECTASSISTANT/
├── src/
│   ├── services/           # Core algorithmic layer
│   │   ├── ConversationManager.ts    # FSM & conversation flow
│   │   ├── SophieService.ts          # LLM integration
│   │   ├── CalendarService.ts        # Google Calendar sync
│   │   ├── WhatsAppService.ts        # WhatsApp Business API
│   │   ├── MediaService.ts           # Image & document handling
│   │   ├── LLMService.ts             # Ollama communication
│   │   └── LogService.ts             # Structured logging
│   ├── routes/             # API endpoints
│   │   ├── webhookRoutes.ts          # WhatsApp webhooks
│   │   ├── adminRoutes.ts            # Clinic dashboard API
│   │   ├── superAdminRoutes.ts       # Super admin API
│   │   └── oauthRoutes.ts            # Google OAuth flow
│   ├── controllers/        # Request handling logic
│   │   ├── AdminController.ts
│   │   ├── SuperAdminController.ts
│   │   └── WebhookController.ts
│   ├── middleware/         # Express middleware
│   │   └── auth.ts                   # JWT authentication
│   ├── database/           # Prisma client
│   ├── utils/              # Utilities
│   │   ├── dateFormatter.ts          # Timezone-aware formatting
│   │   ├── businessHours.ts          # Opening hours validation
│   │   └── emergencyFilter.ts        # Emergency detection
│   └── types/              # TypeScript definitions
│       └── conversation.ts           # FSM states, intents, context
├── prisma/
│   └── schema.prisma       # Database schema
├── public/
│   ├── admin/              # Clinic dashboard frontend
│   └── superadmin/         # Super admin dashboard frontend
├── uploads/                # Media storage
│   ├── images/             # Insurance cards by clinic
│   └── documents/          # Guarantee documents by clinic
├── Modelfile.optimized     # Sophie's LLM configuration
└── docs/                   # Complete documentation
```

---

### Sophie's Intelligence Engine

Sophie is not just a chatbot. It's a hybrid system combining:

#### 1. JSON Entity Extraction (LLM Layer)

Using the **aida-medical-v1** model (based on Qwen 2.5), the system systematically extracts JSON structures from free text:

```typescript
interface LLMResponse {
    detected_language: string;
    intent: Intent;  // BOOK_APPOINTMENT, CANCEL, MODIFY, etc.
    confidence: number;
    entities: {
        first_name?: string;
        last_name?: string;
        birth_date?: string;
        email?: string;
        phone?: string;
        appointment_type?: string;
        date?: string;
        time?: string;
        practitioner?: string;
    };
    needs_backend_action: boolean;
    response_message?: string;
}
```

#### 2. Finite State Machine (FSM Layer)

The `ConversationManager` handles states to ensure users never get lost:

```typescript
enum ConversationState {
    IDLE,                           // Waiting for intent
    COLLECTING_PATIENT_DATA,        // Patient registration phase
    COLLECTING_APPOINTMENT_DATA,    // Appointment details collection
    CONFIRMATION,                   // Final validation
    COMPLETED,                      // Action finalized
    EMERGENCY                       // Urgent medical situation
}
```

**State Flow Example:**
```
IDLE → User: "I need an appointment"
     → COLLECTING_PATIENT_DATA (if new patient)
     → Request: First name, Last name, Birth date, Email
     → Request: Insurance card photo
     → Request: Social insurance info (optional)
     → COLLECTING_APPOINTMENT_DATA
     → Request: Treatment type, Practitioner, Date, Time
     → CONFIRMATION → "Confirm appointment on..."
     → User: "Yes" → COMPLETED
```

---

### Patient Data Collection Flow

#### Mandatory Information
1. **First Name & Last Name**
2. **Birth Date** (format: DD/MM/YYYY or natural language)
3. **Email Address**
4. **Insurance Card Photo** (downloaded and stored locally)

#### Social Insurance (Optional but Requested)
After insurance card upload, Sophie asks:

```
"Do you have social insurance (Hospice générale or SPC)?"

→ If YES:
  "What type of social insurance? (Hospice générale or SPC)"
  "Please provide your beneficiary number or guarantee number.
   If you can't find them, you can send the guarantee document in PDF."

  → User sends number → Stored in database
  → OR user sends PDF → Downloaded and stored

→ If NO:
  Continue to appointment booking
```

**Code Example:**
```typescript
// After insurance card is received
if (imagePath && !currentContext.patient?.insurance_card_url) {
    currentContext.patient.insurance_card_url = imagePath;
    currentContext.patient.awaiting_social_insurance_response = true;
    return "Do you have social insurance (Hospice générale or SPC)?";
}

// Handle yes/no response
if (currentContext.patient?.awaiting_social_insurance_response) {
    if (isYes) {
        currentContext.patient.has_social_insurance = true;
        return "What type? (Hospice générale or SPC)";
    } else {
        currentContext.patient.has_social_insurance = false;
        // Continue to appointment
    }
}
```

---

### Media Handling System

#### MediaService Architecture

The `MediaService` handles automatic download and storage of WhatsApp media via Twilio:

```typescript
class MediaService {
    // Download image (insurance cards) from Twilio
    async downloadAndStoreMedia(
        mediaUrl: string,
        clinicId: string,
        mimeType: string
    ): Promise<{ filePath: string; mimeType: string } | null>

    // Download document (guarantee PDFs) from Twilio
    async downloadAndStoreDocument(
        mediaUrl: string,
        clinicId: string,
        mimeType: string
    ): Promise<{ filePath: string; mimeType: string } | null>
}
```

**Storage Structure:**
```
uploads/
├── images/
│   └── {clinic_id}/
│       └── {timestamp}_{mediaId}.jpg
└── documents/
    └── {clinic_id}/
        └── {timestamp}_{mediaId}.pdf
```

**Twilio WhatsApp API Flow:**
1. Receive webhook with `MediaUrl0` and `MediaContentType0` fields
2. Download file directly from Twilio URL with Basic Auth (Account SID + Auth Token)
3. Save to local filesystem
4. Store path in database (`file_path` field in Message table)

---

### Admin Dashboard Features

#### Clinic Admin Dashboard (`/clinic/{clinicId}/admin`)

**Features:**
- 📊 **Statistics**: Message volume, appointment conversion rates
- 💬 **Conversations**: View all patient conversations with media display
- 📸 **Image Viewer**: Inline display of insurance cards and documents
- 👥 **Patient Management**: Search, view, and edit patient records
- 📅 **Appointment Management**: View, create, modify, and cancel appointments
- 👨‍⚕️ **Practitioner Management**: Add/remove doctors, configure Google Calendar IDs
- 🏥 **Clinic Settings**: Timezone, address, opening hours, emergency messages
- 💉 **Treatment Types**: Configure treatment durations and available practitioners
- 🔍 **Logs**: Real-time system logs with filtering (INFO, ERROR, CRITICAL)

**Conversation View Example:**
```javascript
// Messages are displayed with inline images
conversation.messages.map(msg => `
    <div class="message-item ${msg.role}">
        <div class="message-header">
            ${msg.role === 'user' ? 'Patient' : 'Assistant'}
            • ${formatTime(msg.created_at)}
        </div>
        <div class="message-content">
            ${msg.content}
            ${msg.image_url ? `
                <img src="${msg.image_url}?token=${authToken}"
                     onclick="openImageModal('${msg.image_url}')"
                     style="max-width: 300px; cursor: pointer;" />
            ` : ''}
        </div>
    </div>
`)
```

#### Super Admin Dashboard (`/superadmin`)

**Features:**
- 🏢 **Multi-Clinic Overview**: Manage all clinics from one interface
- 📊 **Global Analytics**: Cross-clinic statistics and performance metrics
- 👥 **Clinic Management**: Create, edit, and deactivate clinics
- 🔧 **WhatsApp Config**: Manage WhatsApp Business API credentials per clinic
- 📞 **All Conversations**: Access conversations across all clinics
- 🗄️ **Database Management**: Advanced tools for data maintenance
- 🔐 **User Management**: Create admin accounts for clinic access

---

### Appointment Booking Flow

#### Dynamic Treatment System

Sophie uses a **treatment-aware** booking system:

1. **User**: "I need an appointment"
2. **Sophie**: Lists available treatments:
   ```
   What type of appointment?
   1. Dental Cleaning (45 min) - Dr. Rufenacht
   2. Check-up (30 min) - Dr. Rufenacht, Dr. Smith
   3. Orthodontics (60 min) - Dr. Johnson
   ```
3. **User**: "1" or "Dental Cleaning"
4. **Sophie**: "Which practitioner? Dr. Rufenacht"
5. **User**: "Tomorrow at 2pm"
6. **Sophie**: Validates business hours and availability
7. **Sophie**: "Confirm appointment on December 15, 2024 at 2:00 PM?"
8. **User**: "Yes"
9. **System**:
   - Creates appointment in database
   - Syncs to Google Calendar
   - Updates conversation state to COMPLETED

**Business Hours Validation:**
```typescript
if (!isWithinBusinessHours(appointmentDate, clinic.opening_hours, timezone)) {
    return `Sorry, the clinic is closed at that time.
            Our hours are: ${clinic.opening_hours}.
            What other time would work for you?`;
}
```

---

### Installation & Deployment

#### Prerequisites
- Node.js v20+
- PostgreSQL
- Ollama (for LLM)
- Twilio Account (WhatsApp Business API)
- Google Cloud Project (for Calendar API)

#### Environment Configuration

Create `.env` file:
```env
# Server
PORT=3000

# Database
DATABASE_URL="postgresql://user:password@localhost:5432/medical_assistant?schema=public"

# LLM (Ollama)
LLM_API_URL="http://localhost:11434/api/generate"

# Authentication
JWT_SECRET="your_jwt_secret_for_dashboard"

# Google OAuth2 (for Calendar integration)
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"

# Super Admin Credentials
SUPER_ADMIN_USERNAME="admin"
SUPER_ADMIN_PASSWORD="secure_password_here"
```

#### Setup Steps

```bash
# 1. Install dependencies
npm install

# 2. Setup database
npx prisma db push
npx prisma generate

# 3. Configure Ollama LLM
ollama create aida-medical-v1 -f Modelfile.optimized

# 4. Start the server
npm run dev

# Server runs on http://localhost:3000
```

#### Twilio WhatsApp Setup

1. Create a Twilio account and enable WhatsApp Sandbox or Business API
2. Configure webhook URL in Twilio Console: `https://your-domain.com/webhook/whatsapp/{clinicId}`
3. Add Twilio credentials to `.env`:
   ```env
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890
   ```
4. Store clinic-specific settings in database via Super Admin dashboard

---

### Security Features

#### Webhook Validation (Twilio)
```typescript
// Twilio signature verification (optional, configured per clinic)
const signature = req.headers['x-twilio-signature'];
const twilioClient = require('twilio');

const isValid = twilioClient.validateRequest(
    authToken,
    signature,
    webhookUrl,
    req.body
);

if (!isValid) {
    throw new Error('Invalid Twilio signature');
}
```

#### Authentication
- JWT tokens for dashboard access
- Token can be passed via header OR query parameter (for image URLs)
- Clinic isolation enforced at middleware level
- Super admin privilege separation

#### Media Access Control
```typescript
// Prevent directory traversal
if (filename.includes('..') || filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
}

// Verify file belongs to clinic
const realPath = fs.realpathSync(filePath);
const expectedDir = path.join(process.cwd(), 'uploads', 'images', clinicId);

if (!realPath.startsWith(expectedDir)) {
    return res.status(403).json({ error: 'Access denied' });
}
```

---

### Reliability & Edge Cases

#### Anti-Loop Protection
```typescript
// Track rejected times to avoid re-proposing invalid slots
if (!currentContext.rejected_times) {
    currentContext.rejected_times = [];
}
currentContext.rejected_times.push(`${dateStr} ${timeStr}`);
```

#### Duplicate Message Prevention
```typescript
// Check if message already processed
const existingMessage = await prisma.message.findUnique({
    where: { wamid: message.id }
});

if (existingMessage) {
    return; // Skip duplicate
}
```

#### Old Message Filtering
```typescript
const msgTimestamp = parseInt(message.timestamp);
const nowTimestamp = Math.floor(Date.now() / 1000);

if (nowTimestamp - msgTimestamp > 300) { // 5 minutes
    return; // Ignore old messages
}
```

#### Timezone Handling
```typescript
// All dates use timezone-aware formatting
import { parseInTimezone, formatDateFromDate } from './utils/dateFormatter';

const appointmentDate = parseInTimezone(dateStr, timeStr, clinic.timezone);
const formatted = formatDateFromDate(appointmentDate, 'fr', 'Europe/Paris');
```

---

### Complete Documentation

For detailed guides, visit our [Documentation Hub](./docs/README.md):

**English:**
- [Complete System Guide](./docs/en/complete-guide.md)
- [Multi-Clinic Setup](./docs/en/multi-clinic-setup.md)
- [Dynamic Treatment System](./docs/en/treatment-system.md)
- [Technical Integration Guide](./docs/en/integration-guide.md)

**Français:**
- [Guide Complet](./docs/fr/guide-complet.md)
- [Configuration Multi-Clinique](./docs/fr/configuration-multi-clinique.md)
- [Système de Traitements](./docs/fr/systeme-traitements.md)
- [Guide d'Intégration](./docs/fr/guide-integration.md)

---

## 🇫🇷 Version Française

### Présentation

**Sophie** est une secrétaire médicale intelligente propulsée par IA, conçue pour automatiser entièrement la gestion des rendez-vous via WhatsApp. Ce projet combine la puissance des modèles de langage (LLM) avec une machine à états (FSM) rigoureuse pour offrir une expérience fluide, humaine et sécurisée.

### Points Forts

- **🤖 IA Conversationnelle**: Compréhension du langage naturel pour les dates relatives ("demain après-midi", "la semaine prochaine")
- **📅 Planification Intelligente**: Suggestions de créneaux en temps réel selon préférences et disponibilités
- **🔄 Machine à États Robuste**: Transitions fluides entre réservation, modification et collecte de données
- **🏥 SaaS Multi-Tenant**: Architecture isolée par clinique avec paramètres spécifiques
- **📸 Gestion des Médias**: Téléchargement et stockage automatiques des cartes d'assurance et documents
- **🔐 Sécurité Avancée**: Validation HMAC SHA-256 des webhooks et filtrage d'urgences
- **📊 Tableaux de Bord**: Interfaces complètes pour cliniques et super admins
- **🌐 Synchronisation Temps Réel**: Intégration bidirectionnelle avec Google Calendar

### Collecte des Données Patient

#### Informations Obligatoires
1. **Prénom & Nom**
2. **Date de naissance** (format: JJ/MM/AAAA ou langage naturel)
3. **Adresse email**
4. **Photo de carte d'assurance** (téléchargée et stockée localement)

#### Assurance Sociale (Optionnel mais Demandé)

Après la carte d'assurance, Sophie demande:

```
"Bénéficiez-vous d'une assurance sociale (Hospice générale ou SPC) ?"

→ Si OUI:
  "De quel type ? (Hospice générale ou SPC)"
  "Veuillez fournir votre numéro de bénéficiaire ou numéro de garanti.
   Si vous ne les trouvez pas, envoyez le document de garantie en PDF."

  → Utilisateur envoie un numéro → Stocké en base
  → OU utilisateur envoie un PDF → Téléchargé et stocké

→ Si NON:
  Passage à la prise de rendez-vous
```

### Structure du Projet

Voir section anglaise pour l'arborescence complète.

### Documentation Complète

Consultez notre [Centre de Documentation](./docs/README.md):

- [Guide Complet](./docs/fr/guide-complet.md)
- [Configuration Multi-Clinique](./docs/fr/configuration-multi-clinique.md)
- [Système de Traitements](./docs/fr/systeme-traitements.md)
- [Guide d'Intégration](./docs/fr/guide-integration.md)

---

**Version**: 3.0
**Last Updated**: January 28, 2026
**Team**: AIDA Medical
