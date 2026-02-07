# Dynamic Treatment System

This system allows for flexible management of appointment types, adapting them to each doctor's specialties.

---

## ðŸ’Ž Concept

Instead of a fixed list of appointments, Sophie offers treatments based on:
1.  **The Clinic**: Services offered by the facility.
2.  **The Practitioner**: Specific skills (e.g., an Orthodontist does not perform Cleaning).
3.  **Duration**: Each treatment has its own duration (e.g., 30 min for a check-up, 60 min for surgery).

---

## ðŸ› ï¸ Technical Components

### 1. Prisma Models
- `TreatmentType`: Defines the name (FR/EN), description, and duration.
- `PractitionerTreatment`: Links a doctor to a type of care.

### 2. Core Services (src/services)
- `TreatmentService.ts`: Core logic (retrieval, assignment).
- `TreatmentConversationHelper.ts`: Helps Sophie format care lists for WhatsApp.

---

## ðŸš€ Setup

### Data Initialization
To configure basic care types:
```bash
npx ts-node scripts/seed-treatments.ts
```

### Automatic Assignment
To link care types to doctors based on their registered specialty:
```bash
npx ts-node scripts/assign-treatments.ts
```

---

## ðŸ“ WhatsApp Flow Example

- **Sophie**: "What type of care would you like?"
- **Patient**: "I want a dental cleaning"
- **Sophie (Internal)**: Identifies `treatment_type_id` -> Checks which doctors perform cleaning -> Suggests `Dr Leal` or `Anna (Hygienist)`.

---

## ðŸŒ Multilingual
Each treatment has a `name` (French) and `name_en` (English) field, allowing Sophie to switch instantly based on the patient's language.

---

**Version**: 2.5  
**Last Update**: January 27, 2026

