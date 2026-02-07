import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: process.env.PORT || 3000,
    databaseUrl: process.env.DATABASE_URL,
    llmApiUrl: process.env.LLM_API_URL || 'http://localhost:11434/api/generate',
    llmModelName: process.env.LLM_MODEL_NAME || 'aida-medical-v1',
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
    },
};
