# Guide de Déploiement - Assistant IA Clinique Dentaire

## Architecture de Déploiement (Tout-en-un VPS)

```
┌─────────────────────────────────────────────────────────────────┐
│                         INTERNET                                │
│                            │                                    │
│                    ┌───────▼───────┐                           │
│                    │   WhatsApp    │                           │
│                    │   (Twilio)    │                           │
│                    └───────┬───────┘                           │
│                            │                                    │
│            ┌───────────────▼───────────────┐                   │
│            │      VPS IONOS Linux L        │                   │
│            │        IP: 87.106.25.147      │                   │
│            │        8 GB RAM               │                   │
│            │                               │                   │
│            │   ┌─────────────────────┐     │                   │
│            │   │   Nginx (Port 80)   │     │                   │
│            │   └──────────┬──────────┘     │                   │
│            │              │                │                   │
│            │   ┌──────────▼──────────┐     │                   │
│            │   │   Node.js App       │     │                   │
│            │   │   (Port 3000)       │     │                   │
│            │   └──────────┬──────────┘     │                   │
│            │              │                │                   │
│            │   ┌──────────▼──────────┐     │                   │
│            │   │   Ollama + Qwen2    │     │                   │
│            │   │   (Port 11434)      │     │                   │
│            │   └──────────┬──────────┘     │                   │
│            │              │                │                   │
│            │   ┌──────────▼──────────┐     │                   │
│            │   │   PostgreSQL        │     │                   │
│            │   │   (Port 5432)       │     │                   │
│            │   └─────────────────────┘     │                   │
│            └───────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

**Avantages de cette architecture :**
- Un seul serveur à gérer et payer
- Pas de latence réseau entre l'app et le LLM
- Configuration simplifiée

**Modèle IA utilisé :** `qwen2:7b-instruct-q4_K_M`
- Excellent multilangue (français, anglais, 29 langues)
- Optimisé pour les instructions
- ~4.5 GB, compatible avec 8 GB RAM

---

## Partie 1 : Configuration du VPS IONOS

### 1.1 Connexion SSH au VPS

```bash
ssh root@87.106.25.147
```

### 1.2 Mise à jour du système

```bash
apt update && apt upgrade -y
```

### 1.3 Installation de Node.js 20 LTS

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# Vérification
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 1.4 Installation de PostgreSQL

```bash
apt install -y postgresql postgresql-contrib
systemctl start postgresql
systemctl enable postgresql
```

Création de la base de données :

```bash
sudo -u postgres psql
```

Dans le shell PostgreSQL (`postgres=#`) :

```sql
CREATE USER aida_user WITH PASSWORD 'Abdidas67*';
CREATE DATABASE aida_db OWNER aida_user;
GRANT ALL PRIVILEGES ON DATABASE aida_db TO aida_user;
\q
```

### 1.5 Installation de Nginx, Git et PM2

```bash
apt install -y nginx git
npm install -g pm2
systemctl start nginx
systemctl enable nginx
```

---

## Partie 2 : Installation d'Ollama et du modèle Qwen2

### 2.1 Installer Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

### 2.2 Télécharger le modèle Qwen2 (multilangue)

```bash
ollama pull qwen2:7b-instruct-q4_K_M
```

⏱️ **Note** : Le téléchargement peut prendre 10-20 minutes (~4.5 GB)

### 2.3 Tester le modèle

```bash
ollama run qwen2:7b-instruct-q4_K_M "Bonjour, comment allez-vous ?"
```

### 2.4 Vérifier qu'Ollama fonctionne en arrière-plan

```bash
# Vérifier le service
systemctl status ollama

# Tester l'API
curl http://localhost:11434/api/tags
```

---

## Partie 3 : Déploiement de l'Application

### 3.1 Créer le répertoire et cloner

```bash
mkdir -p /var/www/aida-assistant
cd /var/www/aida-assistant
git clone https://github.com/abdifrh/aida-assistant.git .
```

### 3.2 Installation des dépendances

```bash
npm install
```

### 3.3 Configuration de l'environnement

```bash
nano /var/www/aida-assistant/.env
```

**Contenu du fichier .env :**

