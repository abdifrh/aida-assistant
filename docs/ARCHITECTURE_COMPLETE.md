# 🏗️ Architecture Complète - Système d'Assistance Médicale Multi-Canal

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Architecture Globale](#architecture-globale)
3. [Canal WhatsApp (Texte)](#canal-whatsapp-texte)
4. [Canal Vapi (Vocal)](#canal-vapi-vocal)
5. [Architecture Unifiée](#architecture-unifiée)
6. [Machine à États (FSM)](#machine-à-états-fsm)
7. [Flux de Données Détaillés](#flux-de-données-détaillés)
8. [Composants Techniques](#composants-techniques)
9. [Gestion de la Mémoire Patient](#gestion-de-la-mémoire-patient)
10. [Déploiement et Configuration](#déploiement-et-configuration)

---

## Vue d'ensemble

Le système est un **assistant médical intelligent multi-canal** qui permet aux patients de :
- 📱 Communiquer par **WhatsApp** (texte)
- 📞 Appeler par **téléphone** (voix via Vapi)

Les deux canaux partagent :
- ✅ La même base de données patients
- ✅ La même logique métier
- ✅ Le même système de gestion de rendez-vous
- ✅ La reconnaissance automatique des patients

---

## Architecture Globale

```
                    ┌─────────────────────────────────────┐
                    │         INTERNET / CLOUD            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────┐
                    │                                     │
          ┌─────────▼─────────┐              ┌──────────▼──────────┐
          │   Twilio/WhatsApp │              │       Vapi          │
          │   Business API    │              │   Voice Platform    │
          └─────────┬─────────┘              └──────────┬──────────┘
                    │                                   │
                    │ Webhook POST                      │ Webhook POST
                    │ /webhook/whatsapp                 │ /webhook/vapi/webhook
                    │                                   │
    ┌───────────────┴───────────────────────────────────┴──────────────┐
    │                    VOTRE SERVEUR EXPRESS                          │
    │                    (Node.js + TypeScript)                         │
    │                    Port 3000                                      │
    │                                                                   │
    │  ┌──────────────────────┐         ┌──────────────────────┐      │
    │  │ WhatsAppController   │         │   VapiController     │      │
    │  │  - handleIncoming()  │         │  - handleWebhook()   │      │
    │  └──────────┬───────────┘         └──────────┬───────────┘      │
    │             │                                 │                  │
    │             └────────────┬────────────────────┘                  │
    │                          │                                       │
    │                ┌─────────▼──────────┐                           │
    │                │ ConversationManager │                           │
    │                │  - Gestion FSM      │                           │
    │                │  - Extraction data  │                           │
    │                │  - Génération rep.  │                           │
    │                └─────────┬──────────┘                           │
    │                          │                                       │
    │         ┌────────────────┼────────────────┐                     │
    │         │                │                │                     │
    │  ┌──────▼──────┐  ┌─────▼─────┐  ┌──────▼──────┐              │
    │  │  LLMService │  │  Prisma   │  │  Services   │              │
    │  │  (Ollama/   │  │  (ORM)    │  │  - Google   │              │
    │  │   GPT-4o)   │  │           │  │  - Twilio   │              │
    │  └─────────────┘  └─────┬─────┘  └─────────────┘              │
    │                          │                                       │
    └──────────────────────────┼───────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │   PostgreSQL DB     │
                    │   - Patients        │
                    │   - Conversations   │
                    │   - Appointments    │
                    │   - Messages        │
                    │   - Logs            │
                    └─────────────────────┘
```

---

## Canal WhatsApp (Texte)

### 🔄 Flux de Traitement WhatsApp

```
┌──────────┐
│ Patient  │ "Je voudrais prendre rendez-vous"
└────┬─────┘
     │ 1. Envoie message WhatsApp
     v
┌──────────────────┐
│ Twilio WhatsApp  │
│ Business API     │
└────┬─────────────┘
     │ 2. POST /webhook/whatsapp
     │    Body: {
     │      From: "whatsapp:+33612345678",
     │      Body: "Je voudrais prendre rendez-vous",
     │      ProfileName: "Jean Dupont"
     │    }
     v
┌────────────────────────────────────────┐
│ WhatsAppController.handleIncoming()    │
│                                        │
│ 1. Extrait numéro patient             │
│ 2. Identifie la clinique              │
│ 3. Trouve/crée conversation           │
└────┬───────────────────────────────────┘
     │ 3. Appel à ConversationManager
     v
┌────────────────────────────────────────┐
│ ConversationManager                    │
│ .processIncomingMessage()              │
│                                        │
│ ÉTAPE 1 : Récupération contexte       │
│ --------------------------------       │
│ - Récupère conversation DB             │
│ - Charge les 10 derniers messages     │
│ - Récupère l'état FSM actuel          │
│ - Charge context_data (JSON)          │
│                                        │
│ ÉTAPE 2 : Analyse avec LLM            │
│ --------------------------------       │
│ → Appel LLMService.extractIntent()    │
│   avec Ollama (aida-medical-v1)       │
│                                        │
│   Prompt envoyé :                     │
│   "Tu es Sophie, assistante médicale  │
│    Analyse: 'Je voudrais prendre RDV' │
│    Contexte actuel: {...}             │
│    Historique: [...]"                 │
│                                        │
│   Réponse LLM (JSON strict) :         │
│   {                                   │
│     "detected_language": "fr",        │
│     "intent": "BOOK_APPOINTMENT",     │
│     "confidence": 0.95,               │
│     "entities": {},                   │
│     "needs_backend_action": false,    │
│     "response_message": "Avec plaisir!│
│       Quel est votre nom complet ?"   │
│   }                                   │
│                                        │
│ ÉTAPE 3 : Transition FSM              │
│ --------------------------------       │
│ État actuel: IDLE                     │
│ Intent détecté: BOOK_APPOINTMENT      │
│ → Transition vers:                    │
│   COLLECTING_PATIENT_DATA             │
│                                        │
│ ÉTAPE 4 : Mise à jour DB              │
│ --------------------------------       │
│ - Sauvegarde message user             │
│ - Sauvegarde réponse Sophie           │
│ - Met à jour current_state            │
│ - Met à jour context_data             │
└────┬───────────────────────────────────┘
     │ 4. Retourne réponse
     v
┌────────────────────────────────────────┐
│ WhatsAppController                     │
│ Envoie réponse via Twilio API         │
└────┬───────────────────────────────────┘
     │ 5. POST vers Twilio
     v
┌──────────────────┐
│ Twilio WhatsApp  │
└────┬─────────────┘
     │ 6. Délivre message
     v
┌──────────┐
│ Patient  │ Reçoit: "Avec plaisir ! Quel est votre nom complet ?"
└──────────┘
```

### 📝 Exemple de Conversation Complète WhatsApp

```
┌─────────────────────────────────────────────────────────────┐
│ Conversation WhatsApp - Prise de RDV                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ État: IDLE                                                  │
│ Patient: "Bonjour"                                          │
│ Sophie: "Bonjour ! Comment puis-je vous aider ?"            │
│ └─> Intent: GREETING                                        │
│                                                             │
│ État: IDLE                                                  │
│ Patient: "Je voudrais prendre rendez-vous"                  │
│ Sophie: "Avec plaisir ! Quel est votre nom complet ?"       │
│ └─> Intent: BOOK_APPOINTMENT                                │
│ └─> Transition: IDLE → COLLECTING_PATIENT_DATA             │
│                                                             │
│ État: COLLECTING_PATIENT_DATA                               │
│ Patient: "Jean Dupont"                                      │
│ Sophie: "Merci Jean. Quelle est votre date de naissance ?"  │
│ └─> Entities: {first_name: "Jean", last_name: "Dupont"}    │
│ └─> Context mis à jour                                      │
│                                                             │
│ État: COLLECTING_PATIENT_DATA                               │
│ Patient: "15 mai 1985"                                      │
│ Sophie: "Parfait. Quelle est votre adresse email ?"         │
│ └─> Entities: {birth_date: "1985-05-15"}                   │
│                                                             │
│ État: COLLECTING_PATIENT_DATA                               │
│ Patient: "jean.dupont@email.com"                            │
│ Sophie: "Bénéficiez-vous d'une assurance sociale            │
│         (Hospice Générale ou SPC) ?"                        │
│ └─> Entities: {email: "jean.dupont@email.com"}             │
│                                                             │
│ État: COLLECTING_PATIENT_DATA                               │
│ Patient: "Oui, Hospice Générale"                            │
│ Sophie: "Quel est votre numéro de bénéficiaire ?"           │
│ └─> Entities: {social_insurance_type: "hospice"}           │
│                                                             │
│ État: COLLECTING_PATIENT_DATA → COLLECTING_APPOINTMENT_DATA│
│ Patient: "123456789"                                        │
│ Sophie: "Merci ! Avec quel praticien souhaitez-vous        │
│         prendre rendez-vous ?"                              │
│ └─> Entities: {beneficiary_number: "123456789"}            │
│ └─> Patient créé en DB                                      │
│                                                             │
│ État: COLLECTING_APPOINTMENT_DATA                           │
│ Patient: "Dr Leal"                                          │
│ Sophie: "Pour quelle date souhaiteriez-vous ce RDV ?"       │
│ └─> Entities: {practitioner: "Dr Leal"}                    │
│                                                             │
│ État: COLLECTING_APPOINTMENT_DATA                           │
│ Patient: "Demain à 14h"                                     │
│ Sophie: "Je vérifie les disponibilités..."                  │
│ └─> Action: check_availability()                            │
│ Sophie: "Parfait ! Je confirme :                            │
│         RDV demain (03/02/2026) à 14h00 avec Dr Leal.      │
│         Est-ce correct ?"                                   │
│ └─> Transition: → CONFIRMATION                              │
│                                                             │
│ État: CONFIRMATION                                          │
│ Patient: "Oui"                                              │
│ Sophie: "Excellent ! Votre RDV est confirmé.                │
│         Vous recevrez un SMS de confirmation."             │
│ └─> Intent: AFFIRMATIVE                                     │
│ └─> Action: book_appointment()                              │
│ └─> Transition: → COMPLETED                                 │
│                                                             │
│ État: COMPLETED                                             │
│ Sophie: "À bientôt Jean ! N'hésitez pas si besoin."         │
└─────────────────────────────────────────────────────────────┘
```

### 🔧 Composants Techniques WhatsApp

#### 1. WhatsAppController.ts

```typescript
export class WhatsAppController {
  async handleIncoming(req: Request, res: Response) {
    // 1. Extraction des données Twilio
    const { From, Body, ProfileName } = req.body;
    const userPhone = From.replace('whatsapp:', '');

    // 2. Identification de la clinique
    const clinicPhone = req.body.To.replace('whatsapp:', '');
    const clinic = await prisma.clinic.findFirst({
      where: { phone: clinicPhone }
    });

    // 3. Récupération ou création conversation
    let conversation = await prisma.conversation.findFirst({
      where: {
        user_phone: userPhone,
        clinic_id: clinic.id
      }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          clinic_id: clinic.id,
          user_phone: userPhone,
          wa_id: userPhone,
          current_state: 'IDLE',
          detected_language: 'fr'
        }
      });
    }

    // 4. Traitement du message
    const response = await conversationManager.processIncomingMessage(
      conversation.id,
      Body,
      clinic.name
    );

    // 5. Envoi de la réponse
    await this.sendWhatsAppMessage(userPhone, response);

    res.status(200).send('OK');
  }

  private async sendWhatsAppMessage(to: string, message: string) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const client = twilio(accountSid, authToken);

    await client.messages.create({
      from: 'whatsapp:+14155238886',
      to: `whatsapp:${to}`,
      body: message
    });
  }
}
```

#### 2. LLMService.ts (Ollama)

```typescript
export class LLMService {
  async extractIntent(
    userMessage: string,
    conversationHistory: any[],
    currentContext: any,
    language: string
  ): Promise<LLMResponse> {

    const prompt = this.buildPrompt(
      userMessage,
      conversationHistory,
      currentContext,
      language
    );

    // Appel à Ollama local
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'aida-medical-v1',
        prompt: prompt,
        stream: false,
        format: 'json'
      })
    });

    const data = await response.json();
    const llmResponse: LLMResponse = JSON.parse(data.response);

    return llmResponse;
  }

  private buildPrompt(
    userMessage: string,
    history: any[],
    context: any,
    language: string
  ): string {
    return `Tu es Sophie, assistante médicale virtuelle.

CONTEXTE ACTUEL:
${JSON.stringify(context, null, 2)}

HISTORIQUE (3 derniers messages):
${history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')}

MESSAGE PATIENT:
"${userMessage}"

ANALYSE ET RÉPONDS EN JSON STRICT:
{
  "detected_language": "fr",
  "intent": "BOOK_APPOINTMENT|CANCEL_APPOINTMENT|...",
  "confidence": 0.0-1.0,
  "entities": {
    "first_name": "...",
    "last_name": "...",
    "birth_date": "YYYY-MM-DD",
    ...
  },
  "needs_backend_action": true|false,
  "response_message": "Ta réponse claire et professionnelle"
}`;
  }
}
```

---

## Canal Vapi (Vocal)

### 🔄 Flux de Traitement Vapi (Voix)

```
┌──────────┐
│ Patient  │ Appelle le numéro Vapi
└────┬─────┘
     │ 1. Appel téléphonique
     v
┌──────────────────────────────────────┐
│ Twilio (Opérateur télécom)           │
│ - Reçoit l'appel                     │
│ - Identifie le numéro appelant       │
└────┬─────────────────────────────────┘
     │ 2. SIP/WebRTC vers Vapi
     v
┌────────────────────────────────────────────────────────────┐
│ Vapi Platform (Cloud)                                      │
│                                                            │
│ ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐ │
│ │  Deepgram    │  │   GPT-4o     │  │  ElevenLabs     │ │
│ │  (STT)       │→ │  (Brain)     │→ │  (TTS)          │ │
│ └──────────────┘  └──────┬───────┘  └─────────────────┘ │
│                          │                                │
│                          │ Function Calls /               │
│                          │ Webhooks                       │
└──────────────────────────┼────────────────────────────────┘
                           │
                           │ POST /webhook/vapi/webhook
                           │ Types: function-call,
                           │        conversation-update,
                           │        status-update,
                           │        end-of-call-report
                           v
┌────────────────────────────────────────────────────────────┐
│ VapiController.handleVapiWebhook()                         │
│                                                            │
│ Switch selon message.type:                                │
│                                                            │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ function-call                                        │  │
│ │ - Vapi demande une action backend                   │  │
│ │ - Ex: process_user_message, book_appointment        │  │
│ │                                                      │  │
│ │ 1. Extraction phone number (call.customer.number)   │  │
│ │ 2. Recherche patient en DB par téléphone            │  │
│ │ 3. Si trouvé : authentification automatique         │  │
│ │    {                                                │  │
│ │      isKnownPatient: true,                          │  │
│ │      patientId: "...",                              │  │
│ │      firstName: "Jean",                             │  │
│ │      lastName: "Dupont",                            │  │
│ │      hasRecentAppointments: true,                   │  │
│ │      lastAppointment: {...}                         │  │
│ │    }                                                │  │
│ │ 4. Si nouveau : crée contexte vide                  │  │
│ │ 5. Appel ConversationManager.processMessageWithSophie│ │
│ │ 6. Retourne réponse JSON à Vapi                     │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ conversation-update                                  │  │
│ │ - Mise à jour temps réel de la transcription        │  │
│ │ - Sauvegarde en DB pour analytics                   │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ status-update                                        │  │
│ │ - État de l'appel: ringing, in-progress, ended     │  │
│ │ - Log dans système                                  │  │
│ └─────────────────────────────────────────────────────┘  │
│                                                            │
│ ┌─────────────────────────────────────────────────────┐  │
│ │ end-of-call-report                                   │  │
│ │ - Rapport complet de l'appel                        │  │
│ │ - Transcription complète                            │  │
│ │ - Durée, coût, résumé                               │  │
│ │ - Mise à jour conversation: state → COMPLETED       │  │
│ └─────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

### 🎙️ Traitement Audio en Temps Réel (Vapi)

```
PATIENT PARLE: "Bonjour, je voudrais prendre rendez-vous"
      │
      v
┌─────────────────┐
│ Deepgram STT    │ Speech-to-Text (temps réel)
│ (Transcription) │ Langue détectée: Français
└────────┬────────┘
         │ Texte: "Bonjour, je voudrais prendre rendez-vous"
         v
┌──────────────────────────────────────────────────────┐
│ GPT-4o (Brain de Vapi)                               │
│                                                      │
│ System Prompt (depuis votre config):                │
│ "Tu es Sophie, secrétaire médicale de [Clinique]    │
│  Nos praticiens: Dr Leal, Dr Martin...              │
│  Nos horaires: Lun-Ven 8h-18h                       │
│  Processus: 1) Nom 2) Date naissance 3) Email..."   │
│                                                      │
│ Context (si patient connu):                         │
│ {                                                   │
│   isKnownPatient: true,                             │
│   firstName: "Jean",                                │
│   lastName: "Dupont",                               │
│   lastAppointment: {...}                            │
│ }                                                   │
│                                                      │
│ GPT-4o analyse et décide:                            │
│ - Patient dit bonjour → Répondre salutation         │
│ - Intent: prendre RDV → Commencer collecte          │
│ - Si patient connu → Personnaliser:                 │
│   "Bonjour Jean ! Content de vous revoir..."        │
└────────┬─────────────────────────────────────────────┘
         │
         │ Décision: Besoin d'action backend ?
         │
         ├─→ NON: Réponse directe
         │   Texte: "Bonjour Jean ! Avec plaisir..."
         │      │
         │      v
         │   ┌─────────────────┐
         │   │ ElevenLabs TTS  │
         │   │ Voice: Bella    │
         │   │ (French)        │
         │   └────────┬────────┘
         │            │ Audio MP3/Stream
         │            v
         │         PATIENT ENTEND
         │
         └─→ OUI: Function call
             POST /webhook/vapi/webhook
             {
               "message": {
                 "type": "function-call"
               },
               "functionCall": {
                 "name": "process_user_message",
                 "parameters": {
                   "message": "je voudrais prendre rendez-vous"
                 }
               },
               "call": {
                 "id": "call-123",
                 "customer": {
                   "number": "+33612345678"
                 }
               }
             }
             │
             v
          Votre Backend
          - Authentifie patient
          - Process avec FSM
          - Retourne réponse
```

### 📞 Exemple de Conversation Complète Vocale

```
┌─────────────────────────────────────────────────────────────────┐
│ Conversation Téléphonique - Nouveau Patient                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [Appel reçu - Numéro: +33612345678]                            │
│ [Recherche en DB... Patient non trouvé]                        │
│ [Contexte: isKnownPatient: false]                              │
│                                                                 │
│ Sophie (TTS): "Bonjour, Sophie à l'appareil. Je suis           │
│                l'assistante virtuelle de la Clinique Dentaire. │
│                Comment puis-je vous aider aujourd'hui ?"        │
│ [Durée audio: 4.2s]                                            │
│                                                                 │
│ Patient (STT): "Bonjour, je voudrais prendre rendez-vous"      │
│ [Transcription confidence: 0.98]                               │
│ [GPT-4o analyse...]                                            │
│ [Intent: BOOK_APPOINTMENT]                                     │
│ [→ Function call vers backend]                                 │
│                                                                 │
│ Backend traite:                                                │
│ - État FSM: IDLE → COLLECTING_PATIENT_DATA                     │
│ - Retourne: "Avec plaisir ! Pouvez-vous me donner votre       │
│             prénom et nom ?"                                   │
│                                                                 │
│ Sophie (TTS): "Avec plaisir ! Pouvez-vous me donner votre      │
│                prénom et nom ?"                                │
│ [Durée audio: 2.8s]                                            │
│                                                                 │
│ Patient (STT): "Jean Dupont"                                   │
│ [Transcription confidence: 0.95]                               │
│ [Entities extraites: first_name="Jean", last_name="Dupont"]   │
│                                                                 │
│ Sophie (TTS): "Enchanté Jean. Quelle est votre date de         │
│                naissance ?"                                    │
│                                                                 │
│ Patient (STT): "Quinze mai mil neuf cent quatre-vingt-cinq"   │
│ [Normalisé: 15/05/1985]                                       │
│ [Entity: birth_date="1985-05-15"]                             │
│                                                                 │
│ Sophie (TTS): "Parfait. Quelle est votre adresse email ?"      │
│                                                                 │
│ Patient (STT): "jean point dupont arobase email point com"     │
│ [Normalisé: jean.dupont@email.com]                            │
│ [Entity: email="jean.dupont@email.com"]                       │
│                                                                 │
│ Sophie (TTS): "Merci Jean. Bénéficiez-vous d'une assurance     │
│                sociale, comme l'Hospice Générale ou le SPC ?"  │
│                                                                 │
│ Patient (STT): "Oui, Hospice Générale"                         │
│ [Entity: has_social_insurance=true, type="hospice"]           │
│                                                                 │
│ [Backend: Création patient en DB avec toutes les infos]        │
│ [Patient ID: pat-123 créé]                                     │
│ [Transition: → COLLECTING_APPOINTMENT_DATA]                    │
│                                                                 │
│ Sophie (TTS): "Excellent ! Avec quel praticien souhaitez-vous  │
│                prendre rendez-vous ?"                          │
│                                                                 │
│ Patient (STT): "Docteur Leal"                                  │
│ [Entity: practitioner="Dr Leal"]                              │
│ [Backend: Recherche praticien en DB... Trouvé]                │
│                                                                 │
│ Sophie (TTS): "Très bien. Pour quelle date souhaiteriez-vous   │
│                ce rendez-vous ?"                               │
│                                                                 │
│ Patient (STT): "Demain à quatorze heures"                      │
│ [Parsé: date="2026-02-03", time="14:00"]                      │
│ [Backend: check_availability()]                                │
│ [Résultat: Créneau disponible ✓]                              │
│                                                                 │
│ Sophie (TTS): "Parfait Jean ! Je confirme votre rendez-vous    │
│                demain, le 3 février 2026, à 14h00 avec le     │
│                Dr Leal. Est-ce correct ?"                      │
│ [Transition: → CONFIRMATION]                                   │
│                                                                 │
│ Patient (STT): "Oui parfait"                                   │
│ [Intent: AFFIRMATIVE]                                          │
│ [Backend: book_appointment() → Création en DB]                 │
│ [Appointment ID: appt-456 créé]                                │
│                                                                 │
│ Sophie (TTS): "Excellent ! Votre rendez-vous est confirmé.     │
│                Vous recevrez un SMS de confirmation à ce       │
│                numéro. À bientôt Jean !"                       │
│ [Transition: → COMPLETED]                                      │
│                                                                 │
│ [Fin d'appel]                                                  │
│ [Durée totale: 2min 34s]                                       │
│ [Coût estimé: $0.13]                                           │
│ [Vapi envoie end-of-call-report avec transcription complète]   │
└─────────────────────────────────────────────────────────────────┘
```

### 🔧 Composants Techniques Vapi

#### 1. VapiController.ts

```typescript
export class VapiController {
  async handleVapiWebhook(req: Request, res: Response) {
    const { message, call } = req.body;

    switch (message?.type) {
      case 'function-call':
        return this.handleFunctionCall(req, res);
      case 'conversation-update':
        return this.handleConversationUpdate(req, res);
      case 'status-update':
        return this.handleStatusUpdate(req, res);
      case 'end-of-call-report':
        return this.handleEndOfCall(req, res);
      default:
        return res.json({ success: true });
    }
  }

  private async handleFunctionCall(req: Request, res: Response) {
    const { functionCall, call } = req.body;

    if (!call) {
      return res.json({
        result: 'Désolé, je ne peux pas traiter cet appel.'
      });
    }

    const phoneNumber = call.customer?.number;
    const clinicId = call.metadata?.clinicId;

    // Authentification automatique par numéro de téléphone
    const existingPatient = await prisma.patient.findFirst({
      where: { phone: phoneNumber, clinic_id: clinicId },
      include: {
        appointments: {
          orderBy: { start_time: 'desc' },
          take: 5,
          include: { practitioner: true, treatment_type: true }
        }
      }
    });

    // Construction du contexte patient
    let patientContext: any = {};
    if (existingPatient) {
      patientContext = {
        isKnownPatient: true,
        patientId: existingPatient.id,
        firstName: existingPatient.first_name,
        lastName: existingPatient.last_name,
        email: existingPatient.email,
        birthDate: existingPatient.birth_date?.toISOString(),
        hasRecentAppointments: existingPatient.appointments.length > 0,
        lastAppointment: existingPatient.appointments[0] ? {
          date: existingPatient.appointments[0].start_time.toISOString(),
          practitioner: `Dr ${existingPatient.appointments[0].practitioner.last_name}`,
          status: existingPatient.appointments[0].status
        } : null
      };
    } else {
      patientContext = { isKnownPatient: false };
    }

    // Récupération ou création de conversation
    let conversation = await prisma.conversation.findFirst({
      where: { user_phone: phoneNumber, clinic_id: clinicId },
      include: { messages: true, clinic: true }
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          clinic_id: clinicId,
          user_phone: phoneNumber,
          wa_id: `voice_${call.id}`,
          current_state: 'IDLE',
          detected_language: 'fr',
          context_data: patientContext
        },
        include: { messages: true, clinic: true }
      });
    } else {
      // Mise à jour du contexte
      conversation = await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          context_data: {
            ...(conversation.context_data as any || {}),
            ...patientContext
          }
        },
        include: { messages: true, clinic: true }
      });
    }

    // Route vers le bon handler
    switch (functionCall?.name) {
      case 'process_user_message':
        const userMessage = functionCall.parameters.message || '';
        const response = await this.conversationManager.processMessageWithSophie(
          conversation.id,
          userMessage,
          conversation.clinic.name || 'Clinique'
        );
        return res.json({
          result: response || 'Je n\'ai pas compris, pourriez-vous répéter ?'
        });

      case 'book_appointment':
        // Logique de réservation
        // ...
        return res.json({
          result: `Votre rendez-vous est confirmé.`
        });

      default:
        return res.json({
          result: 'Fonction non reconnue.'
        });
    }
  }
}
```

#### 2. Configuration Vapi Assistant

```typescript
// Dans VapiController.getAssistantConfig()
const assistantConfig = {
  name: `Sophie - ${clinic.name}`,

  voice: {
    provider: 'elevenlabs',
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - Voix française pro
    stability: 0.6,
    similarityBoost: 0.8,
    model: 'eleven_turbo_v2_5'
  },

  model: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0.7,
    messages: [{
      role: 'system',
      content: `Tu es Sophie, secrétaire médicale de ${clinic.name}.

      NOS PRATICIENS: ${practitionersList}
      NOS HORAIRES: ${formattedHours}

      PROCESSUS:
      1. Accueillir chaleureusement
      2. Demander prénom et nom
      3. Demander date de naissance
      4. Demander email
      5. Demander assurance sociale
      6. Choisir praticien
      7. Choisir date/heure
      8. Confirmer

      RÈGLES:
      - Parle TOUJOURS en français
      - Une seule question à la fois
      - Phrases courtes et claires
      - Confirme les informations importantes`
    }]
  },

  transcriber: {
    provider: 'deepgram',
    model: 'nova-2-general',
    language: 'fr',
    smartFormat: true
  },

  firstMessage: `Bonjour, Sophie à l'appareil...`,

  serverUrl: process.env.VAPI_WEBHOOK_URL,

  metadata: {
    clinicId: clinic.id,
    clinicName: clinic.name
  }
};
```

---

## Architecture Unifiée

### 🎯 Service Partagé (Recommandation)

```typescript
// src/services/AssistantService.ts

/**
 * Service unifié pour WhatsApp ET Vapi
 * Contient toute la logique métier partagée
 */
export class AssistantService {

  /**
   * Recherche et authentifie un patient par téléphone
   */
  async authenticatePatient(
    phoneNumber: string,
    clinicId: string
  ): Promise<PatientContext> {
    const patient = await prisma.patient.findFirst({
      where: { phone: phoneNumber, clinic_id: clinicId },
      include: {
        appointments: {
          orderBy: { start_time: 'desc' },
          take: 5,
          include: { practitioner: true, treatment_type: true }
        }
      }
    });

    if (patient) {
      return {
        isKnownPatient: true,
        patientId: patient.id,
        firstName: patient.first_name,
        lastName: patient.last_name,
        email: patient.email,
        birthDate: patient.birth_date?.toISOString(),
        hasSocialInsurance: patient.has_social_insurance,
        socialInsuranceType: patient.social_insurance_type,
        hasRecentAppointments: patient.appointments.length > 0,
        lastAppointment: patient.appointments[0] ? {
          date: patient.appointments[0].start_time.toISOString(),
          practitioner: `Dr ${patient.appointments[0].practitioner.last_name}`,
          status: patient.appointments[0].status
        } : null
      };
    }

    return { isKnownPatient: false };
  }

  /**
   * Crée ou met à jour un patient
   */
  async upsertPatient(data: PatientData): Promise<Patient> {
    const existing = await prisma.patient.findFirst({
      where: {
        phone: data.phone,
        clinic_id: data.clinicId
      }
    });

    if (existing) {
      return await prisma.patient.update({
        where: { id: existing.id },
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
          birth_date: data.birthDate,
          email: data.email,
          has_social_insurance: data.hasSocialInsurance,
          social_insurance_type: data.socialInsuranceType,
          beneficiary_number: data.beneficiaryNumber
        }
      });
    }

    return await prisma.patient.create({
      data: {
        clinic_id: data.clinicId,
        phone: data.phone,
        first_name: data.firstName,
        last_name: data.lastName,
        birth_date: data.birthDate,
        email: data.email,
        has_social_insurance: data.hasSocialInsurance,
        social_insurance_type: data.socialInsuranceType,
        beneficiary_number: data.beneficiaryNumber
      }
    });
  }

  /**
   * Vérifie disponibilités praticien
   */
  async checkAvailability(
    practitionerId: string,
    date: Date,
    clinicId: string
  ): Promise<TimeSlot[]> {
    // Récupère les RDV existants pour ce jour
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingAppointments = await prisma.appointment.findMany({
      where: {
        practitioner_id: practitionerId,
        start_time: {
          gte: startOfDay,
          lte: endOfDay
        },
        status: { not: 'CANCELLED' }
      }
    });

    // Calcule les créneaux disponibles
    const availableSlots: TimeSlot[] = [];
    // ... logique de calcul des créneaux

    return availableSlots;
  }

  /**
   * Crée un rendez-vous
   */
  async bookAppointment(data: AppointmentData): Promise<Appointment> {
    const appointment = await prisma.appointment.create({
      data: {
        patient_id: data.patientId,
        practitioner_id: data.practitionerId,
        clinic_id: data.clinicId,
        start_time: data.startTime,
        end_time: data.endTime,
        treatment_type_id: data.treatmentTypeId,
        status: 'CONFIRMED'
      },
      include: {
        patient: true,
        practitioner: true,
        treatment_type: true
      }
    });

    // Envoyer SMS de confirmation
    await this.sendConfirmationSMS(appointment);

    // Créer événement Google Calendar si configuré
    await this.createCalendarEvent(appointment);

    return appointment;
  }

  /**
   * Annule un rendez-vous
   */
  async cancelAppointment(appointmentId: string): Promise<Appointment> {
    const appointment = await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED' }
    });

    // Envoyer SMS d'annulation
    await this.sendCancellationSMS(appointment);

    return appointment;
  }

  /**
   * Liste les rendez-vous d'un patient
   */
  async listPatientAppointments(
    patientId: string,
    includeHistory: boolean = false
  ): Promise<Appointment[]> {
    const where: any = { patient_id: patientId };

    if (!includeHistory) {
      where.start_time = { gte: new Date() };
      where.status = { not: 'CANCELLED' };
    }

    return await prisma.appointment.findMany({
      where,
      include: {
        practitioner: true,
        treatment_type: true
      },
      orderBy: { start_time: 'asc' }
    });
  }

  private async sendConfirmationSMS(appointment: Appointment) {
    // Implémentation Twilio SMS
  }

  private async createCalendarEvent(appointment: Appointment) {
    // Implémentation Google Calendar
  }
}
```

### 📊 Utilisation du Service Unifié

```typescript
// WhatsAppController utilise AssistantService
export class WhatsAppController {
  private assistantService: AssistantService;

