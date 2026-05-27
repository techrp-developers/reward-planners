const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Reward Planners API",
      version: "1.0.0",
      description: "Reward Planners Backend APIs",
    },

    servers: [
      {
        url: process.env.CLIENT_URL || "http://localhost:5000",
      },
    ],

    tags: [
      { name: "Auth", description: "Authentication, token, and user endpoints" },
      { name: "Addresses", description: "User address management" },
      { name: "User", description: "User profile and optional auth endpoints" },
      { name: "Settings", description: "Application and company settings" },
      { name: "Support", description: "Support ticket endpoints" },
      { name: "Terms", description: "Terms and privacy endpoints" },
      { name: "Todo", description: "User todo management" },
      { name: "Notification", description: "Notifications and read status" },
      { name: "Wallet", description: "User wallet and transactions" },

      { name: "Checkout", description: "Ecommerce checkout flows" },
      { name: "Cart", description: "Ecommerce cart operations" },
      { name: "Orders", description: "Order history and cancellations" },
      { name: "Products", description: "Product listing and search" },
      { name: "Wishlist", description: "Wishlist management" },
      { name: "Reviews", description: "Product review endpoints" },

      // Service module tags (kept together)
      { name: "Service Category", description: "Service category management" },
      { name: "Services", description: "Services management" },
      { name: "Service Documents", description: "Service documents" },
      { name: "Variants", description: "Service variant management" },
      { name: "Bundles", description: "Service bundles" },
      { name: "Orders", description: "Service orders" },

      { name: "Step Counter", description: "Fitness profile and stats" },

      { name: "BBPS Payments", description: "Payment order and verification" },
      { name: "BBPS Bills", description: "Bill fetch and operator endpoints" },

      { name: "Games", description: "Game sessions and leaderboards" },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },

    security: [
      {
        bearerAuth: [],
      },
    ],
  },

  apis: [
    "./routes/*.js",
    "./app/**/routes/*.js",
    "./swagger/service-v1.yaml",
    "./swagger/app-v1.yaml",
    // "./mps-connect/**/routes/*.js",
  ],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;