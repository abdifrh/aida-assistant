// FSM States
// États de la machine à états finis
export enum ConversationState {
    IDLE = 'IDLE',
    COLLECTING_PATIENT_DATA = 'COLLECTING_PATIENT_DATA',
    COLLECTING_APPOINTMENT_DATA = 'COLLECTING_APPOINTMENT_DATA',
    CONFIRMATION = 'CONFIRMATION',
    COMPLETED = 'COMPLETED',
    EMERGENCY = 'EMERGENCY',
}

// Intent types
// Types d'intention
export enum Intent {
    BOOK_APPOINTMENT = 'BOOK_APPOINTMENT',
    MODIFY_APPOINTMENT = 'MODIFY_APPOINTMENT',
    CANCEL_APPOINTMENT = 'CANCEL_APPOINTMENT',
    INFORMATION = 'INFORMATION',
    LIST_APPOINTMENTS = 'LIST_APPOINTMENTS',
    LIST_PRACTITIONERS = 'LIST_PRACTITIONERS',
    EMERGENCY = 'EMERGENCY',
    GREETING = 'GREETING',
    AFFIRMATIVE = 'AFFIRMATIVE',
    NEGATIVE = 'NEGATIVE',
    UNKNOWN = 'UNKNOWN',
}

// LLM Response Contract (STRICT JSON)
// Contrat de réponse du LLM (JSON STRICT)
export interface LLMResponse {
    detected_language: string;
    intent: Intent;
    confidence: number;
    entities: {
        first_name?: string;
        last_name?: string;
        birth_date?: string;
        email?: string;
        phone?: string;
        appointment_type?: string;
        date?: string;
        time?: string;
        time_preference?: 'MORNING' | 'AFTERNOON';
        practitioner?: string;
    };
    needs_backend_action: boolean;
    is_ambiguous?: boolean;
    response_message?: string;
}

// Client/Patient information
// Informations client/patient
export interface Client {
    id?: string;
    name?: string;
    phone?: string;
    first_name?: string;
    last_name?: string;
    defaultDoctorId?: string;
}

// Appointment information
// Informations de rendez-vous
export interface Appointment {
    id?: string;
    dateTime?: Date;
    start_time?: Date;
    end_time?: Date;
    type?: string;
    treatment_type_id?: string;
    status?: string;
    practitioner_id?: string;
    patient_id?: string;
}

// Conversation Context Data
// Données de contexte de conversation
export interface ConversationContext {
    patient?: {
        first_name?: string;
        last_name?: string;
        birth_date?: string;
        email?: string;
        phone?: string;
        insurance_card_url?: string;
        awaiting_social_insurance_response?: boolean;
        awaiting_social_insurance_type?: boolean;
        awaiting_insurance_numbers?: boolean;
        has_social_insurance?: boolean;
        social_insurance_type?: string;
        beneficiary_number?: string;
        guarantee_number?: string;
        guarantee_document_path?: string;
    };
    appointment?: {
        type?: string;
        date?: string;
        time?: string;
        time_preference?: 'MORNING' | 'AFTERNOON';
        practitioner_id?: string;
        practitioner_name?: string;
    };
    missing_fields?: string[];
    ambiguity_count?: number;
    pending_action?: {
        type: 'BOOK' | 'CANCEL' | 'MODIFY';
        appointment_id?: string;
        new_data?: any;
    };
    rejected_times?: string[];
    // Patient authentication fields (for voice calls with automatic phone number lookup)
    isKnownPatient?: boolean;
    patientId?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    birthDate?: string;
    hasSocialInsurance?: boolean;
    socialInsuranceType?: string;
    beneficiaryNumber?: string;
    hasRecentAppointments?: boolean;
    lastAppointment?: {
        date: string;
        practitioner: string;
        status: string;
    };
}

// Clinic information
export interface Clinic {
    id: string;
    name: string;
    timezone: string;
    phone?: string;
    address?: string;
    email?: string;
    website?: string;
    opening_hours?: string;
}
