import { expireTransactionsJob } from "./expireTransactions.job.js";
import { expireLocationSharingJob } from "./expireLocationSharing.job.js";
import { expireBidsJob } from "./expireBids.job.js";

/**
 * Initialize and start all cron jobs
 */
export const startCronJobs = () => {
  console.log("🕐 Starting cron jobs...");

  // Start expire transactions job
  expireTransactionsJob.start();
  console.log("  ✅ Expire transactions job started (runs hourly)");

  // Start expire location sharing job
  expireLocationSharingJob.start();
  console.log("  ✅ Expire location sharing job started (runs every 15 minutes)");

  // Start expire bids job
  expireBidsJob.start();
  console.log("  ✅ Expire bids job started (runs every 5 minutes)");

  console.log("🎉 All cron jobs started successfully");
};

/**
 * Stop all cron jobs (useful for graceful shutdown)
 */
export const stopCronJobs = () => {
  console.log("🛑 Stopping cron jobs...");

  expireTransactionsJob.stop();
  expireLocationSharingJob.stop();
  expireBidsJob.stop();

  console.log("✅ All cron jobs stopped");
};
