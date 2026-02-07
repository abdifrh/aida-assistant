import prisma from '../database/client';

/**
 * Service for managing treatment types and their relationships with practitioners
 * Service pour gérer les types de traitements et leurs relations avec les praticiens
 */
export class TreatmentService {
    /**
     * Get all available treatment types for a clinic based on active practitioners
     * Obtenir tous les types de traitements disponibles pour une clinique basés sur les praticiens actifs
     */
    async getAvailableTreatmentsForClinic(clinicId: string) {
        try {
            // Get all active practitioners for this clinic with their treatments
            // Obtenir tous les praticiens actifs pour cette clinique avec leurs traitements
            const practitioners = await prisma.practitioner.findMany({
                where: {
                    clinic_id: clinicId,
                    is_active: true
                },
                include: {
                    treatments: {
                        where: {
                            is_active: true
                        },
                        include: {
                            treatment_type: true
                        }
                    }
                }
            });

            // Extract unique treatment types
            // Extraire les types de traitements uniques
            const treatmentTypesMap = new Map();

            for (const practitioner of practitioners) {
                for (const pt of practitioner.treatments) {
                    if (pt.treatment_type.is_active) {
                        treatmentTypesMap.set(pt.treatment_type.id, pt.treatment_type);
                    }
                }
            }

            return Array.from(treatmentTypesMap.values());
        } catch (error) {
            console.error('Error getting available treatments for clinic:', error);
            return [];
        }
    }

    /**
     * Get practitioners who can perform a specific treatment type
     * Obtenir les praticiens qui peuvent effectuer un type de traitement spécifique
     */
    async getPractitionersForTreatment(clinicId: string, treatmentTypeId: string) {
        try {
            const practitioners = await prisma.practitioner.findMany({
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
                        where: {
                            treatment_type_id: treatmentTypeId,
                            is_active: true
                        },
                        include: {
                            treatment_type: true
                        }
                    }
                }
            });

            return practitioners;
        } catch (error) {
            console.error('Error getting practitioners for treatment:', error);
            return [];
        }
    }

    /**
     * Get treatment type by name (supports French and English)
     * Obtenir le type de traitement par nom (supporte français et anglais)
     */
    async getTreatmentTypeByName(name: string) {
        try {
            const normalizedName = name.toLowerCase().trim();

            const treatmentType = await prisma.treatmentType.findFirst({
                where: {
                    OR: [
                        { name: { contains: normalizedName, mode: 'insensitive' } },
                        { name_en: { contains: normalizedName, mode: 'insensitive' } }
                    ],
                    is_active: true
                }
            });

            return treatmentType;
        } catch (error) {
            console.error('Error getting treatment type by name:', error);
            return null;
        }
    }

    /**
     * Get treatment type by ID
     * Obtenir le type de traitement par ID
     */
    async getTreatmentTypeById(id: string) {
        try {
            return await prisma.treatmentType.findUnique({
                where: { id }
            });
        } catch (error) {
            console.error('Error getting treatment type by ID:', error);
            return null;
        }
    }

    /**
     * Create a new treatment type
     * Créer un nouveau type de traitement
     */
    async createTreatmentType(data: {
        name: string;
        name_en?: string;
        description?: string;
        duration_minutes?: number;
    }) {
        try {
            return await prisma.treatmentType.create({
                data: {
                    name: data.name,
                    name_en: data.name_en,
                    description: data.description,
                    duration_minutes: data.duration_minutes || 30
                }
            });
        } catch (error) {
            console.error('Error creating treatment type:', error);
            throw error;
        }
    }

    /**
     * Assign a treatment type to a practitioner
     * Assigner un type de traitement à un praticien
     */
    async assignTreatmentToPractitioner(practitionerId: string, treatmentTypeId: string) {
        try {
            return await prisma.practitionerTreatment.create({
                data: {
                    practitioner_id: practitionerId,
                    treatment_type_id: treatmentTypeId
                }
            });
        } catch (error) {
            console.error('Error assigning treatment to practitioner:', error);
            throw error;
        }
    }

    /**
     * Remove a treatment type from a practitioner
     * Retirer un type de traitement d'un praticien
     */
    async removeTreatmentFromPractitioner(practitionerId: string, treatmentTypeId: string) {
        try {
            await prisma.practitionerTreatment.deleteMany({
                where: {
                    practitioner_id: practitionerId,
                    treatment_type_id: treatmentTypeId
                }
            });
        } catch (error) {
            console.error('Error removing treatment from practitioner:', error);
            throw error;
        }
    }

    /**
     * Get all treatments for a specific practitioner
     * Obtenir tous les traitements pour un praticien spécifique
     */
    async getPractitionerTreatments(practitionerId: string) {
        try {
            const practitioner = await prisma.practitioner.findUnique({
                where: { id: practitionerId },
                include: {
                    treatments: {
                        where: { is_active: true },
                        include: {
                            treatment_type: true
                        }
                    }
                }
            });

            return practitioner?.treatments.map(pt => pt.treatment_type) || [];
        } catch (error) {
            console.error('Error getting practitioner treatments:', error);
            return [];
        }
    }

    /**
     * Format treatment types for display in conversation
     * Formater les types de traitements pour l'affichage dans la conversation
     */
    formatTreatmentsForDisplay(treatments: any[], language: string = 'fr'): string {
        if (treatments.length === 0) {
            return language === 'fr'
                ? "Aucun traitement disponible pour le moment."
                : "No treatments available at the moment.";
        }

        const treatmentList = treatments.map((t, index) => {
            const name = language === 'en' && t.name_en ? t.name_en : t.name;
            return `${index + 1}. ${name}`;
        }).join('\n');

        const header = language === 'fr'
            ? "Voici les types de traitements disponibles :\n"
            : "Here are the available treatment types:\n";

        return header + treatmentList;
    }
}

export const treatmentService = new TreatmentService();
