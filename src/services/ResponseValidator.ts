import { logService } from './LogService';

/**
 * Service de validation des réponses pour éviter les hallucinations
 * Valide que l'assistant ne donne que des informations vérifiables
 */
export class ResponseValidator {

    /**
     * Mots/phrases interdits qui indiquent une hallucination
     * Ces termes ne doivent JAMAIS apparaître dans une réponse sauf si présents dans le contexte
     */
    private static FORBIDDEN_TERMS = [
        // Parking & stationnement - RENFORCÉ
        { pattern: /parking (gratuit|payant|souterrain|extérieur|derrière|devant|privatif|public|limité|disponible)/i, topic: 'parking_details' },
        { pattern: /(nous|on|il y a|il existe|vous trouverez|dispose|disposons) (un|d'un|du|de) (petit |grand )?parking/i, topic: 'parking_mention' },
        { pattern: /parking(?!.*je ne|n'ai pas|ne dispose pas|contacter|contactez)/i, topic: 'parking' },
        { pattern: /stationn(ement|er)(?!.*je ne|n'ai pas|ne dispose pas|contacter|contactez)/i, topic: 'parking' },

        // Étage & localisation physique - RENFORCÉ
        { pattern: /(rez-de-chaussée|premier étage|deuxième étage|troisième étage|[0-9]ème? étage|[0-9]er étage)/i, topic: 'floor' },
        { pattern: /(située?|situé|se trouve|est situé|est située) (au|à l'|dans le) (rez-de-chaussée|étage|[0-9])/i, topic: 'location_detail' },
        { pattern: /au (rez|premier|deuxième|troisième)/i, topic: 'floor' },

        // Couleurs & décoration
        { pattern: /(rose|vert|bleu|jaune|rouge|orange|violet|couleur) (pour|car|afin|vise|permet|crée)/i, topic: 'color_explanation' },
        { pattern: /(décor|décoré|ambiance|atmosphère|apaiser|calmer)/i, topic: 'decoration' },

        // Équipements & installations
        { pattern: /salle d'attente/i, topic: 'waiting_room' },
        { pattern: /ascenseur/i, topic: 'elevator' },
        { pattern: /(équipement|matériel|technologie|moderne|récent)/i, topic: 'equipment' },

        // Explications inventées
        { pattern: /(c'est (pour|afin de|car)|vise à|permet de) (créer|apaiser|calmer|rassurer|mettre à l'aise)/i, topic: 'invented_explanation' },
        { pattern: /choix de (design|décoration|couleur)/i, topic: 'design_choice' },

        // Problèmes techniques (l'assistant ne peut pas les résoudre)
        { pattern: /(anamnèse|formulaire|site web|page) (ne (fonctionne|marche)|bloque|bug|problème)/i, topic: 'technical_issue' },
        { pattern: /pouvez-vous me donner plus de détails sur (l'erreur|le problème|ce qui)/i, topic: 'technical_troubleshoot' },
    ];

    /**
     * Termes qui DOIVENT être accompagnés d'une source vérifiable
     * Si ces mots apparaissent, on doit vérifier qu'ils viennent du contexte
     */
    private static REQUIRES_SOURCE = [
        'parking',
        'étage',
        'rez-de-chaussée',
        'ascenseur',
        'salle d\'attente',
        'gratuit',
        'payant',
        'derrière',
        'devant',
        'à côté',
        'proximité',
    ];

    /**
     * Valide une réponse générée par l'assistant
     * @param response - La réponse à valider
     * @param context - Le contexte disponible (clinicDetails, etc.)
     * @param userMessage - Le message original du patient
     * @returns { valid: boolean, reason?: string, suggestedResponse?: string }
     */
    static async validateResponse(
        response: string,
        context: any,
        userMessage: string
    ): Promise<{ valid: boolean; reason?: string; suggestedResponse?: string }> {

        if (!response || response.trim().length === 0) {
            return { valid: false, reason: 'Empty response' };
        }

        // 1. Vérifier les termes interdits
        for (const forbidden of this.FORBIDDEN_TERMS) {
            if (forbidden.pattern.test(response)) {
                await logService.warn('VALIDATOR', 'FORBIDDEN_TERM_DETECTED', `Detected forbidden term in response: ${forbidden.topic}`, {
                    metadata: { response, topic: forbidden.topic, pattern: forbidden.pattern.source }
                });

                // Générer une réponse de remplacement sûre
                const suggestedResponse = this.generateSafeResponse(userMessage, context, forbidden.topic);

                return {
                    valid: false,
                    reason: `Hallucination detected: ${forbidden.topic}`,
                    suggestedResponse
                };
            }
        }

        // 2. Vérifier les termes nécessitant une source
        const lowerResponse = response.toLowerCase();
        for (const term of this.REQUIRES_SOURCE) {
            if (lowerResponse.includes(term.toLowerCase())) {
                // Vérifier si l'info est présente dans le contexte
                const hasSourceInContext = this.checkIfInContext(term, context);

                if (!hasSourceInContext) {
                    await logService.warn('VALIDATOR', 'UNSOURCED_TERM_DETECTED', `Term without source: ${term}`, {
                        metadata: { response, term }
                    });

                    const suggestedResponse = this.generateSafeResponse(userMessage, context, 'missing_info');

                    return {
                        valid: false,
                        reason: `Unsourced information: ${term}`,
                        suggestedResponse
                    };
                }
            }
        }

        // 3. Validation passée
        await logService.info('VALIDATOR', 'RESPONSE_VALIDATED', 'Response passed validation', {
            metadata: { responseLength: response.length }
        });

        return { valid: true };
    }

    /**
     * Vérifie si un terme est présent dans le contexte fourni
     */
    private static checkIfInContext(term: string, context: any): boolean {
        if (!context) return false;

        const contextStr = JSON.stringify(context).toLowerCase();

        // Recherche du terme dans tout le contexte
        return contextStr.includes(term.toLowerCase());
    }

    /**
     * Génère une réponse sûre en cas de détection d'hallucination
     */
    private static generateSafeResponse(userMessage: string, context: any, topic: string): string {
        const clinicPhone = context?.clinicDetails?.phone || context?.structuredContext?.clinicDetails?.phone;
        const language = context?.language || 'fr';

        // Réponses sûres par type de problème
        const safeResponses: Record<string, { fr: string; en: string }> = {
            parking: {
                fr: clinicPhone
                    ? `Je ne dispose pas de cette information sur le stationnement. Vous pouvez contacter le cabinet au ${clinicPhone} pour connaître les possibilités de parking.`
                    : `Je ne dispose pas de cette information sur le stationnement. Je vous invite à contacter le cabinet directement pour ces détails pratiques.`,
                en: clinicPhone
                    ? `I don't have information about parking. You can contact the clinic at ${clinicPhone} to learn about parking options.`
                    : `I don't have information about parking. Please contact the clinic directly for these practical details.`
            },
            parking_details: {
                fr: clinicPhone
                    ? `Je ne dispose pas d'information précise sur le parking. Pour connaître les détails de stationnement, veuillez contacter le cabinet au ${clinicPhone}.`
                    : `Je ne dispose pas d'information précise sur le parking. Veuillez contacter le cabinet directement.`,
                en: clinicPhone
                    ? `I don't have specific information about parking. For parking details, please contact the clinic at ${clinicPhone}.`
                    : `I don't have specific information about parking. Please contact the clinic directly.`
            },
            parking_mention: {
                fr: clinicPhone
                    ? `Je ne dispose pas de cette information. Pour les questions de stationnement, contactez le cabinet au ${clinicPhone}.`
                    : `Je ne dispose pas de cette information. Pour les questions de stationnement, contactez le cabinet directement.`,
                en: clinicPhone
                    ? `I don't have this information. For parking questions, contact the clinic at ${clinicPhone}.`
                    : `I don't have this information. For parking questions, contact the clinic directly.`
            },
            floor: {
                fr: clinicPhone
                    ? `Je n'ai pas cette information sur l'emplacement exact. Vous pouvez contacter le cabinet au ${clinicPhone} pour ces détails.`
                    : `Je n'ai pas cette information sur l'emplacement exact. Veuillez contacter le cabinet directement.`,
                en: clinicPhone
                    ? `I don't have information about the exact location. You can contact the clinic at ${clinicPhone} for these details.`
                    : `I don't have information about the exact location. Please contact the clinic directly.`
            },
            location_detail: {
                fr: clinicPhone
                    ? `Je ne peux pas vous donner de détails précis sur l'accès. Contactez le cabinet au ${clinicPhone} pour ces informations.`
                    : `Je ne peux pas vous donner de détails précis sur l'accès. Contactez le cabinet directement.`,
                en: clinicPhone
                    ? `I can't give you specific details about access. Contact the clinic at ${clinicPhone} for this information.`
                    : `I can't give you specific details about access. Contact the clinic directly.`
            },
            decoration: {
                fr: `Je n'ai pas d'information sur les aspects de décoration du cabinet. Comment puis-je vous aider pour vos rendez-vous ?`,
                en: `I don't have information about the clinic's decoration. How can I help you with your appointments?`
            },
            color_explanation: {
                fr: `Je n'ai pas d'information sur les choix esthétiques du cabinet. Puis-je vous aider pour prendre un rendez-vous ?`,
                en: `I don't have information about the clinic's aesthetic choices. Can I help you book an appointment?`
            },
            equipment: {
                fr: `Je n'ai pas d'information sur les équipements du cabinet. Pour ces détails, vous pouvez contacter directement le cabinet.`,
                en: `I don't have information about the clinic's equipment. For these details, you can contact the clinic directly.`
            },
            technical_issue: {
                fr: clinicPhone
                    ? `Je ne peux pas résoudre les problèmes techniques. Veuillez contacter le cabinet directement au ${clinicPhone} pour qu'ils puissent vous aider avec ce problème.`
                    : `Je ne peux pas résoudre les problèmes techniques. Veuillez contacter le cabinet directement pour qu'ils puissent vous aider.`,
                en: clinicPhone
                    ? `I cannot resolve technical issues. Please contact the clinic directly at ${clinicPhone} so they can help you with this problem.`
                    : `I cannot resolve technical issues. Please contact the clinic directly so they can help you.`
            },
            technical_troubleshoot: {
                fr: `Je ne suis qu'une secrétaire virtuelle et ne peux pas résoudre les problèmes techniques. Le mieux est de contacter le cabinet directement.`,
                en: `I'm only a virtual secretary and cannot resolve technical issues. It's best to contact the clinic directly.`
            },
            missing_info: {
                fr: clinicPhone
                    ? `Je n'ai pas cette information dans mes données. Vous pouvez contacter le cabinet au ${clinicPhone} pour plus de détails.`
                    : `Je n'ai pas cette information dans mes données. Veuillez contacter le cabinet directement.`,
                en: clinicPhone
                    ? `I don't have this information in my data. You can contact the clinic at ${clinicPhone} for more details.`
                    : `I don't have this information in my data. Please contact the clinic directly.`
            },
            invented_explanation: {
                fr: `Je ne peux pas expliquer les choix du cabinet. Comment puis-je vous aider pour vos rendez-vous ?`,
                en: `I cannot explain the clinic's choices. How can I help you with your appointments?`
            }
        };

        const responseTemplate = safeResponses[topic] || safeResponses['missing_info'];
        return language === 'en' ? responseTemplate.en : responseTemplate.fr;
    }

    /**
     * Détecte si un message patient demande des infos non disponibles
     */
    static detectUnavailableInfoRequest(message: string): { detected: boolean; topic?: string } {
        const lowerMessage = message.toLowerCase();

        const patterns = [
            { keywords: ['parking', 'parquer', 'stationner', 'garer'], topic: 'parking' },
            { keywords: ['étage', 'rez-de-chaussée', 'niveau', 'quel étage'], topic: 'floor' },
            { keywords: ['couleur', 'rose', 'vert', 'bleu', 'pourquoi'], topic: 'decoration' },
            { keywords: ['anamnèse', 'formulaire', 'bloque', 'bug', 'ne fonctionne pas'], topic: 'technical' },
            { keywords: ['salle d\'attente', 'ascenseur', 'accès'], topic: 'facilities' },
        ];

        for (const pattern of patterns) {
            if (pattern.keywords.some(kw => lowerMessage.includes(kw))) {
                return { detected: true, topic: pattern.topic };
            }
        }

        return { detected: false };
    }
}
