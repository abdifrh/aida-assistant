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
│            │        IP: xxx.xxx.xxx.xxx    │                   │
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
│            │   │   Proxy)            │     │                   │
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

## Partie 1 : Configuration du VPS IONOS

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
CREATE USER aida_user WITH PASSWORD 'VOTRE_MOT_DE_PASSE';
CREATE DATABASE aida_db OWNER aida_user;
GRANT ALL PRIVILEGES ON DATABASE aida_db TO aida_user;
\q
```

### 1.5 Installation de Nginx et PM2

```bash
apt install -y nginx git
npm install -g pm2
systemctl start nginx
systemctl enable nginx
```

### 1.6 Création du répertoire

```bash
mkdir -p /var/www/aida-assistant
```

---

## Partie 2 : Déploiement de l'Application

### 2.1 Cloner depuis GitHub

```bash
cd /var/www/aida-assistant
git clone https://github.com/abdifrh/aida-assistant.git .
```

### 2.2 Installation des dépendances

```bash
npm install
```

### 2.3 Configuration de l'environnement

```bash
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
GOOGLE_REDIRECT_URI=http://VOTRE_IP_VPS/auth/google/callback

# ===== WEBHOOK URL =====
WEBHOOK_BASE_URL=http://VOTRE_IP_VPS
```

### 2.4 Migration et Build

```bash
npx prisma generate
npx prisma migrate deploy
npm run build
```

### 2.5 Démarrage avec PM2

```bash
pm2 start dist/index.js --name "aida-assistant"
pm2 startup
pm2 save
```

---

## Partie 3 : Configuration Ollama (Cloud GPU)

### 3.1 Installation

```bash
ssh root@IP_CLOUD_GPU
curl -fsSL https://ollama.com/install.sh | sh
```

### 3.2 Configuration réseau

```bash
mkdir -p /etc/systemd/system/ollama.service.d
nano /etc/systemd/system/ollama.service.d/override.conf
```

**Contenu :**

```ini
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"
```

```bash
systemctl daemon-reload
systemctl restart ollama
```

### 3.3 Téléchargement du modèle

```bash
ollama pull mistral:7b-instruct-v0.3-q4_K_M
```

### 3.4 Pare-feu (autoriser uniquement le VPS)

```bash
ufw allow from IP_VPS to any port 11434
ufw enable
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

## Partie 5 : Pare-feu VPS

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
| When a message comes in | `http://VOTRE_IP_VPS/webhook/twilio/whatsapp` |
| Status callback URL | `http://VOTRE_IP_VPS/webhook/twilio/whatsapp/status` |

---

## Partie 7 : Commandes Utiles

```bash
# Logs en temps réel
pm2 logs aida-assistant

# Redémarrer
pm2 restart aida-assistant

# Mise à jour
cd /var/www/aida-assistant
git pull origin main
npm install
npm run build
pm2 restart aida-assistant

# Backup DB
pg_dump -U aida_user aida_db > backup_$(date +%Y%m%d).sql
```

---

## Récapitulatif des URLs

| Service | URL |
|---------|-----|
| Application | `http://VOTRE_IP_VPS` |
| Webhook WhatsApp | `http://VOTRE_IP_VPS/webhook/twilio/whatsapp` |
| Status Callback | `http://VOTRE_IP_VPS/webhook/twilio/whatsapp/status` |
| Google OAuth | `http://VOTRE_IP_VPS/auth/google/callback` |
| Admin Panel | `http://VOTRE_IP_VPS/admin` |
| Super Admin | `http://VOTRE_IP_VPS/superadmin` |

---

## Checklist

### VPS
- [ ] Node.js 20 installé
- [ ] PostgreSQL configuré
- [ ] Nginx configuré
- [ ] PM2 installé
- [ ] Application déployée
- [ ] Pare-feu activé

### Cloud GPU
- [ ] Ollama installé
- [ ] Modèle téléchargé
- [ ] Accès réseau configuré
- [ ] Pare-feu limité au VPS

### Twilio
- [ ] Webhooks configurés avec IP

---

*Version: 2.1 - Configuration IP uniquement*
