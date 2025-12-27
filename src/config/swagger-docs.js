// src/config/swagger.js
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const routesPath = path.resolve(__dirname, "../routes/**/*.js");
console.log("🔍 Swagger scanning routes from:", routesPath);

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Gas-chahye complete backend Mvp V1",
      version: "1.0.0",
      description:
        "Seller management API documentation for Gas Cylinder Booking Platform",
      contact: {
        name: "API Support",
        email: "support@totalaccess.com",
      },
    },
    servers: [
      { url: "https://gaschahye-backend-production.up.railway.app/api", description: "Development server" },
        { url: "http://localhost:8080/api", description: "Local server" },
      { url: "https://api.totalaccess.com", description: "Production server" },
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
  },
  apis: [routesPath],
};

const swaggerSpec = swaggerJsdoc(options);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api-docs.json", (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
  console.log("✅ Swagger docs available at http://localhost:5000/api-docs");
}

module.exports = swaggerDocs;
