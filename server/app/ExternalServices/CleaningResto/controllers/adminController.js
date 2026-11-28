const svc=require('../services/enquiryService');const {wrap}=require('./customerController');
exports.list=wrap(async(req,res)=>res.json({success:true,data:await svc.listAdmin(req.query)}));
exports.detail=wrap(async(req,res)=>res.json({success:true,data:await svc.detail(req.params.enquiryId,null)}));
exports.status=wrap(async(req,res)=>{await svc.status(req.params.enquiryId,req.user.user_id,req.body);res.json({success:true,message:'Status updated'});});
exports.activity=wrap(async(req,res)=>{await svc.activity(req.params.enquiryId,req.user.user_id,req.body);res.status(201).json({success:true,message:'Activity recorded'});});