```env
# ===== APPLICATION =====
NODE_ENV=production
PORT=3000

# ===== BASE DE DONNÉES =====
DATABASE_URL="postgresql://aida_user:Abdidas67*@localhost:5432/aida_db?schema=public"

# ===== LLM / OLLAMA (Local sur le VPS) =====
LLM_API_URL=http://localhost:11434/api/generate
LLM_MODEL_NAME=qwen2:7b-instruct-q4_K_M

# ===== TWILIO (WhatsApp) =====
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
SKIP_TWILIO_SIGNATURE_VALIDATION=false

# ===== GOOGLE CALENDAR (OAuth2) =====
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://YOUR_IP/oauth/callback

# ===== VAPI (Appels vocaux) =====
VAPI_API_KEY=your_vapi_api_key
VAPI_WEBHOOK_URL=http://YOUR_IP/webhook/vapi/webhook
VAPI_WEBHOOK_SECRET=your_vapi_webhook_secret

# ===== SÉCURITÉ =====
JWT_SECRET=your_jwt_secret_32_characters_minimum

# ===== LOGS =====
LOG_LEVEL=info
```

### 3.4 Migration et Build

```bash
npx prisma generate
npx prisma migrate deploy
npm run build
```

### 3.5 Démarrage avec PM2

```bash
pm2 start dist/index.js --name "aida-assistant"
pm2 startup
pm2 save
```

---

## Partie 4 : Configuration Nginx

```bash
nano /etc/nginx/sites-available/aida-assistant
```

**Contenu :**

```nginx
server {
    listen 80;
    server_name _;

    # Taille max des uploads (pour les images WhatsApp)
    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

```bash
rm -f /etc/nginx/sites-enabled/default
ln -s /etc/nginx/sites-available/aida-assistant /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
```

---

## Partie 5 : Pare-feu

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw enable
```

---

## Partie 6 : Configuration Twilio

