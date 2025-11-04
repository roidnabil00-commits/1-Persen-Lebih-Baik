-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nama" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Todo" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesNote" (
    "id" SERIAL NOT NULL,
    "moduleId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "SalesNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerMap" (
    "id" SERIAL NOT NULL,
    "goal" TEXT,
    "hardSkills" TEXT,
    "softSkills" TEXT,
    "skillGap" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CareerMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessMap" (
    "id" SERIAL NOT NULL,
    "personalStory" TEXT,
    "currentActivity" TEXT,
    "maritalStatus" TEXT,
    "emergencyFund" TEXT,
    "skill" TEXT,
    "capital" TEXT,
    "time" TEXT,
    "knowledge" TEXT,
    "connections" JSONB,
    "opportunities" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "BusinessMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyDashboard" (
    "id" SERIAL NOT NULL,
    "dateString" TEXT NOT NULL,
    "bigWin" TEXT,
    "schedule" JSONB,
    "reviewAchieved" BOOLEAN NOT NULL DEFAULT false,
    "reviewBest" TEXT,
    "reviewLesson" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "DailyDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_id_key" ON "User"("id");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Todo_userId_idx" ON "Todo"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesNote_userId_moduleId_key" ON "SalesNote"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerMap_userId_key" ON "CareerMap"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessMap_userId_key" ON "BusinessMap"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyDashboard_userId_dateString_key" ON "DailyDashboard"("userId", "dateString");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesNote" ADD CONSTRAINT "SalesNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerMap" ADD CONSTRAINT "CareerMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessMap" ADD CONSTRAINT "BusinessMap_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyDashboard" ADD CONSTRAINT "DailyDashboard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
