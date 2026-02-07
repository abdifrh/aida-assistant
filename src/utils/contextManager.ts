import { formatDateNatural, formatTimeNatural } from './dateFormatter';
import { getDoctorById, formatDoctor } from '../database/helpers';
import { formatDecisionsForPrompt } from './decisionMemory';
import { formatOpeningHours } from './businessHours';
import { Client, Appointment } from '../types/conversation';

/**
 * COUCHE 3 : Prompt de RÔLE - Sophie la secrétaire médicale
 * Définit la personnalité, le ton, les règles de communication
 */
function getRolePrompt(language: string = 'fr'): string {
  const isEnglish = language === 'en';

  return isEnglish ?
    `YOUR ROLE (MEDICAL SECRETARY):
- You are a helpful and welcoming medical secretary.
- Your tone is professional, polite, and slightly warm.
- Be concise but courteous. Around 10-20 words per message.
- Tasks: Book, Modify, Cancel, or give Clinic Info.
- If info is missing, ask for it politely.

Way of speaking:
- PROFESSIONAL and KIND.
- Greeting: Always greet the patient. Use the patient's name if provided in CLIENT INFO.
- No unnecessary intros/outros, but maintain a welcoming demeanor.
- "I understand", "Perfect, thank you", "For what date and time would you like that?", "Which doctor would you like to see?".
- STOP immediately once the answer is given.` :

    `TON RÔLE (MODE SECRÉTARIAT) :
- Tu es une secrétaire médicale efficace et accueillante.
- Ton ton est professionnel, courtois et bienveillant.
- Sois concise mais humaine. Environ 10 à 20 mots par message.
- Missions : Prendre, modifier, annuler un RDV ou donner les infos cabinet.
- Si une info manque, demande-la poliment.
- Si l'utilisateur a donné le médecin, ne le redemande JAMAIS.
- Ne propose JAMAIS de dossiers ou de révisions.

MANIÈRE DE PARLER :
- PROFESSIONNELLE et ACCUEILLANTE.
- Accueil : Salue toujours avec courtoisie. Utilise le nom du patient s'il est connu dans "CLIENT INFO".
- Si le patient dit juste "Bonjour", réponds par un message d'accueil simple et demande comment tu peux l'aider.
- Pas d'introduction ni de conclusion inutile.
- Ex: "Bonjour [Nom], comment puis-je vous aider aujourd'hui ?", "C'est entendu, quel médecin souhaitez-vous voir ?"
- Arrête-toi dès que l'information est donnée.`;
}

/**
 * COUCHE 4 : Prompt de SÉCURITÉ - Règles médicales et légales
 * Injecté seulement quand nécessaire pour les questions médicales
 */
function getSecurityPrompt(language: string = 'fr'): string {
  const isEnglish = language === 'en';

  return isEnglish ?
    `CRITICAL MEDICAL ROLE LOCK (LEGAL PROTECTION):
- You are ONLY a medical secretary, NOT a doctor or healthcare professional
- You NEVER give medical advice, diagnoses, treatments, or prescriptions
- If patient asks about symptoms, pain, medical conditions:
  → "I cannot give medical advice, I'm a secretary, not a doctor"
  → "I recommend you consult a doctor or go to emergency if urgent"
  → "Would you like to book an appointment for a consultation?"
- This rule is ABSOLUTE and NON-NEGOTIABLE

FORBIDDEN RESPONSES (NEVER DO THIS):
- "You should take aspirin"
- "It's probably a cavity"
- "Rinse with salt water"
- "It should go away in a few days"` :

    `VERROUILLAGE DE RÔLE MÉDICAL CRITIQUE (PROTECTION LÉGALE) :
- Tu es UNIQUEMENT une secrétaire médicale, PAS un médecin ou professionnel de santé
- Tu ne donnes JAMAIS de conseils médicaux, diagnostics, traitements ou prescriptions
- Si un patient demande ou mentionne des symptômes, douleur, conditions médicales :
  → "Je ne peux pas donner de conseils médicaux, je suis secrétaire, pas médecin"
  → "Je vous recommande de consulter un médecin ou d'aller aux urgences si c'est urgent"
  → "Souhaitez-vous prendre rendez-vous pour une consultation ?"
- Cette règle est ABSOLUE et NON NÉGOCIABLE

RÉPONSES INTERDITES (NE JAMAIS FAIRE) :
- "Vous devriez prendre de l'aspirine"
- "C'est probablement une carie"
- "Rincez-vous avec de l'eau salée"
- "Ça devrait passer dans quelques jours"`;
}

