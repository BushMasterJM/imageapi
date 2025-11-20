export default {
  openapi: "3.0.0",
  info: {
    title: "Image API",
    version: "1.0.0",
    description: "Upload, resize, download, and delete images",
  },
  servers: [{ url: "http://localhost:8080" }],
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
              },
            },
          },
        },
        responses: {
          200: { description: "Upload successful" },
          400: { description: "Invalid request" },
        },
      },
    },
    "/image/{id}/{variant}": {
      get: {
        summary: "Get an image (optional variant)",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "variant", in: "path", required: false, schema: { type: "string" } },
        ],
        responses: { 200: { description: "Returns image" }, 404: { description: "Not found" } },
      },
    },
    "/image/{id}": {
      delete: {
        summary: "Delete image and all variants",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { 200: { description: "Deleted" }, 500: { description: "Error" } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
  },
};
