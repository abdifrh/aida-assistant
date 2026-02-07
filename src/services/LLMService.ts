import axios from 'axios';
import { z } from 'zod';
import { config } from '../config';
import { Intent, LLMResponse } from '../types/conversation';
import { logService } from './LogService';

// Zod schema for strict validation
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

export class LLMService {

    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY_MS = 1000;

    /**
     * Appel HTTP avec retry automatique sur erreur réseau
     * @param requestFn - Fonction qui fait l'appel axios
     * @param operation - Nom de l'opération pour les logs
     */
    private async callWithRetry<T>(
        requestFn: () => Promise<T>,
        operation: string
    ): Promise<T> {
        let lastError: any;

        for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
            try {
                return await requestFn();
            } catch (error: any) {
                lastError = error;

                const isRetryable =
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ETIMEDOUT' ||
                    error.code === 'ECONNABORTED' || // Axios timeout
                    error.code === 'ECONNRESET' ||
                    error.response?.status === 500 ||
                    error.response?.status === 503 ||
                    error.response?.status === 504;

                if (!isRetryable || attempt === this.MAX_RETRIES) {
                    // Erreur non retryable ou dernière tentative
                    throw error;
                }

                await logService.warn('LLM', 'RETRY_ATTEMPT', `${operation} failed, retrying (${attempt}/${this.MAX_RETRIES})`, {
                    metadata: {
                        attempt,
                        errorCode: error.code,
                        errorMessage: error.message,
                        statusCode: error.response?.status
                    }
                });

                // Attendre avant le prochain essai (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * attempt));
            }
        }

