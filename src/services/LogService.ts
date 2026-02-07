import prisma from '../database/client';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG' | 'CRITICAL';
export type LogCategory = 'WHATSAPP' | 'LLM' | 'CONVERSATION' | 'DATABASE' | 'SYSTEM' | 'SECURITY' | 'INTEGRATION' | 'VAPI' | 'VALIDATOR' | 'ENTITY_VALIDATOR' | 'TWILIO';

export interface LogEntry {
    level: LogLevel;
    category: LogCategory;
    action: string;
    message: string;
    metadata?: any;
    clinic_id?: string;
    conversation_id?: string;
    user_phone?: string;
}

class LogService {
    /**
     * Write a log entry to the database
     * Since logging should not block the main flow, we don't await the DB call but handle errors silently
     */
    async log(entry: LogEntry): Promise<void> {
        try {
            // Also log to console for development visibility
            this.logToConsole(entry);

            // Write to DB
            await prisma.systemLog.create({
                data: {
                    level: entry.level,
                    category: entry.category,
                    action: entry.action,
                    message: entry.message,
                    metadata: entry.metadata || {},
                    clinic_id: entry.clinic_id,
                    conversation_id: entry.conversation_id,
                    user_phone: entry.user_phone
                }
            });
        } catch (error) {
            // Failsafe: Don't crash the app if logging fails
            console.error('FAILED TO WRITE LOG TO DB:', error);
            console.error('ORIGINAL LOG ENTRY:', JSON.stringify(entry));
        }
    }

    // Convenience methods
    async info(category: LogCategory, action: string, message: string, context?: Partial<LogEntry>) {
        return this.log({ level: 'INFO', category, action, message, ...context });
    }

    async warn(category: LogCategory, action: string, message: string, context?: Partial<LogEntry>) {
        return this.log({ level: 'WARN', category, action, message, ...context });
    }

    async error(category: LogCategory, action: string, message: string, error?: any, context?: Partial<LogEntry>) {
        const metadata = context?.metadata || {};
        if (error) {
            metadata.error_message = error.message;
            metadata.stack = error.stack;
            metadata.raw_error = JSON.stringify(error, Object.getOwnPropertyNames(error));
        }

        return this.log({
            level: 'ERROR',
            category,
            action,
            message,
            ...context,
            metadata
        });
    }

    async debug(category: LogCategory, action: string, message: string, context?: Partial<LogEntry>) {
        // Only log debug if needed (could be configurable via env)
        if (process.env.LOG_LEVEL === 'DEBUG') {
            return this.log({ level: 'DEBUG', category, action, message, ...context });
        }
    }

    private logToConsole(entry: LogEntry) {
        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${entry.level}] [${entry.category}] [${entry.action}]`;

        switch (entry.level) {
            case 'ERROR':
            case 'CRITICAL':
                console.error(`${prefix} ${entry.message}`, entry.metadata ? JSON.stringify(entry.metadata) : '');
                break;
            case 'WARN':
                console.warn(`${prefix} ${entry.message}`, entry.metadata ? JSON.stringify(entry.metadata) : '');
                break;
            default:
                console.log(`${prefix} ${entry.message}`);
        }
    }
}

export const logService = new LogService();
