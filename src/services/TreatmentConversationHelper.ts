import { treatmentService } from './TreatmentService';
import prisma from '../database/client';

/**
 * Extension methods for ConversationManager to handle dynamic treatment types
 * Méthodes d'extension pour ConversationManager pour gérer les types de traitements dynamiques
 */

export class TreatmentConversationHelper {
    /**
     * Get available treatments for a clinic and format them for display
     * Obtenir les traitements disponibles pour une clinique et les formater pour l'affichage
     */
    static async getAvailableTreatmentsMessage(clinicId: string, language: string = 'fr'): Promise<string> {
        const treatments = await treatmentService.getAvailableTreatmentsForClinic(clinicId);

        if (treatments.length === 0) {
            return language === 'fr'
                ? "Désolé, aucun traitement n'est disponible pour le moment."
                : "Sorry, no treatments are available at the moment.";
        }

        const header = language === 'fr'
            ? "Quel type de traitement souhaitez-vous ?\n\n"
            : "What type of treatment would you like?\n\n";

        const treatmentList = treatments.map((t, index) => {
            const name = language === 'en' && t.name_en ? t.name_en : t.name;
            return `${index + 1}. ${name}`;
        }).join('\n');

        return header + treatmentList;
    }

    /**
     * Find treatment type from user input
     * Trouver le type de traitement à partir de l'entrée utilisateur
     */
    static async findTreatmentFromInput(input: string, clinicId: string): Promise<any | null> {
        // First try exact or fuzzy match by name
        let treatment = await treatmentService.getTreatmentTypeByName(input);

        if (treatment) {
            // Verify this treatment is available at this clinic
            const availableTreatments = await treatmentService.getAvailableTreatmentsForClinic(clinicId);
            const isAvailable = availableTreatments.some(t => t.id === treatment!.id);

            if (isAvailable) {
                return treatment;
            }
        }

        // Try to parse as number (from list)
        const num = parseInt(input.trim());
        if (!isNaN(num) && num > 0) {
            const availableTreatments = await treatmentService.getAvailableTreatmentsForClinic(clinicId);
            if (num <= availableTreatments.length) {
                return availableTreatments[num - 1];
            }
        }

        return null;
    }

    /**
     * Get practitioners available for a specific treatment
     * Obtenir les praticiens disponibles pour un traitement spécifique
     */
    static async getPractitionersForTreatmentMessage(
        clinicId: string,
        treatmentTypeId: string,
        language: string = 'fr'
    ): Promise<string> {
        const practitioners = await treatmentService.getPractitionersForTreatment(clinicId, treatmentTypeId);

        if (practitioners.length === 0) {
            return language === 'fr'
                ? "Désolé, aucun praticien n'est disponible pour ce traitement."
                : "Sorry, no practitioners are available for this treatment.";
        }

        const header = language === 'fr'
            ? "Quel praticien souhaitez-vous consulter ?\n\n"
            : "Which practitioner would you like to see?\n\n";

        const practitionerList = practitioners.map((p, index) => {
            const name = `Dr ${p.first_name} ${p.last_name}`;
            const specialty = p.specialty ? ` (${p.specialty})` : '';
            return `${index + 1}. ${name}${specialty}`;
        }).join('\n');

        return header + practitionerList;
    }

    /**
     * Enhanced missing fields check that includes treatment type
     * Vérification améliorée des champs manquants qui inclut le type de traitement
     */
    static async getMissingFieldsWithTreatment(
        conversationId: string,
        context: any,
        clinicId: string
    ): Promise<string[]> {
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
            if (!patient?.first_name && !context.patient?.first_name) return ['first_name'];
            if (!patient?.last_name && !context.patient?.last_name) return ['last_name'];
            if (!patient?.birth_date && !context.patient?.birth_date) return ['birth_date'];
        }

        // 2. Check Treatment Type BEFORE practitioner
        // This allows us to filter practitioners by treatment
        if (!context.appointment?.treatment_type_id) return ['treatment_type'];

        // 3. Check Practitioner (filtered by treatment type)
        if (!context.appointment?.practitioner_name && !context.appointment?.practitioner_id) {
            return ['practitioner'];
        }

