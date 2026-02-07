import axios from 'axios';
import { config } from '../src/config';

async function testLLM() {
    console.log('🧪 Testing LLM connection...\n');
    console.log('LLM API URL:', config.llmApiUrl);

    const systemPrompt = `Tu es Sophie, l'assistante administrative d'AIDA Medical.

RÈGLES STRICTES:
- Tu ne donnes JAMAIS de conseils médicaux
- Tu réponds UNIQUEMENT en JSON valide

FORMAT DE RÉPONSE (JSON UNIQUEMENT):
{
  "detected_language": "fr",
  "intent": "BOOK_APPOINTMENT",
  "confidence": 0.95,
  "entities": {
    "first_name": "Jean"
  },
  "needs_backend_action": true,
  "handover_required": false,
  "response_message": "Bonjour ! Comment puis-je vous aider ?"
}`;

    const testMessages = [
        'Bonjour, je voudrais prendre rendez-vous',
        'Je mappelle Jean Dupont et je voudrais voir le Dr Martin demain à 10h',
        'Urgence ! Jai très mal aux dents',
    ];

    for (const message of testMessages) {
        console.log(`\n📨 User: "${message}"`);
        console.log('⏳ Waiting for LLM response...\n');

        try {
            const response = await axios.post(
                config.llmApiUrl,
                {
                    model: 'mistral:7b-instruct-q4_0', // Using your available model
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: message },
                    ],
                    stream: false,
                    format: 'json',
                    options: {
                        temperature: 0.3,
                    },
                },
                {
                    timeout: 30000,
                }
            );

            const content = response.data?.message?.content || response.data?.response;

            console.log('✅ LLM Response:');
            console.log(content);

            // Try to parse JSON
            try {
                const parsed = JSON.parse(content);
                console.log('\n✅ Valid JSON!');
                console.log('Intent:', parsed.intent);
                console.log('Language:', parsed.detected_language);
                console.log('Message:', parsed.response_message);
            } catch (e) {
                console.log('\n⚠️  Response is not valid JSON');
            }

            console.log('\n' + '='.repeat(80));
        } catch (error: any) {
            console.error('❌ Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
        }
    }
}

testLLM()
    .then(() => {
        console.log('\n✅ Test completed!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Test failed:', error);
        process.exit(1);
    });
