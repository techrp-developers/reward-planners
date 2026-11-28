// Development-only catalogue seed. Requires explicit opt-in and a local database.
const path = require("path");
const inheritedEnv = { ...process.env };
require("dotenv").config({ path: path.join(__dirname, "../.env") });
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.join(__dirname, "../.env.local"),
    override: true,
  });
  Object.assign(process.env, inheritedEnv);
}
const mysql = require("mysql2/promise");
const metadata = {
  CLEANING: {
    SPORTS_SHOE: ["sports-shoe", "Deep clean for sneakers and running shoes"],
    LEATHER_SHOE: [
      "leather-shoe",
      "Careful cleaning for formal and casual shoes",
    ],
    BAG_AND_BACKPACK: ["bag", "Handbags, school bags and backpacks"],
    JACKET: ["jacket", "Leather and fabric jackets"],
    SOFA: ["sofa", "Fabric and leather sofa cleaning"],
    HELMET: ["helmet", "Interior, exterior and sanitization"],
    TROLLEY_BAG: ["trolley", "Interior, exterior and wheels"],
    TOYS: ["toy", "Soft toys and stuffed animals"],
  },
  RESTORATION: {
    LEATHER_SHOE: [
      "leather-shoe",
      "Colour recovery, polish, scratches and cracks",
    ],
    LEATHER_BAG: ["bag", "Colour fading, scratches and shape recovery"],
    LEATHER_ACCESSORIES: ["accessory", "Wallets, belts and keychains"],
    LEATHER_JACKET: ["jacket", "Cracks, colour restoration and conditioning"],
    LEATHER_SOFA: ["sofa", "Cracks, fading, scratches and conditioning"],
  },
};
const types = {
  CLEANING: [
    "Sports Shoe",
    "Leather Shoe",
    "Bag & Backpack",
    "Jacket",
    "Sofa",
    "Helmet",
    "Trolley Bag",
    "Toys",
  ],
  RESTORATION: [
    "Leather Shoe",
    "Leather Bag",
    "Leather Accessories",
    "Leather Jacket",
    "Leather Sofa",
  ],
};
const conditions = [
  "DUST",
  "STAINS",
  "FADED_COLOUR",
  "SCRATCHES",
  "CRACKS_DAMAGE",
  "BAD_SMELL",
  "WATER_DAMAGE",
  "GENERAL_MAINTENANCE",
];
const label = (code) =>
  code
    .toLowerCase()
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
const options = (codes) =>
  JSON.stringify(codes.map((code) => ({ code, label: label(code) })));
const codeFor = (name) =>
  name
    .toUpperCase()
    .replace(/ & /g, "_AND_")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
async function main() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.EXTERNAL_SERVICES_SEED !== "1"
  )
    throw new Error(
      "Set NODE_ENV=development and EXTERNAL_SERVICES_SEED=1 to run this development seed.",
    );
  if (!["localhost", "127.0.0.1", "::1"].includes(process.env.DB_HOST))
    throw new Error("The database host must be local.");
  const allowedDatabases = ["rewardplanners_test", "rewardplanners_fk_test"];
  if (!allowedDatabases.includes(process.env.DB_NAME))
    throw new Error(
      "The development seed may only target rewardplanners_test or rewardplanners_fk_test.",
    );
  const dryRun = process.argv.includes("--dry-run");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    supportBigNumbers: true,
    bigNumberStrings: true,
  });
  let inTransaction = false;
  const write = async (sql, params) => {
    if (dryRun) {
      console.log(`${mysql.format(sql, params)};`);
      return;
    }
    await db.execute(sql, params);
  };
  try {
    const [[selectedDatabase]] = await db.execute(
      "SELECT DATABASE() databaseName",
    );
    if (selectedDatabase.databaseName !== process.env.DB_NAME)
      throw new Error("Connected database does not match DB_NAME.");
    if (!dryRun) {
      await db.beginTransaction();
      inTransaction = true;
    }
    await write(
      "INSERT INTO svc_external_providers (code,name,is_active) VALUES ('UNITED_SHINE','United Shine',1) ON DUPLICATE KEY UPDATE name=VALUES(name),is_active=1",
    );
    for (const [type, categories] of Object.entries(types)) {
      await write(
        "INSERT INTO svc_service_types (code, name, sort_order, is_active) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE name=VALUES(name), sort_order=VALUES(sort_order)",
        [type, label(type), type === "CLEANING" ? 1 : 2],
      );
      for (const [index, name] of categories.entries()) {
        const categoryCode = codeFor(name);
        const [iconKey, shortDescription] = metadata[type][categoryCode];
        await write(
          "INSERT INTO svc_categories (service_type_id, code, name, icon_key, short_description, sort_order, is_active) SELECT t.id, ?, ?, ?, ?, ?, 1 FROM svc_service_types t WHERE t.code=? ON DUPLICATE KEY UPDATE name=VALUES(name), icon_key=VALUES(icon_key), short_description=VALUES(short_description), sort_order=VALUES(sort_order)",
          [categoryCode, name, iconKey, shortDescription, index + 1, type],
        );
        await write(
          "INSERT IGNORE INTO svc_provider_categories (provider_id, category_id) SELECT p.id, c.id FROM svc_external_providers p JOIN svc_categories c JOIN svc_service_types t ON t.id=c.service_type_id WHERE p.code=? AND t.code=? AND c.code=?",
          ["UNITED_SHINE", type, categoryCode],
        );
        const treatments =
          type === "CLEANING"
            ? ["DEEP_CLEANING", "STAIN_REMOVAL", "ODOUR_REMOVAL"]
            : ["COLOUR_RESTORATION", "REPAIR", "CONDITIONING"];
        const detail = name.includes("Sofa")
          ? ["seat_count", "Seat Count", "NUMBER"]
          : name.includes("Shoe")
            ? ["shoe_size", "Shoe Size", "TEXT"]
            : name === "Helmet"
              ? ["helmet_type", "Helmet Type", "TEXT"]
              : ["material", "Material", "TEXT"];
        const fields = [
          ["treatment", "Treatment", "MULTI_SELECT", options(treatments), 1],
          ["condition", "Condition", "MULTI_SELECT", options(conditions), 1],
          [...detail, null, 0],
        ];
        for (const [order, field] of fields.entries()) {
          const fieldGroup = ["TREATMENT", "CONDITION", "DETAILS"][order];
          const helpText =
            order === 0
              ? "Select the service needed."
              : order === 1
                ? "Select all conditions you have noticed."
                : "Add details about the item.";
          await write(
            "INSERT INTO svc_category_fields (category_id, field_key, label, input_type, options_json, is_required, field_group, help_text, sort_order, is_active) SELECT c.id, ?, ?, ?, ?, ?, ?, ?, ?, 1 FROM svc_categories c JOIN svc_service_types t ON t.id=c.service_type_id WHERE t.code=? AND c.code=? ON DUPLICATE KEY UPDATE label=VALUES(label), input_type=VALUES(input_type), options_json=VALUES(options_json), is_required=VALUES(is_required), field_group=VALUES(field_group), help_text=VALUES(help_text), sort_order=VALUES(sort_order)",
            [...field, fieldGroup, helpText, order + 1, type, categoryCode],
          );
        }
      }
    }
    if (!dryRun) {
      await db.commit();
      inTransaction = false;
      console.log("External services development catalogue seeded.");
    } else {
      console.log(
        `Dry run only. No writes were made to ${selectedDatabase.databaseName}.`,
      );
    }
  } catch (error) {
    if (inTransaction) await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}
main().catch((error) => {
  console.error("Catalogue seed failed:", error.code || error.message);
  process.exitCode = 1;
});
