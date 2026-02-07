const EMERGENCY_KEYWORDS = [
    // French
    "urgence",
    "douleur intense",
    "saigne",
    "je souffre",
    "mal au coeur",
    "respirer",
    "étouffe",
    "accident",
    "grave",
    "vomit sang",
    "perte connaissance",
    "samu",
    "pompiers",
    "15",
    "18",
    "112",

    // English
    "emergency",
    "severe pain",
    "bleeding",
    "can't breathe",
    "heart pain",
    "chest pain",
    "suffocating",
    "accident",
    "serious",
    "vomiting blood",
    "unconscious",
    "911",
    "ambulance"
];

/**
 * Filter to strictly detect emergency situations based on keywords.
 * Filtre pour détecter strictement les situations d'urgence basées sur des mots-clés.
 */
export function isEmergencyMessage(message: string): boolean {
    const normalized = message.toLowerCase();
    return EMERGENCY_KEYWORDS.some(keyword =>
        normalized.includes(keyword)
    );
}
