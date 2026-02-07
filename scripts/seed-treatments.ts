import prisma from '../src/database/client';

/**
 * Seed script to initialize treatment types for dental clinics
 * Script de seed pour initialiser les types de traitements pour les cliniques dentaires
 */

const TREATMENT_TYPES = [
    {
        name: "Hygiène dentaire",
        name_en: "Dental Hygiene",
        description: "Nettoyage et soins d'hygiène dentaire",
        duration_minutes: 45
    },
    {
        name: "Éducation à l'hygiène",
        name_en: "Hygiene Education",
        description: "Formation et conseils sur l'hygiène bucco-dentaire",
        duration_minutes: 30
    },
    {
        name: "Nettoyage dentaire",
        name_en: "Dental Cleaning",
        description: "Détartrage et polissage des dents",
        duration_minutes: 45
    },
    {
        name: "Examen dentaire",
        name_en: "Dental Examination",
        description: "Examen complet de la santé bucco-dentaire",
        duration_minutes: 30
    },
    {
        name: "Application de fluorure",
        name_en: "Fluoride Application",
        description: "Traitement au fluorure pour renforcer l'émail",
        duration_minutes: 20
    },
    {
        name: "Esthétique",
        name_en: "Aesthetic Dentistry",
        description: "Traitements esthétiques dentaires",
        duration_minutes: 60
    },
    {
        name: "Orthodontie",
        name_en: "Orthodontics",
        description: "Correction de l'alignement des dents",
        duration_minutes: 45
    },
    {
        name: "Pédodontie",
        name_en: "Pediatric Dentistry",
        description: "Soins dentaires pour enfants",
        duration_minutes: 30
    },
    {
        name: "Implantologie",
        name_en: "Implantology",
        description: "Pose et suivi d'implants dentaires",
        duration_minutes: 90
    },
    {
        name: "Prothèse",
        name_en: "Prosthetics",
        description: "Prothèses dentaires et couronnes",
        duration_minutes: 60
    }
];

async function seedTreatmentTypes() {
    console.log('🌱 Starting treatment types seeding...');

    try {
        // Create treatment types
        for (const treatment of TREATMENT_TYPES) {
            const existing = await prisma.treatmentType.findFirst({
                where: {
                    OR: [
                        { name: treatment.name },
                        { name_en: treatment.name_en }
                    ]
                }
            });

            if (!existing) {
                const created = await prisma.treatmentType.create({
                    data: treatment
                });
                console.log(`✅ Created treatment type: ${created.name} (${created.name_en})`);
            } else {
                console.log(`⏭️  Treatment type already exists: ${treatment.name}`);
            }
        }

        console.log('\n✨ Treatment types seeding completed successfully!');
    } catch (error) {
        console.error('❌ Error seeding treatment types:', error);
        throw error;
    }
}

async function main() {
    try {
        await seedTreatmentTypes();
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
