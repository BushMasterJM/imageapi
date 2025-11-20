import express from "express";
import fileUpload from "express-fileupload";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { pipeline } from "stream";
import { promisify } from "util";
import fs from "fs";
import { v4 as uuid } from "uuid";
import jwt from "jsonwebtoken";
import swaggerUi from "swagger-ui-express";
import swaggerDocument from "./swagger.js";

const app = express();
const pipe = promisify(pipeline);

const uploadMetrics = [];
const deletedImages = [];

// Auth Middleware
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).send("No token provided");

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).send("Invalid token");
  }
};

// DigitalOcean Spaces Client
const s3 = new S3Client({
  region: "us-east-1",
  endpoint: "https://sfo3.digitaloceanspaces.com",
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

// Middleware
app.use(express.json());
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 10 * 1024 * 1024 },
    abortOnLimit: true,
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// Swagger UI
app.use("/swagger", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Test Route
app.get("/", (req, res) => res.send("Image API Running (Upload + Download + Delete + Auth + Swagger docs at /swagger)"));

// Upload Route
app.post("/upload", auth, async (req, res) => {
  try {
    if (!req.files || !req.files.file)
      return res.status(400).json({ error: "No file uploaded" });

    const file = req.files.file;
    const allowed = ["image/jpeg", "image/png", "image/gif"];
    if (!allowed.includes(file.mimetype))
      return res.status(400).json({ error: "Invalid file type" });

    const imageId = uuid();
    const key = `${imageId}/original`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: key,
        Body: fs.createReadStream(file.tempFilePath),
        ContentType: file.mimetype,
        ACL: "public-read",
      })
    );

    const url = `${process.env.SPACES_CDN}/${key}`;

    uploadMetrics.push({
      id: imageId,
      size: file.size,
      uploadedBy: req.user.email,
      type: file.mimetype,
      timestamp: Date.now(),
    });

    res.json({ message: "Upload successful", id: imageId, url });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// Download Route
app.get("/image/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const key = `${id}/original`;
    const data = await s3.send(new GetObjectCommand({ Bucket: process.env.SPACES_BUCKET, Key: key }));

    res.setHeader("Content-Type", data.ContentType || "image/jpeg");
    await pipe(data.Body, res);
  } catch (err) {
    console.error("Download failed:", err);
    res.status(404).send("Image not found");
  }
});

// Delete Route
app.delete("/image/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const key = `${id}/original`;

    await s3.send(new DeleteObjectCommand({ Bucket: process.env.SPACES_BUCKET, Key: key }));
    deletedImages.push({ id, deletedAt: Date.now() });
    res.json({ message: "Image deleted", id });
  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Upload Metrics
app.get("/metrics/uploads", auth, (req, res) => {
  res.json(uploadMetrics);
});

// Lifecycle Cleanup
setInterval(() => {
  const now = Date.now();
  const retention = 7 * 24 * 60 * 60 * 1000;
  for (const entry of [...deletedImages]) {
    if (now - entry.deletedAt > retention) {
      console.log("Purging deleted record:", entry.id);
      deletedImages.splice(deletedImages.indexOf(entry), 1);
    }
  }
}, 60 * 60 * 1000);

// Server Start
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));
