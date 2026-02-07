# Multi-Clinic Setup (SaaS)

Sophie is natively designed as a **SaaS (Software as a Service)** solution. A single server instance can manage an unlimited number of clinics with total data isolation.

---

## ðŸ—ï¸ Isolation Architecture

Isolation is based on the `clinic_id` (UUID) field present in all key system tables:
1.  **WhatsApp**: Each clinic links its own number via Meta APIs (Secret/Token).
2.  **Calendar**: Google Calendar flows are specific to each practitioner within the clinic.
3.  **Data**: Patients, appointments, and logs are filtered by this ID.

---

## ðŸš€ Adding a New Clinic

### 1. Database
Create an entry in the `clinics` table.
```sql
INSERT INTO clinics (name, timezone, address) VALUES ('My Clinic', 'Europe/Paris', '123 street..');
```

### 2. WhatsApp Configuration
Configure credentials in `clinic_whatsapp_configs`:
- `phone_number_id`: Meta identifier.
- `access_token`: Permanent system token.
- `verify_token`: Webhook validation token.

---

## ðŸ“² Webhook Configuration

Sophie uses a dynamic route to identify the source clinic of the message:
- **Callback URL**: `https://api.your-domain.com/webhook/whatsapp/{CLINIC_ID}`

When a message arrives at this URL, the system instantly loads the context (doctors, treatments, API keys) specific to that clinic.

---

## ðŸ‘¨â€âš•ï¸ Practitioner Management

Each practitioner added to the dashboard must be linked to their clinic.
- **Google Calendar**: Each practitioner must provide their Google Calendar ID so Sophie can read/write appointments.

---

## ðŸ› ï¸ Isolated Admin Dashboard

The administrative interface (`/admin`) is designed to filter data according to the logged-in user:
- An administrator from **Clinic A** will never have access to data from **Clinic B**.
- Performance statistics are calculated per entity.

---

**Version**: 2.5  
**Last Update**: January 27, 2026

