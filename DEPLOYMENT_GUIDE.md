# Guide de Déploiement - Assistant IA Clinique Dentaire

## Architecture de Déploiement

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
│            │   ┌─────────────────────┐     │                   │
│            │   │   Node.js App       │     │                   │
│            │   │   (Port 3000)       │     │                   │
│            │   └──────────┬──────────┘     │                   │
│            │              │                │                   │
│            │   ┌──────────▼──────────┐     │                   │
│            │   │   PostgreSQL        │     │                   │
│            │   │   (Port 5432)       │     │                   │
│            │   └─────────────────────┘     │                   │
│            │              │                │                   │
│            │   ┌──────────▼──────────┐     │                   │
│            │   │   Nginx (Reverse    │     │                   │
│            │   │   Proxy + SSL)      │     │                   │
│            │   └─────────────────────┘     │                   │
│            └───────────────┬───────────────┘                   │
│                            │                                    │
│                            │ API calls (HTTP)                   │
│                            │                                    │
│            ┌───────────────▼───────────────┐                   │
│            │    IONOS Cloud GPU Server     │                   │
│            │   ┌─────────────────────┐     │                   │
│            │   │   Ollama Server     │     │                   │
│            │   │   (Port 11434)      │     │                   │
│            │   └─────────────────────┘     │                   │
│            └───────────────────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Partie 1 : Configuration du VPS IONOS (Application Node.js)

### 1.1 Connexion SSH au VPS

```bash
ssh root@VOTRE_IP_VPS
```

### 1.2 Mise à jour du système

```bash
apt update && apt upgrade -y
```

### 1.3 Installation de Node.js 20 LTS

```bash
# Installation via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# Vérification
node --version  # v20.x.x
npm --version   # 10.x.x
```

### 1.4 Installation de PostgreSQL

```bash
# Installation
apt install -y postgresql postgresql-contrib

# Démarrage et activation
systemctl start postgresql
systemctl enable postgresql

# Création de la base de données
sudo -u postgres psql

# Dans le shell PostgreSQL :
CREATE USER aida_user WITH PASSWORD 'VOTRE_MOT_DE_PASSE_SECURISE';
CREATE DATABASE aida_db OWNER aida_user;
GRANT ALL PRIVILEGES ON DATABASE aida_db TO aida_user;
\q
```

### 1.5 Installation de Nginx

```bash
apt install -y nginx
systemctl start nginx
systemctl enable nginx
```

### 1.6 Installation de PM2 (Process Manager)

```bash
npm install -g pm2
```

### 1.7 Installation de Git

```bash
apt install -y git
```

### 1.8 Création de l'utilisateur applicatif

```bash
# Créer un utilisateur dédié (sécurité)
adduser --disabled-password --gecos "" aida
usermod -aG sudo aida

# Créer le répertoire de l'application
mkdir -p /var/www/aida-assistant
chown -R aida:aida /var/www/aida-assistant
```

---

## Partie 2 : Déploiement de l'Application

### 2.1 Option A : Transfert via Git (Recommandé)

**Sur votre machine locale :**

```bash
# Si pas encore initialisé
cd C:\Users\abdif\Documents\AI CALL ASSISTANT\PROECTASSISTANT
git init
git add .
git commit -m "Initial deployment"

# Créer un repo privé sur GitHub/GitLab, puis :
git remote add origin https://github.com/VOTRE_USER/aida-assistant.git
git push -u origin main
```

**Sur le VPS :**

```bash
su - aida
cd /var/www/aida-assistant
git clone https://github.com/VOTRE_USER/aida-assistant.git .
```

### 2.2 Option B : Transfert via SCP (Direct)

**Sur votre machine Windows (PowerShell) :**

```powershell
# Compresser le projet (exclure node_modules)
cd "C:\Users\abdif\Documents\AI CALL ASSISTANT\PROECTASSISTANT"

# Créer une archive sans node_modules
tar --exclude='node_modules' --exclude='.git' --exclude='dist' -czvf aida-assistant.tar.gz .

# Transférer vers le VPS
scp aida-assistant.tar.gz root@VOTRE_IP_VPS:/var/www/aida-assistant/
```

**Sur le VPS :**

```bash
cd /var/www/aida-assistant
tar -xzvf aida-assistant.tar.gz
rm aida-assistant.tar.gz
chown -R aida:aida /var/www/aida-assistant
```

### 2.3 Installation des dépendances

```bash
su - aida
cd /var/www/aida-assistant
npm install
```

