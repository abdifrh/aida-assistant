# Sophie - Documentation Hub 📚

Welcome to the complete documentation for **Sophie**, your AI Medical Assistant for WhatsApp-based appointment management.

---

## 🇬🇧 English Documentation

### Core Guides
- **[Complete System Guide](en/complete-guide.md)** - Comprehensive overview of Sophie's architecture, features, and workflows
- **[Multi-Clinic Setup](en/multi-clinic-setup.md)** - SaaS configuration and multi-tenant management
- **[Dynamic Treatment System](en/treatment-system.md)** - Treatment types, durations, and practitioner assignment
- **[Technical Integration Guide](en/integration-guide.md)** - Developer guide for integration, customization, and extension

### Quick Links
- [Installation Steps](en/complete-guide.md#installation--setup)
- [Twilio WhatsApp Integration](en/integration-guide.md#twilio-whatsapp-integration)
- [Google Calendar Setup](en/integration-guide.md#google-calendar-synchronization)
- [Admin Dashboard Guide](en/complete-guide.md#admin-dashboard-features)
- [API Reference](en/integration-guide.md#api-endpoints)

---

## 🇫🇷 Documentation Française

### Guides Principaux
- **[Guide Complet du Système](fr/guide-complet.md)** - Vue d'ensemble complète de l'architecture, fonctionnalités et flux de travail
- **[Configuration Multi-Clinique](fr/configuration-multi-clinique.md)** - Configuration SaaS et gestion multi-tenant
- **[Système de Traitements Dynamiques](fr/systeme-traitements.md)** - Types de traitements, durées et affectation des praticiens
- **[Guide d'Intégration Technique](fr/guide-integration.md)** - Guide développeur pour l'intégration, personnalisation et extension

### Liens Rapides
- [Étapes d'installation](fr/guide-complet.md#installation-et-configuration)
- [Intégration Twilio WhatsApp](fr/guide-integration.md#intégration-twilio-whatsapp)
- [Configuration Google Calendar](fr/guide-integration.md#synchronisation-google-calendar)
- [Guide Dashboard Admin](fr/guide-complet.md#fonctionnalités-du-dashboard-admin)
- [Référence API](fr/guide-integration.md#points-dapi)

---

## 📋 What's New in Version 3.0

### 🆕 New Features
- **📸 Media Management**: Automatic download and storage of insurance cards and guarantee documents
- **🏥 Social Insurance Collection**: Optional but requested social insurance information (Hospice générale, SPC)
- **📄 PDF Document Handling**: Support for guarantee documents when insurance numbers aren't available
- **🖼️ Image Display in Dashboards**: Inline viewing of patient-submitted media in admin and super admin dashboards
- **🔐 Enhanced Security**: Query parameter authentication for secure image serving

### 🔧 Improvements
- **Automatic Flow Continuation**: Seamless transition from patient data collection to appointment booking
- **Better Error Handling**: Improved fallback mechanisms for media download failures
- **Enhanced Logging**: More detailed logs for media operations and insurance collection

---

## 🏗️ System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         Patient                              │
│                      (WhatsApp)                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Twilio WhatsApp API                         │
│                 (Webhooks & Messaging)                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                    Sophie Backend                            │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  WhatsAppService → TwilioWhatsAppService              │   │
│  │         ↓                                             │   │
│  │  MediaService (Twilio Auth)                           │   │
│  │         ↓                                             │   │
│  │  ConversationManager (FSM)                            │   │
│  │         ↓                                             │   │
│  │  LLMService → Ollama (Qwen 2.5 / Sophie)              │   │
│  │         ↓                                             │   │
│  │  CalendarService → Google Calendar API                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              PostgreSQL Database                      │   │
│  │  (Clinics, Patients, Appointments, Messages, Logs)   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              File Storage                             │   │
│  │  uploads/images/{clinic_id}/                          │   │
│  │  uploads/documents/{clinic_id}/                       │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │
          ┌─────────────┴──────────────┐
          ▼                            ▼
┌──────────────────────┐    ┌──────────────────────┐
│  Clinic Admin        │    │  Super Admin         │
│  Dashboard           │    │  Dashboard           │
│  /clinic/{id}/admin  │    │  /superadmin         │
└──────────────────────┘    └──────────────────────┘
```

---

## 🚀 Getting Started

### For End Users (Clinic Staff)
1. Access your clinic dashboard at `/clinic/{clinicId}/admin`
2. Configure practitioners and treatment types
3. Connect Google Calendar for each practitioner
4. Share your WhatsApp number with patients
5. Monitor conversations and appointments in real-time

### For Developers
1. Read the [Technical Integration Guide](en/integration-guide.md)
2. Set up your development environment
3. Configure environment variables
4. Run database migrations
5. Start the development server

### For System Administrators
1. Access the super admin dashboard at `/superadmin`
2. Create and configure clinics
3. Set up WhatsApp Business API credentials
4. Monitor system-wide performance and logs
5. Manage user access and permissions

---

## 📞 Support & Community

- **Issues**: Report bugs or request features on GitHub
- **Email**: support@aida-medical.com
- **Documentation**: Always refer to the latest version in this repository

---

## 📝 License

Proprietary - AIDA Medical © 2026

---

**Version**: 3.0
**Last Updated**: January 28, 2026
**Maintained by**: AIDA Medical Team
