import express from "express";
import fileUpload from "express-fileupload";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream";
import { promisify } from "util";
import fs from "fs";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import jwt from "jsonwebtoken";

const app = express();
const pipe = promisify(pipeline);

// --- In-memory logs / lifecycle queue ---
const uploadMetrics = [];
const deletedImages = []; // { id, deletedAt }

// --- Authentication Middleware ---
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

// --- DO Spaces Client ---
const s3 = new S3Client({
  region: "us-east-1",
  endpoint: "https://sfo3.digitaloceanspaces.com",
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

// --- Middleware ---
app.use(express.json());

app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for Epic 1
    abortOnLimit: true,
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// --- Test Route ---
app.get("/", (req, res) => res.send("Image API Running (Upload + Resize + Delete + Auth)"));

// ===============================================================
// =====================  IMAGE UPLOAD ROUTE  =====================
// ===============================================================
app.post("/upload", auth, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const file = req.files.file;

    // ---- Validate Type ----
    const allowed = ["image/jpeg", "image/png", "image/gif"];
    if (!allowed.includes(file.mimetype)) {
      return res.status(400).json({ error: "Invalid file type" });
    }

    const originalPath = file.tempFilePath;

    // ---- Generate UUID for this image ----
    const imageId = uuid();

    // ---- Store variants and original ----
    const sizes = {
      original: null, // stored as-is
      thumbnail: 100,
      small: 300,
      medium: 800,
      large: 1600,
    };

    const uploadedUrls = {};

    // Upload original
    const originalBody = fs.createReadStream(originalPath);
    await s3.send(new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: `${imageId}/original`,
      Body: originalBody,
      ContentType: file.mimetype,
      ACL: "public-read",
    }));

    uploadedUrls.original = `${process.env.SPACES_CDN}/${imageId}/original`;

    // Upload resized variants
    for (const [name, width] of Object.entries(sizes)) {
      if (name === "original") continue;

      const buffer = await sharp(originalPath)
        .resize({ width, withoutEnlargement: true })
        .toBuffer();

      await s3.send(new PutObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: `${imageId}/${name}.jpg`,
        Body: buffer,
        ContentType: "image/jpeg",
        ACL: "public-read",
      }));

      uploadedUrls[name] = `${process.env.SPACES_CDN}/${imageId}/${name}.jpg`;
    }

    // ---- Log Metrics ----
    uploadMetrics.push({
      id: imageId,
      size: file.size,
      uploadedBy: req.user.email,
      type: file.mimetype,
      timestamp: Date.now(),
    });

    return res.json({
      message: "Upload successful",
      id: imageId,
      urls: uploadedUrls,
    });

  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

// ===============================================================
// =====================  IMAGE DOWNLOAD ROUTE  ===================
// ===============================================================
app.get("/image/:id/:variant", async (req, res) => {
  const { id, variant } = req.params;

  try {
    const key = variant === "original" ? `${id}/original` : `${id}/${variant}.jpg`;

    const data = await s3.send(new GetObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: key,
    }));

    res.setHeader("Content-Type", data.ContentType || "image/jpeg");
    await pipe(data.Body, res);

  } catch (err) {
    console.error("Download failed:", err);
    res.status(404).send("Image not found");
  }
});

// ===============================================================
// ========================  DELETE ROUTE  ========================
// ===============================================================
app.delete("/image/:id", auth, async (req, res) => {
  const { id } = req.params;

  try {
    const variants = ["original", "thumbnail.jpg", "small.jpg", "medium.jpg", "large.jpg"];

    for (const variant of variants) {
      const key = variant === "original" ? `${id}/original` : `${id}/${variant}`;

      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.SPACES_BUCKET,
        Key: key,
      }));
    }

    deletedImages.push({ id, deletedAt: Date.now() });

    res.json({ message: "Image deleted", id });

  } catch (err) {
    console.error("Delete failed:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ===============================================================
// ===================  UPLOAD METRICS ROUTE  ====================
// ===============================================================
app.get("/metrics/uploads", auth, (req, res) => {
  res.json(uploadMetrics);
});

// ===============================================================
// ==========  LIFECYCLE CLEANUP (runs every server start)  ======
// ===============================================================
setInterval(async () => {
  const now = Date.now();
  const retentionPeriod = 7 * 24 * 60 * 60 * 1000; // 7 days

  for (const entry of [...deletedImages]) {
    if (now - entry.deletedAt > retentionPeriod) {
      console.log("Purging old deleted file:", entry.id);
      deletedImages.splice(deletedImages.indexOf(entry), 1);
    }
  }
}, 60 * 60 * 1000); // runs hourly

// ===============================================================
// ========================  SERVER START  ========================
// ===============================================================
const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));
