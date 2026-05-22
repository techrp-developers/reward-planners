const cron = require("node-cron");
const TransactionModel = require("../../app/bbps/v1/models/transactionModel");
const ekoService = require("../../app/bbps/v1/services/eko_service");
const rechargeService = require("../../app/bbps/v1/services/recharge_service");
const db = require("../../config/database");

cron.schedule("*/5 * * * *", async () => {
  console.log("🔁 BBPS retry cron running...");

  const failedTxns = await TransactionModel.getRetryable();

  for (const txn of failedTxns) {
    const conn = await db.getConnection();
    let freshTxn;

    try {
      await conn.beginTransaction();

      freshTxn = await TransactionModel.getByIdForUpdate(txn.id, conn);

      if (!freshTxn || freshTxn.bbps_status === "PAID") {
        await conn.rollback();
        continue;
      }

      let res;

      if (freshTxn.fetch_bill === 1) {
        // BBPS
        res = await ekoService.payBill({
          utility_acc_no: freshTxn.utility_acc_no,
          operator_id: freshTxn.operator_id,
          amount: freshTxn.amount,
          cycle_number: freshTxn.cycle_number,
        });
      } else {
        // RECHARGE
        res = await rechargeService.recharge({
          mobile: freshTxn.utility_acc_no.trim(),
          operator_id: freshTxn.operator_id,
          amount: freshTxn.amount,
        });
      }

      await TransactionModel.updateStatus(freshTxn.id, "PAID", res, conn);

      await conn.commit();

      console.log(`✅ Retried success: ${freshTxn.id}`);
    } catch (err) {
      await conn.rollback();

      console.error(`❌ Retry failed: ${txn.id}`, err.message);

      // increment retry OUTSIDE transaction
      if (freshTxn && freshTxn.retry_count + 1 >= freshTxn.max_retry) {
        await TransactionModel.updateStatus(
          txn.id,
          "FAILED_FINAL",
          err.message,
        );
      } else {
        await TransactionModel.incrementRetry(txn.id, conn);
      }
    } finally {
      conn.release();
    }
  }
});
