import fs from 'fs';
import path from 'path';

export class DocumentService {
  static getSignedUrl(filepath: string): string {
    // For development, return local URL
    if (process.env.NODE_ENV !== 'production') {
      return `http://localhost:3001${filepath}`;
    }
    
    // For production with S3/R2, implement signed URL generation
    // This is a placeholder - implement based on your cloud storage
    return filepath;
  }
  
  static getFileInfo(filename: string): { name: string; size: number; url: string } {
    const filePath = path.join(process.cwd(), 'uploads', 'dsa-documents', filename);
    let size = 0;
    
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      size = stats.size;
    }
    
    return {
      name: filename,
      size,
      url: DocumentService.getSignedUrl(`/uploads/dsa-documents/${filename}`),
    };
  }
}