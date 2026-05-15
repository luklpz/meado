-- Phase 1: Replace Room model with Server + Channel + Message + Attachment + ServerRole
-- Room/RoomMember/RoomWhitelist data is test-only; dropping tables.

-- ── Drop old tables ───────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "RoomWhitelist";
DROP TABLE IF EXISTS "RoomMember";
DROP TABLE IF EXISTS "Room";

-- ── Drop old enums ────────────────────────────────────────────────────────────
DROP TYPE IF EXISTS "RoomAccess";
DROP TYPE IF EXISTS "RoomMemberRole";

-- ── New enums ─────────────────────────────────────────────────────────────────
CREATE TYPE "ServerAccess" AS ENUM ('PUBLIC', 'PASSWORD', 'WHITELIST');
CREATE TYPE "ChannelType"  AS ENUM ('TEXT', 'VOICE');

-- ── Server ────────────────────────────────────────────────────────────────────
CREATE TABLE "Server" (
  "id"           TEXT        NOT NULL,
  "name"         TEXT        NOT NULL,
  "slug"         TEXT        NOT NULL,
  "description"  TEXT,
  "iconUrl"      TEXT,
  "accessType"   "ServerAccess" NOT NULL DEFAULT 'PUBLIC',
  "passwordHash" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "ownerId"      TEXT        NOT NULL,
  CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Server_slug_key" ON "Server"("slug");

ALTER TABLE "Server"
  ADD CONSTRAINT "Server_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── ServerRole ────────────────────────────────────────────────────────────────
CREATE TABLE "ServerRole" (
  "id"          TEXT    NOT NULL,
  "name"        TEXT    NOT NULL,
  "color"       TEXT,
  "position"    INTEGER NOT NULL DEFAULT 0,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "permissions" JSONB   NOT NULL DEFAULT '{}',
  "serverId"    TEXT    NOT NULL,
  CONSTRAINT "ServerRole_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServerRole_serverId_name_key" ON "ServerRole"("serverId", "name");

ALTER TABLE "ServerRole"
  ADD CONSTRAINT "ServerRole_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── ServerMember ──────────────────────────────────────────────────────────────
CREATE TABLE "ServerMember" (
  "userId"   TEXT        NOT NULL,
  "serverId" TEXT        NOT NULL,
  "roleId"   TEXT,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerMember_pkey" PRIMARY KEY ("userId", "serverId")
);

ALTER TABLE "ServerMember"
  ADD CONSTRAINT "ServerMember_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerMember"
  ADD CONSTRAINT "ServerMember_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerMember"
  ADD CONSTRAINT "ServerMember_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "ServerRole"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── ServerWhitelist ───────────────────────────────────────────────────────────
CREATE TABLE "ServerWhitelist" (
  "userId"   TEXT        NOT NULL,
  "serverId" TEXT        NOT NULL,
  "addedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServerWhitelist_pkey" PRIMARY KEY ("userId", "serverId")
);

ALTER TABLE "ServerWhitelist"
  ADD CONSTRAINT "ServerWhitelist_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServerWhitelist"
  ADD CONSTRAINT "ServerWhitelist_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Channel ───────────────────────────────────────────────────────────────────
CREATE TABLE "Channel" (
  "id"        TEXT          NOT NULL,
  "name"      TEXT          NOT NULL,
  "type"      "ChannelType" NOT NULL,
  "position"  INTEGER       NOT NULL DEFAULT 0,
  "serverId"  TEXT          NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Channel"
  ADD CONSTRAINT "Channel_serverId_fkey"
  FOREIGN KEY ("serverId") REFERENCES "Server"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Message ───────────────────────────────────────────────────────────────────
CREATE TABLE "Message" (
  "id"        TEXT         NOT NULL,
  "content"   TEXT,
  "channelId" TEXT         NOT NULL,
  "authorId"  TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "editedAt"  TIMESTAMP(3),
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_channelId_fkey"
  FOREIGN KEY ("channelId") REFERENCES "Channel"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_authorId_fkey"
  FOREIGN KEY ("authorId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Attachment ────────────────────────────────────────────────────────────────
CREATE TABLE "Attachment" (
  "id"        TEXT    NOT NULL,
  "url"       TEXT    NOT NULL,
  "name"      TEXT    NOT NULL,
  "size"      INTEGER NOT NULL,
  "mimeType"  TEXT    NOT NULL,
  "messageId" TEXT    NOT NULL,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Attachment"
  ADD CONSTRAINT "Attachment_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Remove unused column from User ───────────────────────────────────────────
ALTER TABLE "User" DROP COLUMN IF EXISTS "lastPos";
