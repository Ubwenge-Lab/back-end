-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL,
    "supportEmail" TEXT,
    "supportPhone" TEXT,
    "supportName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);