Dans [Twilio Console](https://console.twilio.com) > **Messaging** > **WhatsApp** :

| Paramètre | URL |
|-----------|-----|
| When a message comes in | `http://87.106.25.147/webhook/twilio/whatsapp` |
| Status callback URL | `http://87.106.25.147/webhook/twilio/whatsapp/status` |

---

## Partie 7 : Commandes Utiles

### Application

```bash
# Logs en temps réel
pm2 logs aida-assistant

# Redémarrer l'app
pm2 restart aida-assistant

# Statut
pm2 status
```

### Ollama

```bash
# Statut du service
systemctl status ollama

# Logs Ollama
journalctl -u ollama -f

# Tester le modèle
ollama run qwen2:7b-instruct-q4_K_M "Test"

# Lister les modèles
ollama list
```

### Mise à jour

```bash
cd /var/www/aida-assistant
git pull origin main
npm install
npm run build
pm2 restart aida-assistant
```

### Backup DB

```bash
pg_dump -U aida_user aida_db > backup_$(date +%Y%m%d).sql
```

---

## Partie 8 : Optimisation Mémoire (Important pour 8 GB RAM)

### 8.1 Configurer le swap (mémoire virtuelle)

```bash
# Créer un fichier swap de 4 GB
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

# Rendre permanent
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Vérifier
free -h
```

### 8.2 Limiter la mémoire de Node.js (optionnel)

```bash
# Si besoin, limiter Node.js à 1 GB
pm2 delete aida-assistant
pm2 start dist/index.js --name "aida-assistant" --node-args="--max-old-space-size=1024"
pm2 save
```

---

## Récapitulatif des URLs (IP: 87.106.25.147)

| Service | URL |
|---------|-----|
| Application | `http://87.106.25.147` |
| Webhook WhatsApp | `http://87.106.25.147/webhook/twilio/whatsapp` |
| Status Callback | `http://87.106.25.147/webhook/twilio/whatsapp/status` |
| Google OAuth | `http://87.106.25.147/oauth/callback` |
| Admin Panel | `http://87.106.25.147/admin` |
| Super Admin | `http://87.106.25.147/superadmin` |

---

## Checklist de Déploiement

### Installation
- [ ] Node.js 20 installé
- [ ] PostgreSQL installé et configuré
- [ ] Base de données créée (`aida_db`)
- [ ] Ollama installé
- [ ] Modèle Qwen2 téléchargé
- [ ] Nginx configuré
- [ ] PM2 installé

### Application
- [ ] Code cloné depuis GitHub
- [ ] Dépendances installées (`npm install`)
- [ ] Fichier `.env` configuré
- [ ] Migrations Prisma exécutées
- [ ] Application démarrée avec PM2

### Sécurité
- [ ] Pare-feu UFW activé
- [ ] Swap configuré (4 GB)

### Twilio
- [ ] Webhooks configurés avec l'IP

---

## Performances Attendues

| Métrique | Valeur |
|----------|--------|
| Temps de réponse LLM | 5-15 secondes |
| RAM utilisée (Ollama) | ~5-6 GB |
| RAM utilisée (Node.js) | ~200-500 MB |
| RAM utilisée (PostgreSQL) | ~100-200 MB |

**Total RAM estimée** : ~6-7 GB sur 8 GB disponibles

---

## Dépannage

### Ollama ne répond pas

```bash
# Vérifier le service
systemctl status ollama

# Redémarrer
systemctl restart ollama

# Vérifier les logs
journalctl -u ollama --no-pager -n 50
```

### Mémoire insuffisante

```bash
# Vérifier la mémoire
free -h

# Vérifier le swap
swapon --show

# Si Ollama est tué (OOM), augmenter le swap
```

### Application ne démarre pas

```bash
# Vérifier les logs PM2
pm2 logs aida-assistant --err --lines 50

# Vérifier que le port n'est pas utilisé
netstat -tlnp | grep 3000
```

---

## Partie 9 : Fine-Tuning sur Cloud GPU et Export vers VPS

### Architecture d'Entraînement

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        WORKFLOW FINE-TUNING                             │
│                                                                         │
│  ┌───────────────────────┐         ┌───────────────────────────────┐   │
│  │   HiveNet Cloud GPU   │         │      VPS IONOS (Production)   │   │
│  │                       │   SCP   │                               │   │
│  │  1. Fine-tuning       │ ──────► │  3. Import modèle             │   │
│  │  2. Export GGUF       │         │  4. Utilisation Ollama        │   │
│  │                       │         │                               │   │
│  │  GPU: NVIDIA          │         │  CPU: Inference uniquement    │   │
│  │  Usage: Entraînement  │         │  Usage: Production            │   │
│  └───────────────────────┘         └───────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.1 Préparation du Cloud GPU (HiveNet)

#### Connexion SSH au conteneur

```bash
ssh -i ~/.ssh/id_ed25519 -o "ProxyCommand=ssh -i ~/.ssh/id_ed25519 bastion@ssh.hivecompute.ai %h" ubuntu@VOTRE_CONTAINER_ID.ssh.hivecompute.ai
```

#### Installation des outils nécessaires

```bash
# Créer le répertoire temporaire
mkdir -p ~/.cache/tmp
export TMPDIR=/tmp

# Installer les dépendances système
sudo apt-get update
sudo apt-get install -y zstd git python3-pip python3-venv

# Installer Ollama
curl -fsSL https://ollama.com/install.sh | sh

# Démarrer Ollama (pas de systemd dans le conteneur)
ollama serve &

# Télécharger le modèle de base
ollama pull qwen2:7b-instruct-q4_K_M
```

### 9.2 Préparation des Données d'Entraînement

#### Structure des données

Créez un fichier `training_data.jsonl` avec vos conversations :

```bash
nano ~/training_data.jsonl
```

Format JSONL (une conversation par ligne) :

```jsonl
{"messages": [{"role": "system", "content": "Tu es Sophie, assistante virtuelle du cabinet dentaire. Tu es professionnelle, chaleureuse et efficace."}, {"role": "user", "content": "Bonjour, je voudrais prendre rendez-vous"}, {"role": "assistant", "content": "Bonjour ! Je suis Sophie, l'assistante virtuelle du cabinet. Je serais ravie de vous aider à prendre rendez-vous. Puis-je avoir votre nom et prénom ?"}]}
{"messages": [{"role": "system", "content": "Tu es Sophie, assistante virtuelle du cabinet dentaire."}, {"role": "user", "content": "J'ai mal aux dents"}, {"role": "assistant", "content": "Je suis désolée d'apprendre que vous avez mal aux dents. Nous allons vous trouver un rendez-vous rapidement. Êtes-vous déjà patient(e) chez nous ?"}]}
```

#### Conseils pour les données d'entraînement

- **Minimum recommandé** : 100-500 conversations
- **Qualité > Quantité** : Des exemples bien formatés sont essentiels
- **Diversité** : Couvrir tous les cas d'usage (prise de RDV, annulation, questions, etc.)
- **Cohérence** : Garder le même ton et style dans toutes les réponses

### 9.3 Fine-Tuning avec Unsloth (Recommandé)

Unsloth permet un fine-tuning rapide et efficace sur GPU.

#### Installation d'Unsloth

```bash
# Créer un environnement virtuel
python3 -m venv ~/unsloth-env
source ~/unsloth-env/bin/activate

# Installer PyTorch avec CUDA
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# Installer Unsloth
pip install "unsloth[colab-new] @ git+https://github.com/unslothai/unsloth.git"
pip install xformers trl peft accelerate bitsandbytes
```

#### Script de Fine-Tuning

Créez le script d'entraînement :

```bash
nano ~/finetune_qwen.py
```

```python
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset
import torch

# Configuration
max_seq_length = 2048
model_name = "unsloth/Qwen2-7B-Instruct-bnb-4bit"

# Charger le modèle avec quantification 4-bit
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=model_name,
    max_seq_length=max_seq_length,
    dtype=None,  # Auto-détection
    load_in_4bit=True,
)

# Configurer LoRA pour le fine-tuning efficace
model = FastLanguageModel.get_peft_model(
    model,
    r=16,  # Rang LoRA
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                    "gate_proj", "up_proj", "down_proj"],
    lora_alpha=16,
    lora_dropout=0,
    bias="none",
    use_gradient_checkpointing="unsloth",
    random_state=42,
)

# Charger les données d'entraînement
dataset = load_dataset("json", data_files="training_data.jsonl", split="train")

# Template de conversation
def formatting_prompts_func(examples):
    texts = []
    for messages in examples["messages"]:
        text = tokenizer.apply_chat_template(messages, tokenize=False)
        texts.append(text)
    return {"text": texts}

dataset = dataset.map(formatting_prompts_func, batched=True)

# Configuration de l'entraînement
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=dataset,
    dataset_text_field="text",
    max_seq_length=max_seq_length,
    args=TrainingArguments(
        per_device_train_batch_size=2,
        gradient_accumulation_steps=4,
        warmup_steps=5,
        max_steps=100,  # Augmenter pour plus d'entraînement
        learning_rate=2e-4,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        optim="adamw_8bit",
        output_dir="outputs",
        save_steps=50,
    ),
)

# Lancer l'entraînement
print("Démarrage du fine-tuning...")
trainer.train()

# Sauvegarder le modèle
print("Sauvegarde du modèle...")
model.save_pretrained("sophie-dental-assistant")
tokenizer.save_pretrained("sophie-dental-assistant")

print("Fine-tuning terminé !")
```

#### Lancer l'entraînement

```bash
source ~/unsloth-env/bin/activate
python ~/finetune_qwen.py
```

⏱️ **Durée estimée** : 30 minutes à 2 heures selon le nombre de données

### 9.4 Export au Format GGUF (Compatible Ollama)

Après l'entraînement, convertissez le modèle au format GGUF :

```bash
# Installer llama.cpp pour la conversion
cd ~
git clone https://github.com/ggerganov/llama.cpp
cd llama.cpp
make

# Installer les dépendances Python
pip install -r requirements.txt

# Fusionner les poids LoRA avec le modèle de base
python merge_lora.py \
    --base-model unsloth/Qwen2-7B-Instruct \
    --lora-model ~/sophie-dental-assistant \
    --output ~/sophie-merged

# Convertir en GGUF
python convert_hf_to_gguf.py ~/sophie-merged \
    --outfile ~/sophie-dental-q4_K_M.gguf \
    --outtype q4_K_M
```

**Alternative simplifiée avec Unsloth** (recommandée) :

Ajoutez à la fin du script `finetune_qwen.py` :

```python
# Export GGUF directement avec Unsloth
model.save_pretrained_gguf(
    "sophie-dental",
    tokenizer,
    quantization_method="q4_k_m"
)
print("Export GGUF terminé : sophie-dental-unsloth.Q4_K_M.gguf")
```

### 9.5 Transfert du Modèle vers le VPS

#### Depuis le Cloud GPU

```bash
# Compresser le fichier GGUF
gzip -k ~/sophie-dental-unsloth.Q4_K_M.gguf

# Transférer vers le VPS
scp ~/sophie-dental-unsloth.Q4_K_M.gguf.gz root@87.106.25.147:/tmp/
```

#### Sur le VPS IONOS

```bash
# Se connecter au VPS
ssh root@87.106.25.147

# Décompresser le modèle
cd /tmp
gunzip sophie-dental-unsloth.Q4_K_M.gguf.gz

# Créer le répertoire des modèles Ollama
mkdir -p ~/.ollama/models/blobs
mkdir -p ~/.ollama/models/manifests/registry.ollama.ai/library/sophie-dental

# Déplacer le modèle
mv sophie-dental-unsloth.Q4_K_M.gguf ~/.ollama/models/
```

### 9.6 Créer le Modèle dans Ollama (VPS)

#### Créer un Modelfile

```bash
nano ~/Modelfile
```

Contenu :

```dockerfile
FROM ~/.ollama/models/sophie-dental-unsloth.Q4_K_M.gguf

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ .Response }}<|im_end|>
"""

SYSTEM """Tu es Sophie, l'assistante virtuelle du cabinet dentaire. Tu es professionnelle, chaleureuse et efficace. Tu aides les patients à prendre rendez-vous, répondre à leurs questions et gérer leurs demandes."""

PARAMETER temperature 0.7
PARAMETER top_p 0.9
PARAMETER stop "<|im_end|>"
```

#### Créer le modèle Ollama

```bash
ollama create sophie-dental -f ~/Modelfile
```

#### Tester le modèle

```bash
ollama run sophie-dental "Bonjour, je voudrais prendre rendez-vous pour un détartrage"
```

### 9.7 Mettre à jour la Configuration de l'Application

Modifiez le fichier `.env` sur le VPS :

```bash
nano /var/www/aida-assistant/.env
```

Changez le nom du modèle :

```env
# Ancien
LLM_MODEL_NAME=qwen2:7b-instruct-q4_K_M

# Nouveau (votre modèle fine-tuné)
LLM_MODEL_NAME=sophie-dental
```

Redémarrez l'application :

```bash
pm2 restart aida-assistant
```

### 9.8 Vérification Finale

```bash
# Vérifier que le modèle est disponible
ollama list

# Tester via l'API
curl http://localhost:11434/api/generate -d '{
  "model": "sophie-dental",
  "prompt": "Bonjour, je voudrais annuler mon rendez-vous",
  "stream": false
}'

# Vérifier les logs de l'application
pm2 logs aida-assistant
```

---

## Partie 10 : Maintenance du Modèle Fine-Tuné

### 10.1 Amélioration Continue

Pour améliorer le modèle, collectez les nouvelles conversations et relancez le fine-tuning :

```bash
# Sur le Cloud GPU
# 1. Ajouter les nouvelles données à training_data.jsonl
# 2. Relancer l'entraînement
# 3. Exporter et transférer vers le VPS
```

### 10.2 Revenir au Modèle Original

Si le modèle fine-tuné pose problème :

```bash
# Sur le VPS
nano /var/www/aida-assistant/.env

# Remettre le modèle original
LLM_MODEL_NAME=qwen2:7b-instruct-q4_K_M

pm2 restart aida-assistant
```

### 10.3 Sauvegardes

```bash
# Sauvegarder le modèle fine-tuné
cp ~/.ollama/models/sophie-dental-unsloth.Q4_K_M.gguf /backup/

# Sauvegarder les données d'entraînement
scp ubuntu@CLOUD_GPU:~/training_data.jsonl /backup/
```

---

## Checklist Fine-Tuning

### Préparation
- [ ] Cloud GPU connecté (HiveNet)
- [ ] Ollama installé sur Cloud GPU
- [ ] Données d'entraînement préparées (JSONL)
- [ ] Unsloth installé

### Entraînement
- [ ] Fine-tuning exécuté
- [ ] Modèle exporté en GGUF

### Déploiement
- [ ] Modèle transféré vers VPS
- [ ] Modelfile créé
- [ ] Modèle créé dans Ollama
- [ ] Configuration `.env` mise à jour
- [ ] Application redémarrée
- [ ] Tests de validation effectués

---

*Version: 4.0 - Configuration tout-en-un VPS avec Fine-Tuning Cloud GPU*
*Dernière mise à jour: Février 2026*
