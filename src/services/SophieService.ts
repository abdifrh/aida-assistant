import { LLMService } from './LLMService';
import { getContextualPrompt } from '../utils/contextManager';
import { Client, Appointment } from '../types/conversation';
import { isEmergencyMessage } from '../utils/emergencyFilter';
import { logService } from './LogService';
import { ResponseValidator } from './ResponseValidator';

export interface SophieContext {
    client?: Client | null;
    appointments?: Appointment[];
    state?: any;
    language?: string;
    structuredContext?: any;
}

export class SophieService {
    private llmService: LLMService;

    constructor() {
        this.llmService = new LLMService();
    }

    /**
     * Generate a natural conversational response as Sophie
     * Générer une réponse conversationnelle naturelle comme Sophie
     * Avec validation anti-hallucination et retry
     */
    async generateResponse(
        userMessage: string,
        context: SophieContext,
        conversationHistory: { role: string; content: string }[] = []
    ): Promise<string | null> {
        if (!userMessage || userMessage.trim() === "") return null;

        const MAX_RETRIES = 3;
        let attempts = 0;

        try {
            // Build 4-layer contextual prompt
            // Construire le prompt contextuel en 4 couches
            const contextPrompt = getContextualPrompt(
                context.client,
                context.appointments || [],
                context.state,
                context.language || 'fr',
                userMessage,
                context.structuredContext
            );

            // Retry loop pour générer une réponse valide
            while (attempts < MAX_RETRIES) {
                attempts++;

                // Generate natural response
                // Générer une réponse naturelle
                const response = await this.llmService.generateNaturalResponse(
                    userMessage,
                    contextPrompt,
                    conversationHistory,
                    context.language || 'fr'
                );

                if (!response) {
                    await logService.warn('LLM', 'EMPTY_RESPONSE', `Empty response on attempt ${attempts}/${MAX_RETRIES}`);
                    continue;
                }

                // Valider la réponse avant de l'envoyer
                const validation = await ResponseValidator.validateResponse(
                    response,
                    context.structuredContext || context,
                    userMessage
                );

                if (validation.valid) {
                    // Réponse valide, on l'envoie
                    await logService.info('LLM', 'RESPONSE_VALID', `Valid response generated (attempt ${attempts})`);
                    return response;
                } else {
                    // Réponse invalide, logger et utiliser la réponse sûre
                    await logService.warn('LLM', 'HALLUCINATION_DETECTED', `Hallucination detected: ${validation.reason}`, {
                        metadata: {
                            attempt: attempts,
                            invalidResponse: response,
                            reason: validation.reason
                        }
                    });

                    // Si c'est la dernière tentative ou qu'on a une réponse de remplacement, l'utiliser
                    if (attempts === MAX_RETRIES || validation.suggestedResponse) {
                        await logService.info('LLM', 'USING_SAFE_RESPONSE', 'Using safe replacement response');
                        return validation.suggestedResponse || this.getFallbackResponse(context.language || 'fr');
                    }

                    // Sinon, retry avec un prompt plus strict
                    await logService.info('LLM', 'RETRYING', `Retrying with stricter prompt (attempt ${attempts + 1}/${MAX_RETRIES})`);
                }
            }

            // Si tous les retries échouent, utiliser une réponse de secours
            await logService.warn('LLM', 'MAX_RETRIES_EXCEEDED', `Failed to generate valid response after ${MAX_RETRIES} attempts`);
            return this.getFallbackResponse(context.language || 'fr');

        } catch (error) {
            await logService.error('LLM', 'GENERATION_ERROR', 'Sophie response generation error', error, {
                metadata: { userMessage, state: context.state }
            });
            return null;
        }
    }

    /**
     * Réponse de secours si toutes les tentatives échouent
     */
    private getFallbackResponse(language: string): string {
        return language === 'en'
            ? "I'm here to help you with appointments and questions about the clinic. How can I assist you today?"
            : "Je suis là pour vous aider avec les rendez-vous et les questions sur le cabinet. Comment puis-je vous assister aujourd'hui ?";
    }

    /**
     * Extract entities for structured processing
     * Extraire les entités pour le traitement structuré
     */
    async extractEntities(
        userMessage: string,
        clinicName: string = 'AIDA Medical',
        language: string = 'fr',
        context: any = null
    ) {
        const result = await this.llmService.extractEntities(userMessage, clinicName, language, context);

        if (result && result.entities) {
            // Log extraction result (DEBUG level or INFO if important)
            // Ne pas logger toute la réponse si trop verbeux, mais utile pour debug
            if (Object.keys(result.entities).length > 0) {
                await logService.info('LLM', 'ENTITIES_EXTRACTED', `Extracted intent: ${result.intent}`, {
                    metadata: {
                        intent: result.intent,
                        confidence: result.confidence,
                        entities: result.entities
                    }
                });
            }
        }

        return result;
    }

    /**
     * Check if message needs entity extraction
     * Vérifier si le message nécessite une extraction d'entités
     */
    needsEntityExtraction(message: string): boolean {
        const bookingKeywords = [
            'rendez-vous', 'rdv', 'appointment', 'booking',
            'prendre', 'réserver', 'book', 'schedule',
            'annuler', 'cancel', 'modifier', 'change',
            'demain', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
            'matin', 'après-midi', 'soir', 'morning', 'afternoon', 'evening',
            'bonjour', 'salut', 'hello', 'hi', 'hey',
            'oui', 'non', 'ok', 'd\'accord', 'correct', 'yes', 'no',
            'liste', 'list', 'médecin', 'doctor', 'docteur', 'praticien', 'dr'
        ];

        const lowerMessage = message.toLowerCase();
        // If message is technical or long, always extract
        if (message.length > 20) return true;

        return bookingKeywords.some(keyword => lowerMessage.includes(keyword));
    }

    /**
     * Determine if this is an emergency situation
     * Déterminer s'il s'agit d'une situation d'urgence
     */
    isEmergency(message: string): boolean {
        return isEmergencyMessage(message);
    }

    /**
     * Process a WhatsApp message with full Sophie logic
     * Traiter un message WhatsApp avec la logique complète de Sophie
     */
    async processWhatsAppMessage(
        message: string,
        context: SophieContext
    ): Promise<{
        response: string;
        entities?: any;
        needsBackendAction?: boolean;
    }> {
        try {
            const clinicName = context.structuredContext?.clinicName || 'AIDA Medical';

            // Check if we need entity extraction
            // Vérifier si on a besoin d'extraction d'entités
            if (this.needsEntityExtraction(message)) {
                const entities = await this.extractEntities(message, clinicName, context.language, context.state?.data);

                // Generate natural response using context
                // Générer une réponse naturelle en utilisant le contexte
                const naturalResponse = await this.generateResponse(message, context);

                return {
                    response: naturalResponse || entities?.response_message || "Je traite votre demande de rendez-vous.",
                    entities: entities?.entities,
                    needsBackendAction: entities?.needs_backend_action || false,
                };
            }

            // Simple conversational response
            // Réponse conversationnelle simple
            const response = await this.generateResponse(message, context);

            return {
                response: response || "Comment puis-je vous aider avec vos rendez-vous ?",
                needsBackendAction: false,
            };

        } catch (error) {
            await logService.error('SYSTEM', 'SOPHIE_PROCESS_ERROR', 'Sophie processing error', error);
            return {
                response: "Désolé, j'ai eu un problème technique. Puis-je vous aider avec vos rendez-vous ?",
                needsBackendAction: false,
            };
        }
    }
}

export const sophieService = new SophieService();