import { Injectable, Logger } from '@nestjs/common';
import { CloudinaryService } from './cloudinary.service';
import { DriveService } from './drive.service';

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const DRIVE_PREFIX = 'https://drive.google.com/';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly cloudinary: CloudinaryService,
    private readonly drive: DriveService,
  ) {}

  async deleteByUrl(url: string): Promise<void> {
    if (url.startsWith(CLOUDINARY_PREFIX)) {
      return this.cloudinary.deleteByUrl(url);
    }
    if (url.startsWith(DRIVE_PREFIX)) {
      return this.drive.deleteByUrl(url);
    }
    this.logger.warn(`deleteByUrl: unknown storage provider for URL: ${url}`);
  }

  async deleteManyByUrls(urls: string[]): Promise<void> {
    await Promise.all(urls.map(u => this.deleteByUrl(u)));
  }
}
