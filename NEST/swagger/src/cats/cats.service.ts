import { Injectable } from '@nestjs/common';
import { CreateCatDto } from './dto/create-cat.dto';
import { Cat } from './entities/cat.entity';

/**
 * The CatsService class is responsible for managing the cats in the application.
 * It provides methods for creating and finding cats.
 */
@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  /**
 * Creates a new cat.
 * 
 * @param cat - The cat object to be created.
 * @returns The created cat object.
 */
  create(cat: CreateCatDto): Cat {
    this.cats.push(cat);
    return cat;
  }

  /**
 * Finds a cat by its ID.
 * 
 * @param id - The ID of the cat to find.
 * @returns The cat object with the specified ID.
 */
  findOne(id: number): Cat {
    return this.cats[id];
  }
}
