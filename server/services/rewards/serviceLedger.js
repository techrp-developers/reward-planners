const M=require('../../app/service/v1/utils/serviceMoney');
const SERVICE_REASONS=['SERVICE_REWARD','SERVICE_REDEEM','SERVICE_REFUND'];
async function assertServiceSettlementReady(conn) {
  if(process.env.SERVICE_WALLET_SETTLEMENT_ENABLED!=='true')throw M.failure('Service wallet settlement is disabled pending compatibility approval.','SERVICE_SETTLEMENT_DISABLED',503);
  const [[column]]=await conn.execute("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wallet_transactions' AND COLUMN_NAME='reason_code'");
  if(!SERVICE_REASONS.every(reason=>column?.COLUMN_TYPE.includes(`'${reason}'`)))throw M.failure('Service wallet reason migration is required.','SERVICE_WALLET_SCHEMA_REQUIRED',503);
  const [indexes]=await conn.execute("SELECT INDEX_NAME,NON_UNIQUE,GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_in_index FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='wallet_transactions' GROUP BY INDEX_NAME,NON_UNIQUE");
  if(!indexes.some(index=>Number(index.NON_UNIQUE)===0&&index.columns_in_index==='user_id,transaction_type,reason_code,reference_id'))throw M.failure('The existing unique wallet-operation index is required.','SERVICE_WALLET_INDEX_REQUIRED',503);
}
function changed(result,label){if(result.affectedRows!==1||Number(result.warningStatus||result.warningCount||0)>0)throw M.failure(`${label} did not complete exactly once.`,'SERVICE_LEDGER_WRITE_FAILED');}
async function insertServiceLedger(conn,{userId,referenceId,transactionType,reasonCode,amount,balanceAfter,title}) {
  const user=M.reference(userId),reference=M.reference(referenceId),value=M.coins(amount);
  if(!SERVICE_REASONS.includes(reasonCode)||!['credit','debit'].includes(transactionType)||value<=0)throw M.failure('Invalid service ledger operation.');
  const args=[user,transactionType,reasonCode,reference];
  const [[unresolved]]=await conn.execute("SELECT transaction_id FROM wallet_transactions WHERE user_id=? AND transaction_type=? AND reference_id=? AND reason_code='' LIMIT 1 FOR UPDATE",[user,transactionType,reference]);
  if(unresolved)throw M.failure('An empty-reason historical ledger operation needs approved reconciliation before this reference can be reused.','SERVICE_LEDGER_RECONCILIATION_REQUIRED');
  const find=()=>conn.execute('SELECT transaction_id,coins FROM wallet_transactions WHERE user_id=? AND transaction_type=? AND reason_code=? AND reference_id=? FOR UPDATE',args);
  const duplicate=row=>{if(M.coins(row.coins)!==value)throw M.failure('Existing ledger operation has a different amount.','SERVICE_LEDGER_CONFLICT');return false;};
  const [[existing]]=await find();if(existing)return duplicate(existing);
  try{
    const [result]=await conn.execute(`INSERT INTO wallet_transactions
      (user_id,title,description,transaction_type,coins,balance_after,category,reference_id,reason_code)
      VALUES (?,?,?, ?,?,?,'order',?,?)`,[user,title||reasonCode,`Service order ${reference}`,transactionType,value,M.coins(balanceAfter),reference,reasonCode]);
    changed(result,'Ledger insert');return true;
  }catch(error){
    if(error.code!=='ER_DUP_ENTRY')throw error;
    const [[row]]=await find();if(!row)throw error;return duplicate(row);
  }
}
async function creditServiceCoins(conn,{userId,referenceId,amount,reasonCode='SERVICE_REWARD',title}) {
  const value=M.coins(amount);if(!value)return false;
  await assertServiceSettlementReady(conn);
  const user=M.reference(userId);M.reference(referenceId);
  await conn.execute('INSERT INTO customer_wallet (user_id,balance) VALUES (?,0) ON DUPLICATE KEY UPDATE user_id=user_id',[user]);
  const [[wallet]]=await conn.execute('SELECT balance FROM customer_wallet WHERE user_id=? FOR UPDATE',[user]);
  if(!wallet)throw M.failure('Wallet not found.');
  const before=M.coins(wallet.balance),after=M.coins(String(before+value));
  const inserted=await insertServiceLedger(conn,{userId:user,referenceId,transactionType:'credit',reasonCode,amount:value,balanceAfter:after,title});
  if(!inserted)return false;
  const [result]=await conn.execute('UPDATE customer_wallet SET balance=? WHERE user_id=? AND balance=?',[after,user,before]);changed(result,'Wallet credit');return true;
}
module.exports={assertServiceSettlementReady,insertServiceLedger,creditServiceCoins,changed};
