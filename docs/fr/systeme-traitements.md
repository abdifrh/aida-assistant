# Système de Traitements Dynamiques

> **Version**: 3.0
> **Dernière mise à jour**: 28 janvier 2026
> **Fichier**: `docs/fr/systeme-traitements.md`

---

## Table des Matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Architecture de la base de données](#2-architecture-de-la-base-de-données)
3. [Types de traitements disponibles](#3-types-de-traitements-disponibles)
4. [Configuration des durées](#4-configuration-des-durées)
5. [Relation Praticien-Traitement](#5-relation-praticien-traitement)
6. [Flux conversationnel de sélection](#6-flux-conversationnel-de-sélection)
7. [Présentation des traitements aux patients](#7-présentation-des-traitements-aux-patients)
8. [Filtrage par praticien](#8-filtrage-par-praticien)
9. [Gestion via le tableau de bord](#9-gestion-via-le-tableau-de-bord)
10. [API Endpoints](#10-api-endpoints)
11. [Exemples de code](#11-exemples-de-code)

---

## 1. Vue d'ensemble

Le système de traitements dynamiques de Sophie permet une gestion flexible et adaptable des types de rendez-vous selon les compétences spécifiques de chaque praticien. Contrairement à une liste fixe de rendez-vous, ce système propose aux patients uniquement les traitements disponibles en fonction :

- **De la clinique** : Services offerts par l'établissement
- **Du praticien sélectionné** : Spécialités et compétences spécifiques
- **De la durée configurée** : Chaque traitement a sa propre durée optimale
- **Du mapping many-to-many** : Un praticien peut offrir plusieurs traitements, et un traitement peut être offert par plusieurs praticiens

### Avantages du système

- **Flexibilité** : Ajout/modification de traitements sans changer le code
- **Pertinence** : Seuls les traitements disponibles sont présentés
- **Multilingue** : Support français/anglais intégré
- **Évolutivité** : Architecture extensible pour de nouveaux types de soins
- **Personnalisation** : Chaque clinique peut avoir sa propre offre de services

---

## 2. Architecture de la base de données

### 2.1 Modèle Prisma - TreatmentType

Le modèle `TreatmentType` définit les caractéristiques de base d'un type de traitement.

**Fichier**: `prisma/schema.prisma`

```prisma
model TreatmentType {
  id                String   @id @default(uuid()) @db.Uuid
  name              String   @db.VarChar          // Nom en français
  name_en           String?  @db.VarChar          // Nom en anglais (optionnel)
  description       String?  @db.Text             // Description détaillée
  duration_minutes  Int      @default(30)         // Durée par défaut en minutes
  is_active         Boolean  @default(true)       // Actif/inactif
  created_at        DateTime @default(now()) @db.Timestamp

  practitioners     PractitionerTreatment[]        // Relation many-to-many
  appointments      Appointment[]                  // Rendez-vous utilisant ce traitement

  @@map("treatment_types")
}
```

### 2.2 Modèle Prisma - PractitionerTreatment

La table de jonction `PractitionerTreatment` établit la relation many-to-many entre praticiens et traitements.

```prisma
model PractitionerTreatment {
  id                String   @id @default(uuid()) @db.Uuid
  practitioner_id   String   @db.Uuid
  treatment_type_id String   @db.Uuid
  is_active         Boolean  @default(true)
  created_at        DateTime @default(now()) @db.Timestamp

  practitioner      Practitioner  @relation(fields: [practitioner_id], references: [id])
  treatment_type    TreatmentType @relation(fields: [treatment_type_id], references: [id])

  @@unique([practitioner_id, treatment_type_id])
  @@map("practitioner_treatments")
}
```

### 2.3 Modèle Prisma - Appointment

Les rendez-vous référencent le type de traitement sélectionné.

```prisma
model Appointment {
  id                String   @id @default(uuid()) @db.Uuid
  practitioner_id   String   @db.Uuid
  patient_id        String   @db.Uuid
  treatment_type_id String?  @db.Uuid              // Lien vers le traitement
  start_time        DateTime
  end_time          DateTime
  status            String   @default("CONFIRMED") @db.VarChar
  google_event_id   String?  @db.VarChar
  created_at        DateTime @default(now())

  practitioner      Practitioner   @relation(fields: [practitioner_id], references: [id])
  patient           Patient        @relation(fields: [patient_id], references: [id])
  treatment_type    TreatmentType? @relation(fields: [treatment_type_id], references: [id])

  @@map("appointments")
}
```

---

## 3. Types de traitements disponibles

### 3.1 Catalogue par défaut

Le système Sophie est fourni avec un catalogue de traitements dentaires prédéfinis :

| Nom Français | Nom Anglais | Durée | Description |
|--------------|-------------|-------|-------------|
| **Hygiène dentaire** | Dental Hygiene | 45 min | Nettoyage et soins d'hygiène dentaire |
| **Éducation à l'hygiène** | Hygiene Education | 30 min | Formation et conseils sur l'hygiène bucco-dentaire |
| **Nettoyage dentaire** | Dental Cleaning | 45 min | Détartrage et polissage des dents |
| **Examen dentaire** | Dental Examination | 30 min | Examen complet de la santé bucco-dentaire |
| **Application de fluorure** | Fluoride Application | 20 min | Traitement au fluorure pour renforcer l'émail |
| **Esthétique** | Aesthetic Dentistry | 60 min | Traitements esthétiques dentaires |
| **Orthodontie** | Orthodontics | 45 min | Correction de l'alignement des dents |
| **Pédodontie** | Pediatric Dentistry | 30 min | Soins dentaires pour enfants |
| **Implantologie** | Implantology | 90 min | Pose et suivi d'implants dentaires |
| **Prothèse** | Prosthetics | 60 min | Prothèses dentaires et couronnes |

### 3.2 Initialisation du catalogue

Pour initialiser les types de traitements dans votre base de données :

```bash
npx ts-node scripts/seed-treatments.ts
```

**Fichier source**: `scripts/seed-treatments.ts`

---

## 4. Configuration des durées

Chaque type de traitement possède une durée configurée qui détermine :

1. **La longueur des créneaux proposés** lors de la recherche de disponibilités
2. **Le calcul de `end_time`** lors de la création d'un rendez-vous
3. **La synchronisation avec Google Calendar** pour bloquer le bon créneau

### Durées standards

- **Consultation rapide** : 20-30 minutes (examen, fluorure)
- **Traitement standard** : 45 minutes (hygiène, orthodontie, nettoyage)
- **Traitement avancé** : 60 minutes (esthétique, prothèse)
- **Intervention chirurgicale** : 90 minutes (implantologie)

### Modification des durées

Les durées peuvent être modifiées via l'API ou directement en base de données. La modification prend effet immédiatement pour tous les nouveaux rendez-vous.

```typescript
// Exemple de mise à jour de durée
await prisma.treatmentType.update({
  where: { id: treatmentId },
  data: { duration_minutes: 60 }
});
```

---

## 5. Relation Praticien-Traitement

### 5.1 Modèle many-to-many

La relation entre praticiens et traitements est de type **many-to-many** :

- **Un praticien** peut offrir **plusieurs traitements** (ex: Dr Leal fait de l'esthétique ET de l'implantologie)
- **Un traitement** peut être offert par **plusieurs praticiens** (ex: le nettoyage dentaire peut être fait par Dr Leal ou Anna l'hygiéniste)

### 5.2 Mapping par spécialité

Le script `assign-treatments.ts` assigne automatiquement les traitements selon la spécialité du praticien.

**Fichier**: `scripts/assign-treatments.ts`

```typescript
const SPECIALTY_TREATMENT_MAP: Record<string, string[]> = {
    "Orthodontiste": [
        "Orthodontie",
        "Examen dentaire",
        "Esthétique"
    ],
    "Médecin-dentiste": [
        "Examen dentaire",
        "Esthétique",
        "Implantologie",
        "Prothèse",
        "Nettoyage dentaire"
    ],
    "Pédodontiste": [
        "Pédodontie",
        "Examen dentaire",
        "Application de fluorure",
        "Éducation à l'hygiène"
    ],
    "Hygiéniste dentaire": [
        "Hygiène dentaire",
        "Nettoyage dentaire",
        "Éducation à l'hygiène",
        "Application de fluorure"
    ]
};
```

### 5.3 Assignation automatique

Pour assigner automatiquement les traitements aux praticiens existants :

```bash
# Pour toutes les cliniques
npx ts-node scripts/assign-treatments.ts

# Pour une clinique spécifique
npx ts-node scripts/assign-treatments.ts <clinic-uuid>
```

---

## 6. Flux conversationnel de sélection

### 6.1 Détection de l'intention

Lorsqu'un patient demande un rendez-vous, Sophie extrait l'intention et les entités avec le LLM.

**Fichier**: `src/services/ConversationManager.ts`

```typescript
// Exemple d'extraction d'intention
const extractionResult = await sophieService.extractEntities(
    userMessage,
    clinicName,
    language,
    {
        ...currentContext,
        patient: patientRecord,
        structuredContext,
        state: activeState,
        lastAssistantMessage
    }
);

// Résultat typique
{
    "detected_language": "fr",
    "intent": "BOOK_APPOINTMENT",
    "confidence": 0.95,
    "entities": {
        "appointment_type": "Détartrage",  // Type de traitement mentionné
        "practitioner": "Dr Leal",
        "date": "2026-02-15",
        "time": null
    },
    "needs_backend_action": true
}
```

### 6.2 États du flux

Le système utilise une machine à états (FSM) pour gérer le flux de réservation :

```typescript
enum ConversationState {
    IDLE                        = "IDLE",
    COLLECTING_PATIENT_DATA     = "COLLECTING_PATIENT_DATA",
    COLLECTING_APPOINTMENT_DATA = "COLLECTING_APPOINTMENT_DATA",
    CONFIRMATION                = "CONFIRMATION",
    COMPLETED                   = "COMPLETED"
}
```

### 6.3 Collecte du type de traitement

Lorsque le patient est en train de réserver, Sophie collecte progressivement :

1. **Praticien** (qui permet de filtrer les traitements disponibles)
2. **Type de traitement** (parmi ceux offerts par le praticien)
3. **Date et heure** souhaitées

**Exemple de code** (`ConversationManager.ts` - ligne ~620-640) :

```typescript
// Si le type de traitement est manquant
if (nextField === 'type') {
    askMsg = language === 'fr'
        ? "Pourriez-vous m'indiquer le motif de votre consultation ?"
        : "Could you please tell me the reason for your visit?";
}

// Sophie sauvegarde le type dans le contexte
if (entities.appointment_type) {
    if (!updatedContext.appointment) {
        updatedContext.appointment = {};
    }
    updatedContext.appointment.type = entities.appointment_type;
    await this.updateContext(conversationId, updatedContext);
}
```

---

## 7. Présentation des traitements aux patients

### 7.1 Méthode formatTreatmentsForDisplay

Le `TreatmentService` fournit une méthode pour formater les traitements de manière conversationnelle.

**Fichier**: `src/services/TreatmentService.ts` (lignes 219-236)

```typescript
/**
 * Format treatment types for display in conversation
 * Formater les types de traitements pour l'affichage dans la conversation
 */
formatTreatmentsForDisplay(treatments: any[], language: string = 'fr'): string {
    if (treatments.length === 0) {
        return language === 'fr'
            ? "Aucun traitement disponible pour le moment."
            : "No treatments available at the moment.";
    }

    const treatmentList = treatments.map((t, index) => {
        const name = language === 'en' && t.name_en ? t.name_en : t.name;
        return `${index + 1}. ${name}`;
    }).join('\n');

    const header = language === 'fr'
        ? "Voici les types de traitements disponibles :\n"
        : "Here are the available treatment types:\n";

    return header + treatmentList;
}
```

### 7.2 Exemple de conversation

```
👤 Patient: "Bonjour, je voudrais prendre un rendez-vous"

🤖 Sophie: "C'est entendu. Avec quel médecin souhaiteriez-vous prendre
           rendez-vous ? Voici nos praticiens :
           - Dr Leal (Médecin-dentiste)
           - Dr Lucie (Orthodontiste)
           - Anna (Hygiéniste dentaire)"

👤 Patient: "Avec Dr Leal"

🤖 Sophie: "Très bien. Voici les types de traitements disponibles
           avec Dr Leal :
           1. Examen dentaire
           2. Esthétique
           3. Implantologie
           4. Prothèse
           5. Nettoyage dentaire

           Quel type de traitement souhaitez-vous ?"

👤 Patient: "Un nettoyage dentaire"

🤖 Sophie: "C'est noté. Pour quelle date souhaiteriez-vous ce rendez-vous ?"
```

### 7.3 Gestion multilingue

Sophie détecte automatiquement la langue et utilise le champ approprié :

- **Français** : Utilise `treatment.name`
- **Anglais** : Utilise `treatment.name_en` (si disponible, sinon repli sur `name`)

```typescript
const name = language === 'en' && treatment.name_en
    ? treatment.name_en
    : treatment.name;
```

---

## 8. Filtrage par praticien

### 8.1 Récupération des traitements pour une clinique

La méthode `getAvailableTreatmentsForClinic` retourne tous les traitements disponibles basés sur les praticiens actifs.

**Fichier**: `src/services/TreatmentService.ts` (lignes 12-50)

```typescript
/**
 * Get all available treatment types for a clinic based on active practitioners
 * Obtenir tous les types de traitements disponibles pour une clinique
 * basés sur les praticiens actifs
 */
async getAvailableTreatmentsForClinic(clinicId: string) {
    try {
        // Get all active practitioners for this clinic with their treatments
        const practitioners = await prisma.practitioner.findMany({
            where: {
                clinic_id: clinicId,
                is_active: true
            },
            include: {
                treatments: {
                    where: {
                        is_active: true
                    },
                    include: {
                        treatment_type: true
                    }
                }
            }
        });

        // Extract unique treatment types
        const treatmentTypesMap = new Map();

        for (const practitioner of practitioners) {
            for (const pt of practitioner.treatments) {
                if (pt.treatment_type.is_active) {
                    treatmentTypesMap.set(pt.treatment_type.id, pt.treatment_type);
                }
            }
        }

        return Array.from(treatmentTypesMap.values());
    } catch (error) {
        console.error('Error getting available treatments for clinic:', error);
        return [];
    }
}
```

### 8.2 Récupération des praticiens pour un traitement

Inversement, on peut trouver quels praticiens peuvent effectuer un traitement spécifique.

**Fichier**: `src/services/TreatmentService.ts` (lignes 56-87)

```typescript
/**
 * Get practitioners who can perform a specific treatment type
 * Obtenir les praticiens qui peuvent effectuer un type de traitement spécifique
 */
async getPractitionersForTreatment(clinicId: string, treatmentTypeId: string) {
    try {
        const practitioners = await prisma.practitioner.findMany({
            where: {
                clinic_id: clinicId,
                is_active: true,
                treatments: {
                    some: {
                        treatment_type_id: treatmentTypeId,
                        is_active: true
                    }
                }
            },
            include: {
                treatments: {
                    where: {
                        treatment_type_id: treatmentTypeId,
                        is_active: true
                    },
                    include: {
                        treatment_type: true
                    }
                }
            }
        });

        return practitioners;
    } catch (error) {
        console.error('Error getting practitioners for treatment:', error);
        return [];
    }
}
```

### 8.3 Recherche par nom

Sophie peut identifier un traitement à partir du langage naturel du patient.

**Fichier**: `src/services/TreatmentService.ts` (lignes 93-112)

```typescript
/**
 * Get treatment type by name (supports French and English)
 * Obtenir le type de traitement par nom (supporte français et anglais)
 */
async getTreatmentTypeByName(name: string) {
    try {
        const normalizedName = name.toLowerCase().trim();

        const treatmentType = await prisma.treatmentType.findFirst({
            where: {
                OR: [
                    { name: { contains: normalizedName, mode: 'insensitive' } },
                    { name_en: { contains: normalizedName, mode: 'insensitive' } }
                ],
                is_active: true
            }
        });

        return treatmentType;
    } catch (error) {
        console.error('Error getting treatment type by name:', error);
        return null;
    }
}
```

**Exemples de correspondance** :

- "détartrage" → trouve "Nettoyage dentaire"
- "cleaning" → trouve "Dental Cleaning"
- "implant" → trouve "Implantologie"
- "orthodontics" → trouve "Orthodontics"

---

## 9. Gestion via le tableau de bord

### 9.1 Interface administrateur

Le tableau de bord administrateur permet de gérer les traitements via une interface web conviviale.

**URL d'accès** : `http://localhost:3000/clinic/{clinicId}/admin`

### 9.2 Opérations disponibles

#### Création d'un nouveau traitement

Formulaire avec les champs :
- Nom (français) - obligatoire
- Nom anglais - optionnel
- Description
- Durée en minutes
- Statut actif/inactif

#### Modification d'un traitement existant

Possibilité de modifier :
- Les noms et descriptions
- La durée (impact immédiat sur les nouveaux rendez-vous)
- Le statut (désactivation sans suppression)

#### Assignation aux praticiens

Pour chaque praticien, l'administrateur peut :
1. Voir la liste des traitements assignés
2. Ajouter de nouveaux traitements
3. Retirer des traitements existants

### 9.3 Validation des données

Le système vérifie :
- **Unicité** : Pas de doublons de noms
- **Durée minimale** : Au moins 15 minutes
- **Cohérence** : Un traitement ne peut être supprimé s'il a des rendez-vous futurs

---

## 10. API Endpoints

### 10.1 Endpoints pour les traitements

Tous les endpoints nécessitent une authentification JWT.

#### GET - Liste des traitements

```http
GET /api/clinic/{clinicId}/admin/treatments
Authorization: Bearer {jwt_token}
```

**Réponse** :
```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Nettoyage dentaire",
        "name_en": "Dental Cleaning",
        "description": "Détartrage et polissage des dents",
        "duration_minutes": 45,
        "is_active": true,
        "created_at": "2026-01-15T10:00:00.000Z"
    },
    {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Orthodontie",
        "name_en": "Orthodontics",
        "description": "Correction de l'alignement des dents",
        "duration_minutes": 45,
        "is_active": true,
        "created_at": "2026-01-15T10:05:00.000Z"
    }
]
```

#### POST - Créer un traitement

```http
POST /api/clinic/{clinicId}/admin/treatments
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
    "name": "Blanchiment dentaire",
    "name_en": "Teeth Whitening",
    "description": "Traitement de blanchiment professionnel",
    "duration_minutes": 60
}
```

**Réponse** :
```json
{
    "id": "770e8400-e29b-41d4-a716-446655440002",
    "name": "Blanchiment dentaire",
    "name_en": "Teeth Whitening",
    "description": "Traitement de blanchiment professionnel",
    "duration_minutes": 60,
    "is_active": true,
    "created_at": "2026-01-28T14:30:00.000Z"
}
```

#### PUT - Mettre à jour un traitement

```http
PUT /api/clinic/{clinicId}/admin/treatments/{treatmentId}
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
    "name": "Blanchiment dentaire avancé",
    "duration_minutes": 90,
    "is_active": true
}
```

#### DELETE - Désactiver un traitement

```http
DELETE /api/clinic/{clinicId}/admin/treatments/{treatmentId}
Authorization: Bearer {jwt_token}
```

Note : Il s'agit d'une suppression douce (soft delete). Le traitement est marqué `is_active: false` mais conservé en base.

### 10.2 Endpoints pour les assignations praticien-traitement

#### GET - Traitements d'un praticien

```http
GET /api/clinic/{clinicId}/admin/practitioners/{practitionerId}/treatments
Authorization: Bearer {jwt_token}
```

**Réponse** :
```json
[
    {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Examen dentaire",
        "name_en": "Dental Examination",
        "duration_minutes": 30
    },
    {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Esthétique",
        "name_en": "Aesthetic Dentistry",
        "duration_minutes": 60
    }
]
```

#### PUT - Mettre à jour les traitements d'un praticien

```http
PUT /api/clinic/{clinicId}/admin/practitioners/{practitionerId}/treatments
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
    "treatmentIds": [
        "550e8400-e29b-41d4-a716-446655440000",
        "660e8400-e29b-41d4-a716-446655440001",
        "770e8400-e29b-41d4-a716-446655440002"
    ]
}
```

Cette opération remplace complètement la liste des traitements du praticien.

**Fichier source**: `src/controllers/AdminController.ts` (lignes 715-751)

---

## 11. Exemples de code

### 11.1 Création programmatique d'un traitement

```typescript
import { treatmentService } from './services/TreatmentService';

// Créer un nouveau type de traitement
const newTreatment = await treatmentService.createTreatmentType({
    name: "Consultation d'urgence",
    name_en: "Emergency Consultation",
    description: "Prise en charge rapide pour urgences dentaires",
    duration_minutes: 30
});

console.log(`Traitement créé avec l'ID: ${newTreatment.id}`);
```

### 11.2 Assignation d'un traitement à un praticien

```typescript
import { treatmentService } from './services/TreatmentService';

const practitionerId = "123e4567-e89b-12d3-a456-426614174000";
const treatmentTypeId = "550e8400-e29b-41d4-a716-446655440000";

// Assigner le traitement
await treatmentService.assignTreatmentToPractitioner(
    practitionerId,
    treatmentTypeId
);

console.log("Traitement assigné avec succès");
```

**Fichier source**: `src/services/TreatmentService.ts` (lignes 158-170)

### 11.3 Récupération des praticiens pour un traitement

```typescript
import { treatmentService } from './services/TreatmentService';

const clinicId = "clinic-uuid";
const treatmentTypeId = "treatment-uuid";

// Trouver les praticiens qualifiés
const practitioners = await treatmentService.getPractitionersForTreatment(
    clinicId,
    treatmentTypeId
);

console.log(`${practitioners.length} praticien(s) peuvent effectuer ce traitement`);

practitioners.forEach(p => {
    console.log(`- Dr ${p.last_name} (${p.specialty})`);
});
```

### 11.4 Récupération des traitements d'un praticien

```typescript
import { treatmentService } from './services/TreatmentService';

const practitionerId = "practitioner-uuid";

// Obtenir tous les traitements du praticien
const treatments = await treatmentService.getPractitionerTreatments(practitionerId);

console.log(`Dr offre ${treatments.length} type(s) de traitement(s):`);

treatments.forEach(t => {
    console.log(`- ${t.name} (${t.duration_minutes} min)`);
});
```

**Fichier source**: `src/services/TreatmentService.ts` (lignes 194-213)

### 11.5 Intégration dans le flux de conversation

```typescript
// Dans ConversationManager.ts - Exemple de filtrage des traitements
// par praticien lors de la sélection

// Le patient a sélectionné un praticien
const selectedPractitioner = await prisma.practitioner.findUnique({
    where: { id: practitionerId },
    include: {
        treatments: {
            where: { is_active: true },
            include: {
                treatment_type: true
            }
        }
    }
});

// Extraire les types de traitements
const availableTreatments = selectedPractitioner.treatments.map(
    pt => pt.treatment_type
);

// Formater pour WhatsApp
const treatmentList = availableTreatments.map((t, idx) =>
    `${idx + 1}. ${t.name} (${t.duration_minutes} min)`
).join('\n');

const message = `Voici les traitements disponibles avec Dr ${selectedPractitioner.last_name} :\n${treatmentList}`;
```

### 11.6 Validation de la cohérence traitement-praticien

```typescript
// Vérifier qu'un praticien peut effectuer un traitement avant de créer un RDV

async function canPractitionerPerformTreatment(
    practitionerId: string,
    treatmentTypeId: string
): Promise<boolean> {
    const link = await prisma.practitionerTreatment.findFirst({
        where: {
            practitioner_id: practitionerId,
            treatment_type_id: treatmentTypeId,
            is_active: true
        }
    });

    return link !== null;
}

// Utilisation lors de la création d'un rendez-vous
const canPerform = await canPractitionerPerformTreatment(
    selectedPractitionerId,
    selectedTreatmentId
);

if (!canPerform) {
    return "Ce praticien n'effectue pas ce type de traitement. " +
           "Veuillez choisir un autre praticien ou un autre traitement.";
}
```

### 11.7 Recherche intelligente par nom

```typescript
// Le patient dit "Je veux un détartrage"
const userMessage = "Je veux un détartrage";

// Sophie recherche le traitement correspondant
const treatment = await treatmentService.getTreatmentTypeByName("détartrage");

if (treatment) {
    console.log(`Trouvé: ${treatment.name} (${treatment.duration_minutes} min)`);

    // Trouver les praticiens disponibles pour ce traitement
    const availablePractitioners = await treatmentService.getPractitionersForTreatment(
        clinicId,
        treatment.id
    );

    // Proposer les praticiens au patient
    const drList = availablePractitioners.map(
        p => `Dr ${p.last_name}`
    ).join(', ');

    return `Pour un ${treatment.name}, vous pouvez consulter : ${drList}`;
}
```

**Fichier source**: `src/services/TreatmentService.ts` (lignes 93-112)

---

## 12. Cas d'usage avancés

### 12.1 Clinique avec spécialités multiples

**Exemple** : Clinique dentaire Trèfle d'Or

- **Dr Leal** (Médecin-dentiste) : 5 traitements
- **Dr Lucie** (Orthodontiste) : 3 traitements
- **Anna** (Hygiéniste) : 4 traitements

Lorsqu'un patient demande un "nettoyage dentaire" :

1. Sophie identifie le traitement `TreatmentType(name="Nettoyage dentaire")`
2. Interroge la base pour trouver les praticiens qualifiés
3. Trouve : Dr Leal ET Anna
4. Propose les deux options au patient

### 12.2 Ajout d'un nouveau traitement

**Scénario** : La clinique commence à offrir le blanchiment dentaire

**Étape 1** - Créer le traitement via l'API :

```bash
curl -X POST http://localhost:3000/api/clinic/{clinicId}/admin/treatments \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Blanchiment dentaire",
    "name_en": "Teeth Whitening",
    "description": "Blanchiment professionnel des dents",
    "duration_minutes": 60
  }'
```

**Étape 2** - Assigner aux praticiens qualifiés :

Via l'interface admin ou l'API, assigner le nouveau traitement à Dr Leal.

**Résultat** : Les patients peuvent maintenant demander un rendez-vous pour "blanchiment" et Sophie proposera Dr Leal.

### 12.3 Désactivation temporaire d'un traitement

```typescript
// Via l'API ou directement en base
await prisma.treatmentType.update({
    where: { id: treatmentId },
    data: { is_active: false }
});
```

**Impact** :
- Le traitement n'apparaît plus dans les propositions
- Les rendez-vous existants ne sont pas affectés
- Peut être réactivé à tout moment

---

## 13. Meilleures pratiques

### 13.1 Conventions de nommage

- **Nom français** : Forme substantive (ex: "Nettoyage dentaire", "Orthodontie")
- **Nom anglais** : Traduction littérale cohérente
- **Description** : Claire et orientée patient (ce qu'ils vont recevoir)

### 13.2 Configuration des durées

- Prévoir 5-10 minutes de marge pour le nettoyage/préparation
- Adapter selon la complexité réelle observée
- Tenir compte du temps de documentation post-consultation

### 13.3 Gestion des spécialités

- Créer d'abord les praticiens avec leur `specialty` exacte
- Utiliser le script `assign-treatments.ts` pour l'assignation automatique
- Affiner manuellement via le dashboard si nécessaire

### 13.4 Tests et validation

Avant de déployer de nouveaux traitements :

1. Vérifier l'assignation correcte aux praticiens
2. Tester le flux conversationnel avec différentes formulations
3. Confirmer que la durée permet une planification réaliste
4. Vérifier la synchronisation Google Calendar

---

## 14. Dépannage

### 14.1 Problème : Sophie ne propose pas un traitement

**Causes possibles** :

1. Le traitement n'est pas actif (`is_active: false`)
2. Aucun praticien n'est assigné au traitement
3. Les praticiens assignés ne sont pas actifs
4. Erreur dans le nom (casse, accents)

**Solution** :

```sql
-- Vérifier le statut du traitement
SELECT * FROM treatment_types WHERE name ILIKE '%nettoyage%';

-- Vérifier les assignations
SELECT p.first_name, p.last_name, p.is_active, tt.name
FROM practitioner_treatments pt
JOIN practitioners p ON pt.practitioner_id = p.id
JOIN treatment_types tt ON pt.treatment_type_id = tt.id
WHERE tt.name = 'Nettoyage dentaire';
```

### 14.2 Problème : Durée incorrecte dans Google Calendar

**Cause** : La durée du traitement a été modifiée mais les rendez-vous existants utilisent l'ancienne durée.

**Solution** : Les rendez-vous existants gardent leur durée originale. Seuls les nouveaux rendez-vous utilisent la nouvelle durée.

### 14.3 Problème : Traitement non trouvé par recherche

**Cause** : Le patient utilise un synonyme non reconnu (ex: "détartrage" au lieu de "nettoyage dentaire").

**Solution** : Ajouter des variantes dans la description ou créer un traitement avec le nom alternatif.

---

## 15. Évolutions futures

### Fonctionnalités prévues

- **Tarification** : Ajout d'un champ `price` pour affichage des coûts
- **Catégories** : Regroupement des traitements (Préventif, Curatif, Esthétique)
- **Prérequis** : Chaîne de traitements (ex: examen avant implant)
- **Localisation avancée** : Support de langues additionnelles
- **Analytics** : Statistiques sur les traitements les plus demandés

---

## 16. Références

### Fichiers clés

- **Schéma** : `prisma/schema.prisma` (lignes 156-183)
- **Service** : `src/services/TreatmentService.ts`
- **Controller** : `src/controllers/AdminController.ts` (lignes 615-751)
- **Routes** : `src/routes/adminRoutes.ts` (lignes 50-58)
- **Scripts** :
  - `scripts/seed-treatments.ts`
  - `scripts/assign-treatments.ts`

### Documentation associée

- [Guide Complet](./guide-complet.md) - Vue d'ensemble du système
- [Configuration Multi-Clinique](./configuration-multi-clinique.md) - Gestion SaaS
- [Guide d'Intégration](./guide-integration.md) - Détails techniques

---

**Équipe de développement** : AIDA Medical
**Contact** : support@aidamedical.com
