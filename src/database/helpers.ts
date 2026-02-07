/**
 * Database helper functions for Sophie AI
 * Fonctions d'aide pour la base de données de Sophie AI
 */

// Mock doctor data - replace with actual database queries
// Données médecins simulées - remplacer par des requêtes réelles
const mockDoctors = [
  {
    id: '1',
    name: 'Dr. Martin Dubois',
    specialty: 'Dentiste généraliste',
    availability: ['09:00-12:00', '14:00-18:00']
  },
  {
    id: '2',
    name: 'Dr. Sarah Johnson',
    specialty: 'Orthodontiste',
    availability: ['08:00-12:00', '13:00-17:00']
  },
  {
    id: '3',
    name: 'Dr. Ahmed Bennani',
    specialty: 'Chirurgien-dentiste',
    availability: ['10:00-13:00', '15:00-19:00']
  }
];

/**
 * Get doctor by ID
 * Obtenir un médecin par ID
 */
export function getDoctorById(id: string): any | null {
  return mockDoctors.find(doctor => doctor.id === id) || null;
}

/**
 * Get all doctors
 * Obtenir tous les médecins
 */
export function getAllDoctors(): any[] {
  return mockDoctors;
}

/**
 * Format doctor information for display
 * Formater les informations du médecin pour l'affichage
 */
export function formatDoctor(doctor: any, language: string = 'fr'): string {
  if (!doctor) return '';

  const isEnglish = language === 'en';

  if (isEnglish) {
    return `${doctor.name} (${doctor.specialty})`;
  } else {
    return `${doctor.name} (${doctor.specialty})`;
  }
}

/**
 * Check doctor availability for a specific time slot
 * Vérifier la disponibilité d'un médecin pour un créneau spécifique
 */
export function checkDoctorAvailability(doctorId: string, date: string, time: string): boolean {
  const doctor = getDoctorById(doctorId);
  if (!doctor) return false;

  // Simple availability check - replace with actual calendar logic
  // Vérification simple de disponibilité - remplacer par la logique calendrier réelle
  const requestedTime = time.split(':')[0]; // Get hour

  return doctor.availability.some((slot: string) => {
    const [start, end] = slot.split('-');
    const startHour = start.split(':')[0];
    const endHour = end.split(':')[0];

    return requestedTime >= startHour && requestedTime < endHour;
  });
}

/**
 * Get available time slots for a doctor on a specific date
 * Obtenir les créneaux disponibles pour un médecin à une date spécifique
 */
export function getAvailableSlots(doctorId: string, date: string): string[] {
  const doctor = getDoctorById(doctorId);
  if (!doctor) return [];

  // Return mock available slots - replace with actual calendar query
  // Retourner des créneaux disponibles simulés - remplacer par requête calendrier réelle
  return doctor.availability.flatMap((slot: string) => {
    const [start, end] = slot.split('-');
    const startHour = parseInt(start.split(':')[0]);
    const endHour = parseInt(end.split(':')[0]);

    const slots = [];
    for (let hour = startHour; hour < endHour; hour += 2) { // 2-hour slots
      slots.push(`${hour.toString().padStart(2, '0')}:00`);
    }
    return slots;
  });
}

/**
 * Find available doctors for a specific time slot
 * Trouver les médecins disponibles pour un créneau spécifique
 */
export function findAvailableDoctors(date: string, time: string): any[] {
  return mockDoctors.filter(doctor =>
    checkDoctorAvailability(doctor.id, date, time)
  );
}