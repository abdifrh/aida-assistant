/**
 * Decision memory utilities for maintaining conversation context
 * Utilitaires de mémoire décisionnelle pour maintenir le contexte de conversation
 */

interface DecisionRecord {
  timestamp: Date;
  type: 'appointment_booked' | 'appointment_cancelled' | 'appointment_modified' | 'emergency_handover' | 'information_provided';
  details: any;
  outcome: string;
}

const decisionMemory = new Map<string, DecisionRecord[]>();

/**
 * Record a decision for a client
 * Enregistrer une décision pour un client
 */
export function recordDecision(
  clientPhone: string,
  type: DecisionRecord['type'],
  details: any,
  outcome: string
): void {
  if (!decisionMemory.has(clientPhone)) {
    decisionMemory.set(clientPhone, []);
  }

  const decisions = decisionMemory.get(clientPhone)!;
  decisions.push({
    timestamp: new Date(),
    type,
    details,
    outcome
  });

  // Keep only last 10 decisions
  // Garder seulement les 10 dernières décisions
  if (decisions.length > 10) {
    decisions.shift();
  }
}

/**
 * Get recent decisions for a client
 * Obtenir les décisions récentes pour un client
 */
export function getRecentDecisions(clientPhone: string, limit: number = 5): DecisionRecord[] {
  const decisions = decisionMemory.get(clientPhone) || [];
  return decisions.slice(-limit);
}

/**
 * Format decisions for prompt injection
 * Formater les décisions pour l'injection dans le prompt
 */
export function formatDecisionsForPrompt(clientPhone: string, language: string = 'fr'): string {
  const decisions = getRecentDecisions(clientPhone, 3);

  if (decisions.length === 0) {
    return language === 'en' ? 'No recent decisions.' : 'Aucune décision récente.';
  }

  const isEnglish = language === 'en';
  let formatted = isEnglish ? 'RECENT DECISIONS:' : 'DÉCISIONS RÉCENTES:';

  decisions.forEach((decision, index) => {
    const timeAgo = getTimeAgo(decision.timestamp, language);
    let decisionText = '';

    switch (decision.type) {
      case 'appointment_booked':
        decisionText = isEnglish
          ? `Booked appointment: ${decision.details.date || 'Unknown'} at ${decision.details.time || 'Unknown'}`
          : `RDV pris: ${decision.details.date || 'Inconnu'} à ${decision.details.time || 'Inconnu'}`;
        break;
      case 'appointment_cancelled':
        decisionText = isEnglish ? 'Cancelled appointment' : 'RDV annulé';
        break;
      case 'appointment_modified':
        decisionText = isEnglish ? 'Modified appointment' : 'RDV modifié';
        break;
      case 'emergency_handover':
        decisionText = isEnglish ? 'Emergency handover initiated' : 'Transfert urgence initié';
        break;
      case 'information_provided':
        decisionText = isEnglish ? 'Information provided' : 'Information fournie';
        break;
    }

    formatted += `\n${index + 1}. ${timeAgo}: ${decisionText}`;
    if (decision.outcome) {
      formatted += ` - ${decision.outcome}`;
    }
  });

  return formatted;
}

/**
 * Get time ago description
 * Obtenir la description du temps écoulé
 */
function getTimeAgo(date: Date, language: string = 'fr'): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const isEnglish = language === 'en';

  if (diffMins < 1) {
    return isEnglish ? 'just now' : 'à l\'instant';
  } else if (diffMins < 60) {
    return isEnglish ? `${diffMins} min ago` : `il y a ${diffMins} min`;
  } else if (diffHours < 24) {
    return isEnglish ? `${diffHours} hours ago` : `il y a ${diffHours}h`;
  } else if (diffDays < 7) {
    return isEnglish ? `${diffDays} days ago` : `il y a ${diffDays} jours`;
  } else {
    return isEnglish ? 'over a week ago' : 'il y a plus d\'une semaine';
  }
}

/**
 * Clear old decisions (cleanup)
 * Nettoyer les anciennes décisions
 */
export function cleanupOldDecisions(maxAgeHours: number = 24): void {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

  for (const [phone, decisions] of decisionMemory.entries()) {
    const filtered = decisions.filter(d => d.timestamp > cutoff);
    if (filtered.length === 0) {
      decisionMemory.delete(phone);
    } else {
      decisionMemory.set(phone, filtered);
    }
  }
}