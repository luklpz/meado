-- AlterTable
ALTER TABLE "Friendship" ADD COLUMN     "aliasByReceiver" TEXT,
ADD COLUMN     "aliasBySender" TEXT;

-- AlterTable
ALTER TABLE "ServerMember" ADD COLUMN     "nickname" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "name" TEXT;
