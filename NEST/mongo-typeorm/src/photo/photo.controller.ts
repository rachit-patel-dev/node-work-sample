import { Controller, Get } from '@nestjs/common';
import { PhotoService } from './photo.service';
import { Photo } from './photo.entity';

/**
 * Controller responsible for handling photo-related requests.
 */
@Controller('photo')
export class PhotoController {
  constructor(private readonly photoService: PhotoService) {}

  /**
 * Retrieves all photos.
 *
 * @returns {Promise<Photo[]>} A promise that resolves to an array of photos.
 */
  @Get()
  findAll(): Promise<Photo[]> {
    return this.photoService.findAll();
  }
}
