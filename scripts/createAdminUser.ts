import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL!;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function createAdminUser() {
    try {
        // Get clinic ID from command line or use first clinic
        const clinics = await prisma.clinic.findMany();

        if (clinics.length === 0) {
            console.error('Aucune clinique trouvée. Veuillez d\'abord créer une clinique.');
            process.exit(1);
        }

        console.log('\nCliniques disponibles:');
        clinics.forEach((clinic: any, index: number) => {
            console.log(`${index + 1}. ${clinic.name} (ID: ${clinic.id})`);
        });

        const clinic = clinics[0]; // Use first clinic for now
        console.log(`\nUtilisation de la clinique: ${clinic.name}`);

        const username = process.argv[2] || 'admin';
        const password = process.argv[3] || 'admin123';

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await prisma.clinicUser.create({
            data: {
                clinic_id: clinic.id,
                username,
                password: hashedPassword,
                role: 'ADMIN'
            }
        });

        console.log('\n✅ Utilisateur admin créé avec succès!');
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);
        console.log(`Clinic: ${clinic.name}`);
        console.log(`\n🔗 Accédez au dashboard: http://localhost:3000/admin`);

    } catch (error: any) {
        if (error.code === 'P2002') {
            console.error('❌ Erreur: Un utilisateur avec ce nom existe déjà.');
        } else {
            console.error('❌ Erreur:', error.message);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        await pool.end();
    }
}

createAdminUser();
