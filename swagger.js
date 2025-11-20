const swaggerDocument = {
  openapi: "3.0.3",
  info: {
    title: "Image API",
    version: "1.0.0",
    description: "Upload, download, and delete images on DigitalOcean Spaces",
  },
  servers: [{ url: "http://localhost:8080", description: "Local server" }],
  paths: {
    "/upload": {
      post: {
        summary: "Upload an image",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  file: { type: "string", format: "binary" },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          200: { description: "Upload successful" },
          400: { description: "Bad request" },
          401: { description: "Unauthorized" },
        },
      },
    },
    "/image/{id}": {
      get: {
        summary: "Download image",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Image returned" },
          404: { description: "Not found" },
        },
      },
      delete: {
        summary: "Delete image",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          200: { description: "Deleted successfully" },
          401: { description: "Unauthorized" },
          500: { description: "Delete failed" },
        },
      },
    },
    "/metrics/uploads": {
      get: {
        summary: "Get upload metrics",
        security: [{ bearerAuth: [] }],
        responses: {
          200: { description: "Returns metrics" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};

export default swaggerDocument;
