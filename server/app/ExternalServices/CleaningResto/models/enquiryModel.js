const db = require("../../../../config/database");
exports.db = db;
exports.address = async (id, user) =>
  (
    await db.execute(
      "SELECT address_type,address1,address2,city,zipcode,state_id,country_id,landmark,contact_name,contact_phone FROM customer_addresses WHERE address_id=? AND user_id=? AND status=1",
      [id, user],
    )
  )[0][0];
exports.insert = async (c, sql, params) => {
  await c.execute(sql, params);
  return (await c.query("SELECT CAST(LAST_INSERT_ID() AS CHAR) id"))[0][0].id;
};
exports.customerList = async (user, limit, offset) =>
  (
    await db.query(
      "SELECT CAST(id AS CHAR) id,enquiry_no enquiryNo,status,created_at createdAt,customer_name customerName,customer_mobile customerMobile,city_area cityArea,pincode,pickup_required pickupRequired FROM svc_enquiries WHERE customer_user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?",
      [user, limit, offset],
    )
  )[0];
exports.detail = async (id, user) => {
  const [rows] = await db.execute(
    `SELECT CAST(id AS CHAR) id,enquiry_no enquiryNo,status,created_at createdAt,customer_name customerName,customer_mobile customerMobile,city_area cityArea,pincode,pickup_required pickupRequired,customer_notes customerNotes,address_snapshot addressSnapshot,next_follow_up_at nextFollowUpAt,CAST(provider_id AS CHAR) providerId,(SELECT name FROM svc_external_providers WHERE id=svc_enquiries.provider_id) providerName,(SELECT name FROM svc_service_types WHERE id=svc_enquiries.service_type_id) serviceTypeName${user ? "" : ", CAST(assigned_staff_id AS CHAR) assignedStaffId"} FROM svc_enquiries WHERE id=?${user ? " AND customer_user_id=?" : ""}`,
    user ? [id, user] : [id],
  );
  return rows[0];
};
exports.items = async (id) =>
  (
    await db.execute(
      "SELECT CAST(id AS CHAR) id,category_name_snapshot categoryName,item_name itemName,quantity,answers_json answers,item_notes notes FROM svc_enquiry_items WHERE enquiry_id=? ORDER BY id",
      [id],
    )
  )[0];
exports.photos = async (id) =>
  (
    await db.execute(
      "SELECT p.storage_key storageKey FROM svc_enquiry_photos p JOIN svc_enquiry_items i ON i.id=p.enquiry_item_id WHERE i.id=? ORDER BY p.sort_order,p.id",
      [id],
    )
  )[0];
exports.activities = async (id) =>
  (
    await db.execute(
      "SELECT CAST(a.id AS CHAR) id,a.activity_type activityType,a.note,a.from_status fromStatus,a.to_status toStatus,a.created_at createdAt,e.name staffName FROM svc_enquiry_activities a LEFT JOIN eusers e ON e.user_id=a.staff_user_id WHERE a.enquiry_id=? ORDER BY a.created_at DESC,a.id DESC",
      [id],
    )
  )[0];
exports.adminList = async (where, args, limit, offset, follow) => {
  const clause = where.length ? " WHERE " + where.join(" AND ") : "";
  const [[count]] = await db.execute(
    "SELECT COUNT(*) total FROM svc_enquiries" + clause,
    args,
  );
  const [rows] = await db.query(
    "SELECT CAST(id AS CHAR) id,enquiry_no enquiryNo,status,created_at createdAt,next_follow_up_at nextFollowUpAt,customer_name customerName,customer_mobile customerMobile,CAST(assigned_staff_id AS CHAR) assignedStaffId,(SELECT name FROM svc_external_providers WHERE id=svc_enquiries.provider_id) providerName,(SELECT name FROM svc_service_types WHERE id=svc_enquiries.service_type_id) serviceTypeName,COALESCE((SELECT GROUP_CONCAT(DISTINCT i.category_name_snapshot ORDER BY i.category_name_snapshot SEPARATOR ', ') FROM svc_enquiry_items i WHERE i.enquiry_id=svc_enquiries.id),'') categoryNames FROM svc_enquiries" +
      clause +
      (follow
        ? " ORDER BY next_follow_up_at ASC,id ASC"
        : " ORDER BY created_at DESC,id DESC") +
      " LIMIT ? OFFSET ?",
    [...args, limit, offset],
  );
  return { total: count.total, enquiries: rows };
};