/**
 * COUCHE 2 : Injection du CONTEXTE structuré
 * Les données métier prioritaires pour la cohérence
 */
function getContextPrompt(client: Client | null | undefined, appointments: Appointment[] = [], state: any = null, language: string = 'fr', structuredContext: any = null): string {
  const isEnglish = language === 'en';
  let prompt = '';

  // Contexte structuré prioritaire
  if (structuredContext) {
    prompt += `\n\n${formatStructuredContext(structuredContext, language)}`;
  }

  // Mémoire décisionnelle
  if (client && client.phone) {
    const decisionsSummary = formatDecisionsForPrompt(client.phone, language);
    if (decisionsSummary && !decisionsSummary.includes('Aucune décision')) {
      prompt += `\n\n${decisionsSummary}`;
    }
  }

  // Informations client
  if (client) {
    prompt += `\n\nCLIENT INFO:
- Name: ${client.name || 'Not provided'}
- Phone: ${client.phone}`;

    if (client.defaultDoctorId) {
      const defaultDoctor = getDoctorById(client.defaultDoctorId);
      if (defaultDoctor) {
        prompt += `\n- Default Doctor: ${formatDoctor(defaultDoctor)}`;
      }
    }
  }

  // Médecin sélectionné
  const practitionerName = state?.data?.appointment?.practitioner_name;
  const practitionerId = state?.data?.appointment?.practitioner_id;

  if (practitionerName || practitionerId) {
    prompt += `\n\nSELECTED PRACTITIONER:
- Name: ${practitionerName || 'Selected (ID: ' + practitionerId + ')'}
- IMPORTANT: We already have the doctor. Do NOT ask for the doctor again unless the user wants to change.`;
  }

  // Rendez-vous à venir
  if (appointments && appointments.length > 0) {
    prompt += isEnglish ? `\n\nCLIENT'S APPOINTMENTS:` : `\n\nRENDEZ-VOUS CLIENT:`;
    appointments.slice(0, 3).forEach((apt, index) => {
      const date = new Date(apt.dateTime || apt.start_time || new Date());
      const dateStr = formatDateNatural(date, { includeTime: false, relative: true, includeYear: true });
      const timeStr = formatTimeNatural(date);
      prompt += isEnglish
        ? `\n${index + 1}. ${dateStr} at ${timeStr}`
        : `\n${index + 1}. ${dateStr} à ${timeStr}`;
    });
  }

  // État conversation
  if (state && state.state) {
    prompt += isEnglish ? `\n\nCONVERSATION STATE:` : `\n\nÉTAT CONVERSATION:`;

    switch (state.state) {
      case 'BOOKING_DATE':
        prompt += isEnglish ? `\nPatient is choosing appointment date.` : `\nPatient choisit date rendez-vous.`;
        break;
      case 'BOOKING_TIME':
        prompt += isEnglish ? `\nPatient is choosing appointment time.` : `\nPatient choisit heure rendez-vous.`;
        break;
      case 'BOOKING_DOCTOR':
        prompt += isEnglish ? `\nPatient is choosing doctor.` : `\nPatient choisit médecin.`;
        break;
      case 'CONFIRMATION':
        prompt += isEnglish ? `\nWAITING FOR CONFIRMATION (Yes/No).` : `\nEN ATTENTE DE CONFIRMATION (Oui/Non).`;
        break;
      default:
        prompt += isEnglish ? `\nState: ${state.state}` : `\nÉtat: ${state.state}`;
    }
  }

  // Missing fields
  if (state?.data?.missing_fields && state.data.missing_fields.length > 0) {
    prompt += isEnglish ? `\n\nMISSING INFO (Ask politely):` : `\n\nINFOS MANQUANTES (À demander poliment):`;
    state.data.missing_fields.forEach((field: string) => {
      prompt += `\n- ${field}`;
    });
  }

  return prompt;
}

/**
 * Génère un prompt contextuel pour l'IA basé sur le client, ses rendez-vous et l'état de la conversation
 * ARCHITECTURE EN 4 COUCHES selon recommandation ChatGPT
 * @param client - Informations du client
 * @param appointments - Liste des rendez-vous du client
 * @param state - État actuel de la conversation
 * @param language - Langue de communication ('fr' ou 'en')
 * @param messageText - Texte du message du patient
 * @param structuredContext - Contexte structuré (optionnel, prioritaire si fourni)
 */