  async handleIncoming(req: Request, res: Response) {
    // ... extraction données Twilio

    // Authentification via service unifié
    const patientContext = await this.assistantService.authenticatePatient(
      userPhone,
      clinic.id
    );

    // Reste du traitement...
  }
}

// VapiController utilise AUSSI AssistantService
export class VapiController {
  private assistantService: AssistantService;

  private async handleFunctionCall(req: Request, res: Response) {
    // ... extraction données Vapi

    // Même authentification via service unifié
    const patientContext = await this.assistantService.authenticatePatient(
      phoneNumber,
      clinicId
    );

    // Reste du traitement...
  }
}
```

---

## Machine à États (FSM)

### 🔄 Diagramme d'États

```
                        ┌──────────┐
                        │   IDLE   │ État initial
                        └────┬─────┘
                             │
                   ┌─────────┴─────────┐
                   │  Intent détecté   │
                   │ BOOK_APPOINTMENT  │
                   └─────────┬─────────┘
                             │
                             v
              ┌──────────────────────────┐
              │ COLLECTING_PATIENT_DATA  │
              │                          │
              │ Collecte:                │
              │ - Prénom                 │
              │ - Nom                    │
              │ - Date naissance         │
              │ - Email                  │
              │ - Téléphone              │
              │ - Assurance sociale      │
              │ - N° bénéficiaire        │
              └──────────────┬───────────┘
                             │
                   ┌─────────┴──────────┐
                   │ Toutes données OK  │
                   │ Création patient   │
                   └─────────┬──────────┘
                             │
                             v
          ┌────────────────────────────────┐
          │ COLLECTING_APPOINTMENT_DATA    │
          │                                │
          │ Collecte:                      │
          │ - Praticien souhaité           │
          │ - Date préférée                │
          │ - Heure préférée               │
          │ - Type de consultation         │
          │                                │
          │ Actions:                       │
          │ - check_availability()         │
          │ - Propose créneaux dispo       │
          └──────────────┬─────────────────┘
                         │
               ┌─────────┴──────────┐
               │ Créneau sélectionné│
               └─────────┬──────────┘
                         │
                         v
                ┌─────────────────┐
                │  CONFIRMATION   │
                │                 │
                │ Résumé complet: │
                │ "RDV le [date]  │
                │  à [heure]      │
                │  avec [praticien│
                │  Est-ce correct?"│
                └────┬────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        v                         v
 ┌──────────┐            ┌───────────────┐
 │AFFIRMATIVE│            │   NEGATIVE    │
 │   (Oui)  │            │     (Non)     │
 └────┬─────┘            └───────┬───────┘
      │                          │
      │ book_appointment()       │
      │                          v
      │                  Retour à COLLECTING_
      │                  APPOINTMENT_DATA
      │                  (modifier détails)
      v
┌───────────┐
│ COMPLETED │
│           │
│ Actions:  │
│ - RDV créé│
│ - SMS envoyé
│ - Event cal│
└───────────┘


              ┌──────────────┐
              │  EMERGENCY   │ État spécial
              │              │
              │ Détecté si:  │
              │ - "urgence"  │
              │ - "douleur"  │
              │ - "accident" │
              │              │
              │ Action:      │
              │ Conseiller   │
              │ 144/urgences │
              └──────────────┘
```

### 🔧 Implémentation FSM

```typescript
// src/services/StateMachine.ts

export class ConversationStateMachine {

  /**
   * Détermine la transition d'état basée sur l'intent et le contexte
   */
  transition(
    currentState: ConversationState,
    intent: Intent,
    context: ConversationContext
  ): ConversationState {

    switch (currentState) {
      case ConversationState.IDLE:
        if (intent === Intent.BOOK_APPOINTMENT) {
          return ConversationState.COLLECTING_PATIENT_DATA;
        }
        if (intent === Intent.EMERGENCY) {
          return ConversationState.EMERGENCY;
        }
        return ConversationState.IDLE;

      case ConversationState.COLLECTING_PATIENT_DATA:
        if (this.hasAllPatientData(context)) {
          return ConversationState.COLLECTING_APPOINTMENT_DATA;
        }
        return ConversationState.COLLECTING_PATIENT_DATA;

      case ConversationState.COLLECTING_APPOINTMENT_DATA:
        if (this.hasAllAppointmentData(context)) {
          return ConversationState.CONFIRMATION;
        }
        return ConversationState.COLLECTING_APPOINTMENT_DATA;

      case ConversationState.CONFIRMATION:
        if (intent === Intent.AFFIRMATIVE) {
          return ConversationState.COMPLETED;
        }
        if (intent === Intent.NEGATIVE) {
          return ConversationState.COLLECTING_APPOINTMENT_DATA;
        }
        return ConversationState.CONFIRMATION;

      case ConversationState.COMPLETED:
        return ConversationState.IDLE; // Prêt pour nouvelle conversation

      default:
        return currentState;
    }
  }

  /**
   * Vérifie si toutes les données patient sont collectées
   */
  private hasAllPatientData(context: ConversationContext): boolean {
    const patient = context.patient;
    if (!patient) return false;

    return !!(
      patient.first_name &&
      patient.last_name &&
      patient.birth_date &&
      patient.email &&
      patient.phone
      // assurance_sociale est optionnelle
    );
  }

  /**
   * Vérifie si toutes les données RDV sont collectées
   */
  private hasAllAppointmentData(context: ConversationContext): boolean {
    const appt = context.appointment;
    if (!appt) return false;

    return !!(
      appt.practitioner_id &&
      appt.date &&
      appt.time
    );
  }

  /**
   * Détermine les champs manquants dans l'état actuel
   */
  getMissingFields(
    state: ConversationState,
    context: ConversationContext
  ): string[] {
    const missing: string[] = [];

    if (state === ConversationState.COLLECTING_PATIENT_DATA) {
      const p = context.patient || {};
      if (!p.first_name) missing.push('first_name');
      if (!p.last_name) missing.push('last_name');
      if (!p.birth_date) missing.push('birth_date');
      if (!p.email) missing.push('email');
      if (!p.phone) missing.push('phone');
    }

    if (state === ConversationState.COLLECTING_APPOINTMENT_DATA) {
      const a = context.appointment || {};
      if (!a.practitioner_id) missing.push('practitioner');
      if (!a.date) missing.push('date');
      if (!a.time) missing.push('time');
    }

    return missing;
  }
}
```

---

## Flux de Données Détaillés

### 📥 Base de Données - Schéma Principal

```sql
-- Patients
CREATE TABLE patients (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(255),
  birth_date DATE,
  has_social_insurance BOOLEAN DEFAULT false,
  social_insurance_type VARCHAR(50),
  beneficiary_number VARCHAR(100),
  guarantee_number VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversations
CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL,
  user_phone VARCHAR(20),
  wa_id VARCHAR(100),
  current_state VARCHAR(50) DEFAULT 'IDLE',
  detected_language VARCHAR(10) DEFAULT 'fr',
  context_data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL,
  role VARCHAR(20), -- 'user' ou 'assistant'
  content TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Appointments
CREATE TABLE appointments (
  id UUID PRIMARY KEY,
  clinic_id UUID NOT NULL,
  patient_id UUID NOT NULL,
  practitioner_id UUID NOT NULL,
  treatment_type_id UUID,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status VARCHAR(50) DEFAULT 'CONFIRMED',
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Logs système
CREATE TABLE system_logs (
  id UUID PRIMARY KEY,
  level VARCHAR(20),
  category VARCHAR(50),
  action VARCHAR(100),
  message TEXT,
  metadata JSONB,
  clinic_id UUID,
  conversation_id UUID,
  user_phone VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 🔄 Contexte de Conversation (context_data)

```typescript
// Structure du JSONB context_data dans la table conversations

interface ConversationContextData {
  // Authentication patient (auto via téléphone)
  isKnownPatient?: boolean;
  patientId?: string;

  // Données patient en cours de collecte
  patient?: {
    first_name?: string;
    last_name?: string;
    birth_date?: string;
    email?: string;
    phone?: string;
    has_social_insurance?: boolean;
    social_insurance_type?: string;
    beneficiary_number?: string;
    guarantee_number?: string;
  };

  // Données RDV en cours de collecte
  appointment?: {
    type?: string;
    date?: string; // ISO 8601
    time?: string; // HH:mm
    time_preference?: 'MORNING' | 'AFTERNOON';
    practitioner_id?: string;
    practitioner_name?: string;
  };

  // Gestion workflow
  missing_fields?: string[];
  ambiguity_count?: number;
  rejected_times?: string[]; // Créneaux refusés par patient

  // Action en attente
  pending_action?: {
    type: 'BOOK' | 'CANCEL' | 'MODIFY';
    appointment_id?: string;
    new_data?: any;
  };

  // Informations patient connu (enrichies)
  firstName?: string;
  lastName?: string;
  email?: string;
  birthDate?: string;
  hasSocialInsurance?: boolean;
  socialInsuranceType?: string;
  beneficiaryNumber?: string;
  hasRecentAppointments?: boolean;
  lastAppointment?: {
    date: string;
    practitioner: string;
    status: string;
  };
}
```

---

## Gestion de la Mémoire Patient

### 🧠 Authentification Automatique (Vocal)

Lorsqu'un patient **appelle**, Vapi fournit son numéro de téléphone. Le système l'utilise pour :

```typescript
// Dans VapiController.handleFunctionCall()

const phoneNumber = call.customer?.number; // Ex: "+33612345678"

// 1. Recherche en DB
const patient = await prisma.patient.findFirst({
  where: {
    phone: phoneNumber,
    clinic_id: clinicId
  },
  include: {
    appointments: {
      where: {
        start_time: { gte: new Date() },
        status: 'CONFIRMED'
      },
      orderBy: { start_time: 'asc' },
      take: 5,
      include: {
        practitioner: true,
        treatment_type: true
      }
    }
  }
});

// 2. Construit contexte riche
if (patient) {
  const context = {
    isKnownPatient: true,
    patientId: patient.id,
    firstName: patient.first_name,
    lastName: patient.last_name,
    email: patient.email,
    birthDate: patient.birth_date?.toISOString(),
    hasSocialInsurance: patient.has_social_insurance,
    socialInsuranceType: patient.social_insurance_type,
    beneficiaryNumber: patient.beneficiary_number,
    hasRecentAppointments: patient.appointments.length > 0,
    lastAppointment: patient.appointments[0] ? {
      date: patient.appointments[0].start_time.toISOString(),
      practitioner: `Dr ${patient.appointments[0].practitioner.last_name}`,
      status: patient.appointments[0].status
    } : null
  };

  // 3. Injecte dans conversation
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { context_data: context }
  });

  // 4. GPT-4o (Vapi) voit ce contexte et personnalise:
  // "Bonjour Jean ! Content de vous revoir.
  //  Je vois que vous avez déjà un RDV prévu le 5 février avec Dr Leal.
  //  Souhaitez-vous prendre un nouveau rendez-vous ou modifier celui-ci ?"
}
```

### 📱 Authentification WhatsApp

Pour WhatsApp, le numéro est fourni par Twilio :

```typescript
// Dans WhatsAppController.handleIncoming()

const userPhone = req.body.From.replace('whatsapp:', '');

// Même logique d'authentification
const patient = await prisma.patient.findFirst({
  where: { phone: userPhone, clinic_id: clinic.id }
});

if (patient) {
  // Patient reconnu → expérience personnalisée
  // "Bonjour Jean ! Comment puis-je vous aider ?"
} else {
  // Nouveau patient → collecte des infos
  // "Bonjour ! Pour commencer, quel est votre nom ?"
}
```

---

## Déploiement et Configuration

### 🚀 Configuration Complète

#### 1. Variables d'Environnement (.env)

```bash
# Serveur
PORT=3000
NODE_ENV=production

# Base de données
DATABASE_URL="postgresql://user:pass@host:5432/medical_assistant?schema=public"

# LLM Local (Ollama) - Pour WhatsApp
LLM_API_URL="http://localhost:11434/api/generate"
LLM_MODEL="aida-medical-v1"

# JWT
JWT_SECRET="your-super-secret-jwt-key-change-in-production"

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID="ACxxxxx"
TWILIO_AUTH_TOKEN="xxxxx"
TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"

# Vapi (Vocal)
VAPI_API_KEY="your_vapi_api_key"
VAPI_WEBHOOK_URL="https://your-domain.com/webhook/vapi/webhook"
VAPI_WEBHOOK_SECRET="your-secure-webhook-secret"

# Google OAuth (Calendar)
GOOGLE_CLIENT_ID="xxxxx.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="GOCSPX-xxxxx"
GOOGLE_REDIRECT_URI="https://your-domain.com/oauth/callback"

# Logs
LOG_LEVEL="INFO" # DEBUG, INFO, WARN, ERROR
```

#### 2. Démarrage des Services

```bash
# 1. Démarrer PostgreSQL
# (Docker, service local, ou cloud comme Supabase)

# 2. Démarrer Ollama (pour WhatsApp uniquement)
ollama serve
ollama pull aida-medical-v1

# 3. Démarrer l'application
npm install
npm run build
npm start

# 4. Exposer avec ngrok (développement)
ngrok http 3000
# → Copier l'URL https://xxxx.ngrok.io

# 5. Configurer Twilio Webhook
# Dashboard Twilio > WhatsApp > Sandbox
# Webhook URL: https://xxxx.ngrok.io/webhook/whatsapp

# 6. Configurer Vapi Webhook
# Dashboard Vapi > Assistant > Server URL
# Server URL: https://xxxx.ngrok.io/webhook/vapi/webhook
```

#### 3. Production (Recommandations)

```
┌─────────────────────────────────────┐
│         CLOUD PROVIDER              │
│  (AWS, Google Cloud, Azure, etc.)   │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Load Balancer (HTTPS)       │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│  ┌──────────────▼───────────────┐  │
│  │  Node.js App (PM2/Docker)    │  │
│  │  Port 3000 (interne)         │  │
│  └──────────────┬───────────────┘  │
│                 │                   │
│  ┌──────────────▼───────────────┐  │
│  │  PostgreSQL (RDS/managed)    │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Ollama (EC2/GPU instance)   │  │
│  │  Optionnel si WhatsApp only  │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
```

### 📊 Monitoring et Logs

```typescript
// Tous les événements sont loggés dans system_logs

// Exemples de logs importants:

// WhatsApp
await logService.info('WHATSAPP', 'MESSAGE_RECEIVED',
  'Nouveau message WhatsApp', {
    metadata: { phone: userPhone, message: body }
  });

// Vapi
await logService.info('VAPI', 'CALL_STARTED',
  'Nouvel appel vocal', {
    metadata: { callId: call.id, phone: phoneNumber }
  });

// Patient
await logService.info('VAPI', 'PATIENT_AUTHENTICATED',
  'Patient reconnu automatiquement', {
    metadata: { patientId: patient.id, phone: phoneNumber }
  });

// Appointment
await logService.info('CONVERSATION', 'APPOINTMENT_BOOKED',
  'Rendez-vous créé avec succès', {
    metadata: {
      appointmentId: appt.id,
      patientId: patient.id,
      date: appt.start_time
    }
  });

// Erreurs
await logService.error('LLM', 'EXTRACTION_FAILED',
  'Échec extraction entités', error, {
    metadata: { message: userMessage }
  });
```

### 🔍 Requêtes SQL Utiles

```sql
-- Statistiques des conversations
SELECT
  current_state,
  COUNT(*) as total,
  AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) as avg_duration_seconds
FROM conversations
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY current_state;

-- Taux de conversion (RDV réservés)
SELECT
  DATE(created_at) as date,
  COUNT(*) as total_conversations,
  COUNT(*) FILTER (WHERE current_state = 'COMPLETED') as completed,
  ROUND(100.0 * COUNT(*) FILTER (WHERE current_state = 'COMPLETED') / COUNT(*), 2) as conversion_rate
FROM conversations
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;

-- Patients les plus actifs
SELECT
  p.first_name,
  p.last_name,
  p.phone,
  COUNT(DISTINCT c.id) as conversations,
  COUNT(a.id) as appointments
FROM patients p
LEFT JOIN conversations c ON c.user_phone = p.phone
LEFT JOIN appointments a ON a.patient_id = p.id
GROUP BY p.id
ORDER BY conversations DESC
LIMIT 20;

-- Erreurs récentes
SELECT
  created_at,
  category,
  action,
  message,
  metadata->>'error_message' as error
FROM system_logs
WHERE level = 'ERROR'
  AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 🎯 Résumé de l'Architecture

### Avantages du Système

✅ **Multi-canal unifié**
- Patients choisissent texte (WhatsApp) ou voix (téléphone)
- Une seule base de données
- Une seule logique métier

✅ **Intelligence adaptée**
- WhatsApp : Ollama local (gratuit, configurable)
- Vapi : GPT-4o (performant pour la voix)

✅ **Authentification automatique**
- Reconnaissance par numéro de téléphone
- Expérience personnalisée pour patients connus
- Pas besoin de redemander les infos

✅ **Gestion d'état robuste**
- FSM claire et testable
- Gestion des ambiguïtés
- Reprise après erreur

✅ **Évolutif**
- Architecture modulaire
- Facile d'ajouter nouveaux canaux (SMS, email, etc.)
- Service unifié réutilisable

### Points d'Attention

⚠️ **Coûts Vapi**
- ~$0.05-0.15 par minute d'appel
- Surveiller l'utilisation

⚠️ **Latence Ollama**
- Dépend de la machine
- Considérer GPU pour production

⚠️ **Sécurité**
- Chiffrer données sensibles (assurance, etc.)
- Valider webhooks (signatures Twilio/Vapi)
- RGPD : gestion consentements

⚠️ **Disponibilité**
- Ollama doit être up pour WhatsApp
- Internet requis pour Vapi
- Plan de secours en cas de panne

---

## 📚 Fichiers Importants du Projet

```
proectassistant/
├── src/
│   ├── controllers/
│   │   ├── WhatsAppController.ts      # Gestion WhatsApp
│   │   └── VapiController.ts          # Gestion Vapi
│   ├── services/
│   │   ├── ConversationManager.ts     # FSM + Logique
│   │   ├── LLMService.ts              # Interface Ollama
│   │   ├── AssistantService.ts        # Service unifié (à créer)
│   │   └── LogService.ts              # Logs système
│   ├── types/
│   │   └── conversation.ts            # Types TypeScript
│   └── index.ts                       # Point d'entrée
├── prisma/
│   └── schema.prisma                  # Schéma DB
├── docs/
│   ├── ARCHITECTURE_COMPLETE.md       # Ce document
│   ├── VAPI_INTEGRATION.md            # Guide Vapi
│   └── QUICKSTART_VAPI.md             # Démarrage rapide
└── .env                               # Configuration
```

---

## 🚦 Prochaines Étapes Recommandées

1. ✅ **Compléter les corrections Vapi** (webhooks undefined)
2. 🔨 **Créer AssistantService.ts** (service unifié)
3. 🧪 **Tester scénario complet WhatsApp**
4. 📞 **Tester scénario complet Vapi**
5. 📊 **Configurer monitoring/alertes**
6. 🔐 **Renforcer sécurité (webhooks, RGPD)**
7. 🚀 **Préparer déploiement production**

---

*Document créé le 02/02/2026*
*Version: 1.0*
