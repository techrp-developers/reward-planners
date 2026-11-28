const crypto = require('crypto');
const fs = require('fs/promises');
const sharp = require('sharp');
const model = require('../models/enquiryModel');
const catalogue = require('../models/catalogueModel');
const v = require('../validators/enquiryValidator');
const { uploadToR2 } = require('../../../../utils/r2upload');
const { getPublicUrl } = require('../../../../utils/publicUrl');

const statuses = ['NEW', 'CONTACTED', 'FOLLOW_UP', 'CLOSED', 'CANCELLED'];
const statusLabels = {
  NEW: 'Received',
  CONTACTED: 'Our team has contacted you',
  FOLLOW_UP: 'Follow-up scheduled',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
};
const missing = () => {
  const error = new Error('Enquiry not found');
  error.status = 404;
  throw error;
};
const conflict = message => {
  const error = new Error(message);
  error.status = 409;
  throw error;
};
const notConfigured = () => {
  const error = new Error('External services are not configured for enquiries');
  error.status = 503;
  error.code = 'EXTERNAL_SERVICES_NOT_CONFIGURED';
  throw error;
};
const parse = value => typeof value === 'string' ? JSON.parse(value) : value;

function normalizePhotoReferences(photos, field) {
  if (photos === undefined) return [];
  if (!Array.isArray(photos) || photos.length > 5) v.fail(field, 'Provide at most 5 photos');
  const seen = new Set();
  return photos.map((reference, index) => {
    if (typeof reference !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reference)) {
      v.fail(`${field}.${index}`, 'Invalid photo upload reference');
    }
    if (seen.has(reference)) v.fail(`${field}.${index}`, 'Photo reference is duplicated');
    seen.add(reference);
    return reference;
  });
}

async function ensureConfigured() {
  const providers = await catalogue.providers();
  if (!providers.some(provider => provider.isAcceptingEnquiries)) notConfigured();
}

exports.statusLabel = status => statusLabels[status] || status;
exports.normalizePhotoReferences = normalizePhotoReferences;
exports.ensureConfigured = ensureConfigured;

exports.uploadPhoto = async (file, user) => {
  if (!file?.path) v.fail('photo', 'Choose an image to upload');
  try {
    const buffer = await fs.readFile(file.path);
    let metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      v.fail('photo', 'Upload a valid PNG, JPEG, or WebP image');
    }
    if (!['png', 'jpeg', 'webp'].includes(metadata.format)) {
      v.fail('photo', 'Upload a valid PNG, JPEG, or WebP image');
    }
    const reference = crypto.randomUUID();
    const extension = metadata.format === 'jpeg' ? 'jpg' : metadata.format;
    const storageKey = `external-services/uploads/${reference}.${extension}`;
    const contentType = metadata.format === 'jpeg' ? 'image/jpeg' : `image/${metadata.format}`;
    await uploadToR2(buffer, storageKey, contentType);
    await model.db.execute(
      'INSERT INTO svc_enquiry_photo_uploads (reference_id,customer_user_id,storage_key) VALUES (?,?,?)',
      [reference, user, storageKey],
    );
    return { reference, url: getPublicUrl(storageKey) };
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
};

