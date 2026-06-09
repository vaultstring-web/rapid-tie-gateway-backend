// src/config/upload.config.ts
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Ensure upload directories exist
const uploadDir = path.join(process.cwd(), 'uploads');
const dsaUploadDir = path.join(uploadDir, 'dsa-documents');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(dsaUploadDir)) {
  fs.mkdirSync(dsaUploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, dsaUploadDir);
  },
  filename: (_req, file, cb) => {
    const requestId = _req.params.id;
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(file.originalname);
    // safeName is used in the filename generation
    const safeName = file.originalname
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .substring(0, 50);
    // Use safeName in the filename
    cb(null, `${requestId}_${timestamp}_${random}_${safeName}${ext}`);
  },
});

// File filter
const fileFilter = (_req: any, file: any, cb: any) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'image/jpg',
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPEG, PNG are allowed.'), false);
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
});

export const getFileUrl = (filename: string): string => {
  return `/uploads/dsa-documents/${filename}`;
};

export const deleteFile = (filepath: string): void => {
  const fullPath = path.join(process.cwd(), filepath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};