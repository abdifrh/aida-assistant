import prisma from '../database/client';
import { ConversationState, Intent, ConversationContext, LLMResponse } from '../types/conversation';
import { llmService } from './LLMService';
import { sophieService } from './SophieService';
import { calendarService } from './CalendarService';
import { EntityValidator } from './EntityValidator';
import { ResponseValidator } from './ResponseValidator';
import { formatDateForUser, formatDateFromDate, parseInTimezone } from '../utils/dateFormatter';
import { isEmergencyMessage } from '../utils/emergencyFilter';
import { logService } from './LogService';
import { isWithinBusinessHours, isDayOpen, getDayOpeningHours } from '../utils/businessHours';
import { detectLanguage } from '../utils/languageDetector';

export class ConversationManager {
    // Get or create conversation
    // Obtenir ou créer une conversation
    async getOrCreateConversation(clinicId: string, waId: string, userPhone: string) {
        let conversation = await prisma.conversation.findUnique({
            where: {
                clinic_id_wa_id: {
                    clinic_id: clinicId,
                    wa_id: waId
                }
            },
        });

        if (!conversation) {
            conversation = await prisma.conversation.create({
                data: {
                    clinic_id: clinicId,
                    wa_id: waId,
                    user_phone: userPhone,
                    current_state: ConversationState.IDLE,
                    detected_language: 'fr',
                    context_data: {},
                },
            });
        }

        return conversation;
    }

