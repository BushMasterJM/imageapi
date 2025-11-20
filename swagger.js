import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Image API",
      version: "1.0.0",
      description: "REST API for uploading, downloading, and deleting images",
    },
  },
  apis: ["./index.js"], // we'll add JSDoc comments to endpoints
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
