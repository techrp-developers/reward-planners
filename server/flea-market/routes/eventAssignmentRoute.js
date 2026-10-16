const router = require('express').Router({ mergeParams:true });
const service = require('../services/eventAssignmentService');
const handle = work => async (req,res) => {
  try { res.json({success:true,data:await work(req)}); }
  catch(error) { if (!error.statusCode) console.error('[flea-market event]',error); res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Event operation failed'}); }
};
router.get('/vendors',handle(req=>service.vendors(req.params.scheduleId)));
router.post('/vendors',handle(req=>service.addVendor(req.params.scheduleId,req.body,req.user.user_id)));
router.post('/external-vendors',handle(req=>service.externalVendor(req.params.scheduleId,req.body,req.user.user_id)));
router.patch('/vendors/:vendorId',handle(req=>service.configureVendor(req.params.scheduleId,req.params.vendorId,req.body.collectionModel)));
router.delete('/vendors/:vendorId',handle(req=>service.deactivateVendor(req.params.scheduleId,req.params.vendorId)));
router.get('/products',handle(req=>service.products(req.params.scheduleId,'',true)));
router.post('/products',handle(req=>service.assign(req.params.scheduleId,req.body,req.user.user_id)));
router.delete('/products/:assignmentId',handle(req=>service.release(req.params.scheduleId,req.params.assignmentId)));
module.exports = router;