    // Process user message with Sophie (natural conversation)
    // Traiter le message utilisateur avec Sophie (conversation naturelle)
    async processMessageWithSophie(
        conversationId: string,
        userMessage: string,
        clinicName: string,
        wamid?: string,
        imageId?: string,
        imagePath?: string,
        documentId?: string,
        documentPath?: string
    ): Promise<string> {
        // 1. Get conversation with history
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: { orderBy: { created_at: 'desc' }, take: 10 },
                clinic: true
            },
        });

        if (!conversation) {
            await logService.error('CONVERSATION', 'NOT_FOUND',
                `Conversation ${conversationId} not found in processMessageWithSophie`, null);
            // Cannot save message if conversation doesn't exist
            return "Désolé, une erreur s'est produite.";
        }

        let activeState = conversation.current_state as ConversationState;
        const isFinished = activeState === ConversationState.COMPLETED;

        await logService.info('CONVERSATION', 'MESSAGE_RECEIVED', 'Processing user message with Sophie', {
            conversation_id: conversationId,
            clinic_id: conversation.clinic_id,
            metadata: { length: userMessage.length, state: activeState }
        });

        // LOG FULL MESSAGE CONTENT FOR DEBUGGING
        console.log(`\n========== NEW MESSAGE ==========`);
        console.log(`[USER MESSAGE] "${userMessage}"`);
        console.log(`[CURRENT STATE] ${activeState}`);
        console.log(`[CONVERSATION ID] ${conversationId}`);
        console.log(`================================\n`);

        // --- Context Expiration Check (15 minutes) ---
        const lastMessage = conversation.messages[0];
        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        const now = new Date();

        // Track if context was expired (we'll need this later for smart handling)
        let contextWasExpired = false;

        // Check for pending insurance questions in the current context
        const existingContext = (conversation.context_data as ConversationContext) || {};
        const hasPendingInsuranceFlow =
            existingContext.patient?.awaiting_social_insurance_response === true ||
            existingContext.patient?.awaiting_social_insurance_type === true ||
            existingContext.patient?.awaiting_insurance_numbers === true;

        if (lastMessage && (now.getTime() - lastMessage.created_at.getTime()) > FIFTEEN_MINUTES) {
            // Don't fully reset if:
            // - We're receiving an image (likely insurance card) while collecting patient data
            // - OR we have pending insurance questions that the user is responding to
            const wasCollectingPatientData = activeState === ConversationState.COLLECTING_PATIENT_DATA;
            const hasIncomingImage = !!imagePath;

            if ((hasIncomingImage && wasCollectingPatientData) || hasPendingInsuranceFlow) {
                // Preserve the state and context for continuing the flow
                await logService.info('CONVERSATION', 'CONTEXT_EXPIRED_PRESERVED',
                    `Context expired but preserving state for ${hasIncomingImage ? 'image processing' : 'pending insurance flow'}`,
                    { conversation_id: conversationId, clinic_id: conversation.clinic_id, metadata: { hasPendingInsuranceFlow } });
                contextWasExpired = true;
                // Don't reset - let the handler continue the flow
                // But if state was IDLE due to previous reset, restore it to COLLECTING_PATIENT_DATA
                if (activeState === ConversationState.IDLE && hasPendingInsuranceFlow) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    activeState = ConversationState.COLLECTING_PATIENT_DATA;
                }
            } else {
                await logService.info('CONVERSATION', 'CONTEXT_EXPIRED', `Context expired for ${conversationId}. Resetting.`, { conversation_id: conversationId, clinic_id: conversation.clinic_id });
                await prisma.conversation.update({
                    where: { id: conversationId },
                    data: { context_data: {}, current_state: ConversationState.IDLE }
                });
                conversation.context_data = {};
                conversation.current_state = ConversationState.IDLE;
                contextWasExpired = true;
            }
        } else if (isFinished) {
            // State Latch: If we were COMPLETED, reset to IDLE on a new message
            await this.transitionToState(conversationId, ConversationState.IDLE);
            activeState = ConversationState.IDLE;
        }

        // 2. Save user message immediately to database
        await prisma.message.create({
            data: {
                conversation_id: conversationId,
                role: 'user',
                content: userMessage,
                wamid: wamid,
                media_id: imageId,
                media_type: imageId ? 'image' : undefined,
                file_path: imagePath
            },
        });

        // 3. Prepare data for extraction
        const practitioners = await prisma.practitioner.findMany({
            where: { clinic_id: conversation.clinic_id, is_active: true }
        });
        const doctorAvailability = practitioners.map(p => ({
            name: `Dr ${p.last_name}`,
            specialty: p.specialty || 'General'
        }));

        const currentContext = (conversation.context_data as ConversationContext) || {};
        const timezone = (conversation as any).clinic?.timezone || 'Europe/Paris';
        const openingHours = (conversation as any).clinic?.opening_hours;
        const isOpenNow = isWithinBusinessHours(new Date(), openingHours, timezone);

        const structuredContext = {
            currentDateTime: new Date().toLocaleString('fr-FR', { timeZone: timezone }),
            isoDateTime: new Date().toISOString(),
            timezone,
            clinicName: (conversation as any).clinic?.name || clinicName,
            isOpenNow,
            clinicDetails: {
                address: (conversation as any).clinic?.address,
                phone: (conversation as any).clinic?.phone,
                email: (conversation as any).clinic?.email,
                website: (conversation as any).clinic?.website,
                opening_hours: openingHours,
                emergency_message: (conversation as any).clinic?.emergency_message
            },
            doctorAvailability,
            // Include patient authentication context from conversation context_data
            ...(currentContext.isKnownPatient !== undefined && {
                isKnownPatient: currentContext.isKnownPatient,
                patientId: currentContext.patientId,
                firstName: currentContext.firstName,
                lastName: currentContext.lastName,
                email: currentContext.email,
                birthDate: currentContext.birthDate,
                hasSocialInsurance: currentContext.hasSocialInsurance,
                socialInsuranceType: currentContext.socialInsuranceType,
                beneficiaryNumber: currentContext.beneficiaryNumber,
                hasRecentAppointments: currentContext.hasRecentAppointments,
                lastAppointment: currentContext.lastAppointment
            })
        };

        // ===== INTELLIGENT CONVERSATION RESET =====
        // Detect greetings and control commands to reset conversation if in progress
        const lowerMsg = userMessage.toLowerCase().trim();
        const isGreeting = /^(bonjour|salut|hello|hi|hey|bonsoir|good morning|good evening|coucou)$/i.test(lowerMsg);
        const isResetCommand = /^(reset|recommencer|annuler|restart|new|nouveau|start over)$/i.test(lowerMsg);
        const isConversationInProgress = activeState !== ConversationState.IDLE && activeState !== ConversationState.COMPLETED;

        if ((isGreeting || isResetCommand) && isConversationInProgress) {
            // Reset conversation context
            const freshContext: ConversationContext = {
                patient: {},
                appointment: {},
                ambiguity_count: 0,
            };

            await this.updateContext(conversationId, freshContext);
            await this.transitionToState(conversationId, ConversationState.IDLE);

            await logService.info('CONVERSATION', 'RESET_TRIGGERED', 'Conversation reset by user', {
                conversation_id: conversationId,
                metadata: {
                    trigger: isGreeting ? 'greeting' : 'command',
                    previous_state: activeState,
                    userMessage
                }
            });

            // Get patient for personalized greeting
            const patient = await prisma.patient.findUnique({
                where: { clinic_id_phone: { clinic_id: conversation.clinic_id, phone: conversation.user_phone } }
            });

            const patientName = patient?.first_name || '';
            const language = patient?.preferred_language || detectLanguage(userMessage);

            const greetingMsg = language === 'fr'
                ? (patientName ? `Bonjour ${patientName} ! Comment puis-je vous aider aujourd'hui ?` : "Bonjour ! Comment puis-je vous aider aujourd'hui ?")
                : (patientName ? `Hello ${patientName}! How can I help you today?` : "Hello! How can I help you today?");

            await this.saveAssistantMessage(conversationId, greetingMsg);
            return greetingMsg;
        }

        // Detect language from user message (more reliable than LLM)
        const detectedLang = detectLanguage(userMessage);

        // Get or create patient with detected language
        let patient = await prisma.patient.findUnique({
            where: { clinic_id_phone: { clinic_id: conversation.clinic_id, phone: conversation.user_phone } }
        });

        let language: string;

        // Check if we have a stored language and if it differs from detection
        if (patient?.preferred_language) {
            // Only allow language change on STRONG linguistic signals (greetings, full sentences)
            // NOT on names, dates, or short responses
            const languageChanged = detectedLang !== patient.preferred_language;

            // Check if this message has clear intent that indicates language preference
            // We'll extract intent first to see if it's a strong signal
            const needsExtraction = sophieService.needsEntityExtraction(userMessage) || activeState !== ConversationState.IDLE;

            // For now, use stored language by default
            language = patient.preferred_language;
            console.log(`[DEBUG] Using patient's preferred language: ${language}`);

            // We'll check after extraction if we should update language based on intent
        } else {
            // No stored language - use detected and save it
            language = detectedLang;

            // Create or update patient with detected language immediately
            patient = await prisma.patient.upsert({
                where: {
                    clinic_id_phone: {
                        clinic_id: conversation.clinic_id,
                        phone: conversation.user_phone
                    }
                },
                update: {
                    preferred_language: detectedLang
                },
                create: {
                    clinic_id: conversation.clinic_id,
                    phone: conversation.user_phone,
                    preferred_language: detectedLang
                }
            });

            await logService.info('CONVERSATION', 'LANGUAGE_DETECTED', `Language detected and saved to patient: ${detectedLang}`, {
                conversation_id: conversationId,
                metadata: {
                    patientId: patient.id,
                    language: detectedLang,
                    userMessage: userMessage.substring(0, 50)
                }
            });

            console.log(`[DEBUG] New patient language set to: ${detectedLang}`);
        }

        // Always update conversation language
        if (detectedLang !== conversation.detected_language) {
            await prisma.conversation.update({
                where: { id: conversationId },
                data: { detected_language: language },
            });
        }

        // 4. Extraction
        let entities: any = {};
        let isAmbiguous = false;
        let messageIntent = Intent.UNKNOWN;
        let modelResponseMessage: string | undefined;

        const needsExtraction = sophieService.needsEntityExtraction(userMessage) ||
            activeState !== ConversationState.IDLE;

        if (needsExtraction) {
            // Find last assistant message for context
            const lastAssistantMessage = conversation.messages.find(m => m.role === 'assistant')?.content;

            // Fetch patient identity from DB for strict extraction context
            const patientRecord = await prisma.patient.findUnique({
                where: { clinic_id_phone: { clinic_id: conversation.clinic_id, phone: conversation.user_phone } }
            });

            const extractionResult = await sophieService.extractEntities(
                userMessage,
                clinicName,
                language,
                {
                    ...currentContext,
                    patient: patientRecord ? {
                        first_name: patientRecord.first_name,
                        last_name: patientRecord.last_name,
                        birth_date: patientRecord.birth_date?.toISOString().split('T')[0]
                    } : currentContext.patient,
                    client: patientRecord ? {
                        name: `${patientRecord.first_name || ''} ${patientRecord.last_name || ''}`.trim(),
                        phone: patientRecord.phone
                    } : null,
                    structuredContext,
                    state: activeState,
                    lastAssistantMessage
                }
            );
            if (extractionResult) {
                entities = extractionResult.entities;
                isAmbiguous = extractionResult.is_ambiguous || false;
                messageIntent = (extractionResult.intent as Intent) || Intent.UNKNOWN;
                modelResponseMessage = extractionResult.response_message;

                // Debug: Log LLM detected language (for comparison)
                console.log(`[DEBUG] LLM detected language: ${extractionResult.detected_language}, our detection: ${language}`);

                // Check if we should update patient's language based on strong intent
                const strongLanguageIntents = [Intent.GREETING, Intent.BOOK_APPOINTMENT, Intent.CANCEL_APPOINTMENT, Intent.MODIFY_APPOINTMENT];
                const isStrongIntent = strongLanguageIntents.includes(messageIntent);
                const languageChanged = patient?.preferred_language && detectedLang !== patient.preferred_language;

                // Require a substantial message (5+ words) to change language
                // This prevents names like "Dr Van DELDEN" from changing language
                const hasSubstantialContent = userMessage.split(/\s+/).length >= 5;

                // Don't change language if we're in the middle of collecting data
                const isCollectingData = activeState === ConversationState.COLLECTING_PATIENT_DATA ||
                                       activeState === ConversationState.COLLECTING_APPOINTMENT_DATA;

                if (isStrongIntent && languageChanged && hasSubstantialContent && !isCollectingData && patient) {
                    // Strong intent with different language - update it
                    await prisma.patient.update({
                        where: { id: patient.id },
                        data: { preferred_language: detectedLang }
                    });

                    language = detectedLang;

                    await logService.info('CONVERSATION', 'LANGUAGE_CHANGED', `Patient language updated from ${patient.preferred_language} to ${detectedLang} (strong intent: ${messageIntent})`, {
                        conversation_id: conversationId,
                        metadata: {
                            patientId: patient.id,
                            oldLanguage: patient.preferred_language,
                            newLanguage: detectedLang,
                            intent: messageIntent,
                            userMessage: userMessage.substring(0, 50)
                        }
                    });

                    console.log(`[DEBUG] Language changed from ${patient.preferred_language} to ${detectedLang} on strong intent ${messageIntent}`);
                }

                // Override LLM's language detection with our detected language
                extractionResult.detected_language = language;

                console.log(`[DEBUG] Extraction Result - Intent: ${messageIntent}, Entities:`, JSON.stringify(entities, null, 2));

                // Valider les entités extraites
                if (entities && Object.keys(entities).length > 0) {
                    const validation = EntityValidator.validateEntities(entities, structuredContext);

                    if (!validation.valid) {
                        await logService.warn('CONVERSATION', 'INVALID_ENTITIES', 'Entity validation failed', {
                            metadata: {
                                errors: validation.errors,
                                originalEntities: entities,
                                correctedEntities: validation.correctedEntities
                            }
                        });

                        // Utiliser les entités corrigées si disponibles
                        if (validation.correctedEntities) {
                            entities = validation.correctedEntities;
                            console.log(`[DEBUG] Using corrected entities:`, JSON.stringify(entities, null, 2));
                        }
                    }
                }
            }
        }

        // Handle image upload for insurance card
        // This handler should work regardless of state if we're receiving an insurance card image
        if (imagePath && !currentContext.patient?.insurance_card_url) {
            if (!currentContext.patient) currentContext.patient = {};
            currentContext.patient.insurance_card_url = imagePath;
            await this.updateContext(conversationId, currentContext);
            await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, currentContext);

            // Always handle insurance card upload - even if context expired
            // Transition to COLLECTING_PATIENT_DATA if we're in IDLE to continue the flow
            if (activeState === ConversationState.IDLE) {
                await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                activeState = ConversationState.COLLECTING_PATIENT_DATA;
            }

            if (activeState === ConversationState.COLLECTING_PATIENT_DATA) {
                const msg = language === 'fr'
                    ? "Bien reçu ! Votre carte d'assurance a été enregistrée. Bénéficiez-vous d'une assurance sociale (Hospice générale ou SPC) ?"
                    : "Received! Your insurance card has been saved. Do you have social insurance (Hospice générale or SPC)?";

                // Mark that we're now collecting social insurance info
                currentContext.patient.awaiting_social_insurance_response = true;
                await this.updateContext(conversationId, currentContext);

                // Save assistant message before returning
                await this.saveAssistantMessage(conversationId, msg);
                return msg;
            }
        }

        // Handle social insurance question response
        // IMPORTANT: Check the awaiting flag regardless of state - the flag is the source of truth
        if (currentContext.patient?.awaiting_social_insurance_response === true &&
            currentContext.patient?.has_social_insurance === undefined) {

            const lowerMsg = userMessage.toLowerCase();
            const isYes = lowerMsg.includes('oui') || lowerMsg.includes('yes') || lowerMsg.includes('hospice') || lowerMsg.includes('spc');
            const isNo = lowerMsg.includes('non') || lowerMsg.includes('no');

            if (isYes) {
                // Ensure we're in the right state for this flow
                if (activeState === ConversationState.IDLE) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    activeState = ConversationState.COLLECTING_PATIENT_DATA;
                }

                currentContext.patient.has_social_insurance = true;
                currentContext.patient.awaiting_social_insurance_response = false;
                currentContext.patient.awaiting_social_insurance_type = true;
                await this.updateContext(conversationId, currentContext);
                await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, currentContext);

                const msg = language === 'fr'
                    ? "De quel type d'assurance sociale s'agit-il ? (Hospice générale ou SPC)"
                    : "What type of social insurance do you have? (Hospice générale or SPC)";

                // Save assistant message before returning
                await this.saveAssistantMessage(conversationId, msg);
                return msg;
            } else if (isNo) {
                // Ensure we're in the right state for this flow
                if (activeState === ConversationState.IDLE) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    activeState = ConversationState.COLLECTING_PATIENT_DATA;
                }

                currentContext.patient.has_social_insurance = false;
                currentContext.patient.awaiting_social_insurance_response = false;
                await this.updateContext(conversationId, currentContext);
                await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, currentContext);

                // Continue with normal flow
                userMessage = ""; // Clear the message to continue with data collection
            }
        }

        // Handle social insurance type response
        // IMPORTANT: Check the awaiting flag regardless of state
        if (currentContext.patient?.awaiting_social_insurance_type === true) {

            const lowerMsg = userMessage.toLowerCase();
            if (lowerMsg.includes('hospice')) {
                currentContext.patient.social_insurance_type = 'Hospice générale';
            } else if (lowerMsg.includes('spc')) {
                currentContext.patient.social_insurance_type = 'SPC';
            }

            // Ensure we're in the right state for this flow
            if (activeState === ConversationState.IDLE) {
                await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                activeState = ConversationState.COLLECTING_PATIENT_DATA;
            }

            currentContext.patient.awaiting_social_insurance_type = false;
            currentContext.patient.awaiting_insurance_numbers = true;
            await this.updateContext(conversationId, currentContext);
            await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, currentContext);

            const msg = language === 'fr'
                ? "Pouvez-vous me fournir votre numéro de bénéficiaire ou votre numéro de garanti ? Si vous ne les trouvez pas, vous pouvez envoyer le document de garantie de prise en charge en PDF."
                : "Can you provide your beneficiary number or guarantee number? If you can't find them, you can send the guarantee document in PDF format.";

            // Save assistant message before returning
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // Handle document upload for guarantee document (PDF)
        if (documentPath &&
            currentContext.patient?.awaiting_insurance_numbers === true &&
            !currentContext.patient?.guarantee_document_path) {

            if (!currentContext.patient) currentContext.patient = {};
            currentContext.patient.guarantee_document_path = documentPath;
            currentContext.patient.awaiting_insurance_numbers = false;

            // Flag to show confirmation when asking for appointment
            (currentContext as any).insurance_just_completed = 'document';

            await this.updateContext(conversationId, currentContext);
            await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, currentContext);

            // Don't return yet - let the flow continue to check if patient data is complete
            // and automatically transition to COLLECTING_APPOINTMENT_DATA
            userMessage = ""; // Clear message to avoid re-processing
        }

        // Handle insurance numbers (beneficiary or guarantee number)
        // IMPORTANT: Check the awaiting flag regardless of state
        if (currentContext.patient?.awaiting_insurance_numbers === true &&
            userMessage.trim().length > 0 &&
            !userMessage.includes('[') && !userMessage.includes(']')) { // Not a media placeholder

            // Try to detect if it's a number
            const cleanMsg = userMessage.trim();
            if (/\d+/.test(cleanMsg)) { // Contains numbers
                // Ensure we're in the right state for this flow
                if (activeState === ConversationState.IDLE) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    activeState = ConversationState.COLLECTING_PATIENT_DATA;
                }

                // Determine if it's beneficiary or guarantee number based on keywords
                const lowerMsg = cleanMsg.toLowerCase();
                if (lowerMsg.includes('bénéficiaire') || lowerMsg.includes('beneficiary')) {
                    currentContext.patient.beneficiary_number = cleanMsg.replace(/[^\d]/g, '');
                } else if (lowerMsg.includes('garanti') || lowerMsg.includes('guarantee')) {
                    currentContext.patient.guarantee_number = cleanMsg.replace(/[^\d]/g, '');
                } else {
                    // Default to beneficiary number if no keyword
                    currentContext.patient.beneficiary_number = cleanMsg;
                }

                currentContext.patient.awaiting_insurance_numbers = false;

                // Flag to show confirmation when asking for appointment
                (currentContext as any).insurance_just_completed = 'number';

                await this.updateContext(conversationId, currentContext);
                await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, currentContext);

                // Don't return yet - let the flow continue to check if patient data is complete
                // and automatically transition to COLLECTING_APPOINTMENT_DATA
                userMessage = ""; // Clear message to avoid re-processing
            }
        }

        // MANUAL FALLBACK: Check for practitioner if not extracted
        if (!entities.practitioner && doctorAvailability.length > 0) {
            const lowerMsg = userMessage.toLowerCase();

            // 1. Check for ordinals ("le premier", "1er", "number 1")
            if (lowerMsg.includes('premier') || lowerMsg.includes('1er') || lowerMsg.includes('first') || lowerMsg.includes('1st')) {
                entities.practitioner = doctorAvailability[0].name;
            } else if (lowerMsg.includes('deuxième') || lowerMsg.includes('2eme') || lowerMsg.includes('second') || lowerMsg.includes('2nd')) {
                if (doctorAvailability.length >= 2) entities.practitioner = doctorAvailability[1].name;
            } else {
                // 2. Fuzzy match provided names
                for (const doc of doctorAvailability) {
                    const nameParts = doc.name.toLowerCase().replace('dr ', '').split(' ');
                    // Check if any significant part of the name is in the message
                    if (nameParts.some(part => part.length > 2 && lowerMsg.includes(part))) {
                        entities.practitioner = doc.name;
                        break;
                    }
                }
            }

            if (entities.practitioner) {
                await logService.info('CONVERSATION', 'MANUAL_EXTRACTION', `Manually extracted practitioner: ${entities.practitioner}`, { conversation_id: conversationId });
            }
        }


        // Pre-merge: Handle fresh start logic if starting a NEW booking
        // If we detect BOOK_APPOINTMENT and we weren't already booking, clear previous appointment data
        if (messageIntent === Intent.BOOK_APPOINTMENT && (!currentContext.pending_action || currentContext.pending_action.type !== 'BOOK')) {
            console.log("[DEBUG] New booking attempt detected. Fresh start for appointment data.");
            currentContext.appointment = {};
            currentContext.pending_action = { type: 'BOOK' };
            currentContext.rejected_times = []; // Clear previous rejections
        }

        // 5. Update Context & Merge
        const updatedContext = this.mergeContext(currentContext, entities, isAmbiguous);

        // Safety check: if we are collecting patient data and a date is provided, it's the birth date
        if (activeState === ConversationState.COLLECTING_PATIENT_DATA && entities.date && !updatedContext.patient?.birth_date) {
            console.log("[DEBUG] Safety fallback: assigning extracted date to birth_date during registration.");
            if (!updatedContext.patient) updatedContext.patient = {};
            updatedContext.patient.birth_date = entities.date;
        }

        // Email Validation Logic - Independent check before context is considered final
        if (entities.email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(entities.email)) {
                console.log(`[DEBUG] Invalid email detected: ${entities.email}. Clearing from context and asking again.`);

                // 1. Remove from context (undo the merge for this field)
                if (updatedContext.patient) updatedContext.patient.email = undefined;
                await this.updateContext(conversationId, updatedContext);

                // 2. Reject and Ask Again IMMEDIATELY
                const msg = language === 'fr'
                    ? "L'adresse email semble invalide. Pourriez-vous vérifier le format (exemple@domaine.com) ?"
                    : "The email address seems invalid. Could you check the format (example@domain.com)?";
                await this.saveAssistantMessage(conversationId, msg);
                return msg;
            }
        }

        await this.updateContext(conversationId, updatedContext);

        // Update patient record if we have new personal info (language is already saved at the beginning)
        if (entities.first_name || entities.last_name || entities.birth_date || entities.email || (updatedContext.patient?.birth_date && entities.date)) {
            await this.updatePatientRecord(
                conversation.clinic_id,
                conversation.user_phone,
                updatedContext
            );
        }

        // 6. RE-FETCH PATIENT RECORD
        const refetchedPatient = await prisma.patient.findUnique({
            where: { clinic_id_phone: { clinic_id: conversation.clinic_id, phone: conversation.user_phone } }
        });

        // 7. STATE-DRIVEN LOGIC (AUTHORITARIAN)

        // --- CASE A: CONFIRMATION (Higher Priority) ---
        if (activeState === ConversationState.CONFIRMATION) {
            const pendingAction = updatedContext.pending_action || { type: 'BOOK' };

            if (messageIntent === Intent.AFFIRMATIVE) {
                let finalMsg = "";
                if (pendingAction.type === 'CANCEL') {
                    finalMsg = await this.finalizeCancellation(conversationId, updatedContext, language);
                } else if (pendingAction.type === 'MODIFY') {
                    finalMsg = await this.finalizeModification(conversationId, updatedContext, language);
                } else {
                    finalMsg = await this.finalizeBooking(conversationId, updatedContext, language);
                }
                await this.saveAssistantMessage(conversationId, finalMsg);
                return finalMsg;
            }

            if (messageIntent === Intent.NEGATIVE) {
                await this.transitionToState(conversationId, ConversationState.IDLE);
                updatedContext.pending_action = undefined;
                await this.updateContext(conversationId, updatedContext);
                const cancelMsg = language === 'fr' ? "C'est entendu. Comment puis-je vous aider désormais ?" : "Understood. How can I help you now?";
                await this.saveAssistantMessage(conversationId, cancelMsg);
                return cancelMsg;
            }

            // 2. Check for CORRECTION (e.g. user provides a new date/time)
            // Only treat as correction if:
            // - Intent is explicitly MODIFY_APPOINTMENT OR
            // - User message contains correction keywords AND new entities are provided
            const hasNewEntities = entities.date || entities.time || entities.practitioner;
            const hasCorrectionKeywords = userMessage.toLowerCase().match(/\b(non|plutôt|changer|modifier|no|rather|change|modify|instead)\b/);
            const isExplicitModification = messageIntent === Intent.MODIFY_APPOINTMENT;

            if (hasNewEntities && (isExplicitModification || hasCorrectionKeywords)) {
                console.log("[DEBUG] Correction detected in CONFIRMATION state. Transitioning back to collection.");
                await this.transitionToState(conversationId, ConversationState.COLLECTING_APPOINTMENT_DATA);
                activeState = ConversationState.COLLECTING_APPOINTMENT_DATA;
                // Allow it to fall through to Case B
            } else if (hasNewEntities && !isExplicitModification && !hasCorrectionKeywords) {
                // Ignore incorrectly extracted entities if user is just confirming
                console.log("[DEBUG] Entities extracted but no correction intent detected. Treating as unclear response.");
                const clarifyMsg = language === 'fr'
                    ? "Désolé, je n'ai pas bien compris. Souhaitez-vous confirmer ce rendez-vous ? (Oui/Non)"
                    : "Sorry, I didn't understand. Do you want to confirm this appointment? (Yes/No)";
                await this.saveAssistantMessage(conversationId, clarifyMsg);
                return clarifyMsg;
            }
        }

        // --- CASE B: EXPLICIT FLOW TRIGGERS (Authoritarian Intent Handling) ---
        const isFlowIntent = messageIntent === Intent.BOOK_APPOINTMENT ||
            messageIntent === Intent.CANCEL_APPOINTMENT ||
            messageIntent === Intent.MODIFY_APPOINTMENT ||
            messageIntent === Intent.LIST_APPOINTMENTS ||
            messageIntent === Intent.LIST_PRACTITIONERS;
        const isCollecting = activeState === ConversationState.COLLECTING_PATIENT_DATA ||
            activeState === ConversationState.COLLECTING_APPOINTMENT_DATA;

        if (isFlowIntent || isCollecting) {
            // Protection against intent flipping mid-flow
            // Si on est déjà en train de réserver ou de s'enregistrer, on ne bascule pas en modification sans mot-clé explicite
            const isMidFlow = updatedContext.pending_action?.type === 'BOOK' || activeState === ConversationState.COLLECTING_PATIENT_DATA;
            if (messageIntent === Intent.MODIFY_APPOINTMENT && isMidFlow) {
                const lowerMsg = userMessage.toLowerCase();
                const modifyKeywords = ['modifier', 'changer', 'déplacer', 'report', 'à la place', 'modify', 'change', 'move', 'reschedule', 'instead'];
                if (!modifyKeywords.some(k => lowerMsg.includes(k))) {
                    messageIntent = updatedContext.pending_action?.type === 'BOOK' ? Intent.BOOK_APPOINTMENT : Intent.INFORMATION;
                }
            }

            // --- CASE C: APPOINTMENT FLOW ---
            const currentAppointments = await this.getClientAppointments(conversation.user_phone);

            if (messageIntent === Intent.CANCEL_APPOINTMENT) return await this.initiateCancellation(conversationId, updatedContext, language);
            if (messageIntent === Intent.MODIFY_APPOINTMENT && currentAppointments.length > 0) return await this.initiateModification(conversationId, updatedContext, language);

            if (messageIntent === Intent.LIST_APPOINTMENTS) {
                if (currentAppointments.length === 0) {
                    const msg = language === 'fr' ? "Vous n'avez pas de rendez-vous à venir." : "You have no upcoming appointments.";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                }
                let msg = language === 'fr' ? "Vos prochains rendez-vous :" : "Your upcoming appointments:";
                const clinic = await prisma.clinic.findUnique({ where: { id: conversation.clinic_id } });
                const timezone = clinic?.timezone || 'Europe/Paris';

                currentAppointments.forEach(apt => {
                    const formatted = formatDateFromDate(apt.start_time, language as 'fr' | 'en', timezone);
                    const drName = apt.practitioner ? `Dr ${apt.practitioner.last_name}` : (language === 'fr' ? "votre médecin" : "your doctor");
                    msg += `\n- ${formatted} avec ${drName}`;
                });
                await this.saveAssistantMessage(conversationId, msg);
                return msg;
            }

            if (messageIntent === Intent.LIST_PRACTITIONERS) {
                const practitioners = await prisma.practitioner.findMany({
                    where: { clinic_id: conversation.clinic_id, is_active: true }
                });

                if (practitioners.length === 0) {
                    const msg = language === 'fr' ? "Aucun médecin n'est disponible pour le moment." : "No doctors are available at the moment.";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                }

                const drList = practitioners.map(p => `Dr ${p.last_name} (${p.specialty || 'Généraliste'})`).join('\n- ');
                const msg = language === 'fr'
                    ? `Voici nos médecins disponibles :\n- ${drList}\n\nAvec qui souhaitez-vous prendre rendez-vous ?`
                    : `Here are our available doctors:\n- ${drList}\n\nWho would you like to see?`;

                await this.saveAssistantMessage(conversationId, msg);
                return msg;
            }

            // Patient Registration Check
            // Patient Registration Check
            if (messageIntent === Intent.BOOK_APPOINTMENT || messageIntent === Intent.INFORMATION || activeState === ConversationState.COLLECTING_PATIENT_DATA) {
                const needsFirstName = !refetchedPatient?.first_name && !updatedContext.patient?.first_name;
                const needsLastName = !refetchedPatient?.last_name && !updatedContext.patient?.last_name;
                const needsBirthDate = !refetchedPatient?.birth_date && !updatedContext.patient?.birth_date;
                const needsEmail = !refetchedPatient?.email && !updatedContext.patient?.email;

                if (needsFirstName && needsLastName) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    const msg = language === 'fr'
                        ? "C'est entendu. Pour créer votre fiche patient, pourriez-vous m'indiquer votre Prénom et votre Nom ?"
                        : "Understood. To create your patient file, could you please tell me your First and Last name?";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                } else if (needsFirstName) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    const msg = language === 'fr' ? "Bien, et quel est votre prénom ?" : "Great, and what is your first name?";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                } else if (needsLastName) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    const msg = language === 'fr' ? "C'est noté. Quel est votre nom de famille ?" : "Noted. What is your last name?";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                }

                if (needsBirthDate) {
                    // Fallback: if LLM put birth date in "date" (common if intent was misclassified)
                    if (entities.date && !entities.birth_date) {
                        entities.birth_date = entities.date;
                        if (!updatedContext.patient) updatedContext.patient = {};
                        updatedContext.patient.birth_date = entities.date;
                    }

                    // Re-check after possible fallback
                    if (!entities.birth_date && !updatedContext.patient?.birth_date) {
                        return await this.askForBirthDate(conversationId, updatedContext, refetchedPatient, language);
                    }

                    // We have it! Update record
                    await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, updatedContext);
                }

                if (needsEmail) {
                    // Ask for email if missing
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    const msg = language === 'fr'
                        ? "Merci. Quelle est votre adresse email ?"
                        : "Thanks. What is your email address?";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                }

                const needsInsuranceCard = !refetchedPatient?.insurance_card_url && !updatedContext.patient?.insurance_card_url;
                if (needsInsuranceCard) {
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
                    const msg = language === 'fr'
                        ? "Presque fini ! Pourriez-vous m'envoyer une photo de votre carte d'assurance maladie ?"
                        : "Almost done! Could you please send me a photo of your health insurance card?";
                    await this.saveAssistantMessage(conversationId, msg);
                    return msg;
                }

                // If we finished collecting but were in that state, move back to IDLE or BOOKING
                if (activeState === ConversationState.COLLECTING_PATIENT_DATA) {
                    const isBookingPending = updatedContext.pending_action?.type === 'BOOK';
                    const nextState = isBookingPending ? ConversationState.COLLECTING_APPOINTMENT_DATA : ConversationState.IDLE;
                    await this.transitionToState(conversationId, nextState);
                    activeState = nextState;
                }
            }

            // Check for complete booking data -> transition to confirmation
            if (messageIntent === Intent.BOOK_APPOINTMENT ||
                (messageIntent === Intent.MODIFY_APPOINTMENT && currentAppointments.length > 0) ||
                activeState === ConversationState.COLLECTING_APPOINTMENT_DATA) {
                const missing = await this.getMissingFields(conversationId, updatedContext);
                if (missing.length === 0) {
                    const dateStr = updatedContext.appointment?.date || '';
                    const timeStr = updatedContext.appointment?.time || '';
                    const clinic = await prisma.clinic.findUnique({ where: { id: conversation.clinic_id } });
                    const timezone = clinic?.timezone || 'Europe/Paris';

                    // --- CLOSED DAY VALIDATION (check if the selected date is a closed day like Sunday) ---
                    if (clinic?.opening_hours && dateStr && dateStr.length >= 10) {
                        const apptDate = parseInTimezone(dateStr, '10:00', timezone); // Use arbitrary time to check day

                        if (apptDate && !isNaN(apptDate.getTime())) {
                            const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone });
                            const dayName = dayFormatter.format(apptDate).toLowerCase().trim();

                            const dayNamesFr: Record<string, string> = {
                                monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi',
                                thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche'
                            };
                            const dayNamesEn: Record<string, string> = {
                                monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
                                thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
                            };

                            let schedule = clinic.opening_hours;
                            if (typeof schedule === 'string') {
                                try { schedule = JSON.parse(schedule); } catch (e) { }
                            }

                            // Check if the day is closed (null schedule)
                            if (typeof schedule === 'object' && schedule !== null) {
                                const daySchedule = (schedule as any)[dayName];

                                if (!daySchedule || daySchedule === null) {
                                    const dayLabel = language === 'fr' ? dayNamesFr[dayName] || dayName : dayNamesEn[dayName] || dayName;
                                    const closedDayMsg = language === 'fr'
                                        ? `Le cabinet est fermé le ${dayLabel}. Pourriez-vous choisir un autre jour de la semaine ?`
                                        : `The clinic is closed on ${dayLabel}. Could you choose another day of the week?`;

                                    // Clear the date to prompt for a new one
                                    updatedContext.appointment!.date = undefined;
                                    if (updatedContext.appointment!.time) {
                                        updatedContext.appointment!.time = undefined;
                                    }
                                    await this.updateContext(conversationId, updatedContext);

                                    await this.saveAssistantMessage(conversationId, closedDayMsg);
                                    return closedDayMsg;
                                }
                            }
                        }
                    }

                    // --- BUSINESS HOURS VALIDATION ---
                    if (clinic?.opening_hours && dateStr && timeStr && dateStr.length >= 10 && timeStr.includes(':')) {
                        const apptDate = parseInTimezone(dateStr, timeStr, timezone);
                        const isRejectedBefore = updatedContext.rejected_times?.includes(`${dateStr} ${timeStr}`);

                        if (apptDate && !isNaN(apptDate.getTime()) && !isWithinBusinessHours(apptDate, clinic.opening_hours, timezone)) {
                            // Format opening hours in a human-readable way
                            const formatHours = (hours: any) => {
                                const dayNames: any = {
                                    monday: language === 'fr' ? 'Lundi' : 'Monday',
                                    tuesday: language === 'fr' ? 'Mardi' : 'Tuesday',
                                    wednesday: language === 'fr' ? 'Mercredi' : 'Wednesday',
                                    thursday: language === 'fr' ? 'Jeudi' : 'Thursday',
                                    friday: language === 'fr' ? 'Vendredi' : 'Friday',
                                    saturday: language === 'fr' ? 'Samedi' : 'Saturday',
                                    sunday: language === 'fr' ? 'Dimanche' : 'Sunday'
                                };
                                try {
                                    // Parse if string, use directly if object
                                    const parsed = typeof hours === 'string' ? JSON.parse(hours) : hours;

                                    // Check if parsed is a valid object
                                    if (typeof parsed !== 'object' || parsed === null) {
                                        return String(hours);
                                    }

                                    return Object.entries(parsed)
                                        .filter(([_, value]) => value !== null)
                                        .map(([day, times]: [string, any]) =>
                                            `${dayNames[day]}: ${times.open}-${times.close}`
                                        )
                                        .join(', ');
                                } catch (e) {
                                    // If all else fails, return a stringified version
                                    console.error('[FORMAT_HOURS] Error formatting hours:', e);
                                    return typeof hours === 'string' ? hours : JSON.stringify(hours);
                                }
                            };

                            const formattedHours = formatHours(clinic.opening_hours);
                            const closedMsg = language === 'fr'
                                ? `Désolé, le cabinet est fermé à cette heure-là (${timeStr}). Nos horaires sont : ${formattedHours}. Quelle autre heure vous conviendrait ?`
                                : `Sorry, the clinic is closed at that time (${timeStr}). Our hours are: ${formattedHours}. What other time would work for you?`;

                            // Add to rejected times to avoid loop
                            if (!updatedContext.rejected_times) updatedContext.rejected_times = [];
                            updatedContext.rejected_times.push(`${dateStr} ${timeStr}`);

                            // CLEAR the invalid time so it doesn't loop
                            updatedContext.appointment!.time = undefined;
                            await this.updateContext(conversationId, updatedContext);

                            await this.saveAssistantMessage(conversationId, closedMsg);
                            return closedMsg;
                        }
                    }

                    if (!updatedContext.pending_action) {
                        updatedContext.pending_action = { type: 'BOOK' };
                    }
                    await this.updateContext(conversationId, updatedContext);
                    await this.transitionToState(conversationId, ConversationState.CONFIRMATION);

                    // Use a temporary date object for formatting the confirmation
                    const tempDate = new Date(`${dateStr}T${timeStr}:00`);
                    const formattedDate = isNaN(tempDate.getTime())
                        ? `${dateStr} à ${timeStr}`
                        : formatDateFromDate(tempDate, language as 'fr' | 'en', timezone);

                    const practitionerName = updatedContext.appointment?.practitioner_name || 'le médecin';
                    const isModify = updatedContext.pending_action?.type === 'MODIFY';

                    const confirmMsg = language === 'fr'
                        ? (isModify ? `Voulez-vous déplacer le rendez-vous au ${formattedDate} ?` : `Confirmez-vous le rendez-vous le ${formattedDate} avec ${practitionerName} ?`)
                        : (isModify ? `Confirm moving to ${formattedDate}?` : `Confirm appointment on ${formattedDate} with ${practitionerName}?`);

                    await this.saveAssistantMessage(conversationId, confirmMsg);
                    return confirmMsg;
                } else {
                    // If fields are missing, stay in COLLECTING_APPOINTMENT_DATA
                    await this.transitionToState(conversationId, ConversationState.COLLECTING_APPOINTMENT_DATA);

                    // Special case: If we have a practitioner but no date/time, propose available slots
                    // Check if practitioner was just added (either in this message or already in context)
                    const hasPractitioner = updatedContext.appointment?.practitioner_name;
                    const practitionerJustAdded = entities.practitioner || (hasPractitioner && !currentContext.appointment?.practitioner_name);

                    console.log(`\n========== SLOT AVAILABILITY CHECK ==========`);
                    console.log(`[HAS PRACTITIONER] ${hasPractitioner ? 'YES' : 'NO'} (${hasPractitioner})`);
                    console.log(`[PRACTITIONER JUST ADDED] ${practitionerJustAdded ? 'YES' : 'NO'}`);
                    console.log(`[MISSING FIELDS] ${JSON.stringify(missing)}`);
                    console.log(`[ENTITIES.PRACTITIONER] ${entities.practitioner || 'NONE'}`);
                    console.log(`[CURRENT CONTEXT PRACTITIONER] ${currentContext.appointment?.practitioner_name || 'NONE'}`);
                    console.log(`[UPDATED CONTEXT PRACTITIONER] ${updatedContext.appointment?.practitioner_name || 'NONE'}`);
                    console.log(`============================================\n`);

                    if (hasPractitioner && practitionerJustAdded && (missing.includes('date') || missing.includes('time')) && updatedContext.appointment) {
                        console.log(`[SLOT PROPOSAL] Condition MET - Proposing available slots...`);

                    // Also check if user is asking for slots for a specific date
                    const isAskingForSlots = /créneaux|horaires|disponibilités|disponible|slots|heures?/i.test(userMessage);

                    if (!practitionerJustAdded && isAskingForSlots && updatedContext.appointment?.practitioner_id && updatedContext.appointment?.date) {
                        console.log(`[SLOT PROPOSAL] User is asking for slots on specific date - Showing available slots...`);

                        try {
                            const clinic = await prisma.clinic.findUnique({ where: { id: conversation.clinic_id } });
                            const timezone = clinic?.timezone || 'Europe/Zurich';
                            const practitionerName = updatedContext.appointment?.practitioner_name || 'le médecin';

                            // Parse the date
                            const dateParts = updatedContext.appointment.date.split('-');
                            const requestedDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));

                            // Check if the requested date is a closed day
                            if (!isDayOpen(requestedDate, clinic?.opening_hours, timezone)) {
                                const dayName = requestedDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                                    weekday: 'long',
                                    timeZone: timezone
                                });
                                const msg = language === 'fr'
                                    ? `Désolé, le cabinet est fermé le ${dayName}. Pourriez-vous choisir un autre jour ?`
                                    : `Sorry, the clinic is closed on ${dayName}. Could you choose another day?`;
                                await this.saveAssistantMessage(conversationId, msg);
                                return msg;
                            }

                            // Get the opening hours for this specific date
                            const requestedDayHours = getDayOpeningHours(requestedDate, clinic?.opening_hours, timezone);

                            // Get available slots for that specific date
                            const daySlots = await calendarService.getAvailableSlots(
                                updatedContext.appointment.practitioner_id,
                                requestedDate,
                                30,
                                requestedDayHours
                            );

                            const now = new Date();
                            // Filter future slots if it's today
                            const futureSlots = daySlots.filter(slot => {
                                const slotDate = new Date(slot.start);
                                slotDate.setHours(0, 0, 0, 0);
                                const today = new Date(now);
                                today.setHours(0, 0, 0, 0);

                                if (slotDate.getTime() === today.getTime()) {
                                    return slot.start.getTime() > now.getTime();
                                }
                                return true;
                            });

                            if (futureSlots.length > 0) {
                                const availableSlots: { date: string; time: string; display: string }[] = [];

                                for (const slot of futureSlots) {
                                    const timeStr = slot.start.toLocaleTimeString('fr-FR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: timezone
                                    }).replace(':', 'h');

                                    availableSlots.push({
                                        date: slot.start.toISOString().split('T')[0],
                                        time: timeStr,
                                        display: timeStr
                                    });
                                }

                                const slotsList = availableSlots.map(s => `- ${s.display}`).join('\n');

                                const dateStr = requestedDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    timeZone: timezone
                                });

                                const askMsg = language === 'fr'
                                    ? `Voici les créneaux disponibles le ${dateStr} avec ${practitionerName} :\n\n${slotsList}\n\nQuelle heure vous conviendrait ?`
                                    : `Here are the available slots on ${dateStr} with ${practitionerName}:\n\n${slotsList}\n\nWhat time would work for you?`;

                                await this.saveAssistantMessage(conversationId, askMsg);
                                return askMsg;
                            } else {
                                const dateStr = requestedDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                    timeZone: timezone
                                });

                                const noSlotsMsg = language === 'fr'
                                    ? `Désolé, il n'y a plus de créneaux disponibles le ${dateStr}. Souhaitez-vous un autre jour ?`
                                    : `Sorry, there are no available slots on ${dateStr}. Would you like another day?`;

                                await this.saveAssistantMessage(conversationId, noSlotsMsg);
                                return noSlotsMsg;
                            }
                        } catch (error) {
                            console.error('[SLOT DISPLAY ERROR]', error);
                        }
                    }
                        try {
                            // Get next 7 days of available slots
                            const clinic = await prisma.clinic.findUnique({ where: { id: conversation.clinic_id } });
                            const timezone = clinic?.timezone || 'Europe/Zurich';
                            const practitionerName = updatedContext.appointment?.practitioner_name || 'le médecin';

                            // Resolve practitioner ID if not already set
                            if (!updatedContext.appointment.practitioner_id && practitionerName) {
                                const practitioner = await this.resolvePractitioner(
                                    conversation.clinic_id,
                                    practitionerName
                                );

                                if (practitioner) {
                                    updatedContext.appointment.practitioner_id = practitioner.id;
                                    await this.updateContext(conversationId, updatedContext);
                                } else {
                                    // Practitioner not found, ask for clarification
                                    const doctors = await prisma.practitioner.findMany({
                                        where: { clinic_id: conversation.clinic_id, is_active: true }
                                    });
                                    const doctorList = doctors.map(d => `Dr ${d.last_name}`).join(', ');

                                    updatedContext.appointment.practitioner_name = undefined;
                                    await this.updateContext(conversationId, updatedContext);

                                    const msg = language === 'fr'
                                        ? `Désolé, je ne trouve pas de "${practitionerName}". Voici nos médecins : ${doctorList}.`
                                        : `Sorry, I can't find "${practitionerName}". Here are our doctors: ${doctorList}.`;
                                    await this.saveAssistantMessage(conversationId, msg);
                                    return msg;
                                }
                            }

                            // Get minimum booking delay based on patient status and urgency
                            const minDelay = await this.getMinimumBookingDelay(conversationId, updatedContext);
                            const isUrgent = updatedContext.appointment?.type ? this.isUrgentAppointment(updatedContext.appointment.type) : false;

                            console.log(`[SLOT FILTERING] Minimum delay: ${minDelay} days, Urgent: ${isUrgent}`);

                            const now = new Date();
                            const availableSlots: { date: string; time: string; display: string }[] = [];

                            // Get clinic opening hours for filtering closed days
                            const clinicForHours = await prisma.clinic.findUnique({
                                where: { id: conversation.clinic_id }
                            });
                            const clinicOpeningHours = clinicForHours?.opening_hours;

                            // Check next 14 days (or more if needed), skipping closed days
                            for (let i = minDelay; i <= 21 && availableSlots.length < 6; i++) {
                                const checkDate = new Date(now);
                                checkDate.setDate(checkDate.getDate() + i);

                                // Skip closed days (e.g., Sundays, holidays)
                                if (!isDayOpen(checkDate, clinicOpeningHours, timezone)) {
                                    console.log(`[SLOT FILTERING] Skipping closed day: ${checkDate.toLocaleDateString('fr-FR', { weekday: 'long', timeZone: timezone })}`);
                                    continue;
                                }

                                // Get the opening hours for this specific day
                                const dayOpeningHours = getDayOpeningHours(checkDate, clinicOpeningHours, timezone);

                                const daySlots = await calendarService.getAvailableSlots(
                                    updatedContext.appointment!.practitioner_id!,
                                    checkDate,
                                    30,
                                    dayOpeningHours  // Pass the day's opening hours
                                );

                                // Filter out past slots (for today only)
                                const futureSlots = daySlots.filter(slot => {
                                    // If checking today (i === 0), only keep slots in the future
                                    if (i === 0) {
                                        return slot.start.getTime() > now.getTime();
                                    }
                                    // For future days, keep all slots
                                    return true;
                                });

                                // Take first 2 slots of the day
                                for (const slot of futureSlots.slice(0, 2)) {
                                    // Format date without time
                                    const dateStr = slot.start.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric',
                                        timeZone: timezone
                                    });

                                    const timeStr = slot.start.toLocaleTimeString('fr-FR', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: timezone
                                    }).replace(':', 'h');

                                    availableSlots.push({
                                        date: slot.start.toISOString().split('T')[0],
                                        time: timeStr,
                                        display: `${dateStr} à ${timeStr}`
                                    });

                                    if (availableSlots.length >= 6) break;
                                }
                            }

                            if (availableSlots.length > 0) {
                                const slotsList = availableSlots.map(s => `- ${s.display}`).join('\n');

                                let prefixMsg = '';
                                if (isUrgent) {
                                    prefixMsg = language === 'fr'
                                        ? "Je comprends que c'est urgent. "
                                        : "I understand this is urgent. ";
                                } else if (minDelay >= 2) {
                                    prefixMsg = language === 'fr'
                                        ? "Pour une première visite, un délai de 48h est nécessaire. "
                                        : "For a first visit, a 48-hour delay is required. ";
                                }

                                const askMsg = language === 'fr'
                                    ? `${prefixMsg}Voici les prochains créneaux disponibles avec ${practitionerName} :\n\n${slotsList}\n\nQuel créneau vous conviendrait le mieux ?`
                                    : `${prefixMsg}Here are the next available slots with ${practitionerName}:\n\n${slotsList}\n\nWhich slot would work best for you?`;

                                await this.saveAssistantMessage(conversationId, askMsg);
                                return askMsg;
                            }
                        } catch (error) {
                            await logService.error('CONVERSATION', 'SLOTS_FETCH_ERROR', 'Failed to fetch available slots', error, {
                                conversation_id: conversationId,
                                metadata: { practitioner_id: updatedContext.appointment?.practitioner_id }
                            });
                        }
                    }

                    // Authoritarian: ask for the first missing field manually
                    const nextField = missing[0];
                    let askMsg = "";
                    if (nextField === 'practitioner') {
                        if (language === 'fr') {
                            const doctorList = doctorAvailability.map(d => `- ${d.name} (${d.specialty})`).join('\n');
                            askMsg = `C'est entendu. Avec quel médecin souhaitez-vous prendre rendez-vous ? Voici nos praticiens :\n${doctorList}`;
                        } else {
                            const doctorList = doctorAvailability.map(d => `- ${d.name} (${d.specialty})`).join('\n');
                            askMsg = `Understood. Which doctor would you like to see? Here are our practitioners:\n${doctorList}`;
                        }
                    }
                    else if (nextField === 'date') askMsg = language === 'fr' ? "C'est noté. Pour quelle date souhaiteriez-vous ce rendez-vous ?" : "Noted. For what date would you like this appointment?";
                    else if (nextField === 'time') askMsg = language === 'fr' ? "Très bien. À quelle heure préféreriez-vous ?" : "Very well. At what time would you prefer?";
                    else if (nextField === 'type') askMsg = language === 'fr' ? "Pourriez-vous m'indiquer le motif de votre consultation ?" : "Could you please tell me the reason for your visit?";

                    if (askMsg) {
                        // Prepend insurance confirmation if it was just completed
                        const insuranceFlag = (updatedContext as any).insurance_just_completed;
                        if (insuranceFlag) {
                            let confirmationMsg = "";
                            if (insuranceFlag === 'document') {
                                confirmationMsg = language === 'fr'
                                    ? "Bien reçu ! Votre document de garantie a été enregistré. Passons maintenant à votre rendez-vous.\n\n"
                                    : "Received! Your guarantee document has been saved. Let's now move on to your appointment.\n\n";
                            } else if (insuranceFlag === 'number') {
                                confirmationMsg = language === 'fr'
                                    ? "Parfait ! Votre numéro a été enregistré. Passons maintenant à votre rendez-vous.\n\n"
                                    : "Perfect! Your number has been saved. Let's now move on to your appointment.\n\n";
                            }
                            askMsg = confirmationMsg + askMsg;

                            // Clear the flag
                            delete (updatedContext as any).insurance_just_completed;
                            await this.updateContext(conversationId, updatedContext);
                        }

                        await this.saveAssistantMessage(conversationId, askMsg);
                        return askMsg;
                    }
                }
            }

        }


        // 8. CHECK FOR PENDING QUESTIONS BEFORE FALLBACK
        // If we have pending insurance questions and got an unclear response, re-ask instead of generating generic response
        if (updatedContext.patient?.awaiting_social_insurance_response === true) {
            const msg = language === 'fr'
                ? "Bénéficiez-vous d'une assurance sociale (Hospice générale ou SPC) ? Répondez par Oui ou Non."
                : "Do you have social insurance (Hospice générale or SPC)? Please answer Yes or No.";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        if (updatedContext.patient?.awaiting_social_insurance_type === true) {
            const msg = language === 'fr'
                ? "De quel type d'assurance sociale s'agit-il ? (Hospice générale ou SPC)"
                : "What type of social insurance do you have? (Hospice générale or SPC)";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        if (updatedContext.patient?.awaiting_insurance_numbers === true) {
            const msg = language === 'fr'
                ? "Pouvez-vous me fournir votre numéro de bénéficiaire ou votre numéro de garanti ? Vous pouvez aussi envoyer le document de garantie en PDF."
                : "Can you provide your beneficiary number or guarantee number? You can also send the guarantee document in PDF format.";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // 9. FALLBACK TO SOPHIE GENERATIVE (Natural conversation)
        // If we have a modelResponseMessage but we hit one of the authoritarian returns above (like finalMsg or cancelMsg),
        // those functions already returned. So if we are here, it means we either didn't match a flow
        // or the flow didn't return (e.g. still collecting data).

        const currentApts = await this.getClientAppointments(conversation.user_phone);
        const sophieContext = {
            client: refetchedPatient ? { name: `${refetchedPatient.first_name} ${refetchedPatient.last_name}`, phone: refetchedPatient.phone } : null,
            appointments: currentApts,
            state: { state: activeState, data: updatedContext },
            language,
            structuredContext
        } as any;

        // CRITICAL: Validate response before sending (anti-hallucination)
        let finalResponse: string;

        if (modelResponseMessage) {
            // Valider le message extrait par le LLM
            const validation = await ResponseValidator.validateResponse(
                modelResponseMessage,
                structuredContext,
                userMessage
            );

            if (validation.valid) {
                finalResponse = modelResponseMessage;
            } else {
                // Hallucination détectée, utiliser la réponse sûre
                await logService.warn('CONVERSATION', 'MODEL_RESPONSE_REJECTED', `Model response rejected: ${validation.reason}`, {
                    metadata: {
                        rejectedResponse: modelResponseMessage,
                        reason: validation.reason
                    }
                });
                finalResponse = validation.suggestedResponse || await sophieService.generateResponse(userMessage, sophieContext) || (language === 'fr' ? "Comment puis-je vous aider ?" : "How can I help you?");
            }
        } else {
            // Pas de message extrait, générer avec Sophie (déjà validé)
            finalResponse = await sophieService.generateResponse(userMessage, sophieContext) || (language === 'fr' ? "Comment puis-je vous aider ?" : "How can I help you?");
        }

        await this.saveAssistantMessage(conversationId, finalResponse);
        return finalResponse;
    }

    // Legacy method for backward compatibility
    // Méthode legacy pour la compatibilité
    async processMessage(
        conversationId: string,
        userMessage: string,
        clinicName: string
    ): Promise<string> {
        // Get conversation
        // Récupérer la conversation
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: {
                messages: {
                    orderBy: { created_at: 'desc' },
                    take: 10,
                },
            },
        });

        if (!conversation) {
            await logService.error('CONVERSATION', 'NOT_FOUND',
                `Conversation ${conversationId} not found in initiateBooking`, null);
            return "Désolé, une erreur s'est produite.";
        }

        // Save user message
        // Sauvegarder le message utilisateur
        await prisma.message.create({
            data: {
                conversation_id: conversationId,
                role: 'user',
                content: userMessage,
            },
        });

        // Build conversation history for LLM
        // Construire l'historique pour le LLM
        const history = conversation.messages.reverse().map((msg) => ({
            role: msg.role,
            content: msg.content,
        }));

        // Call LLM
        // Appeler le LLM
        const llmResponse = await llmService.generateResponse(
            userMessage,
            clinicName,
            history,
            conversation.detected_language as string || 'fr',
            conversation.context_data // Pass current context here
        );

        if (!llmResponse) {
            const errorMsg = "Désolé, je n'ai pas pu comprendre votre message. Pouvez-vous reformuler ?";

            await logService.error('LLM', 'NO_RESPONSE',
                'LLM failed to generate response in initiateBooking', null, { conversation_id: conversationId });

            await this.saveAssistantMessage(conversationId, errorMsg);

            return errorMsg;
        }

        console.log(`[DEBUG] Intent: ${llmResponse.intent}, Confidence: ${llmResponse.confidence}`);
        console.log(`[DEBUG] Entities extracted:`, JSON.stringify(llmResponse.entities, null, 2));

        // Update context with extracted entities
        // Mettre à jour le contexte avec les entités extraites
        const updatedContext = this.mergeContext(
            conversation.context_data as ConversationContext,
            llmResponse.entities,
            llmResponse.is_ambiguous
        );

        console.log(`[DEBUG] Updated Context:`, JSON.stringify(updatedContext, null, 2));

        // Handle emergency
        // Gérer les urgences
        if (llmResponse.intent === Intent.EMERGENCY) {
            await this.transitionToState(conversationId, ConversationState.EMERGENCY);
            const clinic = await prisma.clinic.findUnique({
                where: { id: conversation.clinic_id },
            });
            const emergencyMessage =
                clinic?.emergency_message ||
                "🚨 URGENCE DÉTECTÉE\n\nVeuillez appeler immédiatement le 15 (SAMU) ou vous rendre aux urgences les plus proches.\n\nSi vous souhaitez parler à un membre de notre équipe, tapez 'HUMAIN'.";

            await this.saveAssistantMessage(conversationId, emergencyMessage);
            return emergencyMessage;
        }

        // Process based on intent and current state
        // Traiter selon l'intention et l'état actuel
        const responseMessage = await this.handleIntent(
            conversationId,
            llmResponse,
            conversation.current_state as ConversationState,
            updatedContext
        );

        // ALWAYS save the updated context to persist entity extraction
        // TOUJOURS sauvegarder le contexte mis à jour pour persister l'extraction d'entités
        await this.updateContext(conversationId, updatedContext);

        // Update patient record if we have personal info
        if (llmResponse.entities.first_name || llmResponse.entities.last_name || llmResponse.entities.birth_date) {
            await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, updatedContext);
        }

        // Save assistant message
        // Sauvegarder le message de l'assistant
        await this.saveAssistantMessage(conversationId, responseMessage);

        return responseMessage;
    }

    // Handle intent based on FSM state
    // Gérer l'intention selon l'état de la FSM
    private async handleIntent(
        conversationId: string,
        llmResponse: LLMResponse,
        currentState: ConversationState,
        context: ConversationContext
    ): Promise<string> {
        const { intent } = llmResponse;

        // PRIORITIZE STATE: If we are in a flow, stay in the flow unless a new strong intent is detected
        // PRIORISER L'ÉTAT : Si on est dans un flux, on y reste sauf si une nouvelle intention forte est détectée

        // 1. Check for strong intents that can break any flow
        if (intent === Intent.CANCEL_APPOINTMENT) {
            return await this.handleCancellationFlow(conversationId, context, llmResponse);
        }
        if (intent === Intent.MODIFY_APPOINTMENT) {
            return await this.handleModificationFlow(conversationId, context, llmResponse);
        }
        if (intent === Intent.EMERGENCY) {
            // Already handled in processMessage but just in case
            return llmResponse.response_message || "Urgence détectée.";
        }

        // 2. Handle based on CURRENT STATE
        if (
            currentState === ConversationState.COLLECTING_APPOINTMENT_DATA ||
            currentState === ConversationState.COLLECTING_PATIENT_DATA ||
            currentState === ConversationState.CONFIRMATION
        ) {
            return await this.handleBookingFlow(conversationId, context, llmResponse);
        }

        // 3. Fallback to Intent-based handling for INITIAL states
        switch (intent) {
            case Intent.GREETING:
                const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
                const practitioners = await prisma.practitioner.findMany({
                    where: { clinic_id: conversation?.clinic_id, is_active: true }
                });
                const drList = practitioners.map(p => `Dr ${p.last_name}`).join(', ');
                // Use our detected language (already updated in llmResponse)
                const greetingMsg = llmResponse.detected_language === 'fr'
                    ? `Bonjour! Comment puis-je vous aider aujourd'hui ?`
                    : `Hello! How can I help you today?`;
                await this.saveAssistantMessage(conversationId, greetingMsg);
                return greetingMsg;

            case Intent.BOOK_APPOINTMENT:
                return await this.handleBookingFlow(conversationId, context, llmResponse);

            case Intent.INFORMATION:
                const infoMsg = llmResponse.response_message || "Je gère vos rendez-vous et infos cabinet.";
                await this.saveAssistantMessage(conversationId, infoMsg);
                return infoMsg;

            default:
                // If the LLM provided a response message, use it, otherwise use a generic one
                const defaultMsg = llmResponse.response_message || "Désolé, reformulez svp.";
                await this.saveAssistantMessage(conversationId, defaultMsg);
                return defaultMsg;
        }
    }

    // Handle booking flow
    // Gérer le flux de réservation
    private async handleBookingFlow(
        conversationId: string,
        context: ConversationContext,
        llmResponse: LLMResponse
    ): Promise<string> {
        // Check what data is missing
        // Vérifier quelles données manquent
        const missingFields = await this.getMissingFields(conversationId, context);

        if (missingFields.length > 0) {
            await this.transitionToState(conversationId, ConversationState.COLLECTING_APPOINTMENT_DATA);
            await this.updateContext(conversationId, context);

            // Special Case: If time is missing but we have a time_preference (morning/afternoon), suggest slots
            if (missingFields.includes('time') && context.appointment?.time_preference && context.appointment?.date && context.appointment?.practitioner_id) {
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    include: { clinic: true }
                });
                const suggestion = await this.suggestSlots(conversationId, context, llmResponse.detected_language, conversation?.clinic);
                if (suggestion) {
                    await this.saveAssistantMessage(conversationId, suggestion);
                    return suggestion;
                }
            }

            // Ask for the first missing field
            // Demander le premier champ manquant
            return await this.askForMissingField(conversationId, missingFields[0], llmResponse.detected_language);
        }

        // All data collected, check availability
        // Toutes les données collectées, vérifier la disponibilité
        return await this.finalizeBooking(conversationId, context, llmResponse.detected_language);
    }

    // Handle cancellation flow
    // Gérer le flux d'annulation
    // Initiate cancellation flow
    private async initiateCancellation(
        conversationId: string,
        context: ConversationContext,
        language: string
    ): Promise<string> {
        // Find upcoming appointments
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId }
        });

        if (!conversation) {
            const errorMsg = language === 'fr'
                ? "Désolé, une erreur s'est produite. Veuillez réessayer."
                : "Sorry, an error occurred. Please try again.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        const appointments = await prisma.appointment.findMany({
            where: {
                patient: {
                    phone: conversation.user_phone,
                    clinic_id: conversation.clinic_id
                },
                start_time: { gte: new Date() },
                status: 'CONFIRMED'
            },
            include: { practitioner: true }
        });

        if (appointments.length === 0) {
            return language === 'fr'
                ? "Je n'ai pas trouvé de rendez-vous à venir pour vous."
                : "I couldn't find any upcoming appointments for you.";
        }

        // For MVP, we take the most recent one
        const target = appointments[0];

        // Set pending action
        context.pending_action = {
            type: 'CANCEL',
            appointment_id: target.id
        };
        await this.updateContext(conversationId, context);
        await this.transitionToState(conversationId, ConversationState.CONFIRMATION);

        const clinic = await prisma.clinic.findUnique({ where: { id: conversation.clinic_id } });
        const timezone = clinic?.timezone || 'Europe/Paris';
        const formattedDate = formatDateFromDate(target.start_time, language as 'fr' | 'en', timezone);

        return language === 'fr'
            ? `Voulez-vous vraiment annuler votre rendez-vous du ${formattedDate} avec le Dr ${target.practitioner.last_name} ?`
            : `Are you sure you want to cancel your appointment on ${formattedDate} with Dr ${target.practitioner.last_name}?`;
    }

    // Finalize cancellation
    private async finalizeCancellation(
        conversationId: string,
        context: ConversationContext,
        language: string
    ): Promise<string> {
        const appointmentId = context.pending_action?.appointment_id;
        if (!appointmentId) {
            const errorMsg = language === 'fr'
                ? "Désolé, une erreur s'est produite. Veuillez réessayer."
                : "Sorry, an error occurred. Please try again.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { practitioner: true }
        });

        if (!appointment) {
            const errorMsg = language === 'fr'
                ? "Désolé, je n'ai pas trouvé ce rendez-vous."
                : "Sorry, I couldn't find that appointment.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        // 1. Delete from Calendar
        if (appointment.google_event_id) {
            try {
                await calendarService.deleteEvent(appointment.practitioner_id, appointment.google_event_id);
            } catch (error) {
                console.error('Error deleting calendar event:', error);
            }
        }

        // 2. Update DB
        await prisma.appointment.update({
            where: { id: appointmentId },
            data: { status: 'CANCELLED' }
        });

        const clinic = await prisma.clinic.findUnique({ where: { id: appointment.practitioner.clinic_id } });
        const formattedDate = formatDateFromDate(appointment.start_time, language as 'fr' | 'en', clinic?.timezone || 'Europe/Paris');
        const drName = `Dr ${appointment.practitioner.last_name}`;

        // 3. Clear context and state
        await this.updateContext(conversationId, {}); // Clear context after completion
        await this.transitionToState(conversationId, ConversationState.COMPLETED);

        return language === 'fr'
            ? `Votre rendez-vous du ${formattedDate} avec le ${drName} a bien été annulé. Souhaitez-vous faire autre chose ?`
            : `Your appointment on ${formattedDate} with ${drName} has been cancelled. Is there anything else I can help you with?`;
    }

    // Initiate modification flow
    private async initiateModification(
        conversationId: string,
        context: ConversationContext,
        language: string
    ): Promise<string> {
        // Find upcoming appointments
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId }
        });

        if (!conversation) {
            const errorMsg = language === 'fr'
                ? "Désolé, une erreur s'est produite. Veuillez réessayer."
                : "Sorry, an error occurred. Please try again.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        const appointments = await prisma.appointment.findMany({
            where: {
                patient: {
                    phone: conversation?.user_phone,
                    clinic_id: conversation?.clinic_id
                },
                start_time: { gte: new Date() },
                status: 'CONFIRMED'
            },
            include: { practitioner: true }
        });

        if (appointments.length === 0) {
            return language === 'fr'
                ? "Je n'ai pas trouvé de rendez-vous à modifier."
                : "I couldn't find any appointment to modify.";
        }

        const target = appointments[0];

        // Check if we already have new date/time in context
        if (context.appointment?.date && context.appointment?.time) {
            // We have the new slot, ask for confirmation to MOVE
            context.pending_action = {
                type: 'MODIFY',
                appointment_id: target.id,
                new_data: {
                    date: context.appointment.date,
                    time: context.appointment.time
                }
            };
            await this.updateContext(conversationId, context);
            await this.transitionToState(conversationId, ConversationState.CONFIRMATION);

            const clinic = await prisma.clinic.findUnique({ where: { id: conversation.clinic_id } });
            const timezone = clinic?.timezone || 'Europe/Paris';
            const tempDate = new Date(`${context.appointment.date}T${context.appointment.time}:00`);
            const formattedDate = isNaN(tempDate.getTime())
                ? `${context.appointment.date} à ${context.appointment.time}`
                : formatDateFromDate(tempDate, language as 'fr' | 'en', timezone);

            return language === 'fr'
                ? `Voulez-vous déplacer votre rendez-vous au ${formattedDate} ?`
                : `Do you want to move your appointment to ${formattedDate}?`;
        }

        // Otherwise, ask for the new slot
        context.pending_action = {
            type: 'MODIFY',
            appointment_id: target.id
        };
        await this.updateContext(conversationId, context);
        await this.transitionToState(conversationId, ConversationState.COLLECTING_APPOINTMENT_DATA);

        return language === 'fr'
            ? "Pour quelle nouvelle date et heure souhaitez-vous déplacer votre rendez-vous ?"
            : "For what new date and time would you like to move your appointment?";
    }

    // Finalize modification
    private async finalizeModification(
        conversationId: string,
        context: ConversationContext,
        language: string
    ): Promise<string> {
        const appointmentId = context.pending_action?.appointment_id;
        const newData = context.pending_action?.new_data;

        if (!appointmentId || !newData) {
            const errorMsg = language === 'fr'
                ? "Désolé, une erreur s'est produite. Veuillez réessayer."
                : "Sorry, an error occurred. Please try again.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        const appointment = await prisma.appointment.findUnique({
            where: { id: appointmentId },
            include: { practitioner: true }
        });

        if (!appointment) {
            const errorMsg = language === 'fr'
                ? "Désolé, je n'ai pas trouvé ce rendez-vous."
                : "Sorry, I couldn't find that appointment.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        const clinic = await prisma.clinic.findUnique({ where: { id: appointment.practitioner.clinic_id } });
        const newStart = parseInTimezone(newData.date, newData.time, clinic?.timezone || 'Europe/Paris');
        const newEnd = new Date(newStart.getTime() + 30 * 60000);

        // Check availability
        const isAvailable = await calendarService.checkAvailability(
            appointment.practitioner_id,
            newStart,
            newEnd
        );

        if (!isAvailable) {
            return language === 'fr'
                ? "Désolé, ce créneau n'est pas disponible. Veuillez en choisir un autre."
                : "Sorry, this slot is not available. Please choose another one.";
        }

        // 1. Update Calendar
        if (appointment.google_event_id) {
            try {
                const conversation = await prisma.conversation.findUnique({
                    where: { id: conversationId },
                    include: { clinic: true }
                });
                await calendarService.updateEvent(
                    appointment.practitioner_id,
                    appointment.google_event_id,
                    newStart,
                    newEnd,
                    conversation?.clinic.timezone || 'Europe/Paris'
                );
            } catch (error) {
                console.error('Error updating calendar event:', error);
            }
        }

        // 2. Update DB
        await prisma.appointment.update({
            where: { id: appointmentId },
            data: {
                start_time: newStart,
                end_time: newEnd
            }
        });

        // 3. Clear context and state
        const formattedDate = formatDateFromDate(newStart, language as 'fr' | 'en', clinic?.timezone || 'Europe/Paris');
        await this.updateContext(conversationId, {}); // Clear context after completion
        await this.transitionToState(conversationId, ConversationState.COMPLETED);

        return language === 'fr'
            ? `C'est fait ! Votre rendez-vous est maintenant prévu pour le ${formattedDate}.`
            : `All set! Your appointment is now scheduled for ${formattedDate}.`;
    }

    // Legacy method for cancellation (kept for compatibility if needed)
    private async handleCancellationFlow(
        conversationId: string,
        context: ConversationContext,
        llmResponse: LLMResponse
    ): Promise<string> {
        return this.initiateCancellation(conversationId, context, llmResponse.detected_language);
    }

    // Handle modification flow (Rescheduling)
    // Gérer le flux de modification (Report)
    private async handleModificationFlow(
        conversationId: string,
        context: ConversationContext,
        llmResponse: LLMResponse
    ): Promise<string> {
        const language = llmResponse.detected_language;
        const clinic = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { clinic: true }
        }).then(convo => convo?.clinic);

        if (!clinic) {
            const errorMsg = language === 'fr'
                ? "Désolé, une erreur s'est produite. Veuillez réessayer."
                : "Sorry, an error occurred. Please try again.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }

        // Check if we have the new date and time
        // Vérifier si nous avons la nouvelle date et heure
        if (!context.appointment?.date || !context.appointment?.time) {
            await this.transitionToState(conversationId, ConversationState.COLLECTING_APPOINTMENT_DATA);
            await this.updateContext(conversationId, context);
            const msg = language === 'fr'
                ? "Pour quelle nouvelle date et heure souhaitez-vous déplacer votre rendez-vous ?"
                : "What new date and time would you like to move your appointment to?";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // Find the existing upcoming appointment
        // Trouver le rendez-vous à venir existant
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId }
        });

        const appointment = await prisma.appointment.findFirst({
            where: {
                patient: {
                    phone: conversation?.user_phone,
                    clinic_id: conversation?.clinic_id
                },
                start_time: { gte: new Date() },
                status: 'CONFIRMED'
            },
            include: { practitioner: true }
        });

        if (!appointment) {
            return language === 'fr'
                ? "Je n'ai pas trouvé de rendez-vous à modifier."
                : "I couldn't find any appointment to modify.";
        }

        // Check availability for the new slot
        const newStart = parseInTimezone(context.appointment.date, context.appointment.time, clinic.timezone || 'Europe/Paris');
        const newEnd = new Date(newStart.getTime() + 30 * 60000);

        if (isNaN(newStart.getTime())) {
            return language === 'fr' ? "Format de date invalide." : "Invalid date format.";
        }

        const isAvailable = await calendarService.checkAvailability(
            appointment.practitioner_id,
            newStart,
            newEnd
        );

        if (!isAvailable) {
            const slots = await calendarService.getAvailableSlots(appointment.practitioner_id, newStart);
            const suggestion = slots.slice(0, 3).map(s => s.start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).join(', ');
            return language === 'fr'
                ? `Désolé, ce nouveau créneau n'est pas disponible. Voici d'autres options : ${suggestion}`
                : `Sorry, this new slot is not available. Here are other options: ${suggestion}`;
        }

        // Proceed with update
        if (appointment.google_event_id) {
            await calendarService.updateEvent(
                appointment.practitioner_id,
                appointment.google_event_id,
                newStart,
                newEnd,
                clinic.timezone || 'Europe/Paris'
            );
        }

        await prisma.appointment.update({
            where: { id: appointment.id },
            data: {
                start_time: newStart,
                end_time: newEnd
            }
        });

        await this.transitionToState(conversationId, ConversationState.COMPLETED);

        return language === 'fr'
            ? `C'est fait ! Votre rendez-vous est maintenant prévu pour le ${context.appointment.date} à ${context.appointment.time}.`
            : `All set! Your appointment is now scheduled for ${context.appointment.date} at ${context.appointment.time}.`;
    }

    // Get missing fields for booking
    // Obtenir les champs manquants pour la réservation
    // Get missing fields for booking - STRICT PRIORITY
    // Obtenir les champs manquants pour la réservation - PRIORITÉ STRICTE
    private async getMissingFields(conversationId: string, context: ConversationContext): Promise<string[]> {
        const missing: string[] = [];

        // 1. Check Patient Data FIRST
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId }
        });

        if (conversation) {
            const patient = await prisma.patient.findUnique({
                where: {
                    clinic_id_phone: {
                        clinic_id: conversation.clinic_id,
                        phone: conversation.user_phone
                    }
                }
            });

            // If patient data is missing, prioritize that above all else
            // We return IMMEDIATELY so the bot focuses on this one task
            if (!patient?.first_name && !context.patient?.first_name) return ['first_name'];
            if (!patient?.last_name && !context.patient?.last_name) return ['last_name'];
            if (!patient?.birth_date && !context.patient?.birth_date) return ['birth_date'];
            if (!patient?.email && !context.patient?.email) return ['email'];
        }

        // 2. Check Appointment Data NEXT
        // ORDER: type (motif) -> practitioner -> date -> time
        // This allows us to detect urgency and suggest appropriate practitioners
        if (!context.appointment?.type) return ['type']; // Motif FIRST
        if (!context.appointment?.practitioner_name && !context.appointment?.practitioner_id) return ['practitioner'];
        if (!context.appointment?.date) return ['date'];
        if (!context.appointment?.time) return ['time'];

        return []; // No missing fields
    }

    // Ask for missing field
    // Demander un champ manquant
    private async askForMissingField(conversationId: string, field: string, language: string): Promise<string> {
        const questions: Record<string, Record<string, string>> = {
            practitioner: {
                fr: "Quel médecin ?",
                en: "Which doctor?",
            },
            date: {
                fr: "Quelle date ?",
                en: "Which date?",
            },
            time: {
                fr: "À quelle heure ?",
                en: "What time?",
            },
            type: {
                fr: "Quel motif ?",
                en: "What reason?",
            },
            first_name: {
                fr: "Votre prénom ?",
                en: "Your first name?",
            },
            last_name: {
                fr: "Votre nom de famille ?",
                en: "Your last name?",
            },
            birth_date: {
                fr: "Date de naissance (JJ/MM/AAAA) ?",
                en: "Birth date (DD/MM/YYYY)?",
            },
            email: {
                fr: "Quelle est votre adresse email ?",
                en: "What is your email address?",
            },
        };

        const msg = questions[field]?.[language] || questions[field]?.['fr'] || "Information manquante.";
        await this.saveAssistantMessage(conversationId, msg);
        return msg;
    }

    // Finalize booking
    // Finaliser la réservation
    private async finalizeBooking(
        conversationId: string,
        context: ConversationContext,
        language: string
    ): Promise<string> {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            include: { clinic: true }
        });

        if (!conversation) {
            const errorMsg = language === 'fr'
                ? "Désolé, une erreur s'est produite. Veuillez réessayer."
                : "Sorry, an error occurred. Please try again.";
            await this.saveAssistantMessage(conversationId, errorMsg);
            return errorMsg;
        }
        const clinic = conversation.clinic;

        // 1. Validate Appointment Details
        // 1. Valider les détails du rendez-vous
        const appt = context.appointment || {};

        if (!appt.practitioner_name) {
            // Need doctor name
            const msg = language === 'fr'
                ? "Quel praticien souhaitez-vous consulter ? (Dr ...)"
                : "Which practitioner would you like to see? (Dr ...)";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // 1.5 Resolve Practitioner ID
        // 1.5 Résoudre l'ID du praticien
        const practitioner = await this.resolvePractitioner(
            conversation.clinic_id,
            appt.practitioner_name
        );

        if (!practitioner) {
            // Doctor named but not found -> Ask for clarification or list available doctors
            const doctors = await prisma.practitioner.findMany({
                where: { clinic_id: conversation.clinic_id, is_active: true }
            });
            const doctorList = doctors.map(d => `Dr ${d.last_name}`).join(', ');

            // Capture name for the message before clearing
            const invalidName = appt.practitioner_name;

            // CLEAR invalid name so we don't loop
            if (context.appointment) {
                context.appointment.practitioner_name = undefined;
                await this.updateContext(conversationId, context);
            }

            const msg = language === 'fr'
                ? `Désolé, je ne trouve pas de "${invalidName}". Voici nos médecins : ${doctorList}.`
                : `Sorry, I can't find "${invalidName}". Here are our doctors: ${doctorList}.`;
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // Update context with resolved ID
        context.appointment!.practitioner_id = practitioner.id;
        await this.updateContext(conversationId, context);

        if (!appt.date || !appt.time) {
            // Need date/time - be specific
            let msg: string;
            if (language === 'fr') {
                if (!appt.date && !appt.time) {
                    msg = `À quelle date et quelle heure souhaitez-vous voir le Dr ${practitioner.last_name} ?`;
                } else if (!appt.date) {
                    msg = `Pour quelle date souhaitez-vous votre rendez-vous avec le Dr ${practitioner.last_name} ?`;
                } else {
                    msg = `À quelle heure souhaitez-vous venir le ${appt.date} avec le Dr ${practitioner.last_name} ?`;
                }
            } else {
                if (!appt.date && !appt.time) {
                    msg = `What date and time would you like to see Dr ${practitioner.last_name}?`;
                } else if (!appt.date) {
                    msg = `What date would you like for your appointment with Dr ${practitioner.last_name}?`;
                } else {
                    msg = `What time would you like to come on ${appt.date} with Dr ${practitioner.last_name}?`;
                }
            }
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        if (!appt.type) {
            // Need type
            const msg = language === 'fr'
                ? "Quel est le motif de la consultation ? (Ex: Suivi, Urgence, Contrôle...)"
                : "What is the reason for the visit? (Ex: Follow-up, Emergency, Check-up...)";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // 2. Parse Date and Time
        // 2. Analyser la date et l'heure
        let dateStr = context.appointment?.date || '';
        const timeStr = context.appointment?.time || '';

        // Anti-hallucination: detect and clear placeholders like [DATE_CALC_...]
        if (dateStr.includes('[') || timeStr.includes('[')) {
            console.log(`[DEBUG] Hallucinated placeholder detected: Date=${dateStr}, Time=${timeStr}. Clearing.`);
            if (context.appointment) {
                if (dateStr.includes('[')) context.appointment.date = undefined;
                if (timeStr.includes('[')) context.appointment.time = undefined;
                await this.updateContext(conversationId, context);
            }
            const msg = language === 'fr'
                ? "Désolé, je n'ai pas compris la date ou l'heure. Pourriez-vous me les préciser ?"
                : "Sorry, I didn't catch the date or time. Could you please specify them?";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // Handle DD/MM/YYYY to YYYY-MM-DD conversion if needed
        if (dateStr.includes('/') && dateStr.split('/').length === 3) {
            const parts = dateStr.split('/');
            if (parts[2].length === 4) { // YYYY is last
                dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
        }

        const startDateTime = parseInTimezone(dateStr, timeStr, clinic.timezone || 'Europe/Paris');
        const endDateTime = new Date(startDateTime.getTime() + 30 * 60000); // Default 30 min

        if (isNaN(startDateTime.getTime())) {
            const msg = language === 'fr'
                ? `Désolé, je n'ai pas pu valider la date (${dateStr}) ou l'heure (${timeStr}).`
                : `Sorry, I couldn't validate the date (${dateStr}) or time (${timeStr}).`;
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // Check if date is in the past
        if (startDateTime < new Date()) {
            const msg = language === 'fr'
                ? "Désolé, cette date est déjà passée. Veuillez choisir un créneau futur."
                : "Sorry, this date is in the past. Please choose a future slot.";
            await this.saveAssistantMessage(conversationId, msg);
            return msg;
        }

        // 3. Check Availability
        // 3. Vérifier la disponibilité
        const isAvailable = await calendarService.checkAvailability(
            practitioner.id,
            startDateTime,
            endDateTime
        );

        if (isAvailable) {
            // 4. Update/Create Patient Profile
            const patient = await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, context);

            // 5. Create Event
            const patientName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'WhatsApp Patient';
            const eventId = await calendarService.createEvent(
                practitioner.id,
                patientName,
                conversation.user_phone,
                startDateTime,
                endDateTime,
                context.appointment?.type || 'Consultation',
                clinic.timezone || 'Europe/Paris'
            );

            if (eventId) {
                // Save to database
                await prisma.appointment.create({
                    data: {
                        practitioner_id: practitioner.id,
                        patient_id: patient.id,
                        start_time: startDateTime,
                        end_time: endDateTime,
                        google_event_id: eventId,
                        status: 'CONFIRMED'
                    }
                });

                // Clear context after completion
                await this.updateContext(conversationId, {});
                await this.transitionToState(conversationId, ConversationState.COMPLETED);

                // Check if this is the patient's first appointment at this clinic
                const appointmentCount = await prisma.appointment.count({
                    where: {
                        patient_id: patient.id,
                        practitioner: {
                            clinic_id: BigInt(0) > 0 ? "" : conversation.clinic_id // clinic_id filter
                        }
                    }
                });

                const formattedDate = formatDateFromDate(startDateTime, language as 'fr' | 'en', clinic.timezone || 'Europe/Paris');
                let baseMsg = language === 'fr'
                    ? `Parfait ! Votre rendez-vous avec le Dr ${practitioner.last_name} est confirmé pour le ${formattedDate}.`
                    : `Perfect! Your appointment with Dr ${practitioner.last_name} is confirmed for ${formattedDate}.`;

                // If first appointment, add onboarding link if available
                if (appointmentCount <= 1 && (clinic as any).onboarding_form_url) {
                    const onboardingMsg = language === 'fr'
                        ? `\n\nComme il s'agit de votre premier rendez-vous, nous avons besoin d'un complément d'information. Merci de remplir obligatoirement ce formulaire avant votre venue : ${(clinic as any).onboarding_form_url}`
                        : `\n\nAs this is your first appointment, we need some additional information. Please complete this mandatory form before your visit: ${(clinic as any).onboarding_form_url}`;
                    baseMsg += onboardingMsg;
                }

                return baseMsg;
            }
        }

        // 5. Handling unvailability: suggest other slots
        const availableSlots = await calendarService.getAvailableSlots(practitioner.id, startDateTime);
        const preference = context.appointment?.time_preference;

        let filteredSlots = availableSlots;
        if (preference) {
            filteredSlots = availableSlots.filter(slot => {
                const hour = slot.start.getHours();
                if (preference === 'MORNING') return hour < 12;
                if (preference === 'AFTERNOON') return hour >= 12;
                return true;
            });
        }

        // Fallback to all slots if none found for preference
        if (filteredSlots.length === 0) filteredSlots = availableSlots;

        const suggestion = filteredSlots.slice(0, 3).map(slot => {
            return slot.start.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        }).join(', ');

        return language === 'fr'
            ? `Malheureusement, ce créneau n'est plus disponible. Voici les prochaines disponibilités pour ce jour-là${preference ? (preference === 'MORNING' ? ' le matin' : " l'après-midi") : ''} : ${suggestion}. Est-ce qu'un de ces créneaux vous convient ?`
            : `Unfortunately, this slot is no longer available. Here are the next availabilities for that day${preference ? (preference === 'MORNING' ? ' in the morning' : ' in the afternoon') : ''}: ${suggestion}. Does one of these work for you?`;
    }

    // Helper to find practitioner by name within a clinic
    // Aide pour trouver un praticien par son nom dans une clinique
    private async resolvePractitioner(clinicId: string, name?: string) {
        if (!name) return null;

        // Simple fuzzy search (case-insensitive)
        const practitioners = await prisma.practitioner.findMany({
            where: { clinic_id: clinicId, is_active: true }
        });

        const searchName = name.toLowerCase();
        return practitioners.find(p => {
            const fullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
            const lastName = (p.last_name || '').toLowerCase();
            // Check if searchName contains lastName OR if searchName is contained in fullName
            return searchName.includes(lastName) || fullName.includes(searchName);
        });
    }

    // Merge context with new entities
    // Fusionner le contexte avec les nouvelles entités
    private mergeContext(
        existing: ConversationContext,
        entities: LLMResponse['entities'],
        isAmbiguous: boolean = false
    ): ConversationContext {
        const merged: ConversationContext = {
            patient: {
                ...existing.patient,
                first_name: entities.first_name || existing.patient?.first_name,
                last_name: entities.last_name || existing.patient?.last_name,
                birth_date: entities.birth_date || existing.patient?.birth_date,
                email: entities.email || existing.patient?.email,
                phone: entities.phone || existing.patient?.phone,
            },
            appointment: {
                ...existing.appointment,
                type: entities.appointment_type || existing.appointment?.type,
                date: (entities.date && entities.time && existing.rejected_times?.includes(`${entities.date} ${entities.time}`))
                    ? existing.appointment?.date
                    : (entities.date || existing.appointment?.date),
                time: (entities.date && entities.time && existing.rejected_times?.includes(`${entities.date} ${entities.time}`))
                    ? existing.appointment?.time
                    : (entities.time || existing.appointment?.time),
                time_preference: entities.time_preference || existing.appointment?.time_preference,
                practitioner_name: entities.practitioner || existing.appointment?.practitioner_name,
            },
            ambiguity_count: isAmbiguous ? (existing.ambiguity_count || 0) + 1 : 0,
            pending_action: existing.pending_action, // CRITICAL: Preserve pending action
            rejected_times: existing.rejected_times,
        };

        // If we have a practitioner_id in context, keep it if the name hasn't changed
        if (existing.appointment?.practitioner_id && !entities.practitioner) {
            merged.appointment!.practitioner_id = existing.appointment.practitioner_id;
        }

        return merged;
    }

    // Suggest available slots based on time preference (morning/afternoon)
    private async suggestSlots(
        conversationId: string,
        context: ConversationContext,
        language: string,
        clinic: any
    ): Promise<string> {
        const practitionerId = context.appointment?.practitioner_id;
        const dateStr = context.appointment?.date;
        const preference = context.appointment?.time_preference;

        if (!practitionerId || !dateStr || !preference) return "";

        // Parse date for slot fetching
        const dateParts = dateStr.split('-');
        const date = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));

        const slots = await calendarService.getAvailableSlots(practitionerId, date);
        const timezone = clinic?.timezone || 'Europe/Paris';

        // Filter by preference
        const filteredSlots = slots.filter(slot => {
            const hour = slot.start.getHours();
            if (preference === 'MORNING') return hour < 12;
            if (preference === 'AFTERNOON') return hour >= 12;
            return true;
        });

        if (filteredSlots.length === 0) {
            const period = language === 'fr'
                ? (preference === 'MORNING' ? 'le matin' : "l'après-midi")
                : (preference === 'MORNING' ? 'the morning' : 'the afternoon');

            return language === 'fr'
                ? `Désolé, il n'y a plus de disponibilités ${period} le ${dateStr}. Souhaitez-vous un autre moment ?`
                : `Sorry, there are no availabilities in ${period} on ${dateStr}. Would you like another time?`;
        }

        const suggestion = filteredSlots.slice(0, 3).map(slot => {
            return slot.start.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
        }).join(', ');

        const periodFr = preference === 'MORNING' ? 'le matin' : "l'après-midi";
        const periodEn = preference === 'MORNING' ? 'the morning' : 'the afternoon';

        return language === 'fr'
            ? `C'est noté. Voici des créneaux disponibles ${periodFr} le ${dateStr} : ${suggestion}. Lequel vous convient ?`
            : `Duly noted. Here are some available slots in ${periodEn} on ${dateStr}: ${suggestion}. Which one works for you?`;
    }

    // Detect if appointment type indicates urgency
    // Détecter si le motif indique une urgence
    private isUrgentAppointment(appointmentType: string): boolean {
        const urgentKeywords = [
            'urgence', 'urgent', 'douleur', 'mal', 'souffre', 'saigne', 'sang', 'cassé', 'fracture',
            'emergency', 'pain', 'hurt', 'bleeding', 'broken', 'severe', 'intense'
        ];

        const lowerType = appointmentType.toLowerCase();
        return urgentKeywords.some(keyword => lowerType.includes(keyword));
    }

    // Get minimum delay in days based on patient status and urgency
    // Obtenir le délai minimum en jours selon le statut du patient et l'urgence
    private async getMinimumBookingDelay(
        conversationId: string,
        context: ConversationContext
    ): Promise<number> {
        const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId }
        });

        if (!conversation) return 2; // Default

        const patient = await prisma.patient.findUnique({
            where: {
                clinic_id_phone: {
                    clinic_id: conversation.clinic_id,
                    phone: conversation.user_phone
                }
            },
            include: {
                appointments: {
                    where: {
                        status: { in: ['CONFIRMED', 'COMPLETED'] }
                    },
                    take: 1
                }
            }
        });

        const isNewPatient = !patient || patient.appointments.length === 0;
        const isUrgent = context.appointment?.type ? this.isUrgentAppointment(context.appointment.type) : false;

        console.log(`[BOOKING DELAY] New patient: ${isNewPatient}, Urgent: ${isUrgent}`);

        if (isUrgent) {
            return 0; // Can book same day if urgent
        }

        if (isNewPatient) {
            return 2; // Minimum 48h for new patients
        }

        // Existing patients: prefer 2 days but can book same day
        return 0; // Allow same day for existing patients
    }

    // Filter slots based on minimum booking delay
    // Filtrer les créneaux selon le délai minimum de réservation
    private filterSlotsByDelay(
        slots: { date: string; time: string; display: string }[],
        minDays: number
    ): { date: string; time: string; display: string }[] {
        if (minDays === 0) return slots;

        const now = new Date();
        const minDate = new Date(now);
        minDate.setDate(minDate.getDate() + minDays);
        minDate.setHours(0, 0, 0, 0);

        return slots.filter(slot => {
            const slotDate = new Date(slot.date);
            slotDate.setHours(0, 0, 0, 0);
            return slotDate >= minDate;
        });
    }

    // Transition to new state
    // Transition vers un nouvel état
    private async transitionToState(conversationId: string, newState: ConversationState) {
        console.log(`[DEBUG] State Transition: from ID ${conversationId} to ${newState}`);

        await prisma.conversation.update({
            where: { id: conversationId },
            data: { current_state: newState },
        });

        const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

        await logService.info(
            'CONVERSATION',
            'STATE_CHANGE',
            `Transitioned conversation to ${newState}`,
            {
                conversation_id: conversationId,
                clinic_id: conversation?.clinic_id,
                metadata: {
                    previous_state: conversation?.current_state, // Note: findUnique fetches *updated* so previous isn't strict here without fetch before.
                    new_state: newState
                }
            }
        );
    }

    // Update context
    // Mettre à jour le contexte
    private async updateContext(conversationId: string, context: ConversationContext) {
        await prisma.conversation.update({
            where: { id: conversationId },
            data: { context_data: context as any },
        });
    }

    // Save assistant message
    // Sauvegarder le message de l'assistant
    private async saveAssistantMessage(conversationId: string, content: string) {
        console.log(`\n========== ASSISTANT RESPONSE ==========`);
        console.log(`[ASSISTANT] "${content}"`);
        console.log(`========================================\n`);

        await prisma.message.create({
            data: {
                conversation_id: conversationId,
                role: 'assistant',
                content,
            },
        });
    }

    // Update patient record with context data
    private async updatePatientRecord(clinicId: string, phone: string, context: ConversationContext) {
        let birthDate: Date | null = null;
        if (context.patient?.birth_date) {
            const dateStr = context.patient.birth_date;
            // 1. Precise check for YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                birthDate = new Date(dateStr);
            }
            // 2. Secondary fallback for DD/MM/YYYY
            else {
                const parts = dateStr.split(/[-/.\s]/);
                if (parts.length === 3) {
                    // Check if it's DD/MM/YYYY
                    if (parts[0].length <= 2 && parts[2].length === 4) {
                        birthDate = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`);
                    }
                    // Check if it's YYYY/MM/DD
                    else if (parts[0].length === 4) {
                        birthDate = new Date(`${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`);
                    }
                }
            }

            // 3. Final attempt with natural language parsing for French/English months (briefly)
            if (!birthDate || isNaN(birthDate.getTime())) {
                const lower = dateStr.toLowerCase();
                const monthsFr = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
                const monthsEn = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

                let foundMonth = -1;
                for (let i = 0; i < 12; i++) {
                    if (lower.includes(monthsFr[i]) || lower.includes(monthsEn[i])) {
                        foundMonth = i + 1;
                        break;
                    }
                }

                if (foundMonth !== -1) {
                    const dayMatch = lower.match(/(\d{1,2})/);
                    const yearMatch = lower.match(/(\d{4})/);
                    if (dayMatch && yearMatch) {
                        birthDate = new Date(`${yearMatch[1]}-${foundMonth.toString().padStart(2, '0')}-${dayMatch[1].padStart(2, '0')}`);
                    }
                }
            }
        }

        // Fetch existing patient to check for locked fields
        const existingPatient = await prisma.patient.findUnique({
            where: {
                clinic_id_phone: {
                    clinic_id: clinicId,
                    phone: phone
                }
            }
        });

        // Locked fields logic: if they exist in DB, don't overwrite them
        const updateData: any = {};
        if (context.patient?.first_name && !existingPatient?.first_name) updateData.first_name = context.patient.first_name;
        if (context.patient?.last_name && !existingPatient?.last_name) updateData.last_name = context.patient.last_name;
        if (context.patient?.email && !existingPatient?.email) updateData.email = context.patient.email;
        if (context.patient?.insurance_card_url && !existingPatient?.insurance_card_url) updateData.insurance_card_url = context.patient.insurance_card_url;
        if (birthDate && !isNaN(birthDate.getTime()) && !existingPatient?.birth_date) updateData.birth_date = birthDate;

        // Social insurance fields - always update if present
        if (context.patient?.has_social_insurance !== undefined) updateData.has_social_insurance = context.patient.has_social_insurance;
        if (context.patient?.social_insurance_type) updateData.social_insurance_type = context.patient.social_insurance_type;
        if (context.patient?.beneficiary_number) updateData.beneficiary_number = context.patient.beneficiary_number;
        if (context.patient?.guarantee_number) updateData.guarantee_number = context.patient.guarantee_number;
        if (context.patient?.guarantee_document_path) updateData.guarantee_document_path = context.patient.guarantee_document_path;

        // Note: preferred_language is now managed at the beginning of processMessageWithSophie

        return await prisma.patient.upsert({
            where: {
                clinic_id_phone: {
                    clinic_id: clinicId,
                    phone: phone
                }
            },
            update: updateData,
            create: {
                clinic_id: clinicId,
                phone: phone,
                first_name: context.patient?.first_name,
                last_name: context.patient?.last_name,
                email: context.patient?.email,
                insurance_card_url: context.patient?.insurance_card_url,
                birth_date: birthDate && !isNaN(birthDate.getTime()) ? birthDate : undefined,
                has_social_insurance: context.patient?.has_social_insurance,
                social_insurance_type: context.patient?.social_insurance_type,
                beneficiary_number: context.patient?.beneficiary_number,
                guarantee_number: context.patient?.guarantee_number,
                guarantee_document_path: context.patient?.guarantee_document_path,
                // preferred_language is set at first message in processMessageWithSophie
            }
        });
    }

    // Helper methods for Sophie integration
    // Méthodes auxiliaires pour l'intégration Sophie

    private async askForBirthDate(conversationId: string, context: ConversationContext, refetchedPatient: any, language: string): Promise<string> {
        await this.transitionToState(conversationId, ConversationState.COLLECTING_PATIENT_DATA);
        const namePart = context.patient?.first_name || refetchedPatient?.first_name || "";
        const msg = language === 'fr'
            ? `Ravie de faire votre connaissance, ${namePart}. Quelle est votre date de naissance (JJ/MM/AAAA) ?`
            : `Nice to meet you, ${namePart}. What is your date of birth (DD/MM/YYYY)?`;
        await this.saveAssistantMessage(conversationId, msg);
        return msg;
    }

    // Get client information
    // Récupérer les informations du client
    private async getClientInfo(phone: string) {
        try {
            const patient = await prisma.patient.findFirst({
                where: { phone },
                include: {
                    clinic: true
                }
            });

            if (patient) {
                return {
                    id: patient.id,
                    name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim(),
                    phone: patient.phone,
                    first_name: patient.first_name || undefined,
                    last_name: patient.last_name || undefined,
                    defaultDoctorId: undefined // Not available in current schema
                };
            }
        } catch (error) {
            console.error('Error getting client info:', error);
        }
        return null;
    }

    // Get client's appointments
    // Récupérer les rendez-vous du client
    private async getClientAppointments(phone: string) {
        try {
            const patient = await prisma.patient.findFirst({
                where: { phone }
            });

            if (patient) {
                const appointments = await prisma.appointment.findMany({
                    where: {
                        patient_id: patient.id,
                        start_time: {
                            gte: new Date() // Future appointments only
                        },
                        status: 'CONFIRMED'
                    },
                    include: { practitioner: true },
                    orderBy: { start_time: 'asc' },
                    take: 5
                });

                return appointments.map(apt => ({
                    id: apt.id,
                    dateTime: apt.start_time,
                    start_time: apt.start_time,
                    end_time: apt.end_time,
                    status: apt.status,
                    practitioner: apt.practitioner
                }));
            }
        } catch (error) {
            console.error('Error getting client appointments:', error);
        }
        return [];
    }

    // Handle extracted entities
    // Gérer les entités extraites
    private async handleEntities(conversationId: string, entities: any) {
        try {
            // Get conversation
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId }
            });

            if (!conversation) return;

            // Update context with entities
            const currentContext = conversation.context_data as ConversationContext || {};

            // Name splitting fallback: if one part is missing but the other contains a space
            if (entities.first_name && !entities.last_name && entities.first_name.trim().includes(' ')) {
                const parts = entities.first_name.trim().split(/\s+/);
                entities.first_name = parts[0];
                entities.last_name = parts.slice(1).join(' ');
            } else if (entities.last_name && !entities.first_name && entities.last_name.trim().includes(' ')) {
                const parts = entities.last_name.trim().split(/\s+/);
                entities.first_name = parts[0];
                entities.last_name = parts.slice(1).join(' ');
            }

            const updatedContext = this.mergeContext(currentContext, entities);

            await this.updateContext(conversationId, updatedContext);

            // Update patient record if we have personal info
            if (entities.first_name || entities.last_name || entities.birth_date) {
                await this.updatePatientRecord(conversation.clinic_id, conversation.user_phone, updatedContext);
            }

        } catch (error) {
            console.error('Error handling entities:', error);
        }
    }
}

export const conversationManager = new ConversationManager();
