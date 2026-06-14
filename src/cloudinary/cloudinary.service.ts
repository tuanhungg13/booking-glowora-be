import { Injectable } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

export interface UploadResult {
  url: string;
  publicId: string;
  width?: number;
  height?: number;
  duration?: number;
}

@Injectable()
export class CloudinaryService {
  uploadImage(file: Express.Multer.File, folder: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder, resource_type: 'image' },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve(result.secure_url);
        },
      );
      Readable.from(file.buffer).pipe(upload);
    });
  }

  uploadFile(file: Express.Multer.File, folder: string, resourceType: 'image' | 'video'): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            duration: (result as any).duration,
          });
        },
      );
      Readable.from(file.buffer).pipe(upload);
    });
  }

  async deleteImage(publicId: string): Promise<void> {
    await cloudinary.uploader.destroy(publicId);
  }

  extractPublicId(url: string): string {
    // https://res.cloudinary.com/<cloud>/image/upload/v<ver>/<folder>/<name>.<ext>
    const parts = url.split('/');
    const uploadIndex = parts.findIndex((p) => p === 'upload');
    // skip version segment (v1234...)
    const relevant = parts.slice(uploadIndex + 2);
    return relevant.join('/').replace(/\.[^.]+$/, '');
  }
}
