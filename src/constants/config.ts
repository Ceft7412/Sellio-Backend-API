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
    mapsApiKey: process.env.GOOGLE_MAPS_API_KEY as string,
    googleApiKey: process.env.GOOGLE_API_KEY as string,
  },
  sms: {
    smsApiKey: process.env.SMS_API_KEY as string,
    smsApiUrl: process.env.SMS_API_URL as string,
  },
};
