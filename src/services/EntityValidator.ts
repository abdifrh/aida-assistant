import { logService } from './LogService';

/**
 * Service de validation des entités extraites par le LLM
 * Vérifie cohérence des dates, horaires, noms, etc.
 */
export class EntityValidator {

    /**
     * Valide les entités extraites
     * @param entities - Entités extraites par le LLM
     * @param context - Contexte de la conversation
     * @returns { valid: boolean, errors: string[], correctedEntities?: any }
     */
    static validateEntities(
        entities: any,
        context: any
    ): { valid: boolean; errors: string[]; correctedEntities?: any } {

        if (!entities || Object.keys(entities).length === 0) {
            return { valid: true, errors: [] };
        }

        const errors: string[] = [];
        const correctedEntities = { ...entities };

        // 1. Valider la date
        if (entities.date) {
            const dateValidation = this.validateDate(entities.date);
            if (!dateValidation.valid) {
                errors.push(`Invalid date: ${dateValidation.error}`);
                delete correctedEntities.date;
            } else if (dateValidation.corrected) {
                correctedEntities.date = dateValidation.corrected;
            }
        }

        // 2. Valider l'heure
        if (entities.time) {
            const timeValidation = this.validateTime(entities.time);
            if (!timeValidation.valid) {
                errors.push(`Invalid time: ${timeValidation.error}`);
                delete correctedEntities.time;
            } else if (timeValidation.corrected) {
                correctedEntities.time = timeValidation.corrected;
            }
        }

        // 3. Valider cohérence date + heure + horaires d'ouverture
        if (correctedEntities.date && correctedEntities.time && context?.clinicDetails?.opening_hours) {
            const scheduleValidation = this.validateAgainstSchedule(
                correctedEntities.date,
                correctedEntities.time,
                context.clinicDetails.opening_hours
            );
            if (!scheduleValidation.valid) {
                errors.push(`Schedule conflict: ${scheduleValidation.error}`);
            }
        }

        // 4. Valider l'email
        if (entities.email) {
            const emailValidation = this.validateEmail(entities.email);
            if (!emailValidation.valid) {
                errors.push(`Invalid email: ${emailValidation.error}`);
                delete correctedEntities.email;
            }
        }

        // 5. Valider le téléphone
        if (entities.phone) {
            const phoneValidation = this.validatePhone(entities.phone);
            if (!phoneValidation.valid) {
                errors.push(`Invalid phone: ${phoneValidation.error}`);
                delete correctedEntities.phone;
            } else if (phoneValidation.corrected) {
                correctedEntities.phone = phoneValidation.corrected;
            }
        }

        // 6. Valider la date de naissance
        if (entities.birth_date) {
            const birthDateValidation = this.validateBirthDate(entities.birth_date);
            if (!birthDateValidation.valid) {
                errors.push(`Invalid birth date: ${birthDateValidation.error}`);
                delete correctedEntities.birth_date;
            }
        }

        // 7. Valider le nom du praticien
        if (entities.practitioner && context?.doctorAvailability) {
            const practitionerValidation = this.validatePractitioner(
                entities.practitioner,
                context.doctorAvailability
            );
            if (!practitionerValidation.valid) {
                errors.push(`Invalid practitioner: ${practitionerValidation.error}`);
                // Ne pas supprimer, juste logger
            }
        }

        if (errors.length > 0) {
            logService.warn('ENTITY_VALIDATOR', 'VALIDATION_ERRORS', 'Entity validation errors detected', {
                metadata: { errors, originalEntities: entities, correctedEntities }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            correctedEntities: errors.length > 0 ? correctedEntities : undefined
        };
    }

    /**
     * Valide une date au format YYYY-MM-DD
     */
    private static validateDate(dateStr: string): { valid: boolean; error?: string; corrected?: string } {
        // Format attendu: YYYY-MM-DD
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!dateRegex.test(dateStr)) {
            return { valid: false, error: `Invalid format: ${dateStr} (expected YYYY-MM-DD)` };
        }

        const date = new Date(dateStr);

        if (isNaN(date.getTime())) {
            return { valid: false, error: `Invalid date: ${dateStr}` };
        }

        // Vérifier que la date n'est pas dans le passé (sauf aujourd'hui)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (date < today) {
            return { valid: false, error: `Date is in the past: ${dateStr}` };
        }

        // Vérifier que la date n'est pas trop loin dans le futur (> 1 an)
        const oneYearFromNow = new Date();
        oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

        if (date > oneYearFromNow) {
            return { valid: false, error: `Date is too far in the future: ${dateStr}` };
        }

        return { valid: true };
    }

