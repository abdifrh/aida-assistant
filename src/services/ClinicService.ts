import prisma from '../database/client';

export class ClinicService {
    async getClinicById(id: string) {
        return prisma.clinic.findUnique({
            where: { id }
        });
    }

    async updateClinic(id: string, data: {
        name?: string;
        timezone?: string;
        default_language?: string;
        phone?: string;
        address?: string;
        email?: string;
        website?: string;
        opening_hours?: string;
        emergency_message?: string;
        is_active?: boolean;
    }) {
        return prisma.clinic.update({
            where: { id },
            data
        });
    }
}