### 2.4 Configuration de l'environnement

```bash
# Créer le fichier .env
nano /var/www/aida-assistant/.env
```

**Contenu du fichier .env :**

```env
# ===== APPLICATION =====
NODE_ENV=production
PORT=3000

# ===== DATABASE =====
DATABASE_URL="postgresql://aida_user:VOTRE_MOT_DE_PASSE@localhost:5432/aida_db?schema=public"

# ===== TWILIO (WhatsApp) =====
TWILIO_ACCOUNT_SID=votre_account_sid
TWILIO_AUTH_TOKEN=votre_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# ===== OLLAMA (Cloud GPU) =====
LLM_API_URL=http://IP_CLOUD_GPU:11434/api/generate
LLM_MODEL_NAME=mistral:7b-instruct-v0.3-q4_K_M

# ===== GOOGLE CALENDAR =====
GOOGLE_CLIENT_ID=votre_client_id
GOOGLE_CLIENT_SECRET=votre_client_secret
GOOGLE_REDIRECT_URI=https://votre-domaine.com/auth/google/callback

# ===== WEBHOOK URL (Twilio) =====
WEBHOOK_BASE_URL=https://votre-domaine.com
```

### 2.5 Migration de la base de données

```bash
cd /var/www/aida-assistant
npx prisma generate
npx prisma migrate deploy
```

### 2.6 Build de l'application

```bash
npm run build
```

### 2.7 Démarrage avec PM2

```bash
# Démarrer l'application
pm2 start dist/index.js --name "aida-assistant"

# Configurer le démarrage automatique
pm2 startup
pm2 save

# Commandes utiles PM2
pm2 status              # Voir le statut
pm2 logs aida-assistant # Voir les logs
pm2 restart aida-assistant # Redémarrer
pm2 stop aida-assistant    # Arrêter
```

---

## Partie 3 : Configuration du Cloud GPU IONOS (Ollama)

### 3.1 Connexion au serveur GPU

```bash
ssh root@IP_CLOUD_GPU
```

### 3.2 Installation de Ollama

```bash
# Installation
curl -fsSL https://ollama.com/install.sh | sh

# Vérification
ollama --version
```

### 3.3 Configuration pour accès réseau

```bash
# Créer le fichier de configuration systemd
mkdir -p /etc/systemd/system/ollama.service.d
nano /etc/systemd/system/ollama.service.d/override.conf
```

**Contenu :**

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

```bash
# Recharger et redémarrer
systemctl daemon-reload
systemctl restart ollama
```

### 3.4 Téléchargement du modèle

```bash
# Télécharger le modèle (peut prendre du temps)
ollama pull mistral:7b-instruct-v0.3-q4_K_M

# Vérifier les modèles disponibles
ollama list
```

### 3.5 Configuration du pare-feu

```bash
# Autoriser uniquement l'IP du VPS
ufw allow from IP_VPS to any port 11434
ufw enable
```

### 3.6 Test de connectivité

**Depuis le VPS :**

```bash
curl http://IP_CLOUD_GPU:11434/api/tags
```

---

## Partie 4 : Configuration Nginx (HTTPS + Reverse Proxy)

### 4.1 Installation de Certbot (SSL Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
```

### 4.2 Configuration Nginx

```bash
nano /etc/nginx/sites-available/aida-assistant
```

**Contenu :**

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    # Redirection HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name votre-domaine.com;

    # SSL sera configuré par Certbot

    # Logs
    access_log /var/log/nginx/aida-access.log;
    error_log /var/log/nginx/aida-error.log;

    # Proxy vers l'application Node.js
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # Webhooks Twilio
    location /webhook/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Important pour Twilio signature validation
        proxy_set_header X-Twilio-Signature $http_x_twilio_signature;
    }
}
```

### 4.3 Activer le site et obtenir SSL

```bash
# Activer le site
ln -s /etc/nginx/sites-available/aida-assistant /etc/nginx/sites-enabled/

# Tester la configuration
nginx -t

# Obtenir le certificat SSL
certbot --nginx -d votre-domaine.com

# Recharger Nginx
systemctl reload nginx
```

---

## Partie 5 : Configuration du Pare-feu VPS

```bash
# Configurer UFW
ufw default deny incoming
ufw default allow outgoing

# Autoriser SSH
ufw allow 22/tcp

# Autoriser HTTP/HTTPS
ufw allow 80/tcp
ufw allow 443/tcp

# Activer le pare-feu
ufw enable

# Vérifier le statut
ufw status
```

