import prisma from '../src/database/client';

/**
 * Example script to create practitioners for Clinique dentaire Trèfle d'Or
 * Script d'exemple pour créer les praticiens de la Clinique dentaire Trèfle d'Or
 * 
 * This demonstrates the exact configuration from your example
 */

interface PractitionerData {
    first_name: string;
    last_name: string;
    specialty: string;
    google_calendar_id: string;
}

const TREFLE_DOR_PRACTITIONERS: PractitionerData[] = [
    {
        first_name: "Eléa",
        last_name: "Ouadi",
        specialty: "Orthodontiste",
        google_calendar_id: "elea.ouadi@trefle-dor.ch" // À remplacer par le vrai calendar ID
    },
    {
        first_name: "Dany",
        last_name: "Leal",
        specialty: "Médecin-dentiste",
        google_calendar_id: "dany.leal@trefle-dor.ch"
    },
    {
        first_name: "Jocelyn",
        last_name: "Van Delden",
        specialty: "Médecin-dentiste",
        google_calendar_id: "jocelyn.vandelden@trefle-dor.ch"
    },
    {
        first_name: "Tom",
        last_name: "Saja",
        specialty: "Pédodontiste",
        google_calendar_id: "tom.saja@trefle-dor.ch"
    },
    {
        first_name: "Anna",
        last_name: "Rufenacht",
        specialty: "Hygiéniste dentaire",
        google_calendar_id: "anna.rufenacht@trefle-dor.ch"
    },
    {
        first_name: "Tiffany",
        last_name: "Tolve",
        specialty: "Hygiéniste dentaire",
        google_calendar_id: "tiffany.tolve@trefle-dor.ch"
    },
    {
        first_name: "Ariel",
        last_name: "Bernier",
        specialty: "Hygiéniste dentaire",
        google_calendar_id: "ariel.bernier@trefle-dor.ch"
    }
];

async function createTrefleDorClinic() {
    console.log('🏥 Creating Clinique dentaire Trèfle d\'Or...\n');

    try {
        // 1. Create or get the clinic
        let clinic = await prisma.clinic.findFirst({
            where: {
                name: { contains: "Trèfle d'Or", mode: 'insensitive' }
            }
        });

        if (!clinic) {
            clinic = await prisma.clinic.create({
                data: {
                    name: "Clinique dentaire Trèfle d'Or",
                    timezone: "Europe/Zurich",
                    default_language: "fr",
                    phone: "+41 22 XXX XX XX", // À remplacer
                    address: "Lancy 1212, Genève, Suisse",
                    email: "contact@trefle-dor.ch",
                    website: "https://www.trefle-dor.ch",
                    opening_hours: JSON.stringify({
                        monday: { open: "08:00", close: "18:00" },
                        tuesday: { open: "08:00", close: "18:00" },
                        wednesday: { open: "08:00", close: "18:00" },
                        thursday: { open: "08:00", close: "18:00" },
                        friday: { open: "08:00", close: "17:00" },
                        saturday: { closed: true },
                        sunday: { closed: true }
                    }),
                    emergency_message: "En cas d'urgence dentaire, veuillez contacter le service d'urgence au +41 22 XXX XX XX",
                    is_active: true
                }
            });
            console.log(`✅ Created clinic: ${clinic.name} (ID: ${clinic.id})\n`);
        } else {
            console.log(`✅ Clinic already exists: ${clinic.name} (ID: ${clinic.id})\n`);
        }

        // 2. Create practitioners
        console.log('👨‍⚕️ Creating practitioners...\n');

        for (const practData of TREFLE_DOR_PRACTITIONERS) {
            const existing = await prisma.practitioner.findFirst({
                where: {
                    clinic_id: clinic.id,
                    first_name: practData.first_name,
                    last_name: practData.last_name
                }
            });

            if (!existing) {
                const practitioner = await prisma.practitioner.create({
                    data: {
                        clinic_id: clinic.id,
                        first_name: practData.first_name,
                        last_name: practData.last_name,
                        specialty: practData.specialty,
                        google_calendar_id: practData.google_calendar_id,
                        is_active: true
                    }
                });

                console.log(`✅ Created: Dr ${practitioner.first_name} ${practitioner.last_name} (${practitioner.specialty})`);
            } else {
                console.log(`⏭️  Already exists: Dr ${practData.first_name} ${practData.last_name}`);
            }
        }

        console.log('\n✨ Clinique dentaire Trèfle d\'Or setup completed!\n');
        console.log('📋 Next steps:');
        console.log('   1. Run: npx ts-node scripts/seed-treatments.ts');
        console.log('   2. Run: npx ts-node scripts/assign-treatments.ts ' + clinic.id);
        console.log('   3. Update Google Calendar IDs in the database if needed\n');

        return clinic;

    } catch (error) {
        console.error('❌ Error creating clinic:', error);
        throw error;
    }
}

async function main() {
    try {
        await createTrefleDorClinic();
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
