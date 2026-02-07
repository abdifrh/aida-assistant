-- CreateTable
CREATE TABLE "treatment_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR NOT NULL,
    "name_en" VARCHAR,
    "description" TEXT,
    "duration_minutes" INTEGER NOT NULL DEFAULT 30,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "practitioner_treatments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "practitioner_id" UUID NOT NULL,
    "treatment_type_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practitioner_treatments_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "treatment_type_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "practitioner_treatments_practitioner_id_treatment_type_id_key" ON "practitioner_treatments"("practitioner_id", "treatment_type_id");

-- AddForeignKey
ALTER TABLE "practitioner_treatments" ADD CONSTRAINT "practitioner_treatments_practitioner_id_fkey" FOREIGN KEY ("practitioner_id") REFERENCES "practitioners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practitioner_treatments" ADD CONSTRAINT "practitioner_treatments_treatment_type_id_fkey" FOREIGN KEY ("treatment_type_id") REFERENCES "treatment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_treatment_type_id_fkey" FOREIGN KEY ("treatment_type_id") REFERENCES "treatment_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