        throw lastError;
    }

    // Generate natural conversation response as Sophie
    async generateNaturalResponse(
        userMessage: string,
        contextPrompt: string,
        conversationHistory: { role: string; content: string }[] = [],
        language: string = 'fr'
    ): Promise<string | null> {
        try {
            await logService.info('LLM', 'GENERATE_NATURAL_START', 'Generating natural response', {
                metadata: { userMessage, conversationHistoryLength: conversationHistory.length }
            });

            const messages = [
                { role: 'system', content: contextPrompt },
                ...conversationHistory,
                { role: 'user', content: userMessage },
            ];

            const response = await this.callWithRetry(
                () => axios.post(
                    config.llmApiUrl.replace('/generate', '/chat'),
                    {
                        model: config.llmModelName,
                        messages,
                        stream: false,
                        options: {
                            temperature: 0.1,
                        },
                    },
                    { timeout: 30000 }
                ),
                'generateNaturalResponse'
            );

            let content = response.data?.message?.content || response.data?.response || null;

            // Handle potential JSON output from the LLM model
            if (content && typeof content === 'string' && content.trim().startsWith('{')) {
                try {
                    const parsed = JSON.parse(content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, ''));
                    content = parsed.response_message || content;
                } catch (e) {
                    // Not valid JSON, keep as is
                }
            }

            await logService.info('LLM', 'GENERATE_NATURAL_SUCCESS', 'Natural response generated', {
                metadata: { response: content }
            });

            return content;
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED') {
                console.error('[LLM] Ollama server is not running. Please start Ollama with: ollama serve');
                await logService.error('LLM', 'GENERATE_NATURAL_ERROR', 'Ollama server is not running', error);
            } else if (error.response?.status === 500) {
                console.error(`[LLM] Ollama returned 500 error. The model might not be loaded. Try: ollama run ${config.llmModelName}`);
                await logService.error('LLM', 'GENERATE_NATURAL_ERROR', 'Ollama 500 error - model may not be loaded', error);
            } else {
                await logService.error('LLM', 'GENERATE_NATURAL_ERROR', 'Error generating natural response', error);
            }
            return null;
        }
    }

    // Extract entities in JSON format for structured processing
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

            // Priority: use the human-readable local time passed in context if available
            // Priority: use the human-readable local time passed in context if available
            // Format example: "Vendredi 23/01/2026 à 19:35"
            const now = new Date();
            const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
            const dayName = dayNames[now.getDay()];
            const dateStr = now.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' });
            const timeStr = now.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

            const currentDateTime = context?.structuredContext?.currentDateTime || `${dayName} ${dateStr} à ${timeStr}`;

            const extractionPrompt = `USER_MESSAGE: "${userMessage}"
LAST_ASSISTANT_MESSAGE: "${context?.lastAssistantMessage || ''}"
CLINIC_NAME: "${clinicName}"
CURRENT_LANGUAGE: "${language}"
CURRENT_DATE_TIME: "${currentDateTime}"
CURRENT_CONTEXT: ${JSON.stringify(context || {})}`;

            const intentOptions = Object.values(Intent).join(' | ');

            const systemPrompt = `You are Sophie, a professional medical secretary. Your role is to extract information and respond naturally.

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
- HALLUCINATION WARNING: Never invent a date or time (like "lundi 10h") if it wasn't provided by the user in the latest message.
- CLINIC HOURS: Always check the 'opening_hours' in CURRENT_CONTEXT. If an appointment was previously rejected as being outside business hours, DO NOT suggest it again.
- OPENING STATUS: If user asks if you are open "now" or "today", look at IS_CLINIC_OPEN_NOW and 'opening_hours' in CURRENT_CONTEXT. If it is Sunday and you are closed, start with "No, we are closed today (Sunday)" then list hours.
- DATE PARSING RULES:
  * "semaine prochaine" / "next week" = Start of NEXT week (the Monday following the current week). For example, if today is Monday Feb 2, "next week" = Monday Feb 9.
  * "cette semaine" / "this week" = A day in the current week.
  * If user says "semaine prochaine" without specifying a day, DO NOT automatically choose a date. Leave entities.date empty to prompt the user to specify which day.
  * CRITICAL: When calculating "next week", add 7+ days to get to the following week, NOT the current week.
  * NEVER select a Sunday (day 0) unless the user explicitly says "dimanche" or "Sunday".
  * DAY + NUMBER DISAMBIGUATION:
    - "vendredi 13" / "Friday 13th" = The day name + day of month (extract as date: 2026-02-13, NOT time: 13:00)
    - "lundi 10" / "Monday 10th" = The day name + day of month (extract as date: 2026-02-10, NOT time: 10:00)
    - RULE: If a number 1-31 follows a day name (lundi, mardi, etc.), it's the DAY OF MONTH, not the time
    - Only treat it as time if followed by "h", ":", "heures" (e.g., "13h", "13:00", "13 heures")
  * KEEP EXISTING TIME:
    - If user only provides a new date (no time mentioned), keep the previously set time from CURRENT_CONTEXT
    - If user only provides a new time (no date mentioned), keep the previously set date from CURRENT_CONTEXT
    - Example: If appointment was "12 Feb at 11:00" and user says "vendredi 13" -> result should be "13 Feb at 11:00" (keep 11:00)
- INTENT CLASSIFICATION:
  * If the user says "take", "book", "rdv", "rendez-vous" -> intent is BOOK_APPOINTMENT.
  * If the user says "change", "move", "reschedule", "modify", "à la place" -> intent is MODIFY_APPOINTMENT.
  * IMPORTANT: If the state is COLLECTING_PATIENT_DATA and the user provides a birth date (e.g., "15/05/1980"), use intent INFORMATION and put it in entities.birth_date. DO NOT use MODIFY_APPOINTMENT just because it's a date.
  * IMPORTANT: If the user provides a new date/time while already in a booking flow, keep intent as BOOK_APPOINTMENT. DO NOT switch to MODIFY_APPOINTMENT unless they explicitly ask to change an EXISTING appointment.
- TIME PREFERENCE: If the user says "morning", "matin", "tôt" -> time_preference = MORNING. If the user says "afternoon", "après-midi", "soir" -> time_preference = AFTERNOON.
- CORRECTIONS & MODIFICATIONS (CRITICAL):
  * If user says "Non" / "Nan" / "No" followed by new info -> it's a CORRECTION, not a confirmation
  * Examples: "Nan à 10h" = correction to 10h, "Non demain" = correction to tomorrow
  * When user corrects, extract the NEW information and set intent to BOOK_APPOINTMENT (continue booking flow)
  * NEVER say "C'est entendu" or "OK" after a correction - ask for confirmation of the NEW information
  * If LAST_ASSISTANT_MESSAGE contains a confirmation question and user says "Non/Nan" + info -> extract the correction
- HISTORY VS NEW MESSAGE: Only extract what is in the NEWEST USER_MESSAGE. If the USER_MESSAGE is a correction (like "Non, à 14h"), extract the new information and ignore the old one.
- If GREETING: Respond with a brief welcome and ask how to help.
- If confirming: Only confirm the EXACT data provided in USER_MESSAGE or CURRENT_CONTEXT. ALWAYS use the patient's real name if known.`;

            const response = await this.callWithRetry(
                () => axios.post(
                    config.llmApiUrl.replace('/generate', '/chat'),
                    {
                        model: config.llmModelName,
                        messages: [
                            { role: 'system', content: systemPrompt },
                            { role: 'user', content: extractionPrompt },
                        ],
                        stream: false,
                        format: 'json',
                        options: { temperature: 0.0 },
                    },
                    { timeout: 90000 }
                ),
                'extractEntities'
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
                // Fallback to avoid complete failure
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
        } catch (error: any) {
            if (error.code === 'ECONNREFUSED') {
                console.error('[LLM] Ollama server is not running. Please start Ollama with: ollama serve');
                await logService.error('LLM', 'EXTRACT_ENTITIES_ERROR', 'Ollama server is not running', error);
            } else if (error.response?.status === 500) {
                console.error(`[LLM] Ollama returned 500 error. The model might not be loaded. Try: ollama run ${config.llmModelName}`);
                await logService.error('LLM', 'EXTRACT_ENTITIES_ERROR', 'Ollama 500 error - model may not be loaded', error);
            } else {
                await logService.error('LLM', 'EXTRACT_ENTITIES_ERROR', 'Entity extraction error', error);
            }
            return null;
        }
    }

    async generateResponse(
        userMessage: string,
        clinicName: string,
        conversationHistory: { role: string; content: string }[] = [],
        language: string = 'fr',
        context: any = null
    ): Promise<LLMResponse | null> {
        return this.extractEntities(userMessage, clinicName, language, context);
    }

    async generateSimpleMessage(prompt: string, language: string = 'fr'): Promise<string | null> {
        try {
            const response = await this.callWithRetry(
                () => axios.post(
                    config.llmApiUrl.replace('/generate', '/chat'),
                    {
                        model: config.llmModelName,
                        messages: [
                            { role: 'system', content: `Sophie, secrétaire médicale. Réponds naturellement en ${language}.` },
                            { role: 'user', content: prompt },
                        ],
                        stream: false,
                    },
                    { timeout: 30000 }
                ),
                'generateSimpleMessage'
            );
            return response.data?.message?.content || response.data?.response || null;
        } catch (error) {
            return null;
        }
    }

    // New: Deep conversation analysis
    async analyzeConversation(messages: { role: string; content: string }[]): Promise<any | null> {
        try {
            const historyText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n');

            const analysisPrompt = `Analyze the following medical secretary conversation between Sophie (Assistant) and a Patient.
            
            CONVERSATION:
            ${historyText}
            
            STRICT JSON OUTPUT:
            {
                "summary": "Short summary of the exchange",
                "sentiment": "Patient sentiment (POSITIVE|NEUTRAL|NEGATIVE|FRUSTRATED)",
                "intent_detected": "Main intent",
                "data_extracted": {
                    "patient_identity": "COMPLETE|INCOMPLETE",
                    "appointment_details": "COMPLETE|INCOMPLETE|NOT_RELEVANT"
                },
                "satisfaction_score": "Score from 1 to 10",
                "recommendation": "Management recommendation for the clinic",
                "potential_issues": ["Issue 1", "Issue 2"]
            }`;

            const response = await this.callWithRetry(
                () => axios.post(
                    config.llmApiUrl.replace('/generate', '/chat'),
                    {
                        model: config.llmModelName,
                        messages: [
                            { role: 'system', content: "You are an expert medical manager analyzing secretary performance and patient satisfaction. Return ONLY JSON." },
                            { role: 'user', content: analysisPrompt },
                        ],
                        format: 'json',
                        options: { temperature: 0.1 }
                    },
                    { timeout: 30000 }
                ),
                'analyzeConversation'
            );

            let content = response.data?.message?.content || response.data?.response;
            if (!content) return null;

            if (typeof content === 'string') {
                // Remove potential markdown block markers
                content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                try {
                    return JSON.parse(content);
                } catch (e) {
                    console.error('[LLM] Failed to parse analysis JSON:', content);
                    return null;
                }
            }
            return content;
        } catch (error) {
            console.error('Conversation analysis error:', error);
            return null;
        }
    }

    // New: Complete conversation analysis with context and logs
    async analyzeConversationComplete(
        messages: { role: string; content: string }[],
        context: any,
        logs: any[]
    ): Promise<any | null> {
        try {
            console.log('[DEBUG LLM] analyzeConversationComplete called');
            console.log('[DEBUG LLM] Messages count:', messages.length);
            console.log('[DEBUG LLM] Logs count:', logs.length);

            const historyText = messages.map((m, idx) => `[Message #${idx + 1}] ${m.role.toUpperCase()}: ${m.content}`).join('\n');
            console.log('[DEBUG LLM] History text length:', historyText.length);

            const logsText = logs.length > 0
                ? logs.map(log => `[${log.created_at.toISOString()}] [${log.level}] ${log.category}: ${log.message}`).join('\n')
                : 'Aucun log système disponible.';

            const patientInfoText = context.patient_info
                ? `- Nom: ${context.patient_info.name}\n- Carte d'assurance: ${context.patient_info.has_insurance ? 'Oui' : 'Non'}\n- Nombre de RDV: ${context.patient_info.appointments_count}\n- RDV récents: ${JSON.stringify(context.patient_info.recent_appointments, null, 2)}`
                : 'Pas d\'informations patient disponibles';

            const contextText = `État de la conversation: ${context.conversation_state}
Langue détectée: ${context.detected_language}
Messages totaux: ${context.total_messages}
Plage analysée: ${context.selected_range}
Clinique: ${context.clinic_name}

PATIENT INFO:
${patientInfoText}

CONTEXT DATA:
${JSON.stringify(context.context_data, null, 2)}`;

            const patientInfoStr = context.patient_info ? context.patient_info.name : 'Non disponible';
            const conversationStateStr = context.conversation_state;
            const totalMessagesNum = context.total_messages;

            const analysisPrompt = `Tu es Sophie, une assistante médicale IA experte en analyse de conversations. Analyse cette conversation de manière COMPLÈTE et APPROFONDIE.

==== CONTEXTE ====
${contextText}

==== CONVERSATION (${messages.length} messages) ====
${historyText}

==== LOGS SYSTÈME (${logs.length} entrées) ====
${logsText}

==== INSTRUCTIONS ====
Fournis une analyse TRÈS DÉTAILLÉE et COMPLÈTE incluant:

1. Résumé narratif (3-5 paragraphes) : raconte l'histoire de la conversation
2. Sentiment patient : POSITIVE, NEUTRAL, NEGATIVE, ou FRUSTRATED avec justification
3. Intent principal détecté et sous-intents
4. État d'extraction des données (patient_identity et appointment_details)
   IMPORTANT pour appointment_details:
   - Si le CONTEXTE montre des RDV récents avec statut CONFIRMED, alors appointment_details = "COMPLETE"
   - Si la conversation mentionne explicitement un RDV confirmé, alors appointment_details = "COMPLETE"
   - Si l'état de la conversation est "COMPLETED" et qu'il y a un RDV dans recent_appointments, alors appointment_details = "COMPLETE"
   - Sinon, si le RDV n'est pas confirmé ou absent, alors appointment_details = "INCOMPLETE"
5. Score de satisfaction (1-10) avec justification détaillée
6. Recommandations (2-3 recommandations concrètes et actionnables)
7. Points d'attention (liste des problèmes, erreurs, ou blocages)
8. Analyse des logs système (erreurs, warnings, anomalies)
9. Qualité de la conversation (comment Sophie a géré)

Réponds en JSON STRICT. Exemple:
{
    "summary": "Résumé détaillé en plusieurs paragraphes",
    "sentiment": "POSITIVE",
    "sentiment_justification": "Explication",
    "intent_detected": "Intent principal",
    "sub_intents": ["sous-intent 1"],
    "data_extracted": {
        "patient_identity": "COMPLETE",
        "appointment_details": "COMPLETE"
    },
    "satisfaction_score": 8,
    "satisfaction_justification": "Explication",
    "recommendation": "Recommandations",
    "potential_issues": ["Problème 1"],
    "logs_analysis": "Analyse logs",
    "conversation_quality": "Évaluation",
    "context_info": {
        "patient_info": "${patientInfoStr}",
        "conversation_state": "${conversationStateStr}",
        "total_messages": ${totalMessagesNum}
    }
}`;

            console.log('[DEBUG LLM] Calling LLM API at:', config.llmApiUrl.replace('/generate', '/chat'));
            console.log('[DEBUG LLM] Analysis prompt length:', analysisPrompt.length);

            const response = await this.callWithRetry(
                () => axios.post(
                    config.llmApiUrl.replace('/generate', '/chat'),
                    {
                        model: config.llmModelName,
                        messages: [
                            {
                                role: 'system',
                                content: "Tu es Sophie, une assistante médicale IA experte. Tu fournis des analyses COMPLÈTES, DÉTAILLÉES et ACTIONNABLES. Réponds TOUJOURS en JSON valide."
                            },
                            { role: 'user', content: analysisPrompt }
                        ],
                        format: 'json',
                        options: { temperature: 0.2, num_predict: 2000 }
                    },
                    { timeout: 60000 }
                ),
                'analyzeConversationComplete'
            );

            console.log('[DEBUG LLM] LLM API response received');
            console.log('[DEBUG LLM] Response status:', response.status);

            // Handle NDJSON streaming format from Ollama
            let content: string | null = null;

            if (typeof response.data === 'string') {
                console.log('[DEBUG LLM] Response data is string (NDJSON stream), parsing...');
                console.log('[DEBUG LLM] Raw data length:', response.data.length);

                // Split NDJSON stream by newlines and parse each chunk
                const lines = response.data.split('\n').filter(line => line.trim());
                console.log('[DEBUG LLM] Number of JSON chunks:', lines.length);

                let concatenatedContent = '';
                for (const line of lines) {
                    try {
                        const chunk = JSON.parse(line);
                        if (chunk.message?.content) {
                            concatenatedContent += chunk.message.content;
                        }
                    } catch (e) {
                        console.error('[DEBUG LLM] Failed to parse chunk:', line.substring(0, 100));
                    }
                }

                content = concatenatedContent;
                console.log('[DEBUG LLM] Concatenated content length:', content.length);
            } else {
                // Normal JSON response
                content = response.data?.message?.content || response.data?.response;
                console.log('[DEBUG LLM] Normal JSON response, content length:', content?.length);
            }

            if (!content) {
                console.log('[DEBUG LLM] No content extracted from response');
                return null;
            }

            console.log('[DEBUG LLM] Final content length:', content.length);

            if (typeof content === 'string') {
                content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                try {
                    const parsed = JSON.parse(content);
                    return parsed;
                } catch (e) {
                    console.error('[LLM] Failed to parse complete analysis JSON:', content);
                    // Return a basic structure if parsing fails
                    return {
                        summary: content,
                        sentiment: "NEUTRAL",
                        satisfaction_score: 5,
                        data_extracted: { patient_identity: "UNKNOWN", appointment_details: "UNKNOWN" },
                        recommendation: "Analyse non disponible en JSON. Voir le résumé.",
                        potential_issues: ["Erreur de parsing JSON"],
                        context_info: context
                    };
                }
            }
            return content;
        } catch (error) {
            console.error('Complete conversation analysis error:', error);
            return {
                summary: "Erreur lors de l'analyse.",
                sentiment: "NEUTRAL",
                satisfaction_score: 0,
                data_extracted: { patient_identity: "ERROR", appointment_details: "ERROR" },
                recommendation: "L'analyse n'a pas pu être effectuée.",
                potential_issues: ["Erreur technique lors de l'analyse"],
                error: String(error)
            };
        }
    }
}

export const llmService = new LLMService();
