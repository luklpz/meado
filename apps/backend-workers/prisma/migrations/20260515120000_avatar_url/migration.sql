-- Rename avatar → avatarUrl, make nullable, clear placeholder values
ALTER TABLE "User" RENAME COLUMN "avatar" TO "avatarUrl";
ALTER TABLE "User" ALTER COLUMN "avatarUrl" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "avatarUrl" DROP NOT NULL;
UPDATE "User" SET "avatarUrl" = NULL WHERE "avatarUrl" = 'default';
