const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('../../../../config/database');
const {authenticateToken,authorizeRoles}=require('../../../../middleware/auth');
const {createWorkspaceModel}=require('../models/managerWorkspaceModel');
const {calculateServiceRewards,allocateRedeemedCoins}=require('../utils/serviceRewards');
const P=require('../utils/managerPolicy');
const workspace=createWorkspaceModel(db);
const router=express.Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:5*1024*1024,files:1},fileFilter:(_req,file,done)=>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.mimetype))return done(P.invalid('Choose a PNG, JPEG or WebP image.'));
  done(null,true);
}});
const handle=fn=>async(req,res,next)=>{try{await fn(req,res);}catch(error){next(error);}};
router.use(authenticateToken,authorizeRoles('service_manager','admin'));
router.use(require('express-rate-limit').rateLimit({windowMs:15*60*1000,limit:60,
  keyGenerator:req=>String(req.user.user_id),skip:req=>['GET','HEAD','OPTIONS'].includes(req.method),
  standardHeaders:'draft-8',legacyHeaders:false,message:{success:false,message:'Too many service changes. Please retry later.'}}));
router.use(async(_req,_res,next)=>{try{await workspace.ready();next();}catch(error){next(error);}});
router.get('/dashboard/summary',handle(async(req,res)=>res.json({success:true,data:await workspace.summary(req.query)})));
router.get('/in-house/summary',handle(async(req,res)=>res.json({success:true,data:await workspace.summary(req.query)})));
router.get('/audit-logs',handle(async(req,res)=>res.json({success:true,data:await workspace.history(req.query)})));
router.patch('/classification/:kind/:id',authorizeRoles('admin'),handle(async(req,res)=>res.json({success:true,data:await require('../models/serviceClassificationModel').createClassificationModel(db)(req.params.kind,req.params.id,req.body,req.user.user_id)})));
router.get('/catalog/:kind',handle(async(req,res)=>res.json({success:true,data:await workspace.list(req.params.kind,req.query)})));
router.get('/services/:id/documents',handle(async(req,res)=>res.json({success:true,data:await workspace.documents(P.id(req.params.id))})));
router.post('/services/:id/documents',handle(async(req,res)=>res.status(201).json({success:true,data:await workspace.saveDocument(P.id(req.params.id),null,req.body,req.user.user_id)})));
router.patch('/services/:id/documents/:documentId',handle(async(req,res)=>res.json({success:true,data:await workspace.saveDocument(P.id(req.params.id),P.id(req.params.documentId),req.body,req.user.user_id)})));
async function save(req,res) {
  if(!['categories','services','variants'].includes(req.params.kind))throw P.invalid('Unknown catalogue type.');
  let imagePath;
  if(req.file){
    // Decode and re-encode to reject disguised files and strip embedded metadata.
    const buffer=await require('sharp')(req.file.buffer,{limitInputPixels:25000000}).rotate().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer();
    imagePath=`public/service-manager/${req.params.kind}/${crypto.randomUUID()}.webp`;
    await require('../../../../utils/r2upload').uploadToR2(buffer,imagePath,'image/webp');
  }
  let data;
  try { data=await workspace.save(req.params.kind,req.params.id?P.id(req.params.id):null,req.body,req.user.user_id,imagePath); }
  catch(error){
    if(imagePath)try{await require('../../../../utils/r2delete').deleteFromR2(imagePath);}catch(cleanupError){console.error('[service-manager upload cleanup]',cleanupError.code||'failed');}
    throw error;
  }
  res.status(req.params.id?200:201).json({success:true,data});
}
router.post('/catalog/:kind',upload.single('image'),handle(save));
router.patch('/catalog/:kind/:id',upload.single('image'),handle(save));
router.patch('/pricing/:id',handle(async(req,res)=>res.json({success:true,data:await workspace.commercial(P.id(req.params.id),req.body,req.user.user_id,'pricing')})));
router.patch('/reward-rules/:id',handle(async(req,res)=>res.json({success:true,data:await workspace.commercial(P.id(req.params.id),req.body,req.user.user_id,'rewards')})));
router.post('/reward-rules/preview',handle(async(req,res)=>{
  const [[variant]]=await db.execute(`SELECT v.* FROM service_variants v JOIN services s ON s.id=v.service_id WHERE v.id=? AND s.service_scope='in_house'`,[P.id(req.body.variant_id)]);
  if(!variant)throw P.invalid('In-House variant not found.',404);
  const rules=P.rewards(req.body);
  const reward=calculateServiceRewards(variant.price,rules);
  const wallet=P.integer(req.body.wallet_balance??0),requested=P.integer(req.body.redeem_coins??0);
  const quote=allocateRedeemedCoins([{price:variant.price,rewards:reward}],requested,wallet);
  res.json({success:true,data:{price:variant.price,...reward,redeem_coins:quote.redeem_coins,payable:quote.items[0].final_price,
    policy:'Existing calculator: percentage of INR price yields coins rounded down; 1 redeemed coin deducts INR 1. Live offers disable redemption. Preview excludes offers and is not a checkout quote.'}});
}));
router.use((error,_req,res,_next)=>{
  const status=error.status|| (error instanceof multer.MulterError?400:500);
  if(status===500)console.error('[service-manager]',error.code||error.message);
  res.status(status).json({success:false,message:status===500?'Unable to complete the service operation. Please retry.':error.message});
});
module.exports=router;