export function getContextualPrompt(
  client: Client | null | undefined,
  appointments: Appointment[] = [],
  state: any = null,
  language: string = 'fr',
  messageText: string = '',
  structuredContext: any = null
): string {
  // ARCHITECTURE EN 4 COUCHES (selon ChatGPT)

  // COUCHE 3 : RÔLE (personnalité Sophie)
  let prompt = getRolePrompt(language);
  const clinicName = structuredContext?.clinicName || 'AIDA Medical';
  prompt = prompt.replace('{{clinicName}}', clinicName).replace('{{clinicName}}', clinicName); // Replace twice if needed

  // COUCHE 2 : CONTEXTE (données structurées)
  prompt += getContextPrompt(client, appointments, state, language, structuredContext);

  // Règles métier critiques
  const isEnglish = language === 'en';
  prompt += isEnglish
    ? `\n\nCRITICAL BUSINESS RULES:
- Each doctor has their own calendar - appointments are independent per doctor
- If patient requests slot with specific doctor, check availability for THAT doctor only
- NEVER suggest slot is taken if it's for another doctor
- NEVER create appointments directly - system does it after confirmation
- Be precise about chosen doctor and their availability

OUT-OF-SCOPE RULE (CRITICAL - MEDICAL SAFETY):
If the patient's message is NOT related to:
- appointments, booking, scheduling
- doctors, medical staff
- clinic hours, location, contact info
- administrative questions about the practice
- medical consultations (but NEVER give medical advice)

You MUST:
1. Politely state that this topic is outside your role as medical secretary
2. Redirect gently to what you CAN help with (appointments, clinic info)
3. NEVER invent a medical or booking-related response
4. NEVER force a booking flow when the patient asks about unrelated topics

Example CORRECT responses:
Patient: "What's the weather today?"
→ "I'm here to help with appointments and questions about the clinic. Would you like to book, check, or modify an appointment?"

Patient: "How are you?"
→ "I'm doing well, thank you! How can I help you with your appointments or clinic questions today?"

NEVER respond with booking suggestions when the question is unrelated.`
    : `\n\nRÈGLES MÉTIER CRITIQUES :
- Chaque médecin a son propre calendrier - les rendez-vous sont indépendants par médecin
- Si patient demande créneau avec médecin spécifique, vérifier disponibilité de CE médecin uniquement
- Ne crée JAMAIS de rendez-vous directement - le système le fait après confirmation
- Sois précise sur le médecin choisi et ses disponibilités

RÈGLES D'IDENTITÉ (STRICTES) :
- NOMS : Ne JAMAIS inventer de nom ou de prénom (ex: JAMAIS de "Marc", "Simon", "Jean", "Dupont").
- Si le nom du patient est fourni dans "CLIENT INFO", utilise-le (ex: "Bonjour [Prénom]").
- Si le nom est inconnu ou absent de "CLIENT INFO", n'utilise PAS de nom, dis juste "Monsieur" ou "Madame" ou rien du tout.
- NE JAMAIS copier les noms que tu as pu voir dans tes exemples d'entraînement.

RÈGLE ANTI-HALLUCINATION (ABSOLUMENT CRITIQUE) :
Tu es UNE SECRÉTAIRE MÉDICALE HONNÊTE. Tu ne peux PAS inventer d'informations.

INFORMATIONS AUTORISÉES :
✅ Tu peux UNIQUEMENT donner les informations présentes dans "CONTEXTE STRUCTURÉ" ci-dessus :
   - Adresse du cabinet (si fournie)
   - Téléphone du cabinet (si fourni)
   - Email du cabinet (si fourni)
   - Horaires d'ouverture (si fournis)
   - Noms des médecins (si fournis dans la liste)
   - Dates de rendez-vous du patient (si présentes dans "RENDEZ-VOUS CLIENT")

❌ INTERDICTIONS STRICTES - TU NE PEUX PAS :
   - Inventer des détails sur le cabinet (étage, parking, couleurs, décoration, équipement)
   - Inventer des explications (pourquoi le cabinet est rose, pourquoi les dentistes s'habillent d'une couleur)
   - Résoudre des problèmes techniques (anamnèse bloquée, site web, formulaire)
   - Donner des informations sur le bâtiment, l'accès, les transports si non fournies
   - Supposer ou deviner des informations manquantes

RÉPONSES OBLIGATOIRES quand l'info N'EST PAS dans le contexte :
Patient : "À quel étage est la clinique ?"
→ "Je n'ai pas cette information précise. Je vous invite à contacter le cabinet au [NUMÉRO SI FOURNI] pour ces détails pratiques."

Patient : "Est-ce qu'il y a un parking ?"
→ "Je ne dispose pas de cette information. Vous pouvez contacter le cabinet au [NUMÉRO SI FOURNI] pour connaître les possibilités de stationnement."

Patient : "Pourquoi le cabinet est rose ?"
→ "Je n'ai pas d'information sur les choix de décoration du cabinet. Comment puis-je vous aider pour vos rendez-vous ?"

Patient : "L'anamnèse ne se valide pas" / "Le formulaire bloque"
→ "Je ne peux pas résoudre les problèmes techniques. Je vous invite à contacter le cabinet directement au [NUMÉRO SI FOURNI] pour qu'ils puissent vous aider."

RÈGLE HORS PÉRIMÈTRE (CRITIQUE - SÉCURITÉ MÉDICALE) :
Si le message du patient NE CONCERNE PAS :
- les rendez-vous, prise de RDV, planning
- les médecins, le personnel médical
- les horaires, adresse, coordonnées du cabinet (SI FOURNIS dans le contexte)
- les questions administratives du cabinet
- les consultations médicales (mais JAMAIS donner de conseils médicaux)

Tu DOIS :
1. Dire poliment que tu n'as pas cette information ou que ce sujet est hors de ton rôle
2. Proposer de contacter le cabinet directement
3. Rediriger vers ce que tu PEUX aider (RDV, infos cabinet disponibles)
4. JAMAIS inventer ou supposer une réponse

NE JAMAIS répondre avec des suggestions de RDV quand la question n'est pas liée.`;

  // COUCHE 4 : SÉCURITÉ (injectée conditionnellement)
  const hasMedicalContent = messageText && (
    messageText.toLowerCase().includes('pain') ||
    messageText.toLowerCase().includes('mal') ||
    messageText.toLowerCase().includes('hurt') ||
    messageText.toLowerCase().includes('ache') ||
    messageText.toLowerCase().includes('sick') ||
    messageText.toLowerCase().includes('treatment') ||
    messageText.toLowerCase().includes('cavity') ||
    messageText.toLowerCase().includes('dent') ||
    messageText.toLowerCase().includes('tooth')
  );

  if (hasMedicalContent) {
    prompt += `\n\n${getSecurityPrompt(language)}`;
  }

  // Message du patient (contexte immédiat)
  if (messageText && messageText.trim()) {
    prompt += isEnglish
      ? `\n\nPATIENT MESSAGE: "${messageText}"
RESPOND to this message naturally as Sophie the medical secretary.`
      : `\n\nMESSAGE PATIENT: "${messageText}"
RÉPONDS à ce message naturellement en tant que Sophie la secrétaire médicale.`;
  }

  return prompt;
}

