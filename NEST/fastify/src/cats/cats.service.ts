import { Injectable } from '@nestjs/common';
import { Cat } from './interfaces/cat.interface';

/**
 * The CatsService class is responsible for managing cats.
 * It provides methods for creating and retrieving cats.
 */
@Injectable()
export class CatsService {
  private readonly cats: Cat[] = [];

  create(cat: Cat) {
    this.cats.push(cat);
  }

  findAll(): Cat[] {
    return this.cats;
  }
}