---

## Partie 6 : Configuration Twilio (Webhooks)

### 6.1 Mettre à jour les URLs dans Twilio Console

1. Connectez-vous à [Twilio Console](https://console.twilio.com)
2. Allez dans **Messaging** > **Settings** > **WhatsApp Sandbox** (ou votre numéro)
3. Configurez les webhooks :

| Paramètre | URL |
|-----------|-----|
| When a message comes in | `https://votre-domaine.com/webhook/twilio/whatsapp` |
| Status callback URL | `https://votre-domaine.com/webhook/twilio/whatsapp/status` |

---

## Partie 7 : Maintenance et Monitoring

### 7.1 Commandes de maintenance

```bash
# Voir les logs en temps réel
pm2 logs aida-assistant --lines 100

# Redémarrer l'application
pm2 restart aida-assistant

# Mise à jour du code
cd /var/www/aida-assistant
git pull origin main
npm install
npm run build
pm2 restart aida-assistant

# Backup de la base de données
pg_dump -U aida_user aida_db > backup_$(date +%Y%m%d).sql
```

### 7.2 Script de déploiement automatique

```bash
nano /var/www/aida-assistant/deploy.sh
```

**Contenu :**

```bash
#!/bin/bash
set -e

echo "🚀 Déploiement AIDA Assistant..."

cd /var/www/aida-assistant

echo "📥 Pull des dernières modifications..."
git pull origin main

echo "📦 Installation des dépendances..."
npm install

echo "🔨 Build de l'application..."
npm run build

echo "🗄️ Migration de la base de données..."
npx prisma migrate deploy

echo "🔄 Redémarrage de l'application..."
pm2 restart aida-assistant

echo "✅ Déploiement terminé !"
pm2 status
```

```bash
chmod +x /var/www/aida-assistant/deploy.sh
```

### 7.3 Monitoring avec PM2

```bash
# Dashboard web PM2
pm2 install pm2-server-monit

# Monitoring en temps réel
pm2 monit
```

---

## Partie 8 : Checklist de Déploiement

### VPS (Application)
- [ ] Node.js 20 installé
- [ ] PostgreSQL installé et configuré
- [ ] Base de données créée
- [ ] Nginx installé et configuré
- [ ] Certificat SSL obtenu
- [ ] PM2 installé
- [ ] Application déployée
- [ ] Variables d'environnement configurées
- [ ] Migrations Prisma exécutées
- [ ] Pare-feu configuré

### Cloud GPU (Ollama)
- [ ] Ollama installé
- [ ] Modèle téléchargé
- [ ] Service configuré pour écouter sur réseau
- [ ] Pare-feu configuré (accès limité au VPS)
- [ ] Test de connectivité réussi

### Twilio
- [ ] Webhooks mis à jour avec nouvelle URL
- [ ] Test d'envoi/réception de message

---

## Partie 9 : Dépannage

### Problème : L'application ne répond pas

```bash
# Vérifier le statut PM2
pm2 status

# Vérifier les logs
pm2 logs aida-assistant --err --lines 50

# Vérifier si le port est utilisé
netstat -tlnp | grep 3000
```

### Problème : Erreur de connexion à la base de données

```bash
# Vérifier PostgreSQL
systemctl status postgresql

# Tester la connexion
psql -U aida_user -d aida_db -h localhost
```

### Problème : Ollama ne répond pas

```bash
# Sur le serveur GPU
systemctl status ollama

# Vérifier les logs
journalctl -u ollama -f

# Tester localement
curl http://localhost:11434/api/tags
```

### Problème : Certificat SSL expiré

```bash
# Renouveler le certificat
certbot renew

# Recharger Nginx
systemctl reload nginx
```

---

## Partie 10 : Coûts Estimés IONOS

| Service | Spécifications | Prix estimé/mois |
|---------|---------------|------------------|
| VPS Linux L | 4 vCPU, 8 GB RAM, 160 GB SSD | ~12-15€ |
| Cloud GPU | Variable selon GPU | ~50-200€ |
| Domaine | .com/.fr | ~10-15€/an |
| **Total** | | **~70-220€/mois** |

---

## Contacts et Ressources

- **Documentation IONOS** : https://docs.ionos.com
- **Documentation Ollama** : https://ollama.com/docs
- **Documentation Twilio** : https://www.twilio.com/docs
- **Documentation Prisma** : https://www.prisma.io/docs

---

*Document généré le 7 février 2026*
*Version: 1.0*
