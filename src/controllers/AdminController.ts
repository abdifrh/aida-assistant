import { Response } from 'express';
import prisma from '../database/client';
import { AuthRequest, generateToken, comparePassword, hashPassword } from '../middleware/auth';
import path from 'path';
import fs from 'fs';

export class AdminController {
    // Login
    async login(req: AuthRequest, res: Response) {
        try {
            const { username, password } = req.body;
            const clinicIdFromUrl = req.params.clinicId;

            if (!clinicIdFromUrl) {
                return res.status(400).json({ error: 'ID de clinique manquant' });
            }

            const user = await prisma.clinicUser.findUnique({
                where: { username },
                include: { clinic: true }
            });

            if (!user) {
                return res.status(401).json({ error: 'Identifiants invalides' });
            }

            // Verify user belongs to the clinic in the URL (except for SuperAdmins)
            if (user.role !== 'SUPERADMIN' && user.clinic_id !== clinicIdFromUrl) {
                return res.status(403).json({ error: 'Accès refusé : vous n\'appartenez pas à cette clinique' });
            }

            const isValid = await comparePassword(password, user.password);
            if (!isValid) {
                return res.status(401).json({ error: 'Identifiants invalides' });
            }

            const token = generateToken(user.id, user.clinic_id, user.role);

            res.json({
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    role: user.role,
                    clinic: {
                        id: user.clinic.id,
                        name: user.clinic.name
                    }
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Dashboard Stats
    async getDashboardStats(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;

            const [
                totalPatients,
                totalConversations,
                totalAppointments,
                activePractitioners,
                recentConversations
            ] = await Promise.all([
                prisma.patient.count({ where: { clinic_id: clinicId } }),
                prisma.conversation.count({ where: { clinic_id: clinicId } }),
                prisma.appointment.count({
                    where: {
                        practitioner: { clinic_id: clinicId }
                    }
                }),
                prisma.practitioner.count({
                    where: { clinic_id: clinicId, is_active: true }
                }),
                prisma.conversation.findMany({
                    where: { clinic_id: clinicId },
                    include: {
                        messages: {
                            orderBy: { created_at: 'desc' },
                            take: 1
                        }
                    },
                    orderBy: { updated_at: 'desc' },
                    take: 10
                })
            ]);

            res.json({
                stats: {
                    totalPatients,
                    totalConversations,
                    totalAppointments,
                    activePractitioners
                },
                recentConversations
            });
        } catch (error) {
            console.error('Dashboard stats error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get all conversations
    async getConversations(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const { page = 1, limit = 20 } = req.query;

            const skip = (Number(page) - 1) * Number(limit);

            const [conversations, total] = await Promise.all([
                prisma.conversation.findMany({
                    where: { clinic_id: clinicId },
                    include: {
                        messages: {
                            orderBy: { created_at: 'desc' },
                            take: 5
                        }
                    },
                    orderBy: { updated_at: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                prisma.conversation.count({ where: { clinic_id: clinicId } })
            ]);

            res.json({
                conversations,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error('Get conversations error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get conversation details
    async getConversationDetails(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const conversationId = String(req.params.conversationId);

            const conversation = await prisma.conversation.findFirst({
                where: {
                    id: conversationId,
                    clinic_id: clinicId
                },
                include: {
                    messages: {
                        orderBy: { created_at: 'asc' }
                    }
                }
            });

            if (!conversation) {
                return res.status(404).json({ error: 'Conversation non trouvée' });
            }

            // Transform messages to include image URLs
            // Transformer les messages pour inclure les URLs d'images
            const messagesWithImages = conversation.messages.map(msg => ({
                id: msg.id,
                role: msg.role,
                content: msg.content,
                created_at: msg.created_at,
                media_type: msg.media_type,
                image_url: msg.file_path
                    ? `/api/clinic/${clinicId}/admin/images/${path.basename(msg.file_path)}`
                    : null
            }));

            res.json({
                ...conversation,
                messages: messagesWithImages
            });
        } catch (error) {
            console.error('Get conversation details error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get all practitioners
    async getPractitioners(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;

            const practitioners = await prisma.practitioner.findMany({
                where: { clinic_id: clinicId },
                include: {
                    calendar_integration: true,
                    appointments: {
                        where: {
                            start_time: {
                                gte: new Date()
                            }
                        },
                        take: 5,
                        orderBy: { start_time: 'asc' }
                    }
                }
            });

            res.json(practitioners);
        } catch (error) {
            console.error('Get practitioners error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Create practitioner
    async createPractitioner(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const { first_name, last_name, specialty, google_calendar_id } = req.body;

            const practitioner = await prisma.practitioner.create({
                data: {
                    clinic_id: clinicId,
                    first_name,
                    last_name,
                    specialty,
                    google_calendar_id
                }
            });

            res.status(201).json(practitioner);
        } catch (error) {
            console.error('Create practitioner error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Update practitioner
    async updatePractitioner(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const practitionerId = String(req.params.practitionerId);
            const { first_name, last_name, specialty, google_calendar_id, is_active } = req.body;

            // Verify practitioner belongs to clinic
            const existing = await prisma.practitioner.findFirst({
                where: {
                    id: practitionerId,
                    clinic_id: clinicId
                }
            });

            if (!existing) {
                return res.status(404).json({ error: 'Praticien non trouvé' });
            }

            const practitioner = await prisma.practitioner.update({
                where: { id: practitionerId },
                data: {
                    first_name,
                    last_name,
                    specialty,
                    google_calendar_id,
                    is_active
                }
            });

            res.json(practitioner);
        } catch (error) {
            console.error('Update practitioner error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    async getPractitionerDetails(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const practitionerId = req.params.practitionerId as string;

            const practitioner = await prisma.practitioner.findFirst({
                where: {
                    id: practitionerId,
                    clinic_id: clinicId
                },
                include: {
                    treatments: {
                        include: { treatment_type: true }
                    },
                    appointments: {
                        take: 10,
                        orderBy: { start_time: 'desc' },
                        include: { patient: true }
                    },
                    _count: {
                        select: { appointments: true }
                    }
                }
            });

            if (!practitioner) {
                return res.status(404).json({ error: 'Praticien non trouvé' });
            }

            res.json(practitioner);
        } catch (error) {
            console.error('Get practitioner details error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get all patients
    async getPatients(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const { page = 1, limit = 50, search } = req.query;

            const skip = (Number(page) - 1) * Number(limit);

            const where: any = { clinic_id: clinicId };

            if (search) {
                where.OR = [
                    { first_name: { contains: String(search), mode: 'insensitive' } },
                    { last_name: { contains: String(search), mode: 'insensitive' } },
                    { phone: { contains: String(search) } }
                ];
            }

            const [patients, total] = await Promise.all([
                prisma.patient.findMany({
                    where,
                    include: {
                        appointments: {
                            take: 5,
                            orderBy: { start_time: 'desc' },
                            include: {
                                practitioner: true
                            }
                        }
                    },
                    orderBy: { created_at: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                prisma.patient.count({ where })
            ]);

            res.json({
                patients,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error('Get patients error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get all appointments
    async getAppointments(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const { startDate, endDate, practitionerId, status } = req.query;

            const where: any = {
                practitioner: { clinic_id: clinicId }
            };

            if (startDate && endDate) {
                where.start_time = {
                    gte: new Date(String(startDate)),
                    lte: new Date(String(endDate))
                };
            }

            if (practitionerId) {
                where.practitioner_id = String(practitionerId);
            }

            if (status) {
                where.status = String(status);
            }

            const appointments = await prisma.appointment.findMany({
                where,
                include: {
                    practitioner: true,
                    patient: true
                },
                orderBy: { start_time: 'asc' }
            });

            res.json(appointments);
        } catch (error) {
            console.error('Get appointments error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Update calendar integration
    async updateCalendarIntegration(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const practitionerId = String(req.params.practitionerId);
            const { calendar_id, access_token, refresh_token } = req.body;

            // Verify practitioner belongs to clinic
            const practitioner = await prisma.practitioner.findFirst({
                where: {
                    id: practitionerId,
                    clinic_id: clinicId
                }
            });

            if (!practitioner) {
                return res.status(404).json({ error: 'Praticien non trouvé' });
            }

            const integration = await prisma.practitionerCalendarIntegration.upsert({
                where: { practitioner_id: practitionerId },
                create: {
                    practitioner_id: practitionerId,
                    calendar_id,
                    access_token,
                    refresh_token,
                    provider: 'google'
                },
                update: {
                    calendar_id,
                    access_token,
                    refresh_token
                }
            });

            res.json(integration);
        } catch (error) {
            console.error('Update calendar integration error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get system logs
    async getSystemLogs(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const { page = 1, limit = 50, level, category } = req.query;

            const skip = (Number(page) - 1) * Number(limit);

            const where: any = { clinic_id: clinicId };
            if (level) where.level = String(level);
            if (category) where.category = String(category);

            const [logs, total] = await Promise.all([
                prisma.systemLog.findMany({
                    where,
                    orderBy: { created_at: 'desc' },
                    take: Number(limit),
                    skip,
                    include: {
                        conversation: {
                            select: {
                                id: true,
                                user_phone: true
                            }
                        }
                    }
                }),
                prisma.systemLog.count({ where })
            ]);

            res.json({
                logs,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error('Get system logs error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get clinic details
    async getClinicDetails(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const clinic = await prisma.clinic.findUnique({
                where: { id: clinicId },
                include: {
                    whatsapp_configs: {
                        where: { is_active: true },
                        take: 1
                    }
                }
            });

            if (!clinic) {
                return res.status(404).json({ error: 'Clinique non trouvée' });
            }

            // Map whatsapp_configs array to a single whatsapp_config object for the frontend
            const clinicData = {
                ...clinic,
                whatsapp_config: clinic.whatsapp_configs[0] || null
            };

            res.json(clinicData);
        } catch (error) {
            console.error('Get clinic details error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Update clinic details
    async updateClinicDetails(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const {
                name,
                address,
                phone,
                email,
                website,
                opening_hours,
                timezone,
                emergency_message,
                default_language,
                // WhatsApp Config
                whatsapp_phone_number_id,
                whatsapp_verify_token,
                whatsapp_access_token,
                whatsapp_webhook_secret
            } = req.body;

            const updatedClinic = await prisma.clinic.update({
                where: { id: clinicId },
                data: {
                    name,
                    address,
                    phone,
                    email,
                    website,
                    opening_hours,
                    timezone,
                    emergency_message,
                    default_language
                }
            });

            // Update or create WhatsApp config if provided
            if (whatsapp_phone_number_id) {
                const existingConfig = await prisma.clinicWhatsAppConfig.findFirst({
                    where: { clinic_id: clinicId }
                });

                if (existingConfig) {
                    await prisma.clinicWhatsAppConfig.update({
                        where: { id: existingConfig.id },
                        data: {
                            phone_number: whatsapp_phone_number_id,
                            verify_token: whatsapp_verify_token,
                            access_token: whatsapp_access_token,
                            webhook_secret: whatsapp_webhook_secret
                        }
                    });
                } else {
                    await prisma.clinicWhatsAppConfig.create({
                        data: {
                            clinic_id: clinicId,
                            phone_number: whatsapp_phone_number_id,
                            verify_token: whatsapp_verify_token || '',
                            access_token: whatsapp_access_token || '',
                            webhook_secret: whatsapp_webhook_secret || '',
                            provider: 'meta'
                        }
                    });
                }
            }

            // Refetch to get everything
            const finalClinic = await prisma.clinic.findUnique({
                where: { id: clinicId },
                include: {
                    whatsapp_configs: {
                        where: { is_active: true },
                        take: 1
                    }
                }
            });

            const finalClinicData = {
                ...finalClinic,
                whatsapp_config: finalClinic?.whatsapp_configs[0] || null
            };

            res.json(finalClinicData);
        } catch (error) {
            console.error('Update clinic details error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
    // Get all treatment types
    async getTreatmentTypes(req: AuthRequest, res: Response) {
        try {
            // Treatment types are global for now or we could link them to clinic.
            // In the current schema, they aren't linked to Clinic, but we filter them in UI.
            const treatments = await prisma.treatmentType.findMany({
                where: { is_active: true },
                orderBy: { name: 'asc' }
            });
            res.json(treatments);
        } catch (error) {
            console.error('Get treatment types error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Create treatment type
    async createTreatmentType(req: AuthRequest, res: Response) {
        try {
            const { name, name_en, description, duration_minutes } = req.body;
            const treatment = await prisma.treatmentType.create({
                data: {
                    name,
                    name_en,
                    description,
                    duration_minutes: Number(duration_minutes) || 30
                }
            });
            res.status(201).json(treatment);
        } catch (error) {
            console.error('Create treatment type error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Update treatment type
    async updateTreatmentType(req: AuthRequest, res: Response) {
        try {
            const treatmentId = String(req.params.treatmentId);
            const { name, name_en, description, duration_minutes, is_active } = req.body;

            const treatment = await prisma.treatmentType.update({
                where: { id: treatmentId },
                data: {
                    name,
                    name_en,
                    description,
                    duration_minutes: duration_minutes ? Number(duration_minutes) : undefined,
                    is_active
                }
            });
            res.json(treatment);
        } catch (error) {
            console.error('Update treatment type error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Delete treatment type (soft delete via is_active)
    async deleteTreatmentType(req: AuthRequest, res: Response) {
        try {
            const treatmentId = String(req.params.treatmentId);
            await prisma.treatmentType.update({
                where: { id: treatmentId },
                data: { is_active: false }
            });
            res.status(204).send();
        } catch (error) {
            console.error('Delete treatment type error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Get treatments for a specific practitioner
    async getPractitionerTreatments(req: AuthRequest, res: Response) {
        try {
            const practitionerId = String(req.params.practitionerId);
            const clinicId = req.params.clinicId as string;

            // Verify practitioner belongs to clinic
            const practitioner = await prisma.practitioner.findFirst({
                where: { id: practitionerId, clinic_id: clinicId }
            });

            if (!practitioner) {
                return res.status(404).json({ error: 'Praticien non trouvé' });
            }

            const practitionerTreatments = await prisma.practitionerTreatment.findMany({
                where: { practitioner_id: practitionerId },
                include: { treatment_type: true }
            });

            res.json(practitionerTreatments.map(pt => pt.treatment_type));
        } catch (error) {
            console.error('Get practitioner treatments error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Update treatments for a specific practitioner
    async updatePractitionerTreatments(req: AuthRequest, res: Response) {
        try {
            const practitionerId = String(req.params.practitionerId);
            const clinicId = req.params.clinicId as string;
            const { treatmentIds } = req.body; // Array of UUIDs

            // Verify practitioner belongs to clinic
            const practitioner = await prisma.practitioner.findFirst({
                where: { id: practitionerId, clinic_id: clinicId }
            });

            if (!practitioner) {
                return res.status(404).json({ error: 'Praticien non trouvé' });
            }

            // Sync: delete old ones and create new ones
            await prisma.practitionerTreatment.deleteMany({
                where: { practitioner_id: practitionerId }
            });

            if (treatmentIds && Array.isArray(treatmentIds)) {
                await Promise.all(treatmentIds.map(ttId =>
                    prisma.practitionerTreatment.create({
                        data: {
                            practitioner_id: practitionerId,
                            treatment_type_id: ttId
                        }
                    })
                ));
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Update practitioner treatments error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Serve image with clinic access control
    // Servir une image avec contrôle d'accès à la clinique
    async serveImage(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const filename = req.params.filename as string;

            // Security: Prevent directory traversal
            // Sécurité : empêcher directory traversal
            if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
                return res.status(400).json({ error: 'Invalid filename' });
            }

            // Construct file path
            // Construire le chemin du fichier
            const filePath = path.join(
                process.cwd(),
                'uploads',
                'images',
                clinicId,
                filename
            );

            // Check if file exists
            // Vérifier si le fichier existe
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Image not found' });
            }

            // Verify file belongs to this clinic by checking path
            // Vérifier que le fichier appartient à cette clinique
            const realPath = fs.realpathSync(filePath);
            const expectedDir = path.join(process.cwd(), 'uploads', 'images', clinicId);

            if (!realPath.startsWith(expectedDir)) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Serve the file
            // Servir le fichier
            res.sendFile(realPath);
        } catch (error) {
            console.error('Serve image error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }
}