        // 4. Check Date and Time
        if (!context.appointment?.date) return ['date'];
        if (!context.appointment?.time) return ['time'];

        return []; // No missing fields
    }

    /**
     * Ask for missing field with treatment-aware messages
     * Demander un champ manquant avec des messages conscients du traitement
     */
    static async askForMissingFieldWithTreatment(
        field: string,
        language: string,
        clinicId: string,
        context: any
    ): Promise<string> {
        // If asking for treatment type, show available treatments
        if (field === 'treatment_type') {
            return await this.getAvailableTreatmentsMessage(clinicId, language);
        }

        // If asking for practitioner and we have a treatment type, show filtered list
        if (field === 'practitioner' && context.appointment?.treatment_type_id) {
            return await this.getPractitionersForTreatmentMessage(
                clinicId,
                context.appointment.treatment_type_id,
                language
            );
        }

        // Default questions for other fields
        const questions: Record<string, Record<string, string>> = {
            practitioner: {
                fr: "Quel médecin souhaitez-vous consulter ?",
                en: "Which doctor would you like to see?",
            },
            date: {
                fr: "Quelle date vous conviendrait ?",
                en: "Which date would suit you?",
            },
            time: {
                fr: "À quelle heure ?",
                en: "What time?",
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
        };

        return questions[field]?.[language] || questions[field]?.['fr'] || "Information manquante.";
    }

    /**
     * Update appointment creation to include treatment type
     * Mettre à jour la création de rendez-vous pour inclure le type de traitement
     */
    static async createAppointmentWithTreatment(data: {
        practitioner_id: string;
        patient_id: string;
        treatment_type_id?: string;
        start_time: Date;
        end_time: Date;
        google_event_id?: string;
        status?: string;
    }) {
        return await prisma.appointment.create({
            data: {
                practitioner_id: data.practitioner_id,
                patient_id: data.patient_id,
                treatment_type_id: data.treatment_type_id,
                start_time: data.start_time,
                end_time: data.end_time,
                google_event_id: data.google_event_id,
                status: data.status || 'CONFIRMED'
            },
            include: {
                practitioner: true,
                patient: true,
                treatment_type: true
            }
        });
    }

    /**
     * Get appointment duration based on treatment type
     * Obtenir la durée du rendez-vous basée sur le type de traitement
     */
    static async getAppointmentDuration(treatmentTypeId?: string): Promise<number> {
        if (!treatmentTypeId) {
            return 30; // Default 30 minutes
        }

        const treatmentType = await treatmentService.getTreatmentTypeById(treatmentTypeId);
        return treatmentType?.duration_minutes || 30;
    }

    /**
     * Format appointment confirmation message with treatment type
     * Formater le message de confirmation de rendez-vous avec le type de traitement
     */
    static async formatAppointmentConfirmation(
        appointment: any,
        language: string = 'fr',
        timezone: string = 'Europe/Paris'
    ): Promise<string> {
        const treatmentName = appointment.treatment_type
            ? (language === 'en' && appointment.treatment_type.name_en
                ? appointment.treatment_type.name_en
                : appointment.treatment_type.name)
            : (language === 'fr' ? 'Consultation' : 'Consultation');

        const practitionerName = `Dr ${appointment.practitioner.last_name}`;

        // Format date
        const formattedDate = appointment.start_time.toLocaleDateString(
            language === 'fr' ? 'fr-FR' : 'en-US',
            {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                timeZone: timezone
            }
        );

        const formattedTime = appointment.start_time.toLocaleTimeString(
            language === 'fr' ? 'fr-FR' : 'en-US',
            {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: timezone
            }
        );

        if (language === 'fr') {
            return `Parfait ! Votre rendez-vous pour ${treatmentName} avec le ${practitionerName} est confirmé pour le ${formattedDate} à ${formattedTime}.`;
        } else {
            return `Perfect! Your appointment for ${treatmentName} with ${practitionerName} is confirmed for ${formattedDate} at ${formattedTime}.`;
        }
    }
}
