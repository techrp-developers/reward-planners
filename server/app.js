// app.js
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./config/swagger");

require("dotenv").config();
require("./services/ExpressBees/cron/shipmentCron");
require("./services/Bbps/retryCron");
require("./services/Bbps/refundCron");
require("./services/Razorpay/retryCron");
require("./services/Maintenance/maintenanceCron");
require("./services/Razorpay/orderExpiryCron");

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

app.use(
  cors({
    origin: "http://localhost:5173",
    // origin: process.env.CLIENT_URL || "https://rewardplanners.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(morgan("dev"));

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
  console.log("=================================\n");

  // ✅ Start worker inside same process (only when enabled)
  if (process.env.START_WA_WORKER === "true") {
    require("./services/whatsapp/waWorker");
    console.log("✅ WhatsApp worker started (START_WA_WORKER=true)");
  }
});
