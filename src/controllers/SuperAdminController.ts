import { Response } from 'express';
import prisma from '../database/client';
import { AuthRequest, generateToken, comparePassword } from '../middleware/auth';
import { llmService } from '../services/LLMService';
import path from 'path';
import fs from 'fs';

export class SuperAdminController {

    // Global Login
    async login(req: any, res: Response) {
        try {
            const { username, password } = req.body;

            const user = await prisma.clinicUser.findUnique({
                where: { username },
                include: { clinic: true }
            });

            if (!user) {
                return res.status(401).json({ error: 'Identifiants invalides' });
            }

            // Check Role
            if (user.role !== 'SUPERADMIN') {
                return res.status(403).json({ error: 'Accès refusé : privilèges SuperAdmin requis' });
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
            console.error('SuperAdmin login error:', error);
            res.status(500).json({ error: 'Erreur serveur' });
        }
    }

    // Global Dashboard Stats
    async getGlobalStats(req: AuthRequest, res: Response) {
        try {
            const [
                totalClinics,
                totalPatients,
                totalConversations,
                totalAppointments,
                totalPractitioners,
                recentLogs
            ] = await Promise.all([
                prisma.clinic.count(),
                prisma.patient.count(),
                prisma.conversation.count(),
                prisma.appointment.count(),
                prisma.practitioner.count(),
                prisma.systemLog.findMany({
                    take: 10,
                    orderBy: { created_at: 'desc' },
                    include: { clinic: true }
                })
            ]);

            res.json({
                stats: {
                    totalClinics,
                    totalPatients,
                    totalConversations,
                    totalAppointments,
                    totalPractitioners
                },
                recentLogs
            });
        } catch (error) {
            console.error('SuperAdmin stats error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get All Practitioners (Global)
    async getAllPractitioners(req: AuthRequest, res: Response) {
        try {
            const practitioners = await prisma.practitioner.findMany({
                include: {
                    clinic: true,
                    calendar_integration: true,
                    _count: {
                        select: { appointments: true }
                    }
                },
                orderBy: { created_at: 'desc' }
            });
            res.json(practitioners);
        } catch (error) {
            console.error('Get all practitioners error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get Practitioner Details (Global)
    async getPractitionerDetails(req: AuthRequest, res: Response) {
        try {
            const practitionerId = req.params.practitionerId as string;
            const practitioner = await prisma.practitioner.findUnique({
                where: { id: practitionerId },
                include: {
                    clinic: true,
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
                return res.status(404).json({ error: 'Médecin non trouvé' });
            }

            res.json(practitioner);
        } catch (error) {
            console.error('Get practitioner details error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get All Appointments (Global)
    async getAllAppointments(req: AuthRequest, res: Response) {
        try {
            const { page = 1, limit = 50, clinicId, status, practitionerId } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where: any = {};
            if (clinicId) {
                where.practitioner = { clinic_id: clinicId as string };
            }
            if (status) where.status = status as string;
            if (practitionerId) where.practitioner_id = practitionerId as string;

            const [appointments, total] = await Promise.all([
                prisma.appointment.findMany({
                    where,
                    include: {
                        practitioner: {
                            include: { clinic: true }
                        },
                        patient: true,
                        treatment_type: true
                    },
                    orderBy: { start_time: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                prisma.appointment.count({ where })
            ]);

            res.json({
                appointments,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    totalPages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error('Get all appointments error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get All Logs (Global)
    async getAllLogs(req: AuthRequest, res: Response) {
        try {
            const { page = 1, limit = 50, level, category, clinicId } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where: any = {};
            if (level) where.level = level as string;
            if (category) where.category = category as string;
            if (clinicId) where.clinic_id = clinicId as string;

            const [logs, total] = await Promise.all([
                prisma.systemLog.findMany({
                    where,
                    include: {
                        clinic: true
                    },
                    orderBy: { created_at: 'desc' },
                    skip,
                    take: Number(limit)
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
            console.error('Get all logs error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get All Conversations (Global)
    async getAllConversations(req: AuthRequest, res: Response) {
        try {
            const { page = 1, limit = 20, clinicId, state, search } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where: any = {};
            if (clinicId) where.clinic_id = clinicId as string;
            if (state) where.current_state = state as string;
            if (search) {
                where.user_phone = { contains: search as string };
            }

            const [conversations, total] = await Promise.all([
                prisma.conversation.findMany({
                    where,
                    include: {
                        clinic: true,
                        messages: {
                            orderBy: { created_at: 'desc' },
                            take: 1
                        }
                    },
                    orderBy: { updated_at: 'desc' },
                    skip,
                    take: Number(limit)
                }),
                prisma.conversation.count({ where })
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
            console.error('Get all conversations error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get Single Conversation (Global)
    async getConversation(req: AuthRequest, res: Response) {
        try {
            const conversationId = req.params.conversationId as string;
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    clinic: true,
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
                    ? `/api/superadmin/images/${conversation.clinic_id}/${path.basename(msg.file_path)}`
                    : null
            }));

            res.json({
                ...conversation,
                messages: messagesWithImages
            });
        } catch (error) {
            console.error('Get conversation error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // New: Deep conversation analysis with message range selection
    async getConversationAnalysis(req: AuthRequest, res: Response) {
        try {
            console.log('[DEBUG] getConversationAnalysis called');
            const conversationId = req.params.conversationId as string;
            const { startIndex, endIndex } = req.body;

            console.log('[DEBUG] Conversation ID:', conversationId);
            console.log('[DEBUG] Start Index:', startIndex);
            console.log('[DEBUG] End Index:', endIndex);

            // Fetch conversation with all related data
            const conversation = await prisma.conversation.findUnique({
                where: { id: conversationId },
                include: {
                    messages: { orderBy: { created_at: 'asc' } },
                    clinic: true
                }
            });

            if (!conversation) {
                console.log('[DEBUG] Conversation not found');
                return res.status(404).json({ error: 'Conversation non trouvée' });
            }

            console.log('[DEBUG] Conversation found, messages:', conversation.messages.length);

            if (conversation.messages.length === 0) {
                console.log('[DEBUG] No messages in conversation');
                return res.json({
                    summary: "Aucun message dans cette conversation.",
                    sentiment: "NEUTRAL",
                    satisfaction_score: 0,
                    data_extracted: { patient_identity: "INCOMPLETE", appointment_details: "NOT_RELEVANT" },
                    recommendation: "Attendre le premier message du patient.",
                    potential_issues: [],
                    context_info: null
                });
            }

            // Select message range
            const start = startIndex !== undefined ? startIndex : 0;
            const end = endIndex !== undefined ? endIndex : conversation.messages.length;
            const selectedMessages = conversation.messages.slice(start, end);

            console.log('[DEBUG] Selected messages:', selectedMessages.length, 'from', start, 'to', end);

            // Fetch patient data
            const patient = await prisma.patient.findFirst({
                where: {
                    phone: conversation.user_phone,
                    clinic_id: conversation.clinic_id
                },
                include: {
                    appointments: {
                        orderBy: { start_time: 'desc' },
                        take: 5,
                        include: { practitioner: true }
                    }
                }
            });

            // Fetch related logs for this conversation
            const logs = await prisma.systemLog.findMany({
                where: {
                    clinic_id: conversation.clinic_id,
                    created_at: {
                        gte: new Date(conversation.created_at.getTime() - 3600000), // 1 hour before
                        lte: new Date(conversation.updated_at.getTime() + 3600000)  // 1 hour after
                    }
                },
                orderBy: { created_at: 'asc' },
                take: 50
            });

            // Build comprehensive context
            const analysisContext = {
                conversation_state: conversation.current_state,
                detected_language: conversation.detected_language,
                total_messages: conversation.messages.length,
                selected_range: `${start + 1} to ${end}`,
                patient_info: patient ? {
                    name: `${patient.first_name || ''} ${patient.last_name || ''}`.trim() || 'N/A',
                    has_insurance: !!patient.insurance_card_url,
                    appointments_count: patient.appointments.length,
                    recent_appointments: patient.appointments.slice(0, 3).map(apt => ({
                        date: apt.start_time,
                        practitioner: `Dr ${apt.practitioner.last_name}`,
                        status: apt.status
                    }))
                } : null,
                context_data: conversation.context_data,
                clinic_name: conversation.clinic.name
            };

            // Perform comprehensive analysis
            console.log('[DEBUG] Calling analyzeConversationComplete...');
            console.log('[DEBUG] Analysis context:', JSON.stringify(analysisContext, null, 2));
            console.log('[DEBUG] Logs count:', logs.length);

            const analysis = await llmService.analyzeConversationComplete(
                selectedMessages,
                analysisContext,
                logs
            );

            console.log('[DEBUG] Analysis completed:', analysis ? 'Success' : 'Failed');

            // Save analysis to database if successful
            if (analysis) {
                try {
                    const savedAnalysis = await prisma.conversationAnalysis.create({
                        data: {
                            conversation_id: conversationId,
                            clinic_id: conversation.clinic_id,
                            message_range_start: start,
                            message_range_end: end,
                            total_messages: conversation.messages.length,
                            analysis_result: analysis as any
                        }
                    });
                    console.log('[DEBUG] Analysis saved to database with ID:', savedAnalysis.id);

                    // Add the database ID to the response
                    res.json({ ...analysis, analysis_id: savedAnalysis.id });
                } catch (saveError) {
                    console.error('[DEBUG] Failed to save analysis to database:', saveError);
                    // Still return the analysis even if saving fails
                    res.json(analysis);
                }
            } else {
                res.json(analysis);
            }
        } catch (error) {
            console.error('[DEBUG] Analyze conversation error:', error);
            console.error('[DEBUG] Error stack:', error instanceof Error ? error.stack : 'No stack');
            res.status(500).json({ error: 'Server error', details: error instanceof Error ? error.message : String(error) });
        }
    }

    // Get analysis history for a conversation
    async getConversationAnalysisHistory(req: AuthRequest, res: Response) {
        try {
            const conversationId = req.params.conversationId as string;

            const analyses = await prisma.conversationAnalysis.findMany({
                where: { conversation_id: conversationId },
                orderBy: { created_at: 'desc' }
            });

            res.json(analyses);
        } catch (error) {
            console.error('Get analysis history error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get detailed statistics
    async getDetailedStats(req: AuthRequest, res: Response) {
        try {
            const { clinicId, startDate, endDate } = req.query;

            const where: any = {};
            if (clinicId) where.clinic_id = clinicId as string;

            const dateFilter: any = {};
            if (startDate) dateFilter.gte = new Date(startDate as string);
            if (endDate) dateFilter.lte = new Date(endDate as string);

            // Basic counts
            const totalClinics = await prisma.clinic.count();

            const practitionerWhere: any = {};
            if (clinicId) practitionerWhere.clinic_id = clinicId as string;
            const totalPractitioners = await prisma.practitioner.count({ where: practitionerWhere });

            const patientWhere: any = {};
            if (clinicId) patientWhere.clinic_id = clinicId as string;
            const totalPatients = await prisma.patient.count({ where: patientWhere });

            const appointmentWhere: any = {};
            if (clinicId) appointmentWhere.practitioner = { clinic_id: clinicId as string };
            if (Object.keys(dateFilter).length > 0) appointmentWhere.created_at = dateFilter;
            const totalAppointments = await prisma.appointment.count({ where: appointmentWhere });

            const conversationWhere: any = {};
            if (clinicId) conversationWhere.clinic_id = clinicId as string;
            if (Object.keys(dateFilter).length > 0) conversationWhere.created_at = dateFilter;
            const totalConversations = await prisma.conversation.count({ where: conversationWhere });

            // Conversation states distribution
            const conversations = await prisma.conversation.findMany({
                where: {
                    ...(clinicId ? { clinic_id: clinicId as string } : {}),
                    ...(Object.keys(dateFilter).length > 0 ? { created_at: dateFilter } : {})
                },
                select: { current_state: true }
            });

            const stateDistribution = conversations.reduce((acc: any, conv) => {
                acc[conv.current_state] = (acc[conv.current_state] || 0) + 1;
                return acc;
            }, {});

            // Appointment status distribution
            const appointments = await prisma.appointment.findMany({
                where: {
                    ...(clinicId ? { practitioner: { clinic_id: clinicId as string } } : {}),
                    ...(Object.keys(dateFilter).length > 0 ? { created_at: dateFilter } : {})
                },
                select: { status: true }
            });

            const appointmentStatusDistribution = appointments.reduce((acc: any, apt) => {
                acc[apt.status] = (acc[apt.status] || 0) + 1;
                return acc;
            }, {});

            // Analyses statistics
            const analyses = await prisma.conversationAnalysis.findMany({
                where: {
                    ...(clinicId ? { clinic_id: clinicId as string } : {}),
                    ...(Object.keys(dateFilter).length > 0 ? { created_at: dateFilter } : {})
                },
                select: { analysis_result: true }
            });

            const sentimentDistribution: any = { POSITIVE: 0, NEUTRAL: 0, NEGATIVE: 0, FRUSTRATED: 0 };
            let totalSatisfaction = 0;
            let satisfactionCount = 0;
            let completeIdentity = 0;
            let completeAppointment = 0;

            analyses.forEach(a => {
                const result = a.analysis_result as any;
                if (result.sentiment) {
                    sentimentDistribution[result.sentiment] = (sentimentDistribution[result.sentiment] || 0) + 1;
                }
                if (result.satisfaction_score) {
                    totalSatisfaction += result.satisfaction_score;
                    satisfactionCount++;
                }
                if (result.data_extracted?.patient_identity === 'COMPLETE') completeIdentity++;
                if (result.data_extracted?.appointment_details === 'COMPLETE') completeAppointment++;
            });

            const averageSatisfaction = satisfactionCount > 0 ? parseFloat((totalSatisfaction / satisfactionCount).toFixed(1)) : 0;
            const completionRate = analyses.length > 0 ? {
                identity: ((completeIdentity / analyses.length) * 100).toFixed(1),
                appointment: ((completeAppointment / analyses.length) * 100).toFixed(1)
            } : { identity: 0, appointment: 0 };

            // Conversion rate (conversations -> appointments)
            const conversionRate = totalConversations > 0 ? parseFloat(((totalAppointments / totalConversations) * 100).toFixed(1)) : 0;

            // Recent activity (last 7 days)
            const last7Days = new Date();
            last7Days.setDate(last7Days.getDate() - 7);

            const recentConversations = await prisma.conversation.count({
                where: {
                    ...(clinicId ? { clinic_id: clinicId as string } : {}),
                    created_at: { gte: last7Days }
                }
            });

            const recentAppointments = await prisma.appointment.count({
                where: {
                    ...(clinicId ? { practitioner: { clinic_id: clinicId as string } } : {}),
                    created_at: { gte: last7Days }
                }
            });

            res.json({
                overview: {
                    totalClinics,
                    totalPractitioners,
                    totalPatients,
                    totalAppointments,
                    totalConversations,
                    totalAnalyses: analyses.length
                },
                conversations: {
                    total: totalConversations,
                    stateDistribution,
                    recent7Days: recentConversations
                },
                appointments: {
                    total: totalAppointments,
                    statusDistribution: appointmentStatusDistribution,
                    recent7Days: recentAppointments
                },
                analyses: {
                    total: analyses.length,
                    sentimentDistribution,
                    averageSatisfaction,
                    completionRate
                },
                performance: {
                    conversionRate
                }
            });
        } catch (error) {
            console.error('Get detailed stats error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get all analyses with filters
    async getAllAnalyses(req: AuthRequest, res: Response) {
        try {
            const { page = 1, limit = 50, clinicId, sentiment } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where: any = {};
            if (clinicId) where.clinic_id = clinicId as string;

            // Filter by sentiment (in JSON field)
            // Note: This requires filtering in memory as Prisma doesn't support JSON filtering directly

            const analyses = await prisma.conversationAnalysis.findMany({
                where,
                include: {
                    conversation: {
                        include: {
                            clinic: true
                        }
                    }
                },
                orderBy: { created_at: 'desc' },
                skip,
                take: Number(limit)
            });

            // Filter by sentiment if provided
            let filteredAnalyses = analyses;
            if (sentiment) {
                filteredAnalyses = analyses.filter(a => {
                    const result = a.analysis_result as any;
                    return result?.sentiment === sentiment;
                });
            }

            const total = await prisma.conversationAnalysis.count({ where });

            res.json({
                analyses: filteredAnalyses,
                pagination: {
                    page: Number(page),
                    limit: Number(limit),
                    total,
                    pages: Math.ceil(total / Number(limit))
                }
            });
        } catch (error) {
            console.error('Get all analyses error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get All Patients (Global)
    async getAllPatients(req: AuthRequest, res: Response) {
        try {
            const { page = 1, limit = 50, search, clinicId } = req.query;
            const skip = (Number(page) - 1) * Number(limit);

            const where: any = {};
            if (clinicId) where.clinic_id = clinicId as string;

            if (search) {
                const searchStr = search as string;
                where.OR = [
                    { first_name: { contains: searchStr, mode: 'insensitive' } },
                    { last_name: { contains: searchStr, mode: 'insensitive' } },
                    { phone: { contains: searchStr } },
                    { email: { contains: searchStr, mode: 'insensitive' } }
                ];
            }

            const [patients, total] = await Promise.all([
                prisma.patient.findMany({
                    where,
                    include: {
                        clinic: true,
                        appointments: {
                            take: 10,
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
            console.error('Get all patients error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get All Clinics (Global)
    async getAllClinics(req: AuthRequest, res: Response) {
        try {
            const clinics = await prisma.clinic.findMany({
                include: {
                    whatsapp_configs: true,
                    _count: {
                        select: {
                            patients: true,
                            practitioners: true,
                            conversations: true
                        }
                    }
                },
                orderBy: { created_at: 'desc' }
            });
            res.json(clinics);
        } catch (error) {
            console.error('Get all clinics error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Get Clinic Details (Global)
    async getClinicDetails(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const clinic = await prisma.clinic.findUnique({
                where: { id: clinicId },
                include: {
                    whatsapp_configs: true,
                    _count: {
                        select: {
                            patients: true,
                            practitioners: true,
                            conversations: true
                        }
                    },
                    practitioners: {
                        include: {
                            _count: {
                                select: { appointments: true }
                            }
                        }
                    },
                    patients: {
                        take: 10,
                        orderBy: { created_at: 'desc' }
                    },
                    conversations: {
                        take: 10,
                        orderBy: { updated_at: 'desc' },
                        include: {
                            messages: {
                                take: 1,
                                orderBy: { created_at: 'desc' }
                            }
                        }
                    }
                }
            });

            if (!clinic) {
                return res.status(404).json({ error: 'Clinique non trouvée' });
            }

            res.json(clinic);
        } catch (error) {
            console.error('Get clinic details error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Update Clinic (Global)
    async updateClinic(req: AuthRequest, res: Response) {
        try {
            const clinicId = req.params.clinicId as string;
            const {
                name, address, phone, email, website, timezone,
                default_language, opening_hours, emergency_message,
                // WhatsApp fields
                whatsapp_phone_number_id,
                whatsapp_verify_token,
                whatsapp_access_token,
                whatsapp_webhook_secret
            } = req.body;

            const updatedClinic = await prisma.clinic.update({
                where: { id: clinicId },
                data: {
                    name, address, phone, email, website, timezone,
                    default_language, opening_hours, emergency_message
                }
            });

            // Handle WhatsApp Config
            if (whatsapp_phone_number_id !== undefined) {
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
                            phone_number: (whatsapp_phone_number_id as string) || '',
                            verify_token: (whatsapp_verify_token as string) || '',
                            access_token: (whatsapp_access_token as string) || '',
                            webhook_secret: (whatsapp_webhook_secret as string) || '',
                            provider: 'meta'
                        }
                    });
                }
            }

            res.json(updatedClinic);
        } catch (error) {
            console.error('Update clinic error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Update Practitioner (Global)
    async updatePractitioner(req: AuthRequest, res: Response) {
        try {
            const practitionerId = req.params.practitionerId as string;
            const { first_name, last_name, specialty, google_calendar_id, is_active } = req.body;

            const practitioner = await prisma.practitioner.update({
                where: { id: practitionerId },
                data: {
                    first_name,
                    last_name,
                    specialty,
                    google_calendar_id,
                    is_active: is_active !== undefined ? Boolean(is_active) : undefined
                }
            });

            res.json(practitioner);
        } catch (error) {
            console.error('Update practitioner error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }

    // Serve image - super admin has access to all clinics
    // Servir une image - le super admin a accès à toutes les cliniques
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

            // Serve the file
            // Servir le fichier
            res.sendFile(filePath);
        } catch (error) {
            console.error('Serve image error:', error);
            res.status(500).json({ error: 'Server error' });
        }
    }
}
