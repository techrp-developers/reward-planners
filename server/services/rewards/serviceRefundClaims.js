const crypto=require('node:crypto');
const M=require('../../app/service/v1/utils/serviceMoney');
async function assertRefundReady(conn){
  if(process.env.SERVICE_REFUND_EXECUTION_ENABLED!=='true')throw M.failure('Service refunds await compatibility approval.','SERVICE_REFUNDS_DISABLED',503);
  const [rows]=await conn.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='service_order_refunds' AND COLUMN_NAME IN ('claim_token','claim_expires_at','submission_state')");
  if(rows.length!==3)throw M.failure('Service refund claim migration is required.','SERVICE_REFUND_SCHEMA_REQUIRED',503);
}
function createServiceRefundRunner({db,gateway,reconcile,assertReady=assertRefundReady}){
  return async function run(serviceOrderId){
    const id=M.reference(serviceOrderId),conn=await db.getConnection();let job;
    try{
      await conn.beginTransaction();await assertReady(conn);
      const [[row]]=await conn.execute(`SELECT r.*,o.payment_id,o.payment_status,o.price,o.reward_coins_used,
        (r.claim_expires_at>NOW()) AS lease_active
        FROM service_order_refunds r JOIN service_orders o ON o.id=r.service_order_id
        WHERE r.service_order_id=? AND r.refund_method='original' FOR UPDATE`,[id]);
      if(!row)throw M.failure('Service refund record not found.','SERVICE_REFUND_NOT_FOUND');
      if(row.status==='completed')job={type:'complete'};
      else if(row.razorpay_refund_id)job={type:'fetch',providerId:row.razorpay_refund_id};
      else if(row.submission_state==='submitting'&&row.lease_active)job={type:'busy'};
      else if(row.submission_state!=='ready'){
        if(row.submission_state==='submitting')await conn.execute("UPDATE service_order_refunds SET submission_state='uncertain',claim_token=NULL,claim_expires_at=NULL WHERE id=?",[row.id]);
        job={type:'review'};
      }else{
        if(row.payment_status!=='paid'||!row.payment_id||M.paise(row.refund_amount)<=0n||M.paise(row.refund_amount)>M.paise(M.payable(row.price,row.reward_coins_used)))throw M.failure('Refund exceeds the saved paid service amount.','INVALID_SERVICE_REFUND');
        const token=crypto.randomUUID();
        const [claimed]=await conn.execute("UPDATE service_order_refunds SET claim_token=?,claim_expires_at=DATE_ADD(NOW(),INTERVAL 120 SECOND),submission_state='submitting',retry_count=COALESCE(retry_count,0)+1,last_retried_at=NOW() WHERE id=? AND submission_state='ready' AND status<>'completed'",[token,row.id]);
        if(claimed.affectedRows!==1)throw M.failure('Refund claim conflict.','SERVICE_REFUND_CLAIM_CONFLICT');
        job={type:'submit',row,token};
      }
      await conn.commit();
    }catch(error){await conn.rollback();throw error;}finally{conn.release();}
    if(job.type==='complete')return {status:'completed'};
    if(job.type==='busy')return {status:'processing'};
    if(job.type==='review')throw M.failure('Refund submission is uncertain or historical. Reconcile with the provider before approving another attempt.','SERVICE_REFUND_REVIEW_REQUIRED');
    if(job.type==='fetch'){const refund=await gateway.fetch(job.providerId);await reconcile(refund);return {status:refund.status,gatewayRefund:refund};}
    const {row,token}=job;let submitted;
    try{
      // A receipt is a trace reference, not an assumed provider idempotency guarantee.
      submitted=await gateway.create(row.payment_id,{amount:Number(M.paise(row.refund_amount)),receipt:`service_cancel_${id}`,notes:{module:'service',service_order_id:String(id),claim_token:token}});
      if(!submitted?.id)throw M.failure('Provider did not return a refund reference.','INVALID_REFUND_RESPONSE');
      const [saved]=await db.execute("UPDATE service_order_refunds SET razorpay_refund_id=?,submission_state='submitted',claim_token=NULL,claim_expires_at=NULL WHERE id=? AND claim_token=? AND status<>'completed'",[submitted.id,row.id,token]);
      if(saved.affectedRows!==1){const [[current]]=await db.execute('SELECT status,razorpay_refund_id FROM service_order_refunds WHERE id=?',[row.id]);if(current?.status!=='completed'||current.razorpay_refund_id!==submitted.id)throw M.failure('Refund response requires reconciliation.','SERVICE_REFUND_RESPONSE_CONFLICT');}
      await reconcile(submitted);return {status:submitted.status,gatewayRefund:submitted};
    }catch(error){
      // Timeout, crash or an ambiguous provider response must NEVER become a fresh
      // POST on a retry. A webhook/provider lookup can reconcile the same attempt.
      await db.execute("UPDATE service_order_refunds SET submission_state='uncertain',claim_expires_at=NULL WHERE id=? AND claim_token=? AND status<>'completed'",[row.id,token]);
      throw error;
    }
  };
}
module.exports={assertRefundReady,createServiceRefundRunner};
