import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MongoRepository } from 'typeorm';
import { Photo } from './photo.entity';

/**
 * PhotoService is a service class that provides methods for interacting with the Photo entity.
 * It is responsible for retrieving and manipulating photo data from the photo repository.
 */
@Injectable()
export class PhotoService {
  constructor(
    @InjectRepository(Photo)
    private readonly photoRepository: MongoRepository<Photo>,
  ) {}

  /**
 * Retrieves all photos from the database.
 * 
 * @returns {Promise<Photo[]>} A promise that resolves to an array of Photo objects.
 */
  async findAll(): Promise<Photo[]> {
    return this.photoRepository.find();
  }
}
