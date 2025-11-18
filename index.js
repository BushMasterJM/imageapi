import express from "express";
import fileUpload from "express-fileupload";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { pipeline } from "stream";
import { promisify } from "util";
import fs from "fs";

const app = express();
const pipe = promisify(pipeline);

// Initialize S3 client for DigitalOcean Spaces
const s3 = new S3Client({
  region: "us-east-1", // Required by AWS SDK but ignored by DO
  endpoint: "https://sfo3.digitaloceanspaces.com", // <-- Region endpoint, NOT bucket URL
  forcePathStyle: false, // Must be false for DO Spaces
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});

// parse JSON
app.use(express.json());

// enable file upload
app.use(
  fileUpload({
    createParentPath: true,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    abortOnLimit: true,
    useTempFiles: true,
    tempFileDir: "/tmp/",
  })
);

// Test route
app.get("/", (req, res) => {
  res.send("Hello from Node.js API!");
});

// Upload to Spaces
app.post("/upload-file", async (req, res) => {
  try {
    console.log("Incoming files:", req.files);

    if (!req.files || !req.files.file) {
      console.log("No files received!");
      return res.status(400).send("No file uploaded");
    }

    const file = req.files.file;
    console.log("Uploading file:", file.name, file.mimetype, file.size);

    // Use temp file stream if available
    const body = file.tempFilePath
      ? fs.createReadStream(file.tempFilePath)
      : file.data;

    const command = new PutObjectCommand({
      Bucket: process.env.SPACES_BUCKET, // Just the bucket name, e.g., "imagestoragebucket"
      Key: file.name,
      Body: body,
      ContentType: file.mimetype,
      ACL: "public-read",
    });

    await s3.send(command);

    const url = `${process.env.SPACES_CDN}/${file.name}`;
    console.log("Upload successful:", url);
    res.json({ message: "File uploaded!", filename: file.name, url });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).send("Upload failed");
  }
});

// Download from Spaces
app.get("/download-file/:filename", async (req, res) => {
  const { filename } = req.params;

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: filename,
    });

    const data = await s3.send(command);

    res.setHeader(
      "Content-Type",
      data.ContentType || "application/octet-stream"
    );
    await pipe(data.Body, res);
  } catch (err) {
    console.error("Download failed:", err);
    res.status(404).send("File not found");
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`Server running on port ${port}`));
