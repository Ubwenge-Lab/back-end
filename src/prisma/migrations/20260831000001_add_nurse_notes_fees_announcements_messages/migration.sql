-- nursing_notes
CREATE TABLE "nursing_notes" (
    "id"                 TEXT NOT NULL,
    "hospitalId"         TEXT NOT NULL,
    "patientId"          TEXT,
    "staffId"            TEXT NOT NULL,
    "observationNotes"   TEXT NOT NULL,
    "careActivities"     TEXT,
    "additionalComments" TEXT,
    "noteDate"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,
    CONSTRAINT "nursing_notes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "nursing_notes_hospitalId_idx" ON "nursing_notes"("hospitalId");
CREATE INDEX "nursing_notes_staffId_idx"    ON "nursing_notes"("staffId");
CREATE INDEX "nursing_notes_noteDate_idx"   ON "nursing_notes"("noteDate");
ALTER TABLE "nursing_notes" ADD CONSTRAINT "nursing_notes_hospitalId_fkey"
  FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "nursing_notes" ADD CONSTRAINT "nursing_notes_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "nursing_notes" ADD CONSTRAINT "nursing_notes_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "hospital_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- hospital_fees
CREATE TABLE "hospital_fees" (
    "id"         TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "service"    TEXT NOT NULL,
    "price"      DECIMAL(12,2) NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'Active',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospital_fees_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hospital_fees_hospitalId_idx" ON "hospital_fees"("hospitalId");
ALTER TABLE "hospital_fees" ADD CONSTRAINT "hospital_fees_hospitalId_fkey"
  FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- hospital_announcements
CREATE TABLE "hospital_announcements" (
    "id"         TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "title"      TEXT NOT NULL,
    "type"       TEXT NOT NULL DEFAULT 'General',
    "message"    TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hospital_announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hospital_announcements_hospitalId_idx" ON "hospital_announcements"("hospitalId");
ALTER TABLE "hospital_announcements" ADD CONSTRAINT "hospital_announcements_hospitalId_fkey"
  FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- hospital_staff_messages
CREATE TABLE "hospital_staff_messages" (
    "id"         TEXT NOT NULL,
    "hospitalId" TEXT NOT NULL,
    "senderId"   TEXT NOT NULL,
    "content"    TEXT NOT NULL,
    "isRead"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "hospital_staff_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hospital_staff_messages_hospitalId_idx" ON "hospital_staff_messages"("hospitalId");
CREATE INDEX "hospital_staff_messages_senderId_idx"   ON "hospital_staff_messages"("senderId");
CREATE INDEX "hospital_staff_messages_createdAt_idx"  ON "hospital_staff_messages"("createdAt");
ALTER TABLE "hospital_staff_messages" ADD CONSTRAINT "hospital_staff_messages_hospitalId_fkey"
  FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hospital_staff_messages" ADD CONSTRAINT "hospital_staff_messages_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "hospital_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
