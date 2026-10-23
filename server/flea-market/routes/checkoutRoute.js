const express = require("express");
const router = express.Router();
const checkoutController = require("../controllers/checkoutController");
const requireFleaMarketSession = require("../middlewares/requireFleaMarketSession");
const { validateCheckout } = require("../middlewares/validators");

router.post("/", requireFleaMarketSession, validateCheckout, checkoutController.checkout);
router.get('/:checkoutId/status',async(req,res)=>{
  try {
    const [[row]]=await require('../../config/database').execute(`SELECT ci.status FROM flea_market_checkout_bindings b
      LEFT JOIN flea_market_checkout_idempotency ci ON ci.idempotency_key=b.idempotency_key
      WHERE b.idempotency_key=? AND b.manager_user_id=?`,[req.params.checkoutId,req.user.user_id]);
    res.json({success:true,data:{status:row ? (row.status||'not_started') : 'not_found'}});
  } catch(error) { console.error('[flea-market checkout status]',error);res.status(500).json({success:false,message:'Could not verify checkout status'}); }
});

router.get('/:checkoutId/receipt',async(req,res)=>{
  try {
    const db=require('../../config/database');
    const [[checkout]]=await db.execute(`SELECT ci.invoice_ids,b.schedule_id FROM flea_market_checkout_bindings b
      JOIN flea_market_checkout_idempotency ci ON ci.idempotency_key=b.idempotency_key
      WHERE b.idempotency_key=? AND b.manager_user_id=? AND ci.status='completed'`,[req.params.checkoutId,req.user.user_id]);
    if (!checkout) return res.status(404).json({success:false,message:'Receipt not found'});
    const ids=Array.isArray(checkout.invoice_ids)?checkout.invoice_ids:JSON.parse(checkout.invoice_ids);
    const invoices=[];
    for (const id of ids) {
      const invoice=await require('../models/checkoutModel').findInvoiceById(id);
      if (invoice?.source==='flea_market') invoices.push({invoiceId:invoice.invoice_id,invoiceNumber:invoice.invoice_number,vendorId:invoice.vendor_id,subtotal:invoice.subtotal,pointsRedeemed:invoice.reward_discount,netInvoicedAmount:invoice.grand_total});
    }
    const [payments]=await db.execute('SELECT method,amount,status,recipient,reference_number,verification_source,confirmed_at FROM flea_market_payments WHERE checkout_key=?',[req.params.checkoutId]);
    return res.json({success:true,data:{checkoutId:req.params.checkoutId,scheduleId:checkout.schedule_id,invoices,payments}});
  } catch(error) { console.error('[flea-market receipt]',error); return res.status(500).json({success:false,message:'Receipt could not be loaded'}); }
});

module.exports = router;
