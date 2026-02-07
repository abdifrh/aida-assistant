import prisma from '../src/database/client';

async function seed() {
    console.log('🌱 Seeding database...');

    // Create a test clinic
    // Créer une clinique de test
    const clinic = await prisma.clinic.create({
        data: {
            name: 'Clinique Médicale Test',
            timezone: 'Europe/Paris',
            default_language: 'fr',
            phone: '+33 1 23 45 67 89',
            address: '123 Avenue de la République, 75011 Paris',
            email: 'contact@clinique-test.fr',
            website: 'https://www.clinique-test.fr',
            opening_hours: 'Lundi-Mercredi: 08:00-19:00, Jeudi: 08:00-19:00, Vendredi: 08:00-18:00, Samedi: 09:00-13:00, Dimanche: Fermé',
            emergency_message:
                '🚨 URGENCE DÉTECTÉE\n\nVeuillez appeler immédiatement le 15 (SAMU) ou vous rendre aux urgences.\n\nPour parler à notre équipe, tapez HUMAIN.',
            is_active: true,
        },
    });

    console.log('✅ Clinic created:', clinic.name);

    // Create test practitioners
    // Créer des praticiens de test
    const practitioner1 = await prisma.practitioner.create({
        data: {
            clinic_id: clinic.id,
            first_name: 'Marie',
            last_name: 'Dupont',
            specialty: 'Médecin généraliste',
            google_calendar_id: 'primary', // Will be replaced with real calendar ID
            is_active: true,
        },
    });

    const practitioner2 = await prisma.practitioner.create({
        data: {
            clinic_id: clinic.id,
            first_name: 'Jean',
            last_name: 'Martin',
            specialty: 'Dentiste',
            google_calendar_id: 'primary',
            is_active: true,
        },
    });

    console.log('✅ Practitioners created:', practitioner1.first_name, practitioner2.first_name);

    // Create WhatsApp config (you need to replace with real credentials)
    // Créer la configuration WhatsApp (à remplacer par de vraies credentials)
    const whatsappConfig = await prisma.clinicWhatsAppConfig.create({
        data: {
            clinic_id: clinic.id,
            phone_number: 'YOUR_PHONE_NUMBER_ID', // Replace with your Meta phone number ID
            verify_token: 'your_verify_token_here',
            access_token: 'YOUR_WHATSAPP_ACCESS_TOKEN', // Replace with your Meta access token
            webhook_secret: 'your_webhook_secret',
            api_version: 'v18.0',
            provider: 'meta',
            is_active: true,
        },
    });

    console.log('✅ WhatsApp config created for phone:', whatsappConfig.phone_number);

    console.log('\n🎉 Seeding completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Update WhatsApp credentials in the database');
    console.log('2. Set up Google Calendar OAuth for practitioners');
    console.log('3. Configure Qwen LLM at', process.env.LLM_API_URL);
}

seed()
    .catch((error) => {
        console.error('❌ Seeding failed:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
