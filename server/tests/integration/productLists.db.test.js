// All products, new arrivals and most viewed against a real, DISPOSABLE MySQL
// database, with the server's sql_mode (ONLY_FULL_GROUP_BY on).
//
//   npm run test:product-lists:db
//
// Creates rp_test_pl_<random>, copies only table STRUCTURE (and recreates the
// offer view), seeds synthetic products and drops the database afterwards.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const path = require("node:path");

const SERVER = path.join(__dirname, "../..");
require("dotenv").config({ path: path.join(SERVER, ".env"), quiet: true });
const mysql = require("mysql2/promise");

const ENABLED = process.env.RP_DISPOSABLE_DB_TESTS === "1" || process.env.npm_lifecycle_event === "test:product-lists:db";
const SOURCE_DB = process.env.DB_NAME || "rewardplanners_db";
const TEST_DB = `rp_test_pl_${crypto.randomBytes(4).toString("hex")}`;
const TABLES = ["eproducts", "product_variants", "product_images", "product_reviews", "categories", "sub_categories", "sub_sub_categories",
  "recently_viewed", "campaigns", "campaign_items", "content_zone_entries", "content_zone_entry_images", "content_product_offers",
  "product_reward_settings", "reward_rules", "customer_wallet", "reward_event_log", "eorders", "eorder_items", "wallet_transactions"];
const VIEWS = ["content_effective_product_offers"];
const SAFE_NAME = /^rp_test_pl_[0-9a-f]{8}$/;

