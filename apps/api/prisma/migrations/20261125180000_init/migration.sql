-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('LEAD', 'PLANNED', 'OFFERED', 'SIGNED', 'INSTALLED');

-- CreateEnum
CREATE TYPE "ProposalStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "latDeg" DOUBLE PRECISION NOT NULL,
    "lonDeg" DOUBLE PRECISION NOT NULL,
    "statedConsumptionKwh" INTEGER NOT NULL,
    "heatPumpAreaM2" INTEGER,
    "heatPumpBuildingYear" INTEGER,
    "evKmPerYear" INTEGER,
    "budgetEur" INTEGER,
    "status" "ProjectStatus" NOT NULL DEFAULT 'LEAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoofFace" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "azimuthDeg" DOUBLE PRECISION NOT NULL,
    "tiltDeg" DOUBLE PRECISION NOT NULL,
    "areaM2" DOUBLE PRECISION NOT NULL,
    "horizonDeg" DOUBLE PRECISION[],

    CONSTRAINT "RoofFace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "kwp" DOUBLE PRECISION NOT NULL,
    "batteryKwh" DOUBLE PRECISION NOT NULL,
    "priceEur" INTEGER NOT NULL,
    "promisedYieldKwh" DOUBLE PRECISION NOT NULL,
    "promisedSavingsEur" DOUBLE PRECISION NOT NULL,
    "paybackYears" DOUBLE PRECISION NOT NULL,
    "plan" JSONB NOT NULL,
    "offerText" TEXT NOT NULL,
    "offerSource" TEXT NOT NULL,
    "draftsRejected" INTEGER NOT NULL,
    "status" "ProposalStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringDay" (
    "projectId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "missing" BOOLEAN NOT NULL DEFAULT false,
    "hourlyKwh" DOUBLE PRECISION[],
    "ghiWm2" DOUBLE PRECISION[],

    CONSTRAINT "MonitoringDay_pkey" PRIMARY KEY ("projectId","day")
);

-- CreateTable
CREATE TABLE "Alarm" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "performance" DOUBLE PRECISION,
    "lossKwhPerDay" DOUBLE PRECISION NOT NULL,
    "message" TEXT NOT NULL,
    "resolvedDay" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alarm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_apiKeyHash_key" ON "Company"("apiKeyHash");

-- CreateIndex
CREATE INDEX "Project_companyId_createdAt_idx" ON "Project"("companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoofFace_projectId_position_key" ON "RoofFace"("projectId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_projectId_version_key" ON "Proposal"("projectId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_projectId_idempotencyKey_key" ON "Proposal"("projectId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Alarm_projectId_day_cause_key" ON "Alarm"("projectId", "day", "cause");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoofFace" ADD CONSTRAINT "RoofFace_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringDay" ADD CONSTRAINT "MonitoringDay_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alarm" ADD CONSTRAINT "Alarm_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
