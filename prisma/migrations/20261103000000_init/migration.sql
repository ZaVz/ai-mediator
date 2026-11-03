CREATE TABLE "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "credentialHash" TEXT NOT NULL,
  "grade" INTEGER NOT NULL,
  "mode" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "Message" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "clientMessageId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "HelpCard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT,
  "grade" INTEGER NOT NULL,
  "studentDescription" TEXT,
  "feelingsAndNeeds" TEXT,
  "uncertainPoints" TEXT,
  "attempts" TEXT,
  "requestedHelp" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "submissionId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "submittedAt" DATETIME,
  CONSTRAINT "HelpCard_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Message_sessionId_clientMessageId_role_key" ON "Message"("sessionId", "clientMessageId", "role");
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");
CREATE UNIQUE INDEX "HelpCard_submissionId_key" ON "HelpCard"("submissionId");
CREATE INDEX "HelpCard_status_submittedAt_idx" ON "HelpCard"("status", "submittedAt");
