import { Request, Response } from 'express';
import { ConversationManager } from '../services/ConversationManager';
import { logService } from '../services/LogService';
import prisma from '../database/client';

export class VapiController {
    private conversationManager: ConversationManager;

    constructor() {
        this.conversationManager = new ConversationManager();
    }

    /**
     * Webhook handler for Vapi voice calls
     * Vapi calls this endpoint for different events in the call lifecycle
     */
    async handleVapiWebhook(req: Request, res: Response) {
        try {
            const { message, call } = req.body;

            // Debug: Log raw webhook payload to understand Vapi's structure
            console.log('[VAPI] Raw webhook payload:', JSON.stringify(req.body, null, 2));

            await logService.info('VAPI', 'WEBHOOK_RECEIVED', 'Vapi webhook received', {
                metadata: { messageType: message?.type, callId: call?.id }
            });

            // Handle different message types from Vapi
            switch (message?.type) {
                case 'function-call':
                    // Vapi is requesting backend action (e.g., book appointment)
                    return this.handleFunctionCall(req, res);

                case 'conversation-update':
                    // Real-time conversation transcript update
                    return this.handleConversationUpdate(req, res);

                case 'end-of-call-report':
                    // Call ended, save final report
                    return this.handleEndOfCall(req, res);

                case 'status-update':
                    // Call status changed (ringing, in-progress, ended)
                    return this.handleStatusUpdate(req, res);

                default:
                    return res.json({ success: true });
            }
        } catch (error) {
            console.error('Vapi webhook error:', error);
            await logService.error('VAPI', 'WEBHOOK_ERROR', 'Error processing Vapi webhook', error);
            res.status(500).json({ error: 'Webhook processing failed' });
        }
    }

