-- CreateTable
CREATE TABLE "email_account_usage" (
    "account" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "email_account_usage_pkey" PRIMARY KEY ("account", "day")
);
