const cron = require("node-cron");
const TransactionModel = require("../../app/bbps/v1/models/transactionModel");
const RefundModel = require("../../app/bbps/v1/models/refundModel");
const {
  processTransaction,
} = require("../../app/bbps/v1/services/paymentProcessor");
const db = require("../../config/database");
const { cronPing, checkCronHealth } = require("../../services/cronMonitor");

cron.schedule("*/5 * * * *", async () => {
  console.log("🔁 BBPS retry cron running...");

  const failedTxns = await TransactionModel.getRetryable();

  for (const txn of failedTxns) {
    const conn = await db.getConnection();
    let freshTxn;

    try {
      await conn.beginTransaction();

      freshTxn = await TransactionModel.getByIdForUpdate(txn.id, conn);

      if (!freshTxn || freshTxn.bbps_status !== "FAILED_RETRY") {
        await conn.rollback();
        continue;
      }

      const res = await processTransaction(freshTxn);

      await TransactionModel.updateStatus(freshTxn.id, "PAID", res, conn);

      await conn.commit();

      console.log(`✅ Retried success: ${freshTxn.id}`);
    } catch (err) {
      await conn.rollback();

      console.error(`❌ Retry failed: ${txn.id}`, err.message);

      if (freshTxn) {
        await conn.beginTransaction();

        if (err.reconciliationRequired) {
          await TransactionModel.updateStatus(
            txn.id,
            "RECONCILIATION_REQUIRED",
            err.providerResponse || err.message,
            conn,
          );
        } else if (err.retryable === false) {
          await TransactionModel.updateStatus(
            txn.id,
            "FAILED_FINAL",
            err.providerResponse || err.message,
            conn,
          );
          await RefundModel.queueForTransaction(txn.id, conn);
        } else if (freshTxn.retry_count + 1 >= freshTxn.max_retry) {
          await TransactionModel.updateStatus(
            txn.id,
            "RECONCILIATION_REQUIRED",
            err.providerResponse || err.message,
            conn,
          );
        } else {
          await TransactionModel.incrementRetry(txn.id, conn);
        }

        await conn.commit();
      }
    } finally {
      conn.release();
    }
  }

  await cronPing("bbps_payment_cron");
});