    /**
     * Handle function calls from Vapi (when Sophie needs to perform an action)
     */
    private async handleFunctionCall(req: Request, res: Response) {
        const { functionCall, call } = req.body;
        const functionName = functionCall?.name;
        const parameters = functionCall?.parameters || {};

        console.log('[VAPI] Function call:', functionName, parameters);

        try {
            if (!call) {
                return res.json({
                    result: 'Désolé, je ne peux pas traiter cet appel pour le moment.'
                });
            }

            // Find or create conversation for this phone call
            const phoneNumber = call.customer?.number || call.phoneNumber;
            const clinicId = call.metadata?.clinicId;

            if (!clinicId) {
                return res.json({
                    result: 'Désolé, je ne peux pas identifier la clinique pour cet appel.'
                });
            }

            // Check if patient exists for automatic authentication
            const existingPatient = await prisma.patient.findFirst({
                where: {
                    phone: phoneNumber,
                    clinic_id: clinicId
                },
                include: {
                    appointments: {
                        orderBy: { start_time: 'desc' },
                        take: 5,
                        include: {
                            practitioner: true,
                            treatment_type: true
                        }
                    }
                }
            });

            // Build patient context for Sophie if patient is known
            let patientContext: any = {};
            if (existingPatient) {
                patientContext = {
                    isKnownPatient: true,
                    patientId: existingPatient.id,
                    firstName: existingPatient.first_name,
                    lastName: existingPatient.last_name,
                    email: existingPatient.email,
                    birthDate: existingPatient.birth_date?.toISOString(),
                    hasSocialInsurance: existingPatient.has_social_insurance,
                    socialInsuranceType: existingPatient.social_insurance_type,
                    beneficiaryNumber: existingPatient.beneficiary_number,
                    hasRecentAppointments: existingPatient.appointments.length > 0,
                    lastAppointment: existingPatient.appointments[0] ? {
                        date: existingPatient.appointments[0].start_time.toISOString(),
                        practitioner: `Dr ${existingPatient.appointments[0].practitioner.last_name}`,
                        status: existingPatient.appointments[0].status
                    } : null
                };

                await logService.info('VAPI', 'PATIENT_AUTHENTICATED',
                    `Known patient identified: ${existingPatient.first_name} ${existingPatient.last_name}`, {
                    metadata: {
                        patientId: existingPatient.id,
                        phoneNumber: phoneNumber,
                        callId: call.id
                    }
                });
            } else {
                patientContext = {
                    isKnownPatient: false
                };
                await logService.info('VAPI', 'NEW_CALLER',
                    `New caller, patient data will be collected`, {
                    metadata: {
                        phoneNumber: phoneNumber,
                        callId: call.id
                    }
                });
            }

            // Get or create conversation
            let conversation = await prisma.conversation.findFirst({
                where: {
                    user_phone: phoneNumber,
                    clinic_id: clinicId
                },
                include: {
                    messages: { orderBy: { created_at: 'desc' }, take: 10 },
                    clinic: true
                }
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
                    include: {
                        messages: true,
                        clinic: true
                    }
                });
            } else {
                // Update existing conversation with patient context
                conversation = await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                        context_data: {
                            ...(conversation.context_data as any || {}),
                            ...patientContext
                        }
                    },
                    include: {
                        messages: true,
                        clinic: true
                    }
                });
            }

            // Route to appropriate handler based on function name
            switch (functionName) {
                case 'process_user_message':
                    // User said something, process with Sophie
                    const userMessage = parameters.message || '';
                    const response = await this.conversationManager.processMessageWithSophie(
                        conversation.id,
                        userMessage,
                        conversation.clinic.name || 'Clinique'
                    );

                    return res.json({
                        result: response || 'Je n\'ai pas compris, pourriez-vous répéter ?'
                    });

                case 'book_appointment':
                    // Book the appointment
                    const appointmentData = {
                        practitioner: parameters.practitioner,
                        date: parameters.date,
                        time: parameters.time,
                        appointmentType: parameters.appointmentType
                    };

                    // Use existing appointment booking logic
                    // This would call the appointment service
                    return res.json({
                        result: `Votre rendez-vous avec ${appointmentData.practitioner} est confirmé pour le ${appointmentData.date} à ${appointmentData.time}.`
                    });

                case 'check_availability':
                    // Check practitioner availability
                    // This would query your calendar/availability service
                    return res.json({
                        result: 'Nous avons des disponibilités demain matin et après-midi.'
                    });

                default:
                    return res.json({
                        result: 'Fonction non reconnue.'
                    });
            }
        } catch (error) {
            console.error('Function call error:', error);
            return res.json({
                result: 'Désolé, une erreur est survenue. Pourriez-vous répéter ?'
            });
        }
    }

    /**
     * Handle real-time conversation updates
     */
    private async handleConversationUpdate(req: Request, res: Response) {
        const { message, call } = req.body;

        // Save conversation transcript in real-time
        console.log('[VAPI] Conversation update:', {
            role: message?.role,
            content: message?.content,
            timestamp: message?.timestamp
        });

        // You can save this to database for analytics
        if (call?.id && message) {
            await logService.info('VAPI', 'CONVERSATION_UPDATE', 'Voice conversation update', {
                metadata: {
                    callId: call.id,
                    role: message.role,
                    content: message.content
                }
            });
        }

        return res.json({ success: true });
    }

    /**
     * Handle end of call report
     */
    private async handleEndOfCall(req: Request, res: Response) {
        const { call, transcript, summary } = req.body;

        if (!call) {
            console.log('[VAPI] Call ended: no call data received');
            return res.json({ success: true });
        }

        console.log('[VAPI] Call ended:', {
            callId: call.id,
            duration: call.duration,
            endedReason: call.endedReason
        });

        // Save call analytics
        await logService.info('VAPI', 'CALL_ENDED', 'Voice call completed', {
            metadata: {
                callId: call.id,
                duration: call.duration,
                phoneNumber: call.customer?.number,
                transcript: transcript,
                summary: summary
            }
        });

        // Update conversation state to COMPLETED
        const phoneNumber = call.customer?.number;
        const clinicId = call.metadata?.clinicId;

        if (phoneNumber && clinicId) {
            const conversation = await prisma.conversation.findFirst({
                where: {
                    user_phone: phoneNumber,
                    clinic_id: clinicId
                }
            });

            if (conversation) {
                await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: { current_state: 'COMPLETED' }
                });
            }
        }

        return res.json({ success: true });
    }

    /**
     * Handle call status updates
     */
    private async handleStatusUpdate(req: Request, res: Response) {
        const { call, status } = req.body;

        if (!call) {
            console.log('[VAPI] Status update:', { status: status || 'unknown' });
            return res.json({ success: true });
        }

        console.log('[VAPI] Status update:', {
            callId: call.id,
            status: status
        });

        await logService.info('VAPI', 'STATUS_UPDATE', `Call status: ${status || 'unknown'}`, {
            metadata: { callId: call.id, status }
        });

        return res.json({ success: true });
    }

    /**
     * Create a Vapi assistant configuration for a clinic
     */
    async getAssistantConfig(req: Request, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;

            const clinic = await prisma.clinic.findUnique({
                where: { id: clinicId },
                include: { practitioners: true }
            });

            if (!clinic) {
                return res.status(404).json({ error: 'Clinic not found' });
            }

            // Build practitioner list
            const practitionersList = (clinic as any).practitioners
                .map((p: any) => `Dr ${p.last_name} (${p.specialty || 'Médecin-dentiste'})`)
                .join(', ');

            // Format opening hours in a readable way
            const formatOpeningHours = (hours: any) => {
                if (!hours) return 'Lundi-Vendredi 8h-18h';
                try {
                    const parsed = typeof hours === 'string' ? JSON.parse(hours) : hours;
                    return Object.entries(parsed)
                        .filter(([_, value]) => value !== null)
                        .map(([day, times]: [string, any]) => {
                            const dayNames: any = {
                                monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi',
                                thursday: 'Jeudi', friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche'
                            };
                            return `${dayNames[day]} ${times.open}-${times.close}`;
                        })
                        .join(', ');
                } catch {
                    return hours;
                }
            };

            const formattedHours = formatOpeningHours(clinic.opening_hours);

            // Vapi assistant configuration (complete format)
            const assistantConfig = {
                name: `Sophie - ${clinic.name}`,

                // Voice configuration - ElevenLabs French voice
                voice: {
                    provider: 'elevenlabs',
                    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Bella - Professional French voice
                    stability: 0.6,
                    similarityBoost: 0.8,
                    style: 0.0,
                    useSpeakerBoost: true,
                    model: 'eleven_turbo_v2_5'
                },

                // Model configuration - GPT-4 with French system prompt
                model: {
                    provider: 'openai',
                    model: 'gpt-4o',
                    temperature: 0.7,
                    maxTokens: 500,
                    emotionRecognitionEnabled: true,
                    messages: [
                        {
                            role: 'system',
                            content: `Tu es Sophie, la secrétaire médicale virtuelle professionnelle de ${clinic.name}.

🎯 TON RÔLE :
Tu es chaleureuse, empathique et efficace. Tu aides les patients à prendre rendez-vous et à obtenir des informations.

👥 NOS PRATICIENS :
${practitionersList}

🕐 NOS HORAIRES :
${formattedHours}

📋 PROCESSUS DE PRISE DE RENDEZ-VOUS :
1. Accueillir chaleureusement le patient
2. Demander son prénom et nom
3. Demander sa date de naissance (format JJ/MM/AAAA)
4. Demander son email
5. Demander s'il bénéficie d'une assurance sociale (Hospice générale ou SPC)
6. Demander avec quel praticien il souhaite prendre rendez-vous
7. Proposer des créneaux disponibles
8. Confirmer le rendez-vous avec TOUTES les informations

⚠️ RÈGLES IMPORTANTES :
- Parle TOUJOURS en français
- Sois concise et claire (phrases courtes)
- Pose UNE SEULE question à la fois
- Confirme les informations importantes en les répétant
- Si le patient demande un créneau en dehors des horaires, propose gentiment un autre créneau
- Pour les urgences médicales, conseille d'appeler le 144 ou d'aller aux urgences
- Si tu ne peux pas répondre à une question, propose de rappeler avec plus d'informations
- Utilise le tutoiement ou vouvoiement selon le patient
- Reste professionnelle mais chaleureuse
- Tu es autonome, tu dois résoudre tous les problèmes toi-même sans transférer l'appel

💡 EXEMPLES DE RÉPONSES :
- "Bonjour ! Je suis Sophie. Comment puis-je vous aider ?"
- "Parfait, merci. Quelle est votre date de naissance ?"
- "Je vérifie nos disponibilités pour le Dr Leal. Un moment s'il vous plaît..."
- "Excellent ! Votre rendez-vous est confirmé pour le [date] à [heure] avec le [praticien]."

🚫 CE QU'IL NE FAUT PAS FAIRE :
- Ne donne JAMAIS de conseils médicaux
- Ne modifie ou n'annule pas de rendez-vous sans confirmation
- Ne partage pas d'informations confidentielles
- Ne fais pas de promesses que tu ne peux pas tenir`
                        }
                    ]
                },

                // Transcriber - Deepgram configured for French
                transcriber: {
                    provider: 'deepgram',
                    model: 'nova-2-general',
                    language: 'fr',
                    smartFormat: true,
                    keywords: ['Dr', 'rendez-vous', 'RDV', 'urgence', 'assurance'],
                    languageDetectionEnabled: false
                },

                // First message when call starts
                firstMessage: `Bonjour, Sophie à l'appareil. Je suis l'assistante virtuelle de ${clinic.name}. Comment puis-je vous aider aujourd'hui ?`,

                // End call message
                endCallMessage: `Merci d'avoir appelé ${clinic.name}. À bientôt !`,

                // Voicemail message (if no answer)
                voicemailMessage: `Bonjour, vous êtes bien chez ${clinic.name}. Nous ne sommes pas disponibles pour le moment. Veuillez laisser un message avec vos coordonnées, nous vous rappellerons dès que possible. Merci.`,

                // Recording settings
                recordingEnabled: true,

                // End call settings
                endCallFunctionEnabled: true,
                endCallPhrases: ['au revoir', 'merci au revoir', 'bonne journée', 'à bientôt'],

                // Silence timeout
                silenceTimeoutSeconds: 30,
                maxDurationSeconds: 600, // 10 minutes max

                // Background sound (optional - adds ambient clinic sound)
                backgroundSound: 'off',

                // Backchannel settings (Sophie makes sounds like "hmm", "oui" while listening)
                backgroundDenoisingEnabled: true,
                modelOutputInMessagesEnabled: true,

                // Server configuration for webhooks
                serverUrl: process.env.VAPI_WEBHOOK_URL || 'https://your-domain.com/webhook/vapi/webhook',
                serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || 'change-this-secret',

                // Analysis plan
                analysisPlan: {
                    summaryPlan: {
                        enabled: true,
                        summaryPrompt: `Résume cet appel en français en incluant :
- Nom du patient
- Motif de l'appel
- Rendez-vous pris (praticien, date, heure) ou raison du refus
- Informations importantes mentionnées
- Action requise (rappel, suivi, etc.)

Format : 3-5 points clairs et concis.`
                    },
                    successEvaluationPlan: {
                        enabled: true,
                        rubric: 'SuccessfulCallRubric',
                        successPrompt: `Évalue le succès de cet appel selon ces critères :
1. Le patient a-t-il obtenu ce qu'il voulait ? (rendez-vous pris, information obtenue)
2. Sophie a-t-elle été professionnelle et empathique ?
3. Toutes les informations nécessaires ont-elles été collectées ?
4. Le patient semble-t-il satisfait à la fin ?

Réponds par "SUCCESS" si au moins 3/4 critères sont remplis, sinon "FAILED" avec la raison.`
                    },
                    structuredDataPlan: {
                        enabled: true,
                        schema: {
                            type: 'object',
                            properties: {
                                patient_name: { type: 'string' },
                                patient_phone: { type: 'string' },
                                patient_email: { type: 'string' },
                                appointment_date: { type: 'string' },
                                appointment_time: { type: 'string' },
                                practitioner: { type: 'string' },
                                reason: { type: 'string' },
                                has_insurance: { type: 'boolean' },
                                appointment_confirmed: { type: 'boolean' }
                            }
                        }
                    }
                },

                // Transport configuration
                transportConfigurations: [
                    {
                        provider: 'twilio',
                        timeout: 60,
                        record: true,
                        recordingChannels: 'dual'
                    }
                ],

                // Client messages (for web interface if needed)
                clientMessages: [
                    'transcript',
                    'hang',
                    'function-call',
                    'speech-update',
                    'metadata',
                    'conversation-update'
                ],

                // Server messages (what we receive in webhooks)
                serverMessages: [
                    'end-of-call-report',
                    'status-update',
                    'hang',
                    'function-call'
                ],

                // Metadata for tracking
                metadata: {
                    clinicId: clinic.id,
                    clinicName: clinic.name,
                    environment: process.env.NODE_ENV || 'development',
                    version: '1.0.0'
                },

                // Artifact plan (save conversation artifacts)
                artifactPlan: {
                    recordingEnabled: true,
                    videoRecordingEnabled: false,
                    transcriptPlan: {
                        enabled: true,
                        assistantName: 'Sophie',
                        userName: 'Patient'
                    }
                },

                // Message plan (custom message handling)
                messagePlan: {
                    idleMessages: [
                        "Je vous écoute...",
                        "Oui, je note...",
                        "D'accord, continuez..."
                    ],
                    idleMessageMaxSpokenCount: 3,
                    idleTimeoutSeconds: 10
                }
            };

            res.json(assistantConfig);
        } catch (error) {
            console.error('Error generating assistant config:', error);
            res.status(500).json({ error: 'Failed to generate configuration' });
        }
    }
}

export const vapiController = new VapiController();
