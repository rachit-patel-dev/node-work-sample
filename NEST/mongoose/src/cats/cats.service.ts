import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateCatDto } from './dto/create-cat.dto';
import { Cat } from './schemas/cat.schema';

/**
 * The CatsService class provides methods for interacting with the Cat model.
 * It is responsible for creating, finding, and deleting cats.
 */
@Injectable()
export class CatsService {
  constructor(@InjectModel(Cat.name) private readonly catModel: Model<Cat>) {}

  /**
 * Creates a new cat.
 * 
 * @param createCatDto - The data for creating a new cat.
 * @returns A promise that resolves to the created cat.
 */
  async create(createCatDto: CreateCatDto): Promise<Cat> {
    const createdCat = await this.catModel.create(createCatDto);
    return createdCat;
  }

  /**
 * Retrieves all cats from the database.
 * 
 * @returns A promise that resolves to an array of cats.
 */
  async findAll(): Promise<Cat[]> {
    return this.catModel.find().exec();
  }

  /**
 * Retrieves a cat from the database by its ID.
 * 
 * @param id - The ID of the cat to retrieve.
 * @returns A promise that resolves to the retrieved cat.
 */
  async findOne(id: string): Promise<Cat> {
    return this.catModel.findOne({ _id: id }).exec();
  }

  /**
 * Deletes a cat from the database by its ID.
 * 
 * @param id - The ID of the cat to delete.
 * @returns A promise that resolves to the deleted cat.
 */
  async delete(id: string) {
    const deletedCat = await this.catModel
      .findByIdAndRemove({ _id: id })
      .exec();
    return deletedCat;
  }
}
