const M=require('./serviceMoney');
async function lockCheckoutAddress(conn,addressId,userId){
  const [[row]]=await conn.execute('SELECT address_id FROM customer_addresses WHERE address_id=? AND user_id=? AND status=1 FOR UPDATE',[M.reference(addressId),M.reference(userId)]);
  if(!row)throw M.failure('Select an active address belonging to your account.','INVALID_CHECKOUT_ADDRESS',400);
  return row;
}
async function lockCheckoutVariant(conn,serviceId,variantId){
  const [[row]]=await conn.execute(`SELECT v.* FROM service_variants v JOIN services s ON s.id=v.service_id JOIN service_categories c ON c.id=s.category_id
    WHERE v.id=? AND v.service_id=? AND v.status=1 AND s.status=1 AND c.status=1 FOR UPDATE`,[M.reference(variantId),M.reference(serviceId)]);
  if(!row)throw M.failure('The selected service or variant is unavailable.','SERVICE_UNAVAILABLE',409);
  return row;
}
async function lockCheckoutBundle(conn,bundleId){
  const [[row]]=await conn.execute('SELECT id,type FROM service_bundles WHERE id=? AND status=1 FOR UPDATE',[M.reference(bundleId)]);
  if(!row)throw M.failure('The selected service bundle is unavailable.','SERVICE_BUNDLE_UNAVAILABLE',409);
  return row;
}
module.exports={lockCheckoutAddress,lockCheckoutVariant,lockCheckoutBundle};
