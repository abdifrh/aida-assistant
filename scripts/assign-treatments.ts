import prisma from '../src/database/client';

/**
 * Example script to assign treatments to practitioners based on their specialty
 * Script d'exemple pour assigner les traitements aux praticiens selon leur spécialité
 * 
 * This demonstrates how to configure the Clinique dentaire Trèfle d'Or example
 */

// Mapping of specialties to treatment types
// Correspondance des spécialités aux types de traitements
const SPECIALTY_TREATMENT_MAP: Record<string, string[]> = {
    "Orthodontiste": [
        "Orthodontie",
        "Examen dentaire",
        "Esthétique"
    ],
    "Médecin-dentiste": [
        "Examen dentaire",
        "Esthétique",
        "Implantologie",
        "Prothèse",
        "Nettoyage dentaire"
    ],
    "Pédodontiste": [
        "Pédodontie",
        "Examen dentaire",
        "Application de fluorure",
        "Éducation à l'hygiène"
    ],
    "Hygiéniste dentaire": [
        "Hygiène dentaire",
        "Nettoyage dentaire",
        "Éducation à l'hygiène",
        "Application de fluorure"
    ]
};

async function assignTreatmentsToPractitioners(clinicId?: string) {
    console.log('🔗 Starting treatment assignment to practitioners...\n');

    try {
        // Get all active practitioners
        const whereClause: any = { is_active: true };
        if (clinicId) {
            whereClause.clinic_id = clinicId;
        }

        const practitioners = await prisma.practitioner.findMany({
            where: whereClause,
            include: {
                clinic: true
            }
        });

        if (practitioners.length === 0) {
            console.log('⚠️  No practitioners found. Please create practitioners first.');
            return;
        }

        console.log(`Found ${practitioners.length} practitioner(s)\n`);

        for (const practitioner of practitioners) {
            const fullName = `${practitioner.first_name} ${practitioner.last_name}`;
            const specialty = practitioner.specialty || 'Unknown';

            console.log(`\n👨‍⚕️ Processing: ${fullName} (${specialty})`);
            console.log(`   Clinic: ${practitioner.clinic.name}`);

            // Get treatment types for this specialty
            const treatmentNames = SPECIALTY_TREATMENT_MAP[specialty];

            if (!treatmentNames || treatmentNames.length === 0) {
                console.log(`   ⚠️  No treatment mapping found for specialty: ${specialty}`);
                continue;
            }

            // Find and assign each treatment
            for (const treatmentName of treatmentNames) {
                const treatmentType = await prisma.treatmentType.findFirst({
                    where: {
                        name: treatmentName,
                        is_active: true
                    }
                });

                if (!treatmentType) {
                    console.log(`   ⚠️  Treatment type not found: ${treatmentName}`);
                    continue;
                }

                // Check if already assigned
                const existing = await prisma.practitionerTreatment.findFirst({
                    where: {
                        practitioner_id: practitioner.id,
                        treatment_type_id: treatmentType.id
                    }
                });

                if (existing) {
                    console.log(`   ⏭️  Already assigned: ${treatmentName}`);
                } else {
                    await prisma.practitionerTreatment.create({
                        data: {
                            practitioner_id: practitioner.id,
                            treatment_type_id: treatmentType.id
                        }
                    });
                    console.log(`   ✅ Assigned: ${treatmentName}`);
                }
            }
        }

        console.log('\n\n✨ Treatment assignment completed successfully!');

        // Display summary
        console.log('\n📊 Summary by clinic:');
        const clinics = await prisma.clinic.findMany({
            include: {
                practitioners: {
                    where: { is_active: true },
                    include: {
                        treatments: {
                            include: {
                                treatment_type: true
                            }
                        }
                    }
                }
            }
        });

        for (const clinic of clinics) {
            console.log(`\n🏥 ${clinic.name}`);

            // Get unique treatments for this clinic
            const treatmentsSet = new Set<string>();
            for (const prac of clinic.practitioners) {
                for (const pt of prac.treatments) {
                    treatmentsSet.add(pt.treatment_type.name);
                }
            }

            console.log(`   Available treatments: ${treatmentsSet.size}`);
            console.log(`   Practitioners: ${clinic.practitioners.length}`);

            if (treatmentsSet.size > 0) {
                console.log(`   Treatments offered:`);
                Array.from(treatmentsSet).sort().forEach(t => {
                    console.log(`   - ${t}`);
                });
            }
        }

    } catch (error) {
        console.error('❌ Error assigning treatments:', error);
        throw error;
    }
}

async function main() {
    try {
        // You can pass a specific clinic ID if needed
        // Vous pouvez passer un ID de clinique spécifique si nécessaire
        const clinicId = process.argv[2]; // Optional: node script.js <clinic-id>

        await assignTreatmentsToPractitioners(clinicId);
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
