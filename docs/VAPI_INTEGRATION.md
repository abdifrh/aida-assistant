# 🎙️ Intégration Vapi - Agent Vocal pour Sophie

Ce guide explique comment intégrer Vapi pour créer un agent vocal qui permet aux patients d'appeler votre clinique et d'interagir avec Sophie par téléphone.

## 📋 Table des matières

1. [Vue d'ensemble](#vue-densemble)
2. [Prérequis](#prérequis)
3. [Installation et Configuration](#installation-et-configuration)
4. [Test de l'intégration](#test-de-lintégration)
5. [Personnalisation](#personnalisation)
6. [Coûts](#coûts)
7. [Troubleshooting](#troubleshooting)

---

## 🎯 Vue d'ensemble

### Architecture

```
📞 Patient appelle → 🌐 Twilio → 🎙️ Vapi
                                      ↓
                                 [STT: Speech-to-Text]
                                      ↓
                        🔗 Webhook vers votre backend
                                      ↓
                        🧠 Sophie (ConversationManager + LLM)
                                      ↓
                        📤 Réponse au format JSON
                                      ↓
                        🔊 Vapi [TTS: ElevenLabs]
                                      ↓
                        📞 Patient entend la réponse
```

### Fonctionnalités

✅ Prise de rendez-vous par téléphone
✅ Renseignements sur les horaires
✅ Information sur les praticiens
✅ Collecte des informations patient
✅ Transfert vers un humain si nécessaire
✅ Enregistrement des conversations
✅ Transcriptions automatiques

---

## 🔧 Prérequis

### 1. Compte Vapi

1. Créez un compte sur [vapi.ai](https://vapi.ai)
2. Récupérez votre **API Key** depuis le dashboard
3. Notez votre **Account ID**

### 2. Exposer votre serveur

Votre serveur doit être accessible publiquement pour recevoir les webhooks de Vapi.

**Option A : Production (Recommandé)**
- Déployez sur un serveur avec une IP publique ou un domaine
- Exemple : `https://votredomaine.com`

**Option B : Développement (ngrok)**
```bash
# Installer ngrok
npm install -g ngrok

# Exposer votre serveur local
ngrok http 3000

# Vous obtiendrez une URL comme : https://abc123.ngrok.io
```

### 3. Variables d'environnement

Ajoutez à votre fichier `.env` :

```env
# Vapi Configuration
VAPI_API_KEY=your_vapi_api_key_here
VAPI_WEBHOOK_URL=https://your-domain.com/webhook/vapi/webhook

# Ou pour développement avec ngrok
VAPI_WEBHOOK_URL=https://abc123.ngrok.io/webhook/vapi/webhook
```

---

## 🚀 Installation et Configuration

### Étape 1 : Compiler le code

```bash
npm run build
```

### Étape 2 : Démarrer le serveur

```bash
npm start
```

### Étape 3 : Créer un assistant Vapi

#### Option A : Via l'API (recommandé)

```bash
# Récupérer la configuration de l'assistant pour votre clinique
curl http://localhost:3000/webhook/vapi/assistant-config/YOUR_CLINIC_ID

# Copier la réponse JSON
```

Puis créez l'assistant via l'API Vapi :

```bash
curl -X POST https://api.vapi.ai/assistant \
  -H "Authorization: Bearer YOUR_VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sophie - Votre Clinique",
    "voice": {
      "provider": "elevenlabs",
      "voiceId": "EXAVITQu4vr4xnSDxMaL",
      "stability": 0.5,
      "similarityBoost": 0.75,
      "model": "eleven_multilingual_v2"
    },
    "model": {
      "provider": "custom-llm",
      "url": "https://your-domain.com/webhook/vapi/webhook",
      "temperature": 0.7
    },
    "firstMessage": "Bonjour, Sophie à l'\''appareil. Comment puis-je vous aider ?",
    "endCallMessage": "Merci d'\''avoir appelé. Au revoir !",
    "recordingEnabled": true,
    "serverUrl": "https://your-domain.com/webhook/vapi/webhook",
    "serverUrlSecret": "your_webhook_secret"
  }'
```

#### Option B : Via le Dashboard Vapi

1. Connectez-vous à [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Cliquez sur "Create Assistant"
3. Configurez :
   - **Name** : Sophie - Votre Clinique
   - **Voice** : ElevenLabs > Bella (French)
   - **LLM** : Custom LLM
   - **Server URL** : `https://your-domain.com/webhook/vapi/webhook`
   - **First Message** : "Bonjour, Sophie à l'appareil. Comment puis-je vous aider ?"

### Étape 4 : Obtenir un numéro de téléphone

#### Via Vapi + Twilio (intégré)

1. Dans le dashboard Vapi, allez dans "Phone Numbers"
2. Cliquez "Buy Number"
3. Choisissez votre pays et numéro
4. Associez-le à votre assistant Sophie

#### Via Twilio directement

1. Créez un compte [Twilio](https://www.twilio.com)
2. Achetez un numéro de téléphone
3. Configurez le webhook Twilio pour pointer vers Vapi

### Étape 5 : Test

1. Appelez le numéro configuré
2. Parlez avec Sophie
3. Vérifiez les logs :

```bash
# Dans le terminal de votre serveur
[VAPI] Webhook received
[VAPI] Function call: process_user_message
[CONVERSATION] Processing user message with Sophie
```

---

## 🎨 Personnalisation

### Changer la voix de Sophie

Liste des voix françaises ElevenLabs disponibles :

- **Bella** (féminine, professionnelle) : `EXAVITQu4vr4xnSDxMaL`
- **Charlotte** (féminine, douce) : `XB0fDUnXU5powFXDhCwa`
- **Matilda** (féminine, mature) : `XrExE9yKIg1WjnnlVkGX`

Modifiez dans `VapiController.ts` :

```typescript
voice: {
    provider: 'elevenlabs',
    voiceId: 'EXAVITQu4vr4xnSDxMaL', // Changez ici
    stability: 0.5,
    similarityBoost: 0.75
}
```

### Personnaliser le message d'accueil

Dans `VapiController.ts`, ligne ~255 :

```typescript
firstMessage: `Bonjour, je suis Sophie, votre assistante virtuelle chez ${clinic.name}. Comment puis-je vous aider aujourd'hui ?`
```

### Ajouter des fonctions personnalisées

Dans `VapiController.ts`, ajoutez une nouvelle fonction :

```typescript
case 'cancel_appointment':
    const appointmentId = parameters.appointmentId;
    // Logique d'annulation
    return res.json({
        result: 'Votre rendez-vous a été annulé avec succès.'
    });
```

Et déclarez-la dans la configuration :

```typescript
{
    name: 'cancel_appointment',
    description: 'Cancel a patient appointment',
    parameters: {
        type: 'object',
        properties: {
            appointmentId: { type: 'string' }
        },
        required: ['appointmentId']
    }
}
```

---

## 💰 Coûts

### Vapi (estimation)

- **Appels entrants** : $0.05 - $0.15 par minute
- **STT (Deepgram)** : Inclus
- **TTS (ElevenLabs)** : Inclus
- **Numéros de téléphone** : ~$1-2 par mois

### Exemple de coût mensuel

Pour 100 appels de 3 minutes en moyenne :
- 100 appels × 3 min × $0.10/min = **$30/mois**
- Numéro de téléphone = **$2/mois**
- **Total : ~$32/mois**

### Twilio (si utilisé directement)

- Numéro : $1/mois
- Appels : $0.013/min (entrants)

---

## 🧪 Test de l'intégration

### 1. Tester le webhook localement

```bash
# Lancer ngrok
ngrok http 3000

# Tester avec curl
curl -X POST http://localhost:3000/webhook/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": {
      "type": "function-call"
    },
    "functionCall": {
      "name": "process_user_message",
      "parameters": {
        "message": "Bonjour"
      }
    },
    "call": {
      "id": "test-call-123",
      "customer": {
        "number": "+33612345678"
      },
      "metadata": {
        "clinicId": "YOUR_CLINIC_ID"
      }
    }
  }'
```

### 2. Scénarios de test

#### Test 1 : Prise de rendez-vous simple
1. Appelez le numéro
2. Dites : "Bonjour, je voudrais prendre rendez-vous"
3. Suivez les instructions de Sophie
4. Vérifiez que le RDV est créé dans la base de données

#### Test 2 : Demande d'horaires
1. Appelez et demandez : "Quels sont vos horaires ?"
2. Sophie devrait répondre avec les horaires de la clinique

#### Test 3 : Interruption
1. Parlez pendant que Sophie parle
2. Vapi devrait gérer l'interruption correctement

---

## 🐛 Troubleshooting

### Problème : Vapi ne reçoit pas les webhooks

**Solution** :
1. Vérifiez que votre serveur est accessible :
   ```bash
   curl https://your-domain.com/health
   ```
2. Vérifiez les logs ngrok si en développement
3. Confirmez l'URL du webhook dans Vapi dashboard

### Problème : Sophie ne répond pas correctement

**Vérifications** :
1. Ollama est-il démarré ? `ollama ps`
2. Le modèle est-il chargé ? `ollama run aida-medical-v1`
3. Vérifiez les logs de votre serveur

### Problème : Qualité audio faible

**Solutions** :
1. Augmentez `stability` dans la config voix (0.7-0.9)
2. Essayez un autre modèle ElevenLabs (`eleven_turbo_v2`)
3. Vérifiez la connexion internet

### Problème : Latence élevée

**Optimisations** :
1. Utilisez `eleven_turbo_v2` au lieu de `eleven_multilingual_v2`
2. Réduisez la complexité du prompt système
3. Optimisez votre backend (cache, etc.)

---

## 📊 Monitoring et Analytics

### Logs à surveiller

Dans votre dashboard ou logs serveur :

```bash
# Nombre d'appels par jour
grep "CALL_ENDED" logs.txt | wc -l

# Durée moyenne des appels
grep "duration" logs.txt | awk '{sum+=$NF; count++} END {print sum/count}'

# Taux de transfert vers humain
grep "transfer_to_human" logs.txt | wc -l
```

### Dashboard Vapi

Le dashboard Vapi fournit :
- 📞 Nombre d'appels
- ⏱️ Durée moyenne
- 📝 Transcriptions
- 💰 Coûts détaillés

---

## 🎯 Prochaines étapes

1. **Tester en conditions réelles** avec quelques patients
2. **Analyser les transcriptions** pour améliorer les réponses
3. **Ajouter des fonctions** (rappel, prescription, etc.)
4. **Optimiser les coûts** en ajustant la qualité audio
5. **Intégrer au CRM** pour un suivi complet

---

## 📚 Ressources

- [Documentation Vapi](https://docs.vapi.ai)
- [ElevenLabs Voice Lab](https://elevenlabs.io/voice-lab)
- [Twilio Console](https://console.twilio.com)
- [ngrok Documentation](https://ngrok.com/docs)

---

## 🤝 Support

Pour toute question :
1. Consultez les logs : `tail -f logs/app.log`
2. Testez avec curl (voir section Test)
3. Vérifiez la documentation Vapi

---

**🎉 Félicitations ! Votre agent vocal Sophie est prêt à recevoir des appels !**
