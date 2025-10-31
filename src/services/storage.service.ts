import { Storage } from "@google-cloud/storage";
import { config } from "../constants/config";
import path from "path";

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: config.gcs.projectId,
  keyFilename: config.gcs.keyFilename, // Path to your service account key file
});

const bucket = storage.bucket(config.gcs.bucketName);

/**
 * Upload a file buffer to Google Cloud Storage
 * @param fileBuffer - The file buffer from multer
 * @param fileName - The name to save the file as
 * @param mimeType - The MIME type of the file
 * @param folder - Optional folder path within the bucket
 * @returns The public URL of the uploaded file
 */
export const uploadToGCS = async (
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = "product_images"
): Promise<string> => {
  try {
    const blob = bucket.file(`${folder}/${fileName}`);
  const blobStream = blob.createWriteStream({
    resumable: false,
    metadata: {
      contentType: mimeType,
      cacheControl: "public, max-age=31536000", // Cache for 1 year
    },
  });

  return new Promise((resolve, reject) => {
    blobStream.on("error", (err) => {
      console.error("Error uploading to GCS:", err);
      reject(err);
    });

    blobStream.on("finish", async () => {
      // For buckets with uniform bucket-level access enabled,
      // files are automatically public if the bucket allows public access
      // No need to call makePublic() on individual files
      try {
        const publicUrl = `https://storage.googleapis.com/${config.gcs.bucketName}/${folder}/${fileName}`;
        console.log(`File uploaded successfully: ${publicUrl}`);
        resolve(publicUrl);
      } catch (err) {
        console.error("Error generating public URL:", err);
        reject(err);
      }
    }); 

    blobStream.end(fileBuffer);
  });

  } catch (error) {
      console.error("Error uploading to GCS:", error);
      throw error;
  }
  
};

/**
 * Delete a file from Google Cloud Storage
 * @param fileUrl - The public URL of the file to delete
 */
export const deleteFromGCS = async (fileUrl: string): Promise<void> => {
  try {
    // Extract the file path from the URL
    const urlParts = fileUrl.split(`${config.gcs.bucketName}/`);
    if (urlParts.length < 2) {
      throw new Error("Invalid file URL");
    }

    const filePath = urlParts[1];
    const file = bucket.file(filePath);
    await file.delete();
    console.log(`File ${filePath} deleted successfully`);
  } catch (err) {
    console.error("Error deleting file from GCS:", err);
    throw err;
  }
};

/**
 * Generate a unique filename
 * @param originalName - The original filename
 * @returns A unique filename
 */
export const generateUniqueFileName = (originalName: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = path.extname(originalName);
  const baseName = path.basename(originalName, extension);

  // Sanitize filename
  const sanitizedBaseName = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-")
    .substring(0, 50);

  return `${sanitizedBaseName}-${timestamp}-${randomString}${extension}`;
};
