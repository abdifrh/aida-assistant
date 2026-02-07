import { fromZonedTime } from 'date-fns-tz';

/**
 * Format an ISO date and time string into a natural language string for the user.
 * Formater une date ISO et une heure en une chaîne de langage naturel pour l'utilisateur.
 */
export function formatDateForUser(
  isoDate: string,
  time: string,
  locale: "fr" | "en"
): string {
  // Ensure we have a valid date parts
  // S'assurer d'avoir des parties de date valides
  const dateStr = isoDate.includes('T') ? isoDate.split('T')[0] : isoDate;
  const date = new Date(`${dateStr}T${time}:00`);

  // Fallback if date is invalid
  if (isNaN(date.getTime())) {
    return `${isoDate} à ${time}`;
  }

  if (locale === "fr") {
    const formattedDate = date.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    // Replace "10:00" with "10h00" for French if needed, or just use at
    const formattedTime = time.replace(':', 'h');
    return `${formattedDate} à ${formattedTime}`;
  }

  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `${formattedDate} at ${time}`;
}

/**
 * Format a Date object naturally, respecting timezone.
 */
export function formatDateFromDate(
  date: Date,
  locale: "fr" | "en",
  timezone: string = 'Europe/Paris'
): string {
  const dStr = date.toLocaleDateString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone
  });

  const tStr = date.toLocaleTimeString(locale === 'fr' ? 'fr-FR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone
  });

  if (locale === 'fr') {
    // Convert 10:00 to 10h00
    return `${dStr} à ${tStr.replace(':', 'h')}`;
  }
  return `${dStr} at ${tStr}`;
}

/**
 * Backward compatibility: format date naturally
 */
export function formatDateNatural(date: Date, options: { includeTime?: boolean, relative?: boolean, includeYear?: boolean } = {}): string {
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: options.includeYear ? "numeric" : undefined,
  });
}

/**
 * Backward compatibility: format time naturally
 */
export function formatTimeNatural(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  }).replace(':', 'h');
}

/**
 * Parse a date and time string in a specific timezone and return a UTC Date.
 */
export function parseInTimezone(
  dateStr: string,
  timeStr: string,
  timezone: string = 'Europe/Paris'
): Date {
  const localStr = `${dateStr} ${timeStr}:00`;
  return fromZonedTime(localStr, timezone);
}