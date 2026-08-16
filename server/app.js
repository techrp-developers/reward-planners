// app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

// Initialize Quiz Game DB Tables
// const setupQuizDB = require("./config/setupQuizDB");
// const setupTodoReminderDB = require("./config/setupTodoReminderDB");
// setupQuizDB();
// setupTodoReminderDB();

require("dotenv").config();
require("./services/ExpressBees/cron/shipmentCron");
require("./services/Bbps/retryCron");
require("./services/Bbps/refundCron");
require("./services/Razorpay/retryCron");
require("./services/Maintenance/maintenanceCron");
require("./services/Razorpay/orderExpiryCron");
require("./services/Todo/todoReminderCron");
require("./services/Todo/birthdayReminderCron");
require("./services/Ecommerce/cartRecoveryCron");
require("./services/Todo/fitnessGoalHookCron");
require("./services/Todo/accountPurgeCron");
// require("./services/Todo/checkoutAbandonmentCron");
// require("./services/Todo/serviceCartRecoveryCron");
// require("./services/Bbps/billDueReminderCron");



// dashboard Route
const dashboardRoute = require("./routes/indexRoute");

// web hook Route
const webhook = require("./utils/orchestratorWebhook");

// App Route
const ecommerceRoute = require("./app/ecommerce/v1/routes/indexRoute");
const commonRoute = require("./app/common/routes/indexRoute");
const serviceRoute = require("./app/service/v1/routes/indexRoute");
const stepCounterRoute = require("./app/step-counter/v1/routes/indexRoute");
const bbpsRoute = require("./app/bbps/v1/routes/indexRoute");
const gamesRoute = require("./app/games/v1/routes/indexRoute");

//External Routes
const mpsRoute = require("./mps-connect/common/routes/indexRoute");

// Flea Market Route
const fleaMarketRoute = require("./flea-market/routes/indexRoute");

const app = express();

const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

// Middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

// CLIENT_URL supports a comma-separated list so staging/local/LAN origins
// (e.g. a tablet hitting the LAN IP of the dev machine) can all be allowed
// without hardcoding a single origin.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;

  if (process.env.NODE_ENV !== "production") {
    try {
      const { hostname } = new URL(origin);
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false;
    }
  }

  return false;
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser requests (curl/Postman/server-to-server) that send no Origin header.
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Location-Id",
      "X-Session-Token",
      "Idempotency-Key",
      "X-CSRF-Token",
    ],
  }),
);

app.use(morgan("dev"));

// Every response produced by this application is dynamic API data. Never let
// a browser, reverse proxy, or CDN reuse one user's authenticated response for
// another request. Static frontend assets are served by the web server, not by
// this Express application.
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("CDN-Cache-Control", "no-store");
  res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
  res.setHeader("Surrogate-Control", "no-store");
  next();
});

// webhook use
app.post(
  "/payment/webhook",
  express.raw({ type: "*/*" }),
  webhook.handleWebhook,
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Maintenance middleware
app.use(require("./middleware/maintenance"));

app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    explorer: true,
    docExpansion: "full",
    defaultModelsExpandDepth: -1,
  }),
);

if (process.env.NODE_ENV !== "production") {
  app.use("/api/wa", require("./routes/waTestRoute"));
}
// Serve uploads folder
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Base route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Reward Planners Backend is running!",
    timestamp: new Date().toISOString(),
  });
});

// Dashboard Routes
app.use("/", dashboardRoute);

// App Routes
app.use("/v1", ecommerceRoute);
app.use("/v1", serviceRoute);
app.use("/v1", stepCounterRoute);
app.use("/v1", commonRoute);
app.use("/v1", bbpsRoute);
app.use("/v1", gamesRoute);

// External App Routes
app.use("/mps", mpsRoute);

// Flea Market Routes
app.use(
  "/",
  (req, res, next) => {
    // API responses (especially deployment-time 404s) must never be cached by
    // Cloudflare, otherwise a newly deployed route can keep appearing missing.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Cloudflare-CDN-Cache-Control", "no-store");
    res.setHeader("Surrogate-Control", "no-store");
    next();
  },
  fleaMarketRoute,
);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
  });
});

// Global Error Handler
app.use((error, req, res, next) => {
  console.error("Unhandled Error:", error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  });
});

// Start Server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log("\n=================================");
  console.log("Reward Planners Backend Started!");
  console.log(`🔗 Server URL: http://localhost:${PORT}`);
  console.log(`Swagger docs at http://localhost:${PORT}/api-docs`);
  console.log(`Flea Market API ready at http://localhost:${PORT}`);
  console.log("CORS allowed origins (parsed):", allowedOrigins);
  console.log("=================================\n");

  // ✅ Start worker inside same process (only when enabled)
  if (process.env.START_WA_WORKER === "true") {
    require("./services/whatsapp/waWorker");
    console.log("✅ WhatsApp worker started (START_WA_WORKER=true)");
  }
});
