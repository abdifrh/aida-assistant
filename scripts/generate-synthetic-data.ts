/**
 * Générateur de conversations synthétiques pour l'entraînement
 */
import fs from 'fs';
import path from 'path';

// Templates de conversations types
const conversationTemplates = [
    // Template 1: Prise de RDV standard
    {
        scenario: 'Booking standard',
        steps: [
            { user: "Bonjour, j'aimerais prendre rendez-vous", assistant: "Bonjour ! Avec plaisir. Pour créer votre fiche patient, pourriez-vous m'indiquer votre prénom et nom ?" },
            { user: "{first_name} {last_name}", assistant: "Ravi de faire votre connaissance, {first_name}. Quelle est votre date de naissance (JJ/MM/AAAA) ?" },
            { user: "{birth_date}", assistant: "Merci. Quelle est votre adresse email ?" },
            { user: "{email}", assistant: "Parfait. Pourriez-vous m'envoyer une photo de votre carte d'assurance maladie ?" },
            { user: "[IMAGE]", assistant: "Bien reçu ! Votre carte d'assurance a été enregistrée. Bénéficiez-vous d'une assurance sociale (Hospice générale ou SPC) ?" },
            { user: "Non", assistant: "C'est noté. Pour quelle date souhaiteriez-vous ce rendez-vous ?" },
            { user: "{date_preference}", assistant: "Très bien. À quelle heure préféreriez-vous ?" },
            { user: "{time}", assistant: "Pourriez-vous m'indiquer le motif de votre consultation ?" },
            { user: "{reason}", assistant: "Confirmez-vous le rendez-vous le {formatted_date} à {time} avec {doctor} ?" },
            { user: "Oui", assistant: "Parfait ! Votre rendez-vous avec le {doctor} est confirmé pour le {formatted_date} à {time}." }
        ]
    },
    // Template 2: Urgence
    {
        scenario: 'Emergency',
        steps: [
            { user: "Bonjour, j'ai très mal {body_part}, c'est urgent", assistant: "Je comprends votre situation. Pour une urgence, je vous recommande de contacter le service d'urgence au {emergency_number} ou de vous rendre aux urgences les plus proches. Souhaitez-vous quand même prendre un rendez-vous ?" },
            { user: "Oui pour un suivi", assistant: "D'accord. Pour créer votre fiche patient, pourriez-vous m'indiquer votre prénom et nom ?" }
        ]
    },
    // Template 3: Modification de RDV
    {
        scenario: 'Modify appointment',
        steps: [
            { user: "Bonjour, je voudrais modifier mon rendez-vous", assistant: "Bien sûr. Pourriez-vous me donner votre nom s'il vous plaît ?" },
            { user: "{first_name} {last_name}", assistant: "Merci {first_name}. Je vois que vous avez un rendez-vous le {current_date} à {current_time}. Quelle nouvelle date souhaiteriez-vous ?" },
            { user: "{new_date}", assistant: "D'accord. À quelle heure préféreriez-vous ?" },
            { user: "{new_time}", assistant: "Confirmez-vous le nouveau rendez-vous le {new_formatted_date} à {new_time} ?" },
            { user: "Oui", assistant: "Parfait ! Votre rendez-vous a été modifié. Nouvelle date : {new_formatted_date} à {new_time}." }
        ]
    }
];

// Données variables pour remplir les templates
const variables = {
    first_names: ['Marie', 'Jean', 'Sophie', 'Pierre', 'Léa', 'Marc', 'Emma', 'Thomas', 'Julie', 'Nicolas', 'Sarah', 'David', 'Chloé', 'Antoine', 'Camille'],
    last_names: ['Martin', 'Bernard', 'Dubois', 'Thomas', 'Robert', 'Richard', 'Petit', 'Durand', 'Leroy', 'Moreau', 'Simon', 'Laurent', 'Lefebvre', 'Michel', 'Garcia'],
    birth_dates: ['15/03/1985', '22/07/1990', '08/11/1978', '30/05/1982', '17/09/1995'],
    emails: ['{first}.{last}@gmail.com', '{first}.{last}@hotmail.com', '{first}{last}@yahoo.fr'],
    date_preferences: ['La semaine prochaine', 'Jeudi prochain', 'Lundi matin', 'Vendredi après-midi', 'Mercredi'],
    times: ['9h', '10h30', '14h', '15h30', '11h', '16h'],
    reasons: [
        'J\'ai mal à une dent',
        'Contrôle de routine',
        'Détartrage',
        'Douleur dentaire',
        'Suivi après soin',
        'Consultation générale'
    ],
    body_parts: ['aux dents', 'à la mâchoire', 'à une molaire'],
    doctors: ['Dr Tolve', 'Dr Martin', 'Dr Dubois'],
    emergency_number: '144'
};

function generateConversations(numConversations: number = 100): void {
    console.log(`🤖 Génération de ${numConversations} conversations synthétiques...\n`);

    const conversations = [];

    for (let i = 0; i < numConversations; i++) {
        // Choisir un template aléatoire
        const template = conversationTemplates[Math.floor(Math.random() * conversationTemplates.length)];

        // Générer des valeurs aléatoires
        const firstName = variables.first_names[Math.floor(Math.random() * variables.first_names.length)];
        const lastName = variables.last_names[Math.floor(Math.random() * variables.last_names.length)];
        const birthDate = variables.birth_dates[Math.floor(Math.random() * variables.birth_dates.length)];
        const email = variables.emails[Math.floor(Math.random() * variables.emails.length)]
            .replace('{first}', firstName.toLowerCase())
            .replace('{last}', lastName.toLowerCase());
        const datePreference = variables.date_preferences[Math.floor(Math.random() * variables.date_preferences.length)];
        const time = variables.times[Math.floor(Math.random() * variables.times.length)];
        const reason = variables.reasons[Math.floor(Math.random() * variables.reasons.length)];
        const doctor = variables.doctors[Math.floor(Math.random() * variables.doctors.length)];

        const messages = [
            {
                role: 'system',
                content: 'Tu es Sophie, secrétaire médicale professionnelle. Tu gères les prises de rendez-vous avec courtoisie et efficacité.'
            }
        ];

        // Remplir le template
        for (const step of template.steps) {
            const userMsg = step.user
                .replace('{first_name}', firstName)
                .replace('{last_name}', lastName)
                .replace('{birth_date}', birthDate)
                .replace('{email}', email)
                .replace('{date_preference}', datePreference)
                .replace('{time}', time)
                .replace('{reason}', reason)
                .replace('{body_part}', variables.body_parts[0]);

            const assistantMsg = step.assistant
                .replace('{first_name}', firstName)
                .replace('{last_name}', lastName)
                .replace('{formatted_date}', 'lundi 10 février 2026')
                .replace('{time}', time)
                .replace('{doctor}', doctor)
                .replace('{emergency_number}', variables.emergency_number);

            messages.push({ role: 'user', content: userMsg });
            messages.push({ role: 'assistant', content: assistantMsg });
        }

        conversations.push({ messages });
    }

    // Sauvegarder
    const outputPath = path.join(__dirname, '../fine-tuning/synthetic-training-data.jsonl');
    const jsonlContent = conversations
        .map(conv => JSON.stringify(conv))
        .join('\n');

    fs.writeFileSync(outputPath, jsonlContent, 'utf-8');

    console.log(`✅ ${conversations.length} conversations générées`);
    console.log(`💾 Fichier: ${outputPath}`);
    console.log(`📊 Taille: ${(Buffer.from(jsonlContent).length / 1024).toFixed(2)} KB\n`);
}

// Générer 200 conversations
generateConversations(200);
