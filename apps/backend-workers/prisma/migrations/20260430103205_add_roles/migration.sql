-- CreateEnum
CREATE TYPE "RoomMemberRole" AS ENUM ('USERROOM', 'MODERATOR', 'ADMINROOM');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'SUPERADMIN';

-- AlterTable
ALTER TABLE "RoomMember" ADD COLUMN     "role" "RoomMemberRole" NOT NULL DEFAULT 'USERROOM';
