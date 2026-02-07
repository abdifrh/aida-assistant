/**
 * Script pour exporter les conversations réelles en format d'entraînement
 */
import prisma from '../src/database/client';
import fs from 'fs';
import path from 'path';

interface TrainingExample {
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
}

async function exportTrainingData() {
    console.log('📊 Export des conversations pour entraînement...\n');

    // Récupérer les conversations complétées avec succès
    const conversations = await prisma.conversation.findMany({
        where: {
            current_state: 'COMPLETED'
        },
        include: {
            messages: {
                orderBy: { created_at: 'asc' }
            },
            clinic: {
                select: {
                    name: true,
                    opening_hours: true
                }
            }
        },
        take: 500 // Ajustez selon vos besoins
    });

    console.log(`✓ ${conversations.length} conversations complétées trouvées\n`);

    const trainingExamples: TrainingExample[] = [];

    for (const conv of conversations) {
        if (conv.messages.length < 4) continue; // Ignorer les conversations trop courtes

        const messages: TrainingExample['messages'] = [
            {
                role: 'system',
                content: `Tu es Sophie, secrétaire médicale professionnelle du cabinet ${conv.clinic.name}. Tu gères les prises de rendez-vous de manière naturelle et professionnelle.`
            }
        ];

        for (const msg of conv.messages) {
            messages.push({
                role: msg.role as 'user' | 'assistant',
                content: msg.content
            });
        }

        trainingExamples.push({ messages });
    }

    console.log(`✓ ${trainingExamples.length} exemples d'entraînement créés\n`);

    // Sauvegarder en format JSONL
    const outputPath = path.join(__dirname, '../fine-tuning/training-data.jsonl');
    const jsonlContent = trainingExamples
        .map(example => JSON.stringify(example))
        .join('\n');

    fs.writeFileSync(outputPath, jsonlContent, 'utf-8');

    console.log(`✅ Dataset sauvegardé: ${outputPath}`);
    console.log(`📈 Total: ${trainingExamples.length} conversations`);
    console.log(`💾 Taille: ${(Buffer.from(jsonlContent).length / 1024 / 1024).toFixed(2)} MB\n`);

    // Statistiques
    const avgMessagesPerConv = trainingExamples.reduce(
        (sum, ex) => sum + ex.messages.length, 0
    ) / trainingExamples.length;

    console.log(`📊 Statistiques:`);
    console.log(`   - Moyenne messages/conversation: ${avgMessagesPerConv.toFixed(1)}`);
    console.log(`   - Langues: ${conv.detected_language}`);
}

exportTrainingData()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
