import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { Cat } from './schemas/cat.schema';

/**
 * CatsController is a controller class that handles HTTP requests related to cats.
 *
 * @remarks
 * This class is responsible for creating, retrieving, and deleting cat data.
 *
 * @example
 * ```typescript
 * const controller = new CatsController(catsService);
 * ```
 */
@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  /**
 * Creates a new cat.
 * 
 * @param createCatDto - The data for creating a new cat.
 * @returns A Promise that resolves to void.
 */
  @Post()
  async create(@Body() createCatDto: CreateCatDto) {
    await this.catsService.create(createCatDto);
  }

  /**
 * Retrieves all cats.
 * 
 * @returns A Promise that resolves to an array of Cat objects.
 */
  @Get()
  async findAll(): Promise<Cat[]> {
    return this.catsService.findAll();
  }

  /**
 * Retrieves a single cat by its ID.
 * 
 * @param id - The ID of the cat to retrieve.
 * @returns A Promise that resolves to a Cat object.
 */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Cat> {
    return this.catsService.findOne(id);
  }

  /**
 * Deletes a cat by its ID.
 * 
 * @param id - The ID of the cat to delete.
 * @returns A Promise that resolves to void.
 */
  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.catsService.delete(id);
  }
}
