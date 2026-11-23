-- Soft delete for users: the account row and its content remain, but the
-- status makes it unusable and keeps it out of all active-user queries.
ALTER TYPE "UserStatus" ADD VALUE IF NOT EXISTS 'Deleted';
