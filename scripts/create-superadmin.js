const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    const username = 'admin';
    const password = 'password123';

    console.log(`Creating SuperAdmin user...`);
    console.log(`Username: ${username}`);
    console.log(`Password: ${password}`);

    // 1. Get or Create a Clinic
    let clinic = await prisma.clinic.findFirst();
    if (!clinic) {
        console.log('No clinic found. Creating default system clinic...');
        clinic = await prisma.clinic.create({
            data: {
                name: 'System Clinic',
                timezone: 'Europe/Paris',
                address: 'System Address',
                phone: '0000000000'
            }
        });
    }

    // 2. Hash Password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Create/Update SuperAdmin
    const user = await prisma.clinicUser.upsert({
        where: { username },
        update: {
            password: hashedPassword,
            role: 'SUPERADMIN',
            clinic_id: clinic.id
        },
        create: {
            username,
            password: hashedPassword,
            role: 'SUPERADMIN',
            clinic_id: clinic.id
        }
    });

    console.log(`✅ SuperAdmin created successfully!`);
    console.log(`ID: ${user.id}`);
    console.log(`Role: ${user.role}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
