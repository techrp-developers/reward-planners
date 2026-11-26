const db=require('../../../../config/database');
const {createWorkspaceModel,enquiryScope}=require('../models/managerWorkspaceModel');
// Shared legacy routes retain their behavior for other roles. A Service Manager
// must pass migration readiness and workspace checks on every protected action.
function managerScope(kind=null) {
  return async(req,res,next)=>{
    if(req.user?.role!=='service_manager')return next();
    try {
      await createWorkspaceModel(db).ready();
      req.inHouseOnly=true;
      let sql,args;
      if(kind==='order'){sql="SELECT o.id FROM service_orders o JOIN services s ON s.id=o.service_id WHERE o.id=? AND s.service_scope='in_house'";args=[req.params.id||req.params.serviceOrderId];}
      if(kind==='parent'){sql="SELECT o.id FROM service_orders o WHERE o.parent_order_id=? AND NOT EXISTS (SELECT 1 FROM service_orders x LEFT JOIN services s ON s.id=x.service_id WHERE x.parent_order_id=o.parent_order_id AND (s.service_scope IS NULL OR s.service_scope<>'in_house')) LIMIT 1";args=[req.params.parentOrderId];}
      if(kind==='enquiry'){sql=`SELECT e.id FROM service_enquiries e WHERE e.id=? AND ${enquiryScope('e')}`;args=[req.params.id];}
      if(kind==='variant'){sql="SELECT v.id FROM service_variants v JOIN services s ON s.id=v.service_id WHERE v.id=? AND s.service_scope='in_house'";args=[req.body.variant_id];}
      if(kind==='variantSection'){sql="SELECT x.id FROM service_variant_sections x JOIN service_variants v ON v.id=x.variant_id JOIN services s ON s.id=v.service_id WHERE x.id=? AND s.service_scope='in_house'";args=[req.params.id];}
      if(sql){const [rows]=await db.execute(sql,args);if(!rows.length)return res.status(404).json({success:false,message:'Record not found in the In-House workspace.'});}
      next();
    }catch(error){res.status(error.status||503).json({success:false,message:error.status?error.message:'Service workspace is unavailable. Please retry.'});}
  };
}
function managedCatalogueOnly(req,res,next) {
  if(req.user?.role==='service_manager')return res.status(403).json({success:false,message:'Use the audited /v1/service-manager/catalog APIs for Service Manager catalogue changes.'});
  next();
}
module.exports={managerScope,managedCatalogueOnly};
