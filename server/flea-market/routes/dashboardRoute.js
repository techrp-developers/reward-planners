const router = require('express').Router();
router.get('/summary',async(req,res)=>{
  try { res.json({success:true,data:await require('../services/dashboardService').summary(req.query)}); }
  catch(error) { if (!error.statusCode) console.error('[flea-market dashboard]',error); res.status(error.statusCode||500).json({success:false,message:error.statusCode?error.message:'Dashboard could not be loaded'}); }
});
module.exports = router;
