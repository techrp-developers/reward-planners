const P=require('../utils/managerPolicy');
function createClassificationModel(db){return async(kind,id,body,actor)=>{
  const table={categories:'service_categories',services:'services'}[kind];if(!table)throw P.invalid('Only categories and services can be classified.');
  const target=body.service_scope;if(!['in_house','partner'].includes(target))throw P.invalid('Choose In-House or Partner scope.');
  const review=P.text(body.review_reference,'Business approval reference',200),reason=P.text(body.reason,'Reason',500);
  const conn=await db.getConnection();try{
    await conn.beginTransaction();
    const [[before]]=await conn.execute(`SELECT * FROM ${table} WHERE id=? FOR UPDATE`,[P.id(id)]);
    if(!before)throw P.invalid('Record not found.',404);
    if(before.service_scope!==null)throw P.invalid('Assigned scope is immutable here. Historical ownership changes require a separate reviewed migration.',409);
    if(body.version!==JSON.stringify(before))throw P.invalid('Refresh the classification record before approving.',409);
    if(kind==='services'){
      const [[parent]]=await conn.execute('SELECT service_scope FROM service_categories WHERE id=? FOR UPDATE',[before.category_id]);
      if(parent?.service_scope!==target)throw P.invalid('Approve the category in the same workspace first.',409);
      const [[mixed]]=await conn.execute(`SELECT other.id FROM service_bundle_items own JOIN service_bundle_items other ON other.bundle_id=own.bundle_id JOIN services s ON s.id=other.service_id WHERE own.service_id=? AND s.service_scope IS NOT NULL AND s.service_scope<>? LIMIT 1`,[before.id,target]);
      if(mixed)throw P.invalid('This classification would create a mixed-workspace bundle. Review the bundle first.',409);
    }else{
      const [[mixed]]=await conn.execute('SELECT id FROM services WHERE category_id=? AND service_scope IS NOT NULL AND service_scope<>? LIMIT 1',[before.id,target]);
      if(mixed)throw P.invalid('A child service already belongs to another workspace.',409);
    }
    const [result]=await conn.execute(`UPDATE ${table} SET service_scope=? WHERE id=? AND service_scope IS NULL`,[target,before.id]);
    if(result.affectedRows!==1)throw P.invalid('Classification changed concurrently.',409);
    await conn.execute(`INSERT INTO service_manager_audit_logs (actor_id,service_scope,entity_type,entity_id,action,reason,before_json,after_json) VALUES (?,?,?,?,'classified',?,?,?)`,[actor,target,kind,before.id,reason,JSON.stringify(before),JSON.stringify({...before,service_scope:target,review_reference:review})]);
    await conn.commit();return {id:before.id,service_scope:target,review_reference:review};
  }catch(error){await conn.rollback();throw error;}finally{conn.release();}
};}
module.exports={createClassificationModel};