if (!ENABLED) {
  test("disposable-database product list tests", { skip: "set RP_DISPOSABLE_DB_TESTS=1 (npm run test:product-lists:db)" }, () => {});
} else {
  let admin;
  let db;
  let ProductModel;

  test.before(async () => {
    assert.match(TEST_DB, SAFE_NAME);
    assert.notEqual(TEST_DB, SOURCE_DB);
    admin = await mysql.createConnection({
      host: process.env.DB_HOST || "localhost", port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER || "root", password: process.env.DB_PASSWORD || "", multipleStatements: false,
    });
    await admin.query(`CREATE DATABASE \`${TEST_DB}\` CHARACTER SET utf8mb4`);
    for (const table of TABLES) await admin.query(`CREATE TABLE \`${TEST_DB}\`.\`${table}\` LIKE \`${SOURCE_DB}\`.\`${table}\``);
    await admin.query(`USE \`${TEST_DB}\``);
    for (const view of VIEWS) {
      const [[row]] = await admin.query(`SHOW CREATE VIEW \`${SOURCE_DB}\`.\`${view}\``);
      const ddl = row["Create View"]
        .replace(/^CREATE ALGORITHM=\w+ DEFINER=\S+ SQL SECURITY \w+ VIEW/, "CREATE SQL SECURITY INVOKER VIEW")
        .replaceAll(`\`${SOURCE_DB}\`.`, "");
      await admin.query(ddl);
    }

    await admin.query("INSERT INTO categories (category_id, category_name, status, is_visible_in_ui) VALUES (50, 'Kitchen', 1, 1)");
    await admin.query("INSERT INTO sub_categories (subcategory_id, category_id, subcategory_name, status) VALUES (60, 50, 'Toasters', 1)");
    await admin.query("INSERT INTO sub_sub_categories (sub_subcategory_id, subcategory_id, name, status) VALUES (70, 60, 'Pop-up', 1)");
    // 101: several variants (a hidden cheaper one, two equal cheapest) and three images.
    // 102: no images. 103: no visible priced variant. 104: hidden. 105: flea-market quick create.
    // 106/107: same created_at, to pin the tie-break.
    await admin.query(
      `INSERT INTO eproducts (product_id, vendor_id, product_name, brand_name, category_id, subcategory_id, sub_subcategory_id, status, is_visible, is_searchable, is_deleted, created_via, created_at) VALUES
       (101, 1, 'Toaster Pro', 'Acme', 50, 60, 70, 'approved', 1, 1, 0, 'standard', '2026-01-05 10:00:00'),
       (102, 1, 'Kettle', 'Acme', 50, 60, 70, 'approved', 1, 1, 0, 'standard', '2026-01-04 10:00:00'),
       (103, 1, 'No Price', 'Acme', 50, 60, 70, 'approved', 1, 1, 0, 'standard', '2026-01-03 10:00:00'),
       (104, 1, 'Hidden', 'Acme', 50, 60, 70, 'approved', 0, 1, 0, 'standard', '2026-01-06 10:00:00'),
       (105, 1, 'Flea', 'Acme', 50, 60, 70, 'approved', 1, 1, 0, 'flea_market_quick_create', '2026-01-07 10:00:00'),
       (106, 1, 'Twin A', 'Acme', 50, 60, 70, 'approved', 1, 1, 0, 'standard', '2026-01-01 10:00:00'),
       (107, 1, 'Twin B', 'Acme', 50, 60, 70, 'approved', 1, 1, 0, 'standard', '2026-01-01 10:00:00')`,
    );
    await admin.query(
      `INSERT INTO product_variants (variant_id, product_id, variant_attributes, mrp, sale_price, is_visible) VALUES
       (11, 101, '{}', 400, 300, 1), (12, 101, '{}', 450, 300, 1), (13, 101, '{}', 600, 500, 1), (14, 101, '{}', 200, 100, 0), (15, 101, '{}', 90, NULL, 1),
       (21, 102, '{}', 80, 50, 1), (31, 103, '{}', 80, NULL, 1), (41, 104, '{}', 80, 50, 1), (51, 105, '{}', 80, 50, 1),
       (61, 106, '{}', 80, 60, 1), (71, 107, '{}', 80, 70, 1)`,
    );
    await admin.query(
      `INSERT INTO product_images (image_id, product_id, image_url, type, sort_order, updated_at) VALUES
       (903, 101, 'p/101-c.jpg', 'gallery', 2, '2026-01-05 10:00:00'),
       (902, 101, 'p/101-b.jpg', 'gallery', 1, '2026-01-05 10:00:00'),
       (901, 101, 'p/101-a.jpg', 'banner', 0, '2026-01-05 10:00:00'),
       (961, 106, 'p/106.jpg', 'gallery', 0, '2026-01-01 10:00:00')`,
    );
    await admin.query(
      `INSERT INTO product_reviews (user_id, product_id, variant_id, order_id, rating, status) VALUES
       (1, 101, 11, 1, 4, 'approved'), (2, 101, 11, 2, 5, 'approved'), (3, 101, 11, 3, 1, 'rejected')`,
    );
    // Views in the last 30 days: 102 x3, 101 x2 (three images, so a joined count would read 6), 106 x2, 104 x9 (hidden).
    await admin.query(
      `INSERT INTO recently_viewed (user_id, product_id, viewed_at) VALUES
       (1, 102, NOW()), (2, 102, NOW()), (3, 102, NOW()), (1, 101, NOW()), (2, 101, NOW()), (1, 106, NOW()), (2, 106, NOW()),
       (1, 104, NOW()), (2, 104, NOW()), (3, 104, NOW()), (4, 104, NOW()), (5, 104, NOW()), (6, 104, NOW()), (7, 104, NOW()), (8, 104, NOW()), (9, 104, NOW()),
       (5, 107, NOW() - INTERVAL 60 DAY)`,
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

  test("runs under ONLY_FULL_GROUP_BY", async () => {
    const [[{ mode }]] = await db.query("SELECT @@SESSION.sql_mode AS mode");
    assert.match(mode, /ONLY_FULL_GROUP_BY/);
  });

  test("all products: one row each, cheapest visible variant, ordered images, approved reviews", async () => {
    const { products, totalItems } = await ProductModel.getAllProducts({ sortBy: "created_at", sortOrder: "DESC", limit: 10, offset: 0 });
    // Listed and searchable, not hidden or flea-market; products without a priced variant are still listed.
    assert.deepEqual(products.map((p) => p.product_id), [101, 102, 103, 107, 106]);
    assert.equal(totalItems, 5);
    const toaster = products[0];
    assert.deepEqual([toaster.variant_id, Number(toaster.mrp), Number(toaster.sale_price)], [11, 400, 300], "equal prices: lower variant id");
    assert.deepEqual(toaster.images.map((i) => i.image_id), [901, 902, 903]);
    assert.deepEqual(toaster.images[0], { image_id: 901, image_url: "p/101-a.jpg", type: "banner", sort_order: 0, updated_at: "2026-01-05 10:00:00" });
    assert.deepEqual([toaster.rating, toaster.reviews], ["4.5", 2]);
    assert.deepEqual(products[1].images, []);
    assert.equal(products[2].variant_id, null);
  });

  test("all products: pages are stable and search still filters", async () => {
    const pages = [];
    for (let offset = 0; offset < 5; offset += 2) pages.push(...(await ProductModel.getAllProducts({ sortBy: "created_at", sortOrder: "DESC", limit: 2, offset })).products.map((p) => p.product_id));
    assert.deepEqual(pages, [101, 102, 103, 107, 106]);
    const searched = await ProductModel.getAllProducts({ search: "Twin", sortBy: "product_name", sortOrder: "ASC", limit: 10, offset: 0 });
    assert.deepEqual(searched.products.map((p) => p.product_id), [106, 107]);
    assert.equal(searched.totalItems, 2);
  });

  test("new arrivals: newest first, one row each, the chosen variant's prices and first image", async () => {
    const rows = await ProductModel.getNewArrivals(10, 0, "");
    // 103 has no visible priced variant; 104 is hidden; 105 is a flea-market product.
    assert.deepEqual(rows.map((r) => r.product_id), [101, 102, 107, 106]);
    const toaster = rows[0];
    assert.deepEqual([toaster.variant_id, toaster.price, toaster.originalPrice, toaster.discount], [11, "₹300.00", "₹400.00", "25%"]);
    assert.match(toaster.image, /\/p\/101-a\.jpg/, "first image by sort order");
    assert.deepEqual([toaster.rating, toaster.reviews], ["4.5", 2]);
    assert.equal(rows[1].image, null);
    assert.deepEqual((await ProductModel.getNewArrivals(1, 2, "")).map((r) => r.product_id), [107]);
    assert.deepEqual((await ProductModel.getNewArrivals(10, 0, "Kettle")).map((r) => r.product_id), [102]);
  });

  test("most viewed: views are counted once per view, not per image, and only listed products count", async () => {
    const rows = await ProductModel.getMostViewedProducts(10, 0, 30, "");
    assert.deepEqual(rows.map((r) => [r.product_id, Number(r.view_count)]), [[102, 3], [101, 2], [106, 2]],
      "101 has three images; joined counting would have ranked it first with 6");
    const toaster = rows[1];
    assert.deepEqual([toaster.variant_id, toaster.price], [11, "₹300.00"]);
    assert.match(toaster.image, /\/p\/101-a\.jpg/);
    assert.deepEqual((await ProductModel.getMostViewedProducts(10, 0, 90, "")).map((r) => r.product_id), [102, 101, 106, 107], "a longer window includes older views");
    assert.deepEqual((await ProductModel.getMostViewedProducts(1, 1, 30, "")).map((r) => r.product_id), [101]);
    assert.deepEqual((await ProductModel.getMostViewedProducts(10, 0, 30, "Twin")).map((r) => r.product_id), [106]);
  });

  /* ---------- top rated and best sellers ---------- */

  test("top rated: at least three approved reviews, counted once each, best average first", async () => {
    // 101 already has 2 approved + 1 rejected review and three images: the old join counted 6 and let it in.
    await admin.query(
      `INSERT INTO product_reviews (user_id, product_id, variant_id, order_id, rating, status) VALUES
       (11, 102, 21, 11, 5, 'approved'), (12, 102, 21, 12, 5, 'approved'), (13, 102, 21, 13, 4, 'approved'),
       (14, 106, 61, 14, 5, 'approved'), (15, 106, 61, 15, 5, 'approved'), (16, 106, 61, 16, 4, 'approved'), (17, 106, 61, 17, 4, 'approved'),
       (18, 107, 71, 18, 5, 'approved'), (19, 107, 71, 19, 4, 'approved'), (20, 107, 71, 20, 5, 'approved'),
       (21, 104, 41, 21, 5, 'approved'), (22, 104, 41, 22, 5, 'approved'), (23, 104, 41, 23, 5, 'approved')`,
    );
    const rows = await ProductModel.getTopRatedProducts(10, 0, "");
    // 102 and 107 tie on 4.67 with 3 reviews each: lower product id first. 104 is hidden.
    assert.deepEqual(rows.map((r) => [r.product_id, r.rating, Number(r.reviews)]), [[102, "4.7", 3], [107, "4.7", 3], [106, "4.5", 4]]);
    assert.ok(!rows.some((r) => r.product_id === 101), "two approved reviews do not qualify, whatever the image count");
    assert.match(rows[2].image, /\/p\/106\.jpg/);
    assert.deepEqual((await ProductModel.getTopRatedProducts(1, 1, "")).map((r) => r.product_id), [107]);
    assert.deepEqual((await ProductModel.getTopRatedProducts(10, 0, "Twin")).map((r) => r.product_id), [107, 106]);
    assert.deepEqual(await ProductModel.getTopRatedProducts(10, 0, "nothing-matches"), []);
  });

  test("best sellers: eligible orders in the window, quantities summed once, stable ranking", async () => {
    await admin.query(
      `INSERT INTO eorders (order_id, order_ref, user_id, total_amount, status, created_at) VALUES
       (1, 'O1', 1, 0, 'paid', NOW()), (2, 'O2', 1, 0, 'delivered', NOW()), (3, 'O3', 1, 0, 'cancelled', NOW()), (4, 'O4', 1, 0, 'paid', NOW() - INTERVAL 60 DAY)`,
    );
    await admin.query(
      `INSERT INTO eorder_items (order_id, vendor_order_id, product_id, variant_id, quantity, price) VALUES
       (1, 1, 101, 11, 2, 300), (2, 2, 101, 12, 1, 300), (1, 1, 102, 21, 3, 50),
       (3, 3, 106, 61, 5, 60), (4, 4, 107, 71, 4, 70), (1, 1, 104, 41, 9, 50)`,
    );
    const rows = await ProductModel.getBestSellers(10, 0, 30, "");
    // 101: 2 + 1 across two orders, three images (a joined sum would read 9); ties 102 on 3 -> lower id first.
    // 106 only in a cancelled order, 107 only outside 30 days, 104 hidden.
    assert.deepEqual(rows.map((r) => [r.product_id, Number(r.total_sold)]), [[101, 3], [102, 3]]);
    assert.deepEqual([rows[0].variant_id, rows[0].price], [11, "₹300.00"], "the product's cheapest visible variant, not the one ordered");
    assert.match(rows[0].image, /\/p\/101-a\.jpg/);
    assert.deepEqual((await ProductModel.getBestSellers(10, 0, 90, "")).map((r) => r.product_id), [107, 101, 102]);
    assert.deepEqual((await ProductModel.getBestSellers(1, 1, 30, "")).map((r) => r.product_id), [102]);
    assert.deepEqual((await ProductModel.getBestSellers(10, 0, 30, "Kettle")).map((r) => r.product_id), [102]);
  });

  /* ---------- wallet transactions ---------- */

  test("wallet transactions page with numeric or string page/limit, filtered by type", async () => {
    const WalletModel = require(path.join(SERVER, "app/common/models/walletModel"));
    await admin.query(
      `INSERT INTO wallet_transactions (transaction_id, user_id, title, transaction_type, coins, created_at) VALUES
       (1, 9, 'Order reward', 'credit', 10, NOW()), (2, 9, 'Redeemed', 'debit', 5, NOW()), (3, 9, 'Steps reward', 'credit', 7, NOW()),
       (4, 9, 'Quiz reward', 'credit', 3, NOW()), (5, 8, 'Other user', 'credit', 99, NOW())`,
    );
    assert.deepEqual((await WalletModel.getWalletTransactions(9, "credit", 1, 50)).map((t) => t.transaction_id), [4, 3, 1]);
    assert.deepEqual((await WalletModel.getWalletTransactions(9, "debit", "1", "50")).map((t) => t.transaction_id), [2]);
    assert.deepEqual((await WalletModel.getWalletTransactions(9, "all", "2", "2")).map((t) => t.transaction_id), [2, 1], "page 2 of 2");
    assert.deepEqual(await WalletModel.getWalletTransactions(9, "credit", "abc", "-5"), (await WalletModel.getWalletTransactions(9, "credit", 1, 1)), "bad paging falls back safely");
  });
}
