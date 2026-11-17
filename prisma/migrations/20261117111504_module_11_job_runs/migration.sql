-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "run_date" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "detail" TEXT,
    "recipient_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_runs_run_date_idx" ON "job_runs"("run_date");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_run_date_key" ON "job_runs"("job", "run_date");
