# 📚 Sophie Medical Assistant - Complete System Guide

> **Version**: 3.0
> **Last Updated**: January 29, 2026
> **Team**: AIDA Medical

---

## 📋 Table of Contents

1. [Overview and Architecture](#1-overview-and-architecture)
2. [Patient Data Collection Flow](#2-patient-data-collection-flow)
3. [Media Handling (Images and PDFs)](#3-media-handling-images-and-pdfs)
4. [Appointment Booking System](#4-appointment-booking-system)
5. [Finite State Machine (FSM)](#5-finite-state-machine-fsm)
6. [Admin Dashboards](#6-admin-dashboards)
7. [Installation and Configuration](#7-installation-and-configuration)
8. [Security](#8-security)
9. [Code Examples](#9-code-examples)

---

## 1. 🏗️ Overview and Architecture

### 1.1 Introduction

**Sophie** is an AI-powered intelligent medical secretary designed to fully automate appointment management via WhatsApp. The system combines the power of Large Language Models (LLM) with a rigorous Finite State Machine (FSM) to deliver a natural, secure, and reliable conversational experience.

### 1.2 Key Features

- 🤖 **Conversational AI**: Natural language understanding for relative dates
- 📅 **Intelligent Scheduling**: Real-time slot suggestions
- 🔄 **Robust State Machine**: Smooth transitions between states
- 🏥 **Multi-Tenant SaaS Architecture**: Complete isolation by clinic
- 📸 **Media Management**: Automatic download of images and PDFs
- 🔐 **Advanced Security**: Twilio webhook validation, JWT authentication
- 📊 **Complete Dashboards**: Admin and super-admin interfaces
- 🌐 **Real-Time Synchronization**: Bidirectional Google Calendar integration

### 1.3 Tech Stack

```
🖥️  Runtime          : Node.js v20+ with TypeScript
🗄️  Database         : PostgreSQL via Prisma ORM
🧠  LLM              : Ollama (Qwen 2.5) - aida-medical-v1 model
💬  Client Interface : Twilio WhatsApp API
🎨  Dashboard        : Native HTML/CSS/JS + Express API
🐳  Infrastructure   : Docker for PostgreSQL and services
```

### 1.4 Project Architecture

```
PROECTASSISTANT/
│
├── 📁 src/
│   ├── 📁 services/              # Business logic layer
│   │   ├── ConversationManager.ts    # ⚙️ FSM & orchestration
│   │   ├── SophieService.ts          # 🧠 LLM integration
│   │   ├── CalendarService.ts        # 📅 Google Calendar sync
│   │   ├── WhatsAppService.ts        # 💬 Twilio WhatsApp API
│   │   ├── MediaService.ts           # 📸 Media downloads
│   │   ├── LLMService.ts             # 🤖 Ollama communication
│   │   ├── TreatmentService.ts       # 💉 Treatment management
│   │   └── LogService.ts             # 📝 Structured logging
│   │
│   ├── 📁 controllers/           # Processing logic
│   ├── 📁 routes/                # API entry points
│   ├── 📁 middleware/            # Express middleware
│   ├── 📁 utils/                 # Utilities
│   └── 📁 types/                 # TypeScript definitions
│
├── 📁 prisma/                    # Database schema
├── 📁 public/                    # Frontend dashboards
├── 📁 uploads/                   # Media storage
└── 📁 docs/                      # Documentation
```

---

## 2. 📋 Patient Data Collection Flow

### 2.1 Required Information

| Field | Format | Example |
|-------|--------|---------|
| **First Name** | Text | "Marie" |
| **Last Name** | Text | "Dubois" |
| **Date of Birth** | DD/MM/YYYY | "15/05/1980" |
| **Email** | Email format | "marie@email.com" |
| **Insurance Card** | JPEG/PNG image | Photo of card |

### 2.2 Social Insurance (Optional)

After receiving the insurance card, Sophie asks:

```
💬 Sophie: "Do you have social insurance
           (Hospice générale or SPC)?"

→ If YES:
  💬 "What type?"
     "1. Hospice générale"
     "2. SPC"

  💬 "Please provide your beneficiary number
     or send the guarantee document in PDF."

→ If NO:
  💬 "Let's proceed to book your appointment."
```

### 2.3 Code Example: Patient Collection

**File**: `src/services/ConversationManager.ts`

```typescript
// State: COLLECTING_PATIENT_DATA
if (currentState === ConversationState.COLLECTING_PATIENT_DATA) {
    const entities = llmResponse.entities || {};

    // Update context
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

    // Handle insurance card photo
    if (imagePath && !currentContext.patient?.insurance_card_url) {
        currentContext.patient!.insurance_card_url = imagePath;
        currentContext.patient!.awaiting_social_insurance_response = true;

        await this.updateConversationContext(conversationId, currentContext);

        return "Photo received, thank you! " +
               "Do you have social insurance?";
    }

    // Process social insurance response
    if (currentContext.patient?.awaiting_social_insurance_response) {
        const isYes = /\b(yes|oui|si)\b/i.test(userMessage);
        const isNo = /\b(no|non|pas)\b/i.test(userMessage);

        if (isYes) {
            currentContext.patient.has_social_insurance = true;
            currentContext.patient.awaiting_social_insurance_type = true;
            return "What type? (Hospice générale or SPC)";
        } else if (isNo) {
            currentContext.patient.has_social_insurance = false;
            // Continue to appointment
        }
    }

    // Check for missing fields
    const missing = this.checkMissingPatientFields(currentContext.patient!);
    if (missing.length > 0) {
        return this.askForMissingField(missing[0], language);
    }

    // Save and move to next state
    await this.saveOrUpdatePatient(clinicId, currentContext.patient!, userPhone);
    newState = ConversationState.COLLECTING_APPOINTMENT_DATA;
}
```

---

## 3. 📸 Media Handling (Images and PDFs)

### 3.1 MediaService Architecture

**File**: `src/services/MediaService.ts`

The `MediaService` handles automatic downloads from Twilio WhatsApp.

### 3.2 Storage Structure

```
uploads/
├── images/                    # Insurance cards
│   └── {clinic_id}/
│       └── {timestamp}_{randomId}.jpg
│
└── documents/                 # Guarantee documents
    └── {clinic_id}/
        └── {timestamp}_{randomId}.pdf
```

### 3.3 Complete Code: MediaService (Twilio)

```typescript
export class MediaService {
    private accountSid: string;
    private authToken: string;

    constructor() {
        this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
        this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    }

    /**
     * Download and store media from Twilio WhatsApp
     */
    async downloadAndStoreMedia(
        mediaUrl: string,
        clinicId: string,
        mimeType: string = 'image/jpeg'
    ): Promise<{ filePath: string; mimeType: string } | null> {
        try {
            // Download file with Twilio authentication
            const fileBuffer = await this.downloadFile(mediaUrl);

            // Save to disk
            const filePath = this.saveFileToDisk(fileBuffer, clinicId, mimeType);

            await logService.info('TWILIO', 'MEDIA_STORED',
                `Media stored successfully`,
                { clinic_id: clinicId, metadata: { file_path: filePath } }
            );

            return { filePath, mimeType };
        } catch (error) {
            await logService.error('TWILIO', 'MEDIA_DOWNLOAD_ERROR',
                `Download error`, error,
                { clinic_id: clinicId }
            );
            return null;
        }
    }

    private async downloadFile(url: string): Promise<Buffer> {
        const response = await axios.get(url, {
            auth: {
                username: this.accountSid,
                password: this.authToken
            },
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

## 4. 📅 Appointment Booking System

### 4.1 Booking Flow

```
👤 "I would like an appointment"

💬 "What type of treatment?
   1. Dental cleaning (45 min)
   2. Consultation (30 min)"

👤 "Cleaning"

💬 "Which practitioner?
   - Dr. Rufenacht
   - Dr. Smith"

👤 "Dr. Rufenacht"

💬 "When would you like to come?"

👤 "Tomorrow at 2pm"

💬 "Available slots:
   1. 14:00 - 14:45
   2. 15:00 - 15:45"

👤 "2pm"

💬 "✅ Confirm?
   📅 January 29, 2026 at 14:00
   💉 Dental cleaning
   👨‍⚕️ Dr. Rufenacht"

👤 "Yes"

💬 "✅ Appointment confirmed!"
```

### 4.2 Database Schema

**File**: `prisma/schema.prisma`

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

### 4.3 Code: TreatmentService

**File**: `src/services/TreatmentService.ts`

```typescript
export class TreatmentService {
    /**
     * Get available treatments for a clinic
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

        // Extract unique treatment types
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
     * Get practitioners for a treatment type
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
     * Format treatments for display
     */
    formatTreatmentsForDisplay(
        treatments: any[],
        language: string = 'fr'
    ): string {
        if (treatments.length === 0) {
            return "No treatments available.";
        }

        const treatmentList = treatments.map((t, index) => {
            const name = language === 'en' && t.name_en
                ? t.name_en
                : t.name;
            return `${index + 1}. ${name} (${t.duration_minutes} min)`;
        }).join('\n');

        return "Available treatments:\n" + treatmentList;
    }
}
```

---

## 5. 🔄 Finite State Machine (FSM)

### 5.1 Defined States

**File**: `src/types/conversation.ts`

```typescript
export enum ConversationState {
    IDLE = 'IDLE',                          // 🟢 Waiting
    COLLECTING_PATIENT_DATA = 'COLLECTING_PATIENT_DATA',
    COLLECTING_APPOINTMENT_DATA = 'COLLECTING_APPOINTMENT_DATA',
    CONFIRMATION = 'CONFIRMATION',          // ✅ Validation
    COMPLETED = 'COMPLETED',                // ✔️ Finished
    EMERGENCY = 'EMERGENCY'                 // 🚨 Emergency
}
```

### 5.2 Transition Table

| Current State | Trigger | Next State | Action |
|---------------|---------|------------|--------|
| IDLE | BOOK_APPOINTMENT + New patient | COLLECTING_PATIENT_DATA | Request first name |
| IDLE | BOOK_APPOINTMENT + Existing patient | COLLECTING_APPOINTMENT_DATA | Request treatment |
| COLLECTING_PATIENT_DATA | Complete data | COLLECTING_APPOINTMENT_DATA | Save patient |
| COLLECTING_APPOINTMENT_DATA | Date + Practitioner OK | CONFIRMATION | Show summary |
| CONFIRMATION | AFFIRMATIVE | COMPLETED | Create appointment |
| CONFIRMATION | NEGATIVE | IDLE | Cancel |

### 5.3 Code: State Management

```typescript
async processMessageWithSophie(
    conversationId: string,
    userMessage: string,
    clinicName: string
): Promise<string> {
    // Get conversation
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { clinic: true }
    });

    let currentContext = conversation.context_data as any || {};
    let currentState = conversation.current_state as ConversationState;

    // Check for emergency
    if (isEmergencyMessage(userMessage)) {
        await this.updateConversationState(
            conversationId,
            ConversationState.EMERGENCY,
            currentContext
        );
        return "🚨 EMERGENCY: Call 112 immediately!";
    }

    // Extract entities via LLM
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
                responseMessage = "What type of treatment?";
            } else {
                newState = ConversationState.COLLECTING_PATIENT_DATA;
                responseMessage = "What is your first name?";
            }
        }
    }

    else if (currentState === ConversationState.COLLECTING_PATIENT_DATA) {
        // (Patient data collection code)
        responseMessage = await this.handlePatientDataCollection(...);
    }

    else if (currentState === ConversationState.COLLECTING_APPOINTMENT_DATA) {
        // (Appointment data collection code)
        responseMessage = await this.handleAppointmentDataCollection(...);
    }

    else if (currentState === ConversationState.CONFIRMATION) {
        if (llmResponse.intent === Intent.AFFIRMATIVE) {
            await this.createAppointment(context);
            newState = ConversationState.COMPLETED;
            responseMessage = "✅ Appointment confirmed!";
        }
    }

    await this.updateConversationState(conversationId, newState, currentContext);
    return responseMessage;
}
```

---

## 6. 📊 Admin Dashboards

### 6.1 Clinic Dashboard

**URL**: `https://domain.com/clinic/{clinicId}/admin`

**Features**:
- 📊 Statistics (patients, conversations, appointments)
- 💬 Conversations with inline images
- 👥 Patient management
- 📅 Appointment calendar
- 👨‍⚕️ Practitioner management
- 💉 Treatment configuration
- 🔍 System logs

### 6.2 Code: Statistics Endpoint

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

### 6.3 Super Admin Dashboard

**URL**: `https://domain.com/superadmin`

**Features**:
- 🏢 Multi-clinic management
- 📊 Global analytics
- 👥 User management
- 🔧 WhatsApp config per clinic
- 🗄️ Database administration

---

## 7. 🛠️ Installation and Configuration

### 7.1 Prerequisites

```bash
Node.js: v20+
PostgreSQL: v14+
Ollama: v0.1.22+
```

### 7.2 Installation

```bash
# Clone
git clone https://github.com/org/sophie.git
cd sophie

# Install dependencies
npm install

# Configure database
createdb medical_assistant
npx prisma db push
npx prisma generate

# Configure LLM
ollama create aida-medical-v1 -f Modelfile.optimized

# Start
npm run dev
```

### 7.3 .env Configuration

```bash
# Server
PORT=3000

# Database
DATABASE_URL="postgresql://user:pass@localhost:5432/medical_assistant"

# LLM
LLM_API_URL="http://localhost:11434/api/generate"

# JWT
JWT_SECRET="secure_secret_32_characters_minimum"

# Google Calendar
GOOGLE_CLIENT_ID="xxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="xxx"
GOOGLE_REDIRECT_URI="http://localhost:3000/oauth/callback"

# Super Admin
SUPER_ADMIN_USERNAME="admin"
SUPER_ADMIN_PASSWORD="$2a$10$hash_bcrypt..."
```

---

## 8. 🔐 Security

### 8.1 HMAC Webhook Validation

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

### 8.2 Directory Traversal Protection

```typescript
async serveImage(req: AuthRequest, res: Response) {
    const filename = req.params.filename;

    // Block dangerous characters
    if (filename.includes('..') || filename.includes('/')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }

    const filePath = path.join(
        process.cwd(), 'uploads', 'images', clinicId, filename
    );

    // Verify clinic isolation
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

## 9. 💻 Code Examples

### 9.1 Complete Appointment Creation

```typescript
async createAppointment(
    clinicId: string,
    context: ConversationContext,
    userPhone: string
): Promise<boolean> {
    try {
        // Get patient
        const patient = await prisma.patient.findUnique({
            where: {
                clinic_id_phone: { clinic_id: clinicId, phone: userPhone }
            }
        });

        // Get treatment
        const treatmentType = await prisma.treatmentType.findUnique({
            where: { id: context.appointment!.treatment_type_id! }
        });

        // Parse date/time with timezone
        const appointmentStart = parseInTimezone(
            context.appointment!.date!,
            context.appointment!.time!,
            clinic.timezone || 'Europe/Paris'
        );

        const appointmentEnd = new Date(
            appointmentStart.getTime() +
            treatmentType.duration_minutes * 60000
        );

        // Check availability
        const isAvailable = await calendarService.checkAvailability(
            context.appointment!.practitioner_id!,
            appointmentStart,
            appointmentEnd
        );

        if (!isAvailable) return false;

        // Create in Google Calendar
        const googleEventId = await calendarService.createEvent(
            context.appointment!.practitioner_id!,
            `${patient.first_name} ${patient.last_name}`,
            patient.phone,
            appointmentStart,
            appointmentEnd,
            treatmentType.name,
            clinic.timezone
        );

        // Create in database
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
            'Appointment created successfully',
            { clinic_id: clinicId, metadata: { google_event_id: googleEventId } }
        );

        return true;
    } catch (error) {
        await logService.error('APPOINTMENT', 'CREATION_ERROR',
            'Appointment creation error', error, { clinic_id: clinicId }
        );
        return false;
    }
}
```

### 9.2 Twilio WhatsApp API Call

```bash
# Send message via Twilio WhatsApp API
curl -X POST \
  'https://api.twilio.com/2010-04-01/Accounts/YOUR_ACCOUNT_SID/Messages.json' \
  -u 'YOUR_ACCOUNT_SID:YOUR_AUTH_TOKEN' \
  -d 'From=whatsapp:+14155238886' \
  -d 'To=whatsapp:+33612345678' \
  -d 'Body=Your appointment is confirmed!'
```

---

## 📌 Conclusion

This guide covers the entire Sophie system. For more details:

- **[Multi-Clinic Setup](./multi-clinic-setup.md)**
- **[Treatment System](./treatment-system.md)**
- **[Integration Guide](./integration-guide.md)**

---

**Developed with ❤️ by AIDA Medical**
**Support**: support@aida-medical.com
**Documentation**: https://docs.aida-medical.com
