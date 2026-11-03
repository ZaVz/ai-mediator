CREATE TABLE "SafetyAlert" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT,
  "conversationRef" TEXT NOT NULL,
  "clientMessageId" TEXT NOT NULL,
  "grade" INTEGER NOT NULL,
  "signalsJson" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'unread',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" DATETIME,
  "handledAt" DATETIME,
  CONSTRAINT "SafetyAlert_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "SafetyAlert_conversationRef_clientMessageId_key" ON "SafetyAlert"("conversationRef", "clientMessageId");
CREATE INDEX "SafetyAlert_status_createdAt_idx" ON "SafetyAlert"("status", "createdAt");