    /**
     * Valide une heure au format HH:MM
     */
    private static validateTime(timeStr: string): { valid: boolean; error?: string; corrected?: string } {
        // Format attendu: HH:MM
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/;

        const match = timeStr.match(timeRegex);

        if (!match) {
            return { valid: false, error: `Invalid format: ${timeStr} (expected HH:MM)` };
        }

        // Normaliser le format (ajouter 0 si nécessaire)
        const hours = match[1].padStart(2, '0');
        const minutes = match[2];
        const normalized = `${hours}:${minutes}`;

        return {
            valid: true,
            corrected: normalized !== timeStr ? normalized : undefined
        };
    }

    /**
     * Valide qu'une date/heure est dans les horaires d'ouverture
     */
    private static validateAgainstSchedule(
        dateStr: string,
        timeStr: string,
        openingHours: any
    ): { valid: boolean; error?: string } {

        if (!openingHours || typeof openingHours !== 'object') {
            return { valid: true }; // Pas de vérification possible
        }

        const date = new Date(dateStr);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[date.getDay()];

        const daySchedule = openingHours[dayName];

        // Si fermé ce jour-là
        if (!daySchedule || daySchedule === null) {
            return { valid: false, error: `Clinic is closed on ${dayName}` };
        }

        // Vérifier les horaires
        if (typeof daySchedule === 'object' && daySchedule.open && daySchedule.close) {
            const [hours, minutes] = timeStr.split(':').map(Number);
            const timeInMinutes = hours * 60 + minutes;

            const [openHours, openMinutes] = daySchedule.open.split(':').map(Number);
            const openTimeInMinutes = openHours * 60 + openMinutes;

            const [closeHours, closeMinutes] = daySchedule.close.split(':').map(Number);
            const closeTimeInMinutes = closeHours * 60 + closeMinutes;

            if (timeInMinutes < openTimeInMinutes || timeInMinutes >= closeTimeInMinutes) {
                return {
                    valid: false,
                    error: `Time ${timeStr} is outside business hours (${daySchedule.open}-${daySchedule.close})`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Valide un email
     */
    private static validateEmail(email: string): { valid: boolean; error?: string } {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
            return { valid: false, error: `Invalid email format: ${email}` };
        }

        return { valid: true };
    }

    /**
     * Valide un numéro de téléphone
     */
    private static validatePhone(phone: string): { valid: boolean; error?: string; corrected?: string } {
        // Enlever espaces, tirets, points
        const cleaned = phone.replace(/[\s\-\.]/g, '');

        // Vérifier que c'est un numéro valide (format international ou local)
        const phoneRegex = /^(\+)?[0-9]{8,15}$/;

        if (!phoneRegex.test(cleaned)) {
            return { valid: false, error: `Invalid phone format: ${phone}` };
        }

        return {
            valid: true,
            corrected: cleaned !== phone ? cleaned : undefined
        };
    }

    /**
     * Valide une date de naissance
     */
    private static validateBirthDate(birthDateStr: string): { valid: boolean; error?: string } {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

        if (!dateRegex.test(birthDateStr)) {
            return { valid: false, error: `Invalid format: ${birthDateStr} (expected YYYY-MM-DD)` };
        }

        const date = new Date(birthDateStr);

        if (isNaN(date.getTime())) {
            return { valid: false, error: `Invalid date: ${birthDateStr}` };
        }

        // Vérifier que la personne a au moins 1 an et moins de 120 ans
        const now = new Date();
        const age = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

        if (age < 1) {
            return { valid: false, error: `Birth date is too recent: ${birthDateStr}` };
        }

        if (age > 120) {
            return { valid: false, error: `Birth date is too old: ${birthDateStr}` };
        }

        return { valid: true };
    }

    /**
     * Valide le nom d'un praticien
     */
    private static validatePractitioner(
        practitionerName: string,
        doctorAvailability: any[]
    ): { valid: boolean; error?: string } {

        if (!Array.isArray(doctorAvailability) || doctorAvailability.length === 0) {
            return { valid: true }; // Pas de vérification possible
        }

        const normalizedInput = practitionerName.toLowerCase().trim();

        // Chercher une correspondance
        const found = doctorAvailability.some(doctor => {
            const doctorName = doctor.name || doctor.fullName || '';
            return doctorName.toLowerCase().includes(normalizedInput) ||
                   normalizedInput.includes(doctorName.toLowerCase());
        });

        if (!found) {
            const availableNames = doctorAvailability.map(d => d.name || d.fullName).join(', ');
            return {
                valid: false,
                error: `Practitioner "${practitionerName}" not found. Available: ${availableNames}`
            };
        }

        return { valid: true };
    }
}
