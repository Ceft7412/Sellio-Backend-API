import multer from "multer";

import { Request } from 'express';


// Configure multer for memory storage (we'll upload directly to GCS)

const upload_types = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
]



const storage = multer.memoryStorage();
// File filter function
const fileFilter = (
    _req: Request,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    // Check if file type is allowed
    if (upload_types.includes(file.mimetype)) {
      console.log('file', file);
      cb(null, true);
    } else {
      cb(
        new Error(
          `File type ${file.mimetype} not allowed. Allowed types: ${upload_types.join(', ')}`
        )
      );
    }
  };
  

export const uploadMiddleware = multer({
    storage,
    fileFilter,
  });

export const uploadMultiple = uploadMiddleware.fields([
  { name: 'images', maxCount: 10 },
  { name: 'maintenanceImages', maxCount: 10 },
]);