exports.create = async (body, user) => {
  await ensureConfigured();
  const type = v.id(body.serviceTypeId, 'serviceTypeId');
  const name = v.text(body.customerName, 'customerName', 150);
  const mobile = v.text(body.customerMobile, 'customerMobile', 20);
  const city = v.text(body.cityArea, 'cityArea', 150);
  const pin = v.text(body.pincode, 'pincode', 10);
  if (!/^[6-9]\d{9}$/.test(mobile)) v.fail('customerMobile', 'Enter a valid Indian mobile number');
  if (!/^\d{6}$/.test(pin)) v.fail('pincode', 'Enter a six-digit PIN code');
  if (typeof body.pickupRequired !== 'boolean') v.fail('pickupRequired', 'Must be boolean');
  if (body.partnerShareConsent !== undefined && typeof body.partnerShareConsent !== 'boolean') v.fail('partnerShareConsent', 'Must be boolean');

  const notes = v.text(body.customerNotes, 'customerNotes', 4000, false);
  const addressId = body.addressId == null ? null : v.id(body.addressId, 'addressId');
  let address = null;
  if (addressId) {
    address = await model.address(addressId, user);
    if (!address) v.fail('addressId', 'Address not found');
  }

  if (!Array.isArray(body.items) || !body.items.length || body.items.length > 10) v.fail('items', 'Provide between 1 and 10 items');
  const cache = new Map();
  const items = [];
  for (let index = 0; index < body.items.length; index += 1) {
    const item = body.items[index];
    const field = `items.${index}`;
    if (!item || typeof item !== 'object') v.fail(field, 'Invalid item');
    const categoryId = v.id(item.categoryId, `${field}.categoryId`);
    if (!cache.has(categoryId)) {
      const category = await catalogue.category(categoryId, type);
      if (!category) v.fail(`${field}.categoryId`, 'Category is inactive or does not belong to the selected type');
      cache.set(categoryId, { category, fields: await catalogue.fields(categoryId) });
    }
    const data = cache.get(categoryId);
    const itemName = v.text(item.itemName, `${field}.itemName`, 150);
    const itemNotes = v.text(item.itemNotes, `${field}.itemNotes`, 4000, false);
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) v.fail(`${field}.quantity`, 'Quantity must be between 1 and 99');
    const photoReferences = normalizePhotoReferences(item.photos, `${field}.photos`);
    if (!item.answers || typeof item.answers !== 'object' || Array.isArray(item.answers)) v.fail(`${field}.answers`, 'Answers must be an object');
    const knownFields = new Set(data.fields.map(formField => formField.fieldKey));
    for (const key of Object.keys(item.answers)) {
      if (!knownFields.has(key)) v.fail(`${field}.answers.${key}`, 'Unknown field');
    }
    const answers = {};
    for (const formField of data.fields) {
      const value = item.answers[formField.fieldKey];
      const answerField = `${field}.answers.${formField.fieldKey}`;
      const absent = value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
      if (absent) {
        if (formField.isRequired) v.fail(answerField, 'This field is required');
        continue;
      }
      let labels = [];
      if (formField.inputType === 'TEXT') {
        v.text(value, answerField, 1000);
      } else if (formField.inputType === 'NUMBER') {
        if (typeof value !== 'number' || !Number.isFinite(value)) v.fail(answerField, 'Must be a finite number');
      } else if (formField.inputType === 'BOOLEAN') {
        if (typeof value !== 'boolean') v.fail(answerField, 'Must be boolean');
      } else {
        const options = Array.isArray(formField.options) ? formField.options : [];
        const values = formField.inputType === 'MULTI_SELECT' ? value : [value];
        if (!Array.isArray(values) || !values.length || new Set(values).size !== values.length || values.some(option => typeof option !== 'string' || !options.some(entry => entry.code === option))) {
          v.fail(answerField, 'Invalid option');
        }
        labels = values.map(option => options.find(entry => entry.code === option).label);
      }
      answers[formField.fieldKey] = { label: formField.label, type: formField.inputType, value, valueLabels: labels };
    }
    items.push({ categoryId, categoryName: data.category.name, itemName, itemNotes, quantity: item.quantity, answers, photoReferences, field });
  }

  const photoReferences = items.flatMap(item => item.photoReferences);
  if (new Set(photoReferences).size !== photoReferences.length) v.fail('items', 'Each photo reference can only be used once');
  const offered = await catalogue.matchingProviders(type, [...new Set(items.map(item => item.categoryId))]);
  const requested = body.providerId == null ? null : v.id(body.providerId, 'providerId');
  const provider = requested ? offered.find(candidate => candidate.id === requested) : (offered.length === 1 ? offered[0] : null);
  if (!provider) v.fail('providerId', requested ? 'Provider does not offer all selected categories' : 'Select a provider that offers all selected categories');
  const serviceTypeName = await catalogue.serviceTypeName(type);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const connection = await model.db.getConnection();
    let stage = '';
    try {
      await connection.beginTransaction();
      const uploadMap = new Map();
      if (photoReferences.length) {
        const [uploads] = await connection.execute(
          'SELECT reference_id referenceId,storage_key storageKey FROM svc_enquiry_photo_uploads WHERE customer_user_id=? AND claimed_item_id IS NULL AND reference_id IN (?) FOR UPDATE',
          [user, photoReferences],
        );
        for (const upload of uploads) uploadMap.set(upload.referenceId, upload.storageKey);
        for (const item of items) {
          if (item.photoReferences.some(reference => !uploadMap.has(reference))) {
            v.fail(`${item.field}.photos`, 'One or more photo references are invalid or already used');
          }
        }
      }

      const enquiryNo = `RP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      stage = 'enquiry';
      const enquiryId = await model.insert(connection,
        'INSERT INTO svc_enquiries (provider_id,enquiry_no,service_type_id,customer_user_id,address_id,customer_name,customer_mobile,city_area,pincode,address_snapshot,pickup_required,customer_notes,status,partner_share_consent_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,\'NEW\',IF(?,NOW(),NULL))',
        [provider.id, enquiryNo, type, user, addressId, name, mobile, city, pin, address ? JSON.stringify(address) : null, body.pickupRequired ? 1 : 0, notes, body.partnerShareConsent === true ? 1 : 0],
      );
      stage = 'items';
      for (const item of items) {
        const itemId = await model.insert(connection,
          'INSERT INTO svc_enquiry_items (enquiry_id,category_id,service_type_id,category_name_snapshot,item_name,quantity,answers_json,item_notes) VALUES (?,?,?,?,?,?,?,?)',
          [enquiryId, item.categoryId, type, item.categoryName, item.itemName, item.quantity, JSON.stringify(item.answers), item.itemNotes],
        );
        for (const [sortOrder, reference] of item.photoReferences.entries()) {
          const storageKey = uploadMap.get(reference);
          await connection.execute('INSERT INTO svc_enquiry_photos (enquiry_item_id,storage_key,sort_order) VALUES (?,?,?)', [itemId, storageKey, sortOrder]);
          const [claimed] = await connection.execute(
            'UPDATE svc_enquiry_photo_uploads SET claimed_item_id=?,claimed_at=NOW() WHERE reference_id=? AND customer_user_id=? AND claimed_item_id IS NULL',
            [itemId, reference, user],
          );
          if (claimed.affectedRows !== 1) conflict('One or more photo references are no longer available');
        }
      }
      const [[row]] = await connection.execute('SELECT created_at createdAt FROM svc_enquiries WHERE id=?', [enquiryId]);
      await connection.commit();
      return {
        enquiryId,
        enquiryNo,
        status: 'NEW',
        statusLabel: statusLabels.NEW,
        createdAt: row.createdAt,
        providerName: provider.name,
        serviceTypeName,
        itemCount: items.length,
      };
    } catch (error) {
      await connection.rollback();
      if (!(stage === 'enquiry' && error.code === 'ER_DUP_ENTRY' && /uq_svc_enquiries_no/.test(error.message) && attempt < 4)) throw error;
    } finally {
      connection.release();
    }
  }
};

async function attachItems(row, customerView) {
  row.statusLabel = statusLabels[row.status] || row.status;
  row.pickupRequired = !!row.pickupRequired;
  row.items = await model.items(row.id);
  for (const item of row.items) {
    item.answers = parse(item.answers);
    item.photos = (await model.photos(item.id)).map(photo => ({ url: getPublicUrl(photo.storageKey) }));
  }
  if (customerView) delete row.nextFollowUpAt;
  return row;
}

exports.detail = async (id, user) => {
  const row = await model.detail(v.id(id, 'enquiryId'), user);
  if (!row) missing();
  row.addressSnapshot = parse(row.addressSnapshot);
  await attachItems(row, !!user);
  if (!user) row.activities = await model.activities(id);
  return row;
};

exports.listCustomer = async (user, query) => {
  const [limit, offset] = v.page(query);
  const rows = await model.customerList(user, limit, offset);
  for (const row of rows) await attachItems(row, true);
  return rows;
};

exports.listAdmin = async query => {
  const [limit, offset] = v.page(query);
  const where = [];
  const args = [];
  if (query.status) {
    if (!statuses.includes(query.status)) v.fail('status', 'Invalid status');
    where.push('status=?');
    args.push(query.status);
  }
  for (const [key, column, operator] of [['followUpFrom', 'next_follow_up_at', '>='], ['followUpTo', 'next_follow_up_at', '<=']]) {
    if (query[key]) {
      if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(query[key]) || !Number.isFinite(Date.parse(query[key]))) v.fail(key, 'Invalid date');
      where.push(`${column} ${operator} ?`);
      args.push(query[key].replace('T', ' ').replace(/Z$/, ''));
    }
  }
  if (query.overdueFollowUp !== undefined && !['true', 'false'].includes(query.overdueFollowUp)) v.fail('overdueFollowUp', 'Must be true or false');
  if (query.overdueFollowUp === 'true') where.push("status='FOLLOW_UP' AND next_follow_up_at<NOW()");
  if (query.search) {
    where.push('(enquiry_no=? OR customer_mobile=?)');
    args.push(query.search, query.search);
  }
  if (query.assignedStaffId) {
    where.push('assigned_staff_id=?');
    args.push(v.id(query.assignedStaffId, 'assignedStaffId'));
  }
  return model.adminList(where, args, limit, offset, !!(query.followUpFrom || query.followUpTo || query.overdueFollowUp === 'true'));
};

exports.activity = async (id, user, body) => {
  v.id(id, 'enquiryId');
  if (!['CALL', 'NOTE'].includes(body.activityType)) v.fail('activityType', 'Must be CALL or NOTE');
  const note = v.text(body.note, 'note', 4000);
  const [result] = await model.db.execute(
    'INSERT INTO svc_enquiry_activities (enquiry_id,staff_user_id,activity_type,note) SELECT id,?,?,? FROM svc_enquiries WHERE id=?',
    [user, body.activityType, note, id],
  );
  if (!result.affectedRows) missing();
};

exports.status = async (id, user, body) => {
  v.id(id, 'enquiryId');
  if (!statuses.includes(body.status)) v.fail('status', 'Invalid status');
  const note = v.text(body.note, 'note', 4000, false);
  let date = null;
  if (body.status === 'FOLLOW_UP') {
    if (typeof body.nextFollowUpAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(body.nextFollowUpAt) || !Number.isFinite(Date.parse(body.nextFollowUpAt)) || Date.parse(body.nextFollowUpAt) <= Date.now()) {
      v.fail('nextFollowUpAt', 'Provide a future ISO 8601 date with timezone');
    }
    date = new Date(body.nextFollowUpAt).toISOString().slice(0, 19).replace('T', ' ');
  }
  const connection = await model.db.getConnection();
  try {
    await connection.beginTransaction();
    const [[row]] = await connection.execute('SELECT status,next_follow_up_at FROM svc_enquiries WHERE id=? FOR UPDATE', [id]);
    if (!row) missing();
    const allowed = {
      NEW: ['CONTACTED', 'FOLLOW_UP', 'CLOSED', 'CANCELLED'],
      CONTACTED: ['FOLLOW_UP', 'CLOSED', 'CANCELLED'],
      FOLLOW_UP: ['CONTACTED', 'FOLLOW_UP', 'CLOSED', 'CANCELLED'],
      CLOSED: [],
      CANCELLED: [],
    };
    if (!allowed[row.status].includes(body.status)) conflict('Invalid status transition');
    const reschedule = row.status === 'FOLLOW_UP' && body.status === 'FOLLOW_UP';
    if (reschedule && row.next_follow_up_at === date) conflict('Follow-up date is unchanged');
    const next = body.status === 'FOLLOW_UP' ? date : ['CLOSED', 'CANCELLED'].includes(body.status) ? null : row.next_follow_up_at;
    await connection.execute('UPDATE svc_enquiries SET status=?,next_follow_up_at=? WHERE id=?', [body.status, next, id]);
    await connection.execute(
      'INSERT INTO svc_enquiry_activities (enquiry_id,staff_user_id,activity_type,note,from_status,to_status) VALUES (?,?,?,?,?,?)',
      [id, user, reschedule ? 'NOTE' : 'STATUS_CHANGE', reschedule ? `Follow-up rescheduled from ${row.next_follow_up_at} to ${date}${note ? ` - ${note}` : ''}` : note, reschedule ? null : row.status, reschedule ? null : body.status],
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.form = async id => {
  v.id(id, 'categoryId');
  if (!await catalogue.formCategory(id)) missing();
  return catalogue.fields(id);
};
