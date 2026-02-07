import { google } from 'googleapis';
import prisma from '../database/client';
import { config } from '../config';

export class CalendarService {
    // Get OAuth2 client for a specific practitioner
    // Obtenir le client OAuth2 pour un praticien spécifique
    private async getOAuth2Client(practitionerId: string) {
        const integration = await prisma.practitionerCalendarIntegration.findUnique({
            where: { practitioner_id: practitionerId },
        });

        if (!integration || !integration.is_active) {
            throw new Error(`No active calendar integration for practitioner ${practitionerId}`);
        }

        const oauth2Client = new google.auth.OAuth2(
            config.google.clientId,
            config.google.clientSecret,
            config.google.redirectUri
        );

        oauth2Client.setCredentials({
            access_token: integration.access_token,
            refresh_token: integration.refresh_token,
            expiry_date: integration.token_expiry?.getTime(),
        });

        // Auto-refresh token if expired
        // Rafraîchir automatiquement le token s'il est expiré
        oauth2Client.on('tokens', async (tokens) => {
            if (tokens.refresh_token) {
                await prisma.practitionerCalendarIntegration.update({
                    where: { practitioner_id: practitionerId },
                    data: {
                        access_token: tokens.access_token!,
                        refresh_token: tokens.refresh_token,
                        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
                    },
                });
            }
        });

        return oauth2Client;
    }

