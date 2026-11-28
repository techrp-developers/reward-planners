const db = require("../../../../config/database");
exports.types = async () =>
  (
    await db.execute(
      "SELECT CAST(id AS CHAR) id, code, name FROM svc_service_types WHERE is_active=1 ORDER BY sort_order,id",
    )
  )[0];
exports.serviceTypeName = async (id) =>
  (
    await db.execute(
      "SELECT name FROM svc_service_types WHERE id=? AND is_active=1",
      [id],
    )
  )[0][0]?.name;
exports.categories = async (id) =>
  (
    await db.execute(
      "SELECT CAST(c.id AS CHAR) id,c.code,c.name,c.image_key imageKey,c.icon_key iconKey,c.short_description shortDescription FROM svc_categories c JOIN svc_service_types t ON t.id=c.service_type_id WHERE c.service_type_id=? AND c.is_active=1 AND t.is_active=1 ORDER BY c.sort_order,c.id",
      [id],
    )
  )[0];
exports.category = async (id, type) =>
  (
    await db.execute(
      "SELECT CAST(c.id AS CHAR) id,c.name FROM svc_categories c JOIN svc_service_types t ON t.id=c.service_type_id WHERE c.id=? AND c.service_type_id=? AND c.is_active=1 AND t.is_active=1",
      [id, type],
    )
  )[0][0];
exports.fields = async (id) =>
  (
    await db.execute(
      "SELECT f.field_key fieldKey,f.label,f.input_type inputType,f.is_required isRequired,f.options_json options,f.field_group fieldGroup,f.help_text helpText FROM svc_category_fields f JOIN svc_categories c ON c.id=f.category_id JOIN svc_service_types t ON t.id=c.service_type_id WHERE f.category_id=? AND f.is_active=1 AND c.is_active=1 AND t.is_active=1 ORDER BY f.sort_order,f.id",
      [id],
    )
  )[0].map((f) => ({
    ...f,
    isRequired: !!f.isRequired,
    options: typeof f.options === "string" ? JSON.parse(f.options) : f.options,
  }));
exports.formCategory = async (id) =>
  (
    await db.execute(
      "SELECT CAST(c.id AS CHAR) id FROM svc_categories c JOIN svc_service_types t ON t.id=c.service_type_id WHERE c.id=? AND c.is_active=1 AND t.is_active=1",
      [id],
    )
  )[0][0];

exports.providers = async () =>
  (
    await db.execute(
      "SELECT CAST(p.id AS CHAR) id,p.code,p.name,IF(EXISTS (SELECT 1 FROM svc_provider_categories pc JOIN svc_categories c ON c.id=pc.category_id JOIN svc_service_types t ON t.id=c.service_type_id WHERE pc.provider_id=p.id AND c.is_active=1 AND t.is_active=1),1,0) isAcceptingEnquiries FROM svc_external_providers p WHERE p.is_active=1 ORDER BY p.name,p.id",
    )
  )[0].map((provider) => ({
    ...provider,
    isAcceptingEnquiries: !!provider.isAcceptingEnquiries,
  }));
exports.providerTypes = async (id) =>
  (
    await db.execute(
      "SELECT DISTINCT CAST(t.id AS CHAR) id,t.code,t.name,t.sort_order FROM svc_service_types t JOIN svc_categories c ON c.service_type_id=t.id AND c.is_active=1 JOIN svc_provider_categories pc ON pc.category_id=c.id JOIN svc_external_providers p ON p.id=pc.provider_id AND p.is_active=1 WHERE p.id=? AND t.is_active=1 ORDER BY t.sort_order,id",
      [id],
    )
  )[0];
exports.providerCategories = async (provider, type) =>
  (
    await db.execute(
      "SELECT CAST(c.id AS CHAR) id,c.code,c.name,c.image_key imageKey,c.icon_key iconKey,c.short_description shortDescription FROM svc_categories c JOIN svc_service_types t ON t.id=c.service_type_id AND t.is_active=1 JOIN svc_provider_categories pc ON pc.category_id=c.id JOIN svc_external_providers p ON p.id=pc.provider_id AND p.is_active=1 WHERE p.id=? AND t.id=? AND c.is_active=1 ORDER BY c.sort_order,c.id",
      [provider, type],
    )
  )[0];
exports.matchingProviders = async (type, categories) => {
  const [rows] = await db.query(
    "SELECT CAST(p.id AS CHAR) id,p.name FROM svc_external_providers p JOIN svc_provider_categories pc ON pc.provider_id=p.id JOIN svc_categories c ON c.id=pc.category_id JOIN svc_service_types t ON t.id=c.service_type_id WHERE p.is_active=1 AND c.is_active=1 AND t.is_active=1 AND t.id=? AND c.id IN (?) GROUP BY p.id,p.name HAVING COUNT(DISTINCT c.id)=?",
    [type, categories, categories.length],
  );
  return rows;
};
