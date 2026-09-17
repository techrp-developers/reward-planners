const bcrypt = require("bcryptjs");
const db = require("../config/database");

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const phonePattern = /^[6-9]\d{9}$/;
const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const clean = (value, max = 255) => String(value ?? "").trim().slice(0, max);
const email = (value) => clean(value, 190).toLowerCase();
const phone = (value) => clean(value, 20).replace(/\D/g, "").slice(-10);
const bool = (value) => value === true || value === 1 || value === "1" || value === "true";

function normalize(body = {}) {
  return {
    companyName: clean(body.companyName), legalName: clean(body.legalName), companyType: clean(body.companyType, 100),
    industry: clean(body.industry, 150), employeeCount: clean(body.employeeCount, 50), website: clean(body.website, 500),
    officialEmail: email(body.officialEmail), officialPhone: phone(body.officialPhone), pan: clean(body.pan, 10).toUpperCase(), gst: clean(body.gst, 15).toUpperCase(),
    address1: clean(body.address1), address2: clean(body.address2), country: clean(body.country, 100), state: Number(body.state), city: clean(body.city, 100), pincode: clean(body.pincode, 10), officeSame: bool(body.officeSame),
    repName: clean(body.repName, 150), designation: clean(body.designation, 100), repEmail: email(body.repEmail), repPhone: phone(body.repPhone), repPan: clean(body.repPan, 10).toUpperCase(),
    aadhaarLast4: clean(body.aadhaarLast4, 4), identityConsent: bool(body.identityConsent), terms: bool(body.terms), privacy: bool(body.privacy), dataConsent: bool(body.dataConsent), communicationConsent: bool(body.communicationConsent),
    adminName: clean(body.adminName, 150), adminEmail: email(body.adminEmail), password: String(body.password ?? ""), confirmPassword: String(body.confirmPassword ?? ""),
  };
}

function validate(data) {
  const required = ["companyName", "companyType", "industry", "employeeCount", "officialEmail", "officialPhone", "address1", "country", "city", "pincode", "repName", "designation", "repEmail", "repPhone", "adminName", "adminEmail", "password"];
  if (required.some((field) => !data[field]) || !Number.isInteger(data.state) || data.state <= 0) return "Complete all required onboarding fields.";
  if (![data.officialEmail, data.repEmail, data.adminEmail].every((value) => emailPattern.test(value))) return "Enter valid company, representative, and administrator email addresses.";
  if (![data.officialPhone, data.repPhone].every((value) => phonePattern.test(value))) return "Enter valid 10-digit Indian mobile numbers.";
  if (!/^\d{6}$/.test(data.pincode)) return "Enter a valid PIN code.";
  if (!passwordPattern.test(data.password) || data.password !== data.confirmPassword) return "The administrator password is invalid or does not match.";
  if (![data.terms, data.privacy, data.dataConsent, data.communicationConsent].every(Boolean)) return "Accept all mandatory legal agreements.";
  return null;
}

async function createClientOnboarding(rawData, { zohoRequestId = null }) {
  const data = normalize(rawData);
  const validationError = validate(data);
  if (validationError) throw Object.assign(new Error(validationError), { status: 400 });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[state]] = await connection.execute("SELECT state_id FROM states WHERE state_id = ? AND status = 1 LIMIT 1", [data.state]);
    if (!state) throw Object.assign(new Error("Select a valid active state."), { status: 400 });

    const [duplicates] = await connection.execute(
      `SELECT 'company' AS source FROM companies WHERE LOWER(TRIM(company_email)) = ?
       UNION ALL SELECT 'administrator' FROM eusers WHERE LOWER(TRIM(email)) = ?
       UNION ALL SELECT 'employee' FROM company_users WHERE LOWER(TRIM(email)) IN (?, ?) LIMIT 1`,
      [data.officialEmail, data.adminEmail, data.repEmail, data.adminEmail],
    );
    if (duplicates.length) throw Object.assign(new Error("A company or user with one of these email addresses already exists."), { status: 409 });

    const [companyResult] = await connection.execute(
      `INSERT INTO companies (company_name, company_email, company_phone, status) VALUES (?, ?, ?, 1)`,
      [data.companyName, data.officialEmail, data.officialPhone],
    );
    const companyId = companyResult.insertId;

    const [representativeResult] = await connection.execute(
      `INSERT INTO company_users (company_id, name, email, contact, address1, address2, role, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [companyId, data.repName, data.repEmail, data.repPhone, data.address1, data.address2 || null, data.designation],
    );

    let adminCompanyUserId = representativeResult.insertId;
    if (data.adminEmail !== data.repEmail) {
      const [adminResult] = await connection.execute(
        `INSERT INTO company_users (company_id, name, email, contact, address1, address2, role, department, status)
         VALUES (?, ?, ?, NULL, ?, ?, 'Primary HR Administrator', 'Human Resources', 1)`,
        [companyId, data.adminName, data.adminEmail, data.address1, data.address2 || null],
      );
      adminCompanyUserId = adminResult.insertId;
    } else {
      await connection.execute(
        `UPDATE company_users SET name = ?, role = 'Primary HR Administrator', department = 'Human Resources' WHERE id = ?`,
        [data.adminName, adminCompanyUserId],
      );
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const [userResult] = await connection.execute(
      `INSERT INTO eusers (name, role, email, password, phone, is_verified) VALUES (?, 'hr', ?, ?, ?, 1)`,
      [data.adminName, data.adminEmail, passwordHash, data.adminEmail === data.repEmail ? data.repPhone : null],
    );

    await connection.execute(`INSERT INTO company_wallet (company_id, balance) VALUES (?, 0)`, [companyId]);
    await connection.execute(
      `INSERT INTO client_onboarding_details (
        company_id, legal_name, company_type, industry, employee_count, website, pan, gst,
        address1, address2, country, state_id, city, pincode, office_same,
        representative_name, representative_designation, representative_email, representative_phone,
        representative_pan, aadhaar_last4, identity_consent, terms_accepted, privacy_accepted,
        data_consent, communication_consent, zoho_request_id, signed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, ?, ?)`,
      [companyId, data.legalName || null, data.companyType, data.industry, data.employeeCount, data.website || null, data.pan || null, data.gst || null,
        data.address1, data.address2 || null, data.country, data.state, data.city, data.pincode, data.officeSame ? 1 : 0,
        data.repName, data.designation, data.repEmail, data.repPhone, data.repPan || null, data.aadhaarLast4 || null, data.identityConsent ? 1 : 0, zohoRequestId ? String(zohoRequestId) : null, zohoRequestId ? new Date() : null],
    );

    await connection.commit();
    return { companyId, companyUserId: adminCompanyUserId, userId: userResult.insertId };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") throw Object.assign(new Error("This company or administrator has already been onboarded."), { status: 409 });
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = { createClientOnboarding };
