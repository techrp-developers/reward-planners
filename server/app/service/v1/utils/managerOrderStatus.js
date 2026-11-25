const P=require('./managerPolicy');
async function updateManagerOrderStatus(db,actor,orderId,status,{inHouseOnly=true}={}) {
  const conn=await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]]=await conn.execute(`SELECT o.*,s.service_scope AS workspace_scope FROM service_orders o JOIN services s ON s.id=o.service_id WHERE o.id=? ${inHouseOnly?"AND s.service_scope='in_house'":''} FOR UPDATE`,[P.id(orderId)]);
    if(!order)throw P.invalid('In-House order not found.',404);
    if(!inHouseOnly&&!order.workspace_scope)throw P.invalid('Business-approved service classification is required before manual fulfilment.',409);
    P.transition(order,status);
    if(order.status===status){await conn.commit();return {changed:false,user_id:order.user_id,parent_order_id:order.parent_order_id};}
    const [[pending]]=await conn.execute("SELECT id FROM service_order_cancellations WHERE service_order_id=? AND status='requested' LIMIT 1 FOR UPDATE",[order.id]);
    if(pending)throw P.invalid('Review the pending cancellation before changing fulfilment.',409);
    if(status==='completed' && Number(order.reward_coins_earned)>0){
      await require('../../../../services/rewards/serviceLedger').creditServiceCoins(conn,{userId:order.user_id,amount:order.reward_coins_earned,referenceId:order.id,reasonCode:'SERVICE_REWARD',title:'Coins earned from completed service'});
    }
    await conn.execute(`UPDATE service_orders SET status=?${status==='completed'?',completed_at=NOW()':''} WHERE id=?`,[status,order.id]);
    await conn.execute(`INSERT INTO service_manager_audit_logs (actor_id,service_scope,entity_type,entity_id,action,reason,before_json,after_json)
      VALUES (?,?,'orders',?,'status','Manager fulfilment update',?,?)`,[actor,order.workspace_scope||'in_house',order.id,JSON.stringify({status:order.status}),JSON.stringify({status})]);
    await conn.commit();
    return {changed:true,user_id:order.user_id,parent_order_id:order.parent_order_id};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
}
module.exports={updateManagerOrderStatus};
