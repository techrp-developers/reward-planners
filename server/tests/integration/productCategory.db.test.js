// Category product listing against a real, DISPOSABLE MySQL database.
//
//   npm run test:product-category:db
//
// Creates rp_test_pc_<random>, copies only the STRUCTURE of the tables the
// query reads, seeds synthetic products and drops the database afterwards.
// Runs with the server's sql_mode, which includes ONLY_FULL_GROUP_BY.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const SERVER = path.join(__dirname, "../..");
require("dotenv").config({ path: path.join(SERVER, ".env"), quiet: true });
const mysql = require("mysql2/promise");

const ENABLED = process.env.RP_DISPOSABLE_DB_TESTS === "1" || process.env.npm_lifecycle_event === "test:product-category:db";
const SOURCE_DB = process.env.DB_NAME || "rewardplanners_db";
const TEST_DB = `rp_test_pc_${crypto.randomBytes(4).toString("hex")}`;
const TABLES = ["eproducts", "product_variants", "product_images", "product_reviews", "categories", "sub_categories", "sub_sub_categories"];
const SAFE_NAME = /^rp_test_pc_[0-9a-f]{8}$/;

if (!ENABLED) {
  test("disposable-database category listing tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1 (npm run test:product-category:db)" }, () => {});
} else {
  let admin;
  let db;
  let ProductModel;

  const list = (args = {}) => ProductModel.getProductsByCategory({
    sortBy: "created_at", sortOrder: "DESC", limit: 10, offset: 0, categoryId: 50, ...args,
  });

  test.before(async () => {
    assert.match(TEST_DB, SAFE_NAME);
    assert.notEqual(TEST_DB, SOURCE_DB);
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      multipleStatements: false,
    });
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    for (const table of TABLES) {
      await admin.query(`CREATE TABLE \`${TEST_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
    }
    await admin.query(`USE \`${TEST_DB}\``);
    await admin.query(`INSERT INTO categories (category_id, category_name) VALUES (50, 'Kitchen'), (51, 'Other')`);
    await admin.query(`INSERT INTO sub_categories (subcategory_id, category_id, subcategory_name) VALUES (60, 50, 'Toasters')`);
    await admin.query(`INSERT INTO sub_sub_categories (sub_subcategory_id, subcategory_id, name) VALUES (70, 60, 'Pop-up')`);
    // 101: several variants and images. 102: no images. 103: no visible priced
    // variant. 104: hidden product. 105: other category. 106/107: same
    // created_at as each other, to pin the pagination tie-break.
    await admin.query(
      `INSERT INTO eproducts (product_id, vendor_id, product_name, brand_name, category_id, subcategory_id, sub_subcategory_id, status, is_visible, is_deleted, created_at) VALUES
       (101, 1, 'Toaster Pro', 'Acme', 50, 60, 70, 'approved', 1, 0, '2026-01-05 10:00:00'),
       (102, 1, 'Kettle', 'Acme', 50, NULL, NULL, 'approved', 1, 0, '2026-01-04 10:00:00'),
       (103, 1, 'No Price', 'Acme', 50, NULL, NULL, 'approved', 1, 0, '2026-01-03 10:00:00'),
       (104, 1, 'Hidden', 'Acme', 50, NULL, NULL, 'approved', 0, 0, '2026-01-02 10:00:00'),
       (105, 1, 'Elsewhere', 'Acme', 51, NULL, NULL, 'approved', 1, 0, '2026-01-02 10:00:00'),
       (106, 1, 'Twin A', 'Acme', 50, NULL, NULL, 'approved', 1, 0, '2026-01-01 10:00:00'),
       (107, 1, 'Twin B', 'Acme', 50, NULL, NULL, 'approved', 1, 0, '2026-01-01 10:00:00')`,
    );
    await admin.query(
      `INSERT INTO product_variants (variant_id, product_id, variant_attributes, mrp, sale_price, is_visible) VALUES
       (11, 101, '{}', 400, 300, 1),
       (12, 101, '{}', 450, 300, 1),
       (13, 101, '{}', 600, 500, 1),
       (14, 101, '{}', 200, 100, 0),
       (15, 101, '{}', 90, NULL, 1),
       (21, 102, '{}', 80, 50, 1),
       (31, 103, '{}', 80, NULL, 1),
       (41, 104, '{}', 80, 50, 1),
       (51, 105, '{}', 80, 50, 1),
       (61, 106, '{}', 80, 60, 1),
       (71, 107, '{}', 80, 70, 1)`,
    );
    await admin.query(
      `INSERT INTO product_images (image_id, product_id, image_url, type, sort_order, updated_at) VALUES
       (903, 101, 'p/101-c.jpg', 'gallery', 2, '2026-01-05 10:00:00'),
       (902, 101, 'p/101-b.jpg', 'gallery', 1, '2026-01-05 10:00:00'),
       (901, 101, 'p/101-a.jpg', 'banner', 0, '2026-01-05 10:00:00'),
       (904, 101, 'p/101-d.jpg', 'gallery', 1, '2026-01-05 10:00:00')`,
    );
    await admin.query(
      `INSERT INTO product_reviews (user_id, product_id, variant_id, order_id, rating, status) VALUES
       (1, 101, 11, 1, 4, 'approved'),
       (2, 101, 11, 2, 5, 'approved'),
       (3, 101, 11, 3, 1, 'rejected')`,
    );

    process.env.DB_NAME = TEST_DB;
    db = require(path.join(SERVER, "config/database"));
    ProductModel = require(path.join(SERVER, "app/ecommerce/v1/models/productModel"));
  });

  test.after(async () => {
    await db?.end().catch(() => {});
    if (admin) {
      if (SAFE_NAME.test(TEST_DB)) await admin.query(`DROP DATABASE IF EXISTS \`${TEST_DB}\``);
      await admin.end();
    }
  });

  test("runs under ONLY_FULL_GROUP_BY with numeric limit/offset, as the controller passes them", async () => {
    const [[{ mode }]] = await db.query("SELECT @@SESSION.sql_mode AS mode");
    assert.match(mode, /ONLY_FULL_GROUP_BY/);
    const result = await list();
    assert.equal(result.category_name, "Kitchen");
    assert.equal(result.totalItems, 4);
  });

  test("each product appears once, newest first, with only visible priced products of the category", async () => {
    const { products } = await list();
    assert.deepEqual(products.map((p) => p.product_id), [101, 102, 107, 106]);
  });

  test("the cheapest visible variant is chosen, the lower variant id on equal prices", async () => {
    const toaster = (await list()).products.find((p) => p.product_id === 101);
    assert.equal(toaster.variant_id, 11);
    assert.equal(Number(toaster.mrp), 400);
    assert.equal(Number(toaster.sale_price), 300);
  });

  test("images keep sort order (image id on ties), and a product without images has none", async () => {
    const { products } = await list();
    const toaster = products.find((p) => p.product_id === 101);
    assert.deepEqual(toaster.images.map((i) => i.image_id), [901, 902, 904, 903]);
    assert.deepEqual(toaster.images[0], { image_id: 901, image_url: "p/101-a.jpg", type: "banner", sort_order: 0, updated_at: "2026-01-05 10:00:00" });
    assert.deepEqual(products.find((p) => p.product_id === 102).images, []);
  });

  test("review fields count approved reviews only", async () => {
    const toaster = (await list()).products.find((p) => p.product_id === 101);
    assert.equal(toaster.avg_rating, "4.5");
    assert.equal(toaster.rating_count, 2);
  });

  test("pages are stable and cover every product once, even with equal created_at", async () => {
    const pages = [];
    for (let offset = 0; offset < 4; offset += 2) pages.push(...(await list({ limit: 2, offset })).products.map((p) => p.product_id));
    assert.deepEqual(pages, [101, 102, 107, 106]);
  });

  test("price and rating filters, and the total uses the same filters", async () => {
    const priced = await list({ priceMin: 55, priceMax: 400 });
    assert.deepEqual(priced.products.map((p) => p.product_id), [101, 107, 106]);
    assert.equal(priced.totalItems, 3);
    const rated = await list({ ratingMin: 4 });
    assert.deepEqual(rated.products.map((p) => p.product_id), [101]);
    assert.equal(rated.totalItems, 1);
  });

  test("collection products by id keep the requested order and drop unlisted ids", async () => {
    const rows = await ProductModel.getListedProductsByIds([107, 104, 999, 101, 103, 105]);
    // 104 hidden, 999 unknown, 103 has no visible priced variant; 105 is listed in another category.
    assert.deepEqual(rows.map((row) => row.product_id), [107, 101, 105]);
    const toaster = rows.find((row) => row.product_id === 101);
    assert.equal(toaster.variant_id, 11);
    assert.equal(Number(toaster.final_price), 300);
    assert.equal(toaster.image_url, "p/101-b.jpg"); // first gallery image by id, as campaign products use
  });
}
