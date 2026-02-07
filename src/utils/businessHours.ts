import { formatInTimeZone } from 'date-fns-tz';

/**
 * Interface for structured opening hours
 */
export interface OpeningHours {
    monday?: { open: string; close: string } | null;
    tuesday?: { open: string; close: string } | null;
    wednesday?: { open: string; close: string } | null;
    thursday?: { open: string; close: string } | null;
    friday?: { open: string; close: string } | null;
    saturday?: { open: string; close: string } | null;
    sunday?: { open: string; close: string } | null;
}

/**
 * Checks if a given Date (UTC) is within the clinic's business hours.
 * @param date The date to check
 * @param openingHours The clinical hours structure (JSON or legacy string)
 * @param timezone The clinic's timezone
 */
export function isWithinBusinessHours(date: Date, openingHours: any, timezone: string): boolean {
    if (!openingHours) return true;

    // Valid date check
    if (!date || isNaN(date.getTime())) return true; // Fail safe

    try {
        // Get the local day and time in the clinic's timezone
        const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone });
        const dayName = dayFormatter.format(date).toLowerCase().trim() as keyof OpeningHours;

        const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone });
        const timeStrRaw = timeFormatter.format(date).toLowerCase();

        // Normalize time to HH:MM
        const timeMatch = timeStrRaw.match(/(\d{1,2})[^\d](\d{2})/);
        const currentTimeStr = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : "00:00";
        const [currentH, currentM] = currentTimeStr.split(':').map(Number);
        const currentTimeMinutes = currentH * 60 + currentM;

        console.log(`[DEBUG] BusinessHours Check: ${date.toISOString()} -> Day: ${dayName}, Time: ${currentTimeStr} (${currentTimeMinutes}m)`);

        // Handle string input (could be JSON string or legacy text)
        let schedule = openingHours;
        if (typeof openingHours === 'string') {
            try {
                schedule = JSON.parse(openingHours);
            } catch (e) {
                // Not JSON, continue to legacy string parsing
            }
        }

        // Handle Object structure (either parsed JSON or original object)
        if (typeof schedule === 'object' && schedule !== null && !Array.isArray(schedule)) {
            const daySchedule = (schedule as any)[dayName];

            if (!daySchedule) {
                console.log(`[DEBUG] BusinessHours: Day ${dayName} is marked as closed or null.`);
                return false;
            }

            // Support both single range and array of ranges
            const ranges = Array.isArray(daySchedule) ? daySchedule : [daySchedule];

            for (const range of ranges) {
                if (!range.open || !range.close) continue;

                const [startH, startM] = range.open.split(':').map(Number);
                const [endH, endM] = range.close.split(':').map(Number);

                const startMinutes = startH * 60 + startM;
                const endMinutes = endH * 60 + endM;

                console.log(`[DEBUG] BusinessHours: Testing JSON range ${range.open}-${range.close} (${startMinutes}m-${endMinutes}m)`);

                if (currentTimeMinutes >= startMinutes && currentTimeMinutes < endMinutes) {
                    console.log(`[DEBUG] BusinessHours: MATCH!`);
                    return true;
                }
            }

            return false;
        }

        // --- LEGACY STRING FALLBACK ---
        console.log(`[DEBUG] BusinessHours: Falling back to legacy string parsing for: ${openingHours}`);
        const dayMapFr: Record<string, number> = {
            'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6, 'dimanche': 0
        };
        const dayFormatterFr = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: timezone });
        let dayNameFr = dayFormatterFr.format(date).toLowerCase().trim();
        dayNameFr = dayNameFr.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '');

        const parts = (openingHours as string).split(',').map(p => p.trim());
        for (const part of parts) {
            const colonIndex = part.indexOf(':');
            if (colonIndex === -1) continue;

            let dayPart = part.substring(0, colonIndex).trim().toLowerCase();
            dayPart = dayPart.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

            const timeRangePart = part.substring(colonIndex + 1).trim();

            if (timeRangePart.toLowerCase().includes('fermé')) {
                if (isDayInRange(dayNameFr, dayPart, dayMapFr)) return false;
                continue;
            }

            if (isDayInRange(dayNameFr, dayPart, dayMapFr)) {
                const ranges = timeRangePart.split(/&|\set\s/).map(r => r.trim());
                for (const range of ranges) {
                    const rangeParts = range.split(/[–-]/).map(s => s.trim());
                    if (rangeParts.length !== 2) continue;

                    const [startMatch, endMatch] = rangeParts.map(s => s.match(/(\d{1,2})[^\d](\d{2})/));
                    if (!startMatch || !endMatch) continue;

                    const startMin = parseInt(startMatch[1]) * 60 + parseInt(startMatch[2]);
                    const endMin = parseInt(endMatch[1]) * 60 + parseInt(endMatch[2]);

                    if (currentTimeMinutes >= startMin && currentTimeMinutes < endMin) return true;
                }
            }
        }

        return false;
    } catch (e) {
        console.error('Error in business hours check:', e);
        return true; // Fail safe
    }
}

