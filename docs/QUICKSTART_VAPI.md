# 🚀 Démarrage Rapide - Agent Vocal Vapi

## ⚡ Guide en 5 minutes

### 1. Créer un compte Vapi

```bash
# Aller sur https://vapi.ai
# S'inscrire gratuitement (100 minutes offertes)
# Récupérer votre API Key dans Settings
```

### 2. Exposer votre serveur (développement)

```bash
# Installer ngrok
npm install -g ngrok

# Démarrer votre serveur
npm start

# Dans un autre terminal, exposer le serveur
ngrok http 3000

# Copier l'URL fournie (ex: https://abc123.ngrok.io)
```

### 3. Configurer Vapi (Option Simple - Dashboard)

1. Aller sur [dashboard.vapi.ai](https://dashboard.vapi.ai)
2. Cliquer "Create Assistant"
3. Remplir :

**Général**
- Name: `Sophie - Ma Clinique`
- Description: `Assistante vocale médicale`

**Voice**
- Provider: `ElevenLabs`
- Voice: `Bella` (French)
- Model: `eleven_multilingual_v2`

**Model**
- Provider: `Custom LLM`
- URL: `https://your-ngrok-url.ngrok.io/webhook/vapi/webhook`

**Messages**
- First Message: `Bonjour, Sophie à l'appareil. Comment puis-je vous aider ?`
- End Call Message: `Merci d'avoir appelé. Au revoir !`

**Advanced**
- Recording: ✅ Enabled
- Server URL: `https://your-ngrok-url.ngrok.io/webhook/vapi/webhook`

4. Cliquer "Save"

### 4. Obtenir un numéro de téléphone

1. Dans Vapi Dashboard > "Phone Numbers"
2. Cliquer "Buy Number"
3. Choisir pays : France (+33)
4. Sélectionner un numéro disponible
5. Associer à votre assistant "Sophie"

### 5. Tester

```bash
# Appeler le numéro
📞 Composer le numéro Vapi

# Sophie devrait répondre : "Bonjour, Sophie à l'appareil..."
```

## 🎤 Scénario de test complet

```
Vous: Bonjour
Sophie: Bonjour ! Comment puis-je vous aider aujourd'hui ?

Vous: Je voudrais prendre rendez-vous
Sophie: Avec plaisir ! Pouvez-vous me donner votre prénom et nom ?

Vous: Jean Dupont
Sophie: Enchanté Jean. Quelle est votre date de naissance ?

Vous: 15 mai 1985
Sophie: Merci. Quelle est votre adresse email ?

Vous: jean.dupont@email.com
Sophie: Parfait. Avec quel praticien souhaitez-vous prendre rendez-vous ?

Vous: Dr Leal
Sophie: Pour quelle date souhaiteriez-vous ce rendez-vous ?

Vous: Demain à 14h
Sophie: Je confirme : rendez-vous demain à 14h avec Dr Leal. Est-ce correct ?

Vous: Oui
Sophie: Parfait ! Votre rendez-vous est confirmé. Vous recevrez un SMS de confirmation.
```

## 🔍 Vérifier que ça fonctionne

### Dans votre terminal serveur

```bash
# Vous devriez voir :
[VAPI] Webhook received
[VAPI] Function call: process_user_message
[CONVERSATION] Processing user message with Sophie
[LLM] Extract entities: ...
```

### Dans Vapi Dashboard

1. Aller dans "Calls"
2. Voir votre appel dans la liste
3. Cliquer pour voir la transcription complète
4. Vérifier les coûts

## ⚙️ Configuration Avancée (via API)

```bash
# Obtenir la config JSON pour votre clinique
curl http://localhost:3000/webhook/vapi/assistant-config/YOUR_CLINIC_ID

# Créer l'assistant via l'API Vapi
curl -X POST https://api.vapi.ai/assistant \
  -H "Authorization: Bearer YOUR_VAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d @vapi-config.json
```

## 🛠️ Personnalisation Rapide

### Changer la voix

Dans Dashboard Vapi > Votre Assistant > Voice :
- `Bella` - Professionnelle (recommandé)
- `Charlotte` - Douce et chaleureuse
- `Matilda` - Mature et rassurante

### Modifier le message d'accueil

Dans Dashboard Vapi > Votre Assistant > First Message :
```
Bonjour, je suis Sophie, votre assistante virtuelle chez [Nom Clinique].
Comment puis-je vous aider aujourd'hui ?
```

## 💡 Astuces

### Pour tester sans téléphone

Vapi propose un "Web Call" dans le dashboard :
1. Cliquer "Test Call" sur votre assistant
2. Autoriser le micro dans votre navigateur
3. Parler directement depuis votre ordinateur

### Pour réduire la latence

1. Utiliser `eleven_turbo_v2` au lieu de `eleven_multilingual_v2`
2. Réduire `stability` à 0.3-0.4
3. Utiliser un serveur proche géographiquement

### Pour améliorer la compréhension

1. Parler clairement et lentement
2. Faire des pauses entre les informations
3. Si Sophie ne comprend pas, répéter différemment

## 🐛 Dépannage Express

### "Sophie ne répond pas"

```bash
# Vérifier que le serveur tourne
curl http://localhost:3000/health

# Vérifier qu'Ollama est démarré
ollama ps

# Vérifier que le modèle est chargé
ollama run aida-medical-v1
```

### "Erreur webhook"

```bash
# Vérifier l'URL ngrok
ngrok status

# Tester le webhook
curl -X POST http://localhost:3000/webhook/vapi/webhook \
  -H "Content-Type: application/json" \
  -d '{"message":{"type":"status-update"}}'
```

### "Qualité audio mauvaise"

1. Dashboard Vapi > Voice Settings
2. Augmenter `Stability` à 0.7-0.9
3. Augmenter `Similarity Boost` à 0.8-0.9

## 📊 Coûts Estimés

| Utilisation | Coût mensuel |
|------------|--------------|
| 50 appels × 2min | ~$5-10 |
| 100 appels × 3min | ~$15-30 |
| 500 appels × 3min | ~$75-150 |

+ $1-2/mois pour le numéro de téléphone

## 📚 Ressources

- [Documentation complète](./VAPI_INTEGRATION.md)
- [Vapi Docs](https://docs.vapi.ai)
- [Dashboard Vapi](https://dashboard.vapi.ai)

## ✅ Prochaines étapes

1. ✅ Test avec quelques appels réels
2. ⚙️ Ajuster la voix et les messages
3. 📊 Analyser les transcriptions
4. 🔧 Optimiser les réponses de Sophie
5. 📈 Déployer en production

---

**Besoin d'aide ?** Consultez [VAPI_INTEGRATION.md](./VAPI_INTEGRATION.md) pour le guide complet.
