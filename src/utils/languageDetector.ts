import { franc } from 'franc-min';

/**
 * Detect the language of a text message
 * Supports: French (fr), English (en)
 * Returns: 'fr' or 'en'
 */
export function detectLanguage(text: string): 'fr' | 'en' {
    // Remove common punctuation and whitespace
    const cleanText = text.trim().toLowerCase();

    // Quick heuristics for very short messages
    const englishGreetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'thank you', 'thanks', 'yes', 'no', 'ok', 'okay', 'tomorrow', 'today', 'yesterday'];
    const frenchGreetings = ['bonjour', 'bonsoir', 'salut', 'merci', 'oui', 'non', 'd\'accord', 'demain', 'aujourd\'hui', 'hier'];

    // Check for exact matches with common greetings
    if (englishGreetings.includes(cleanText)) {
        return 'en';
    }
    if (frenchGreetings.includes(cleanText)) {
        return 'fr';
    }

    // For longer messages, use franc library
    if (text.length > 10) {
        const detected = franc(text, { minLength: 3 });

        // franc returns ISO 639-3 codes, map them to our supported languages
        if (detected === 'eng') return 'en';
        if (detected === 'fra') return 'fr';
    }

    // Default to French if uncertain
    return 'fr';
}