    // Check availability for a practitioner
    // Vérifier la disponibilité d'un praticien
    async checkAvailability(
        practitionerId: string,
        startTime: Date,
        endTime: Date
    ): Promise<boolean> {
        try {
            const oauth2Client = await this.getOAuth2Client(practitionerId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const integration = await prisma.practitionerCalendarIntegration.findUnique({
                where: { practitioner_id: practitionerId },
            });

            if (!integration) return false;

            // Fetch busy times from Google Calendar
            // Récupérer les créneaux occupés depuis Google Calendar
            const response = await calendar.freebusy.query({
                requestBody: {
                    timeMin: startTime.toISOString(),
                    timeMax: endTime.toISOString(),
                    items: [{ id: integration.calendar_id }],
                },
            });

            const busySlots = response.data.calendars?.[integration.calendar_id]?.busy || [];

            // Check if requested time overlaps with any busy slot
            // Vérifier si le créneau demandé chevauche un créneau occupé
            const isAvailable = !busySlots.some((slot) => {
                const slotStart = new Date(slot.start!);
                const slotEnd = new Date(slot.end!);
                return startTime < slotEnd && endTime > slotStart;
            });

            return isAvailable;
        } catch (error) {
            console.error('Error checking availability:', error);
            return false;
        }
    }

    // Create an event in Google Calendar
    // Créer un événement dans Google Calendar
    async createEvent(
        practitionerId: string,
        patientName: string,
        patientPhone: string,
        startTime: Date,
        endTime: Date,
        appointmentType: string,
        timeZone: string = 'Europe/Paris'
    ): Promise<string | null> {
        try {
            const oauth2Client = await this.getOAuth2Client(practitionerId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const integration = await prisma.practitionerCalendarIntegration.findUnique({
                where: { practitioner_id: practitionerId },
            });

            if (!integration) return null;

            const event = {
                summary: `${appointmentType} - ${patientName}`,
                description: `Patient: ${patientName}\nTéléphone: ${patientPhone}`,
                start: {
                    dateTime: startTime.toISOString(),
                    timeZone: timeZone,
                },
                end: {
                    dateTime: endTime.toISOString(),
                    timeZone: timeZone,
                },
            };

            const response = await calendar.events.insert({
                calendarId: integration.calendar_id,
                requestBody: event,
            });

            return response.data.id || null;
        } catch (error) {
            console.error('Error creating event:', error);
            return null;
        }
    }

    // Get available slots for a practitioner on a specific date
    // Obtenir les créneaux disponibles pour un praticien à une date donnée
    async getAvailableSlots(
        practitionerId: string,
        date: Date,
        slotDuration: number = 30, // minutes
        openingHours?: { open: string; close: string } | null // Optional: specific opening hours for this day
    ): Promise<{ start: Date; end: Date }[]> {
        try {
            const oauth2Client = await this.getOAuth2Client(practitionerId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const integration = await prisma.practitionerCalendarIntegration.findUnique({
                where: { practitioner_id: practitionerId },
            });

            if (!integration) return [];

            // Use provided opening hours or default to 9 AM to 6 PM
            // Utiliser les horaires fournis ou par défaut 9h à 18h
            let startHour = 9;
            let startMinute = 0;
            let endHour = 18;
            let endMinute = 0;

            if (openingHours) {
                const [openH, openM] = openingHours.open.split(':').map(Number);
                const [closeH, closeM] = openingHours.close.split(':').map(Number);
                startHour = openH;
                startMinute = openM;
                endHour = closeH;
                endMinute = closeM;
            }

            const startOfDay = new Date(date);
            startOfDay.setHours(startHour, startMinute, 0, 0);

            const endOfDay = new Date(date);
            endOfDay.setHours(endHour, endMinute, 0, 0);

            // Fetch busy times
            // Récupérer les créneaux occupés
            const response = await calendar.freebusy.query({
                requestBody: {
                    timeMin: startOfDay.toISOString(),
                    timeMax: endOfDay.toISOString(),
                    items: [{ id: integration.calendar_id }],
                },
            });

            const busySlots = response.data.calendars?.[integration.calendar_id]?.busy || [];

            // Generate all possible slots
            // Générer tous les créneaux possibles
            const availableSlots: { start: Date; end: Date }[] = [];
            let currentTime = new Date(startOfDay);

            while (currentTime < endOfDay) {
                const slotEnd = new Date(currentTime.getTime() + slotDuration * 60000);

                if (slotEnd > endOfDay) break;

                // Check if slot is free
                // Vérifier si le créneau est libre
                const isBusy = busySlots.some((busy) => {
                    const busyStart = new Date(busy.start!);
                    const busyEnd = new Date(busy.end!);
                    return currentTime < busyEnd && slotEnd > busyStart;
                });

                if (!isBusy) {
                    availableSlots.push({
                        start: new Date(currentTime),
                        end: new Date(slotEnd),
                    });
                }

                currentTime = new Date(currentTime.getTime() + slotDuration * 60000);
            }

            return availableSlots;
        } catch (error) {
            console.error('Error fetching available slots:', error);
            return [];
        }
    }

    // List upcoming events for a practitioner
    // Lister les événements à venir pour un praticien
    async listEvents(
        practitionerId: string,
        timeMin: Date = new Date(),
        maxResults: number = 10
    ) {
        try {
            const oauth2Client = await this.getOAuth2Client(practitionerId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const integration = await prisma.practitionerCalendarIntegration.findUnique({
                where: { practitioner_id: practitionerId },
            });

            if (!integration) return [];

            const response = await calendar.events.list({
                calendarId: integration.calendar_id,
                timeMin: timeMin.toISOString(),
                maxResults: maxResults,
                singleEvents: true,
                orderBy: 'startTime',
            });

            return response.data.items || [];
        } catch (error) {
            console.error('Error listing events:', error);
            return [];
        }
    }

    // Delete an event
    // Supprimer un événement
    async deleteEvent(practitionerId: string, eventId: string) {
        try {
            const oauth2Client = await this.getOAuth2Client(practitionerId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const integration = await prisma.practitionerCalendarIntegration.findUnique({
                where: { practitioner_id: practitionerId },
            });

            if (!integration) return false;

            await calendar.events.delete({
                calendarId: integration.calendar_id,
                eventId: eventId,
            });

            return true;
        } catch (error) {
            console.error('Error deleting event:', error);
            return false;
        }
    }

    // Update an existing event (Reschedule)
    // Mettre à jour un événement existant (Reporter)
    async updateEvent(
        practitionerId: string,
        eventId: string,
        startTime: Date,
        endTime: Date,
        timeZone: string = 'Europe/Paris'
    ): Promise<boolean> {
        try {
            const oauth2Client = await this.getOAuth2Client(practitionerId);
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            const integration = await prisma.practitionerCalendarIntegration.findUnique({
                where: { practitioner_id: practitionerId },
            });

            if (!integration) return false;

            await calendar.events.patch({
                calendarId: integration.calendar_id,
                eventId: eventId,
                requestBody: {
                    start: {
                        dateTime: startTime.toISOString(),
                        timeZone: timeZone,
                    },
                    end: {
                        dateTime: endTime.toISOString(),
                        timeZone: timeZone,
                    },
                },
            });

            return true;
        } catch (error) {
            console.error('Error updating event:', error);
            return false;
        }
    }
}

export const calendarService = new CalendarService();
