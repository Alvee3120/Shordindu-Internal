-- AlterTable
ALTER TABLE "otp_codes" ADD COLUMN     "request_ip" TEXT;

-- CreateIndex
CREATE INDEX "otp_codes_request_ip_created_at_idx" ON "otp_codes"("request_ip", "created_at");