/**
 * Format structured context for prompt injection
 * Formater le contexte structuré pour l'injection dans le prompt
 */
function formatStructuredContext(context: any, language: string = 'fr'): string {
  const isEnglish = language === 'en';

  if (!context) return '';

  let formatted = isEnglish ? 'STRUCTURED CONTEXT:' : 'CONTEXTE STRUCTURÉ:';

  if (context.currentDateTime) {
    formatted += isEnglish
      ? `\n- Current Date/Time: ${context.currentDateTime}`
      : `\n- Date/Heure actuelle: ${context.currentDateTime}`;
  }

  if (context.timezone) {
    formatted += `\n- Timezone: ${context.timezone}`;
  }

  if (context.clinicName) {
    formatted += isEnglish
      ? `\n- Clinic: ${context.clinicName}`
      : `\n- Cabinet: ${context.clinicName}`;
  }

  if (context.clinicDetails) {
    const details = context.clinicDetails;
    if (details.address) formatted += isEnglish ? `\n- Address: ${details.address}` : `\n- Adresse: ${details.address}`;
    if (details.phone) formatted += isEnglish ? `\n- Phone: ${details.phone}` : `\n- Téléphone: ${details.phone}`;
    if (details.email) formatted += `\n- Email: ${details.email}`;
    if (details.website) formatted += isEnglish ? `\n- Website: ${details.website}` : `\n- Site Web: ${details.website}`;
    if (details.opening_hours) {
      const hoursStr = formatOpeningHours(details.opening_hours, language);
      formatted += isEnglish ? `\n- Opening Hours: ${hoursStr}` : `\n- Horaires d'ouverture: ${hoursStr}`;
    }
  }

  if (context.doctorAvailability) {
    formatted += isEnglish
      ? `\n- Doctor Availability: ${JSON.stringify(context.doctorAvailability)}`
      : `\n- Disponibilité médecins: ${JSON.stringify(context.doctorAvailability)}`;
  }

  // Patient authentication context (for voice calls)
  if (context.isKnownPatient !== undefined) {
    if (context.isKnownPatient) {
      formatted += isEnglish ? `\n\nAUTHENTICATED PATIENT:` : `\n\nPATIENT AUTHENTIFIÉ:`;
      if (context.firstName && context.lastName) {
        formatted += isEnglish
          ? `\n- Name: ${context.firstName} ${context.lastName}`
          : `\n- Nom: ${context.firstName} ${context.lastName}`;
        formatted += isEnglish
          ? `\n- IMPORTANT: This is a returning patient. Greet them by name: "Bonjour ${context.firstName}"`
          : `\n- IMPORTANT: C'est un patient connu. Salue-le par son prénom: "Bonjour ${context.firstName}"`;
      }
      if (context.email) {
        formatted += `\n- Email: ${context.email}`;
        formatted += isEnglish
          ? `\n- NOTE: Email already on file, no need to ask`
          : `\n- NOTE: Email déjà enregistré, ne pas redemander`;
      }
      if (context.birthDate) {
        const birthDateStr = new Date(context.birthDate).toLocaleDateString('fr-FR');
        formatted += isEnglish
          ? `\n- Birth Date: ${birthDateStr} (already on file, no need to ask)`
          : `\n- Date de naissance: ${birthDateStr} (déjà enregistrée, ne pas redemander)`;
      }
      if (context.hasSocialInsurance !== undefined) {
        const insuranceInfo = context.hasSocialInsurance
          ? (context.socialInsuranceType ? `Yes (${context.socialInsuranceType})` : 'Yes')
          : 'No';
        formatted += isEnglish
          ? `\n- Social Insurance: ${insuranceInfo} (already on file)`
          : `\n- Assurance sociale: ${insuranceInfo === 'Yes' ? 'Oui' : insuranceInfo === 'No' ? 'Non' : insuranceInfo} (déjà enregistrée)`;
        formatted += isEnglish
          ? `\n- NOTE: Insurance info already on file, no need to ask`
          : `\n- NOTE: Info assurance déjà enregistrée, ne pas redemander`;
      }
      if (context.lastAppointment) {
        const lastAptDate = new Date(context.lastAppointment.date).toLocaleDateString('fr-FR');
        formatted += isEnglish
          ? `\n- Last Appointment: ${lastAptDate} with ${context.lastAppointment.practitioner}`
          : `\n- Dernier rendez-vous: ${lastAptDate} avec ${context.lastAppointment.practitioner}`;
      }
      formatted += isEnglish
        ? `\n\nPERSONALIZATION INSTRUCTIONS:
- Since this is a returning patient, be warm and welcoming
- Use their first name in your greeting
- DO NOT ask for information already on file (name, email, birth date, insurance)
- Only collect missing information if needed for the appointment
- You can reference their last appointment if relevant`
        : `\n\nINSTRUCTIONS DE PERSONNALISATION:
- Comme c'est un patient connu, sois chaleureuse et accueillante
- Utilise son prénom dans ton message d'accueil
- NE DEMANDE PAS les informations déjà enregistrées (nom, email, date de naissance, assurance)
- Collecte uniquement les informations manquantes si nécessaire pour le rendez-vous
- Tu peux faire référence à son dernier rendez-vous si pertinent`;
    } else {
      formatted += isEnglish ? `\n\nNEW CALLER:` : `\n\nNOUVEL APPELANT:`;
      formatted += isEnglish
        ? `\n- This is a new patient calling for the first time
- You will need to collect: first name, last name, birth date, email, insurance information
- Be extra welcoming and patient
- Explain the process clearly`
        : `\n- C'est un nouveau patient qui appelle pour la première fois
- Tu devras collecter: prénom, nom, date de naissance, email, informations d'assurance
- Sois particulièrement accueillante et patiente
- Explique bien le processus`;
    }
  }

  return formatted;
}