function isDayInRange(currentDayFr: string, dayRangeStr: string, dayMap: Record<string, number>): boolean {
    const range = dayRangeStr.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

    if (range.includes('-') || range.includes('–')) {
        const [startDay, endDay] = range.split(/[–-]/).map(d => d.trim().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''));
        const startNum = dayMap[startDay];
        const endNum = dayMap[endDay];
        const currentNum = dayMap[currentDayFr];

        if (startNum === undefined || endNum === undefined) return false;

        return startNum <= endNum
            ? (currentNum >= startNum && currentNum <= endNum)
            : (currentNum >= startNum || currentNum <= endNum);
    }
    return range === currentDayFr;
}

/**
 * Checks if a given day is open (not a closed day like Sunday)
 * Returns true if the day has opening hours, false if it's closed
 */
export function isDayOpen(date: Date, openingHours: any, timezone: string): boolean {
    if (!openingHours) return true; // If no opening hours defined, assume open

    if (!date || isNaN(date.getTime())) return true; // Fail safe

    try {
        // Get the day name in English (monday, tuesday, etc.)
        const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone });
        const dayName = dayFormatter.format(date).toLowerCase().trim();

        // Handle string input (could be JSON string)
        let schedule = openingHours;
        if (typeof openingHours === 'string') {
            try {
                schedule = JSON.parse(openingHours);
            } catch (e) {
                // Not JSON, try legacy parsing
                // For legacy format, check if day is marked as "fermé"
                const dayNameFr = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', timeZone: timezone })
                    .format(date).toLowerCase().trim()
                    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

                if (openingHours.toLowerCase().includes(`${dayNameFr}`) &&
                    openingHours.toLowerCase().includes('fermé')) {
                    return false;
                }
                return true; // Can't determine, assume open
            }
        }

        // Handle Object structure
        if (typeof schedule === 'object' && schedule !== null && !Array.isArray(schedule)) {
            const daySchedule = (schedule as any)[dayName];

            // If day schedule is null, undefined, or empty, the day is closed
            if (!daySchedule) {
                return false;
            }

            // Day has schedule, it's open
            return true;
        }

        return true; // Default to open if can't determine
    } catch (e) {
        console.error('Error in isDayOpen check:', e);
        return true; // Fail safe
    }
}

/**
 * Gets the opening hours for a specific day
 * Returns { open: string, close: string } or null if closed
 */
export function getDayOpeningHours(date: Date, openingHours: any, timezone: string): { open: string; close: string } | null {
    if (!openingHours) return null;

    if (!date || isNaN(date.getTime())) return null;

    try {
        // Get the day name in English
        const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: timezone });
        const dayName = dayFormatter.format(date).toLowerCase().trim();

        // Handle string input
        let schedule = openingHours;
        if (typeof openingHours === 'string') {
            try {
                schedule = JSON.parse(openingHours);
            } catch (e) {
                return null;
            }
        }

        // Handle Object structure
        if (typeof schedule === 'object' && schedule !== null && !Array.isArray(schedule)) {
            const daySchedule = (schedule as any)[dayName];

            if (!daySchedule) {
                return null;
            }

            // Handle single range
            if (daySchedule.open && daySchedule.close) {
                return { open: daySchedule.open, close: daySchedule.close };
            }

            // Handle array of ranges - return first range
            if (Array.isArray(daySchedule) && daySchedule.length > 0) {
                return { open: daySchedule[0].open, close: daySchedule[0].close };
            }
        }

        return null;
    } catch (e) {
        return null;
    }
}

/**
 * Formats structured opening hours into a human-readable string for the LLM
 */
export function formatOpeningHours(openingHours: any, language: string = 'fr'): string {
    if (!openingHours) return language === 'fr' ? 'Non spécifié' : 'Not specified';

    let schedule = openingHours;
    if (typeof openingHours === 'string') {
        try {
            schedule = JSON.parse(openingHours);
        } catch (e) {
            return openingHours; // Not JSON, return as is
        }
    }

    if (typeof schedule !== 'object' || schedule === null) return String(schedule);

    const labelsFr: Record<string, string> = {
        monday: 'Lundi', tuesday: 'Mardi', wednesday: 'Mercredi', thursday: 'Jeudi',
        friday: 'Vendredi', saturday: 'Samedi', sunday: 'Dimanche'
    };

    const labelsEn: Record<string, string> = {
        monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday', thursday: 'Thursday',
        friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
    };

    const labels = language === 'fr' ? labelsFr : labelsEn;
    const closedLabel = language === 'fr' ? 'Fermé' : 'Closed';

    return Object.entries(openingHours)
        .map(([day, schedule]) => {
            const dayLabel = labels[day] || day;
            if (!schedule) return `${dayLabel}: ${closedLabel}`;

            const ranges = Array.isArray(schedule) ? schedule : [schedule];
            const timeStr = ranges.map((r: any) => `${r.open}-${r.close}`).join(' & ');
            return `${dayLabel}: ${timeStr}`;
        })
        .join(', ');
}
