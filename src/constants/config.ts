import * as dotenv from "dotenv";

dotenv.config();

export const config = {
  jwt: {
    secret: process.env.JWT_SECRET as string,
    expiresIn: process.env.JWT_EXPIRES_IN as string,
  },
  gcs: {
    projectId: process.env.GCS_PROJECT_ID as string,
    bucketName: process.env.GCS_BUCKET_NAME as string,
    keyFilename: process.env.GCS_KEY_FILENAME as string,
  },
};
