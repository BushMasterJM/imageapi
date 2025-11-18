import { S3Client } from "@aws-sdk/client-s3";

export const s3 = new S3Client({
  region: "us-east-1", // Required by AWS SDK, ignored by DO
  endpoint: process.env.SPACES_ENDPOINT, // e.g. "https://sfo3.digitaloceanspaces.com"
  forcePathStyle: false, // Must be false for DO Spaces
  credentials: {
    accessKeyId: process.env.SPACES_KEY,
    secretAccessKey: process.env.SPACES_SECRET,
  },
});
