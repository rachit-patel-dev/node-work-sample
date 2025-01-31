import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ParseIntPipe } from '../common/pipes/parse-int.pipe';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { Cat } from './interfaces/cat.interface';

/**
 * Controller for managing cats.
 *
 * @remarks
 * This controller is responsible for handling HTTP requests related to cats.
 * It provides endpoints for creating a cat, retrieving all cats, and retrieving a cat by ID.
 *
 * @example
 * ```
 * // Create a new cat
 * POST /cats
 *
 * // Retrieve all cats
 * GET /cats
 *
 * // Retrieve a cat by ID
 * GET /cats/:id
 * ```
 *
 * @public
 */
@UseGuards(RolesGuard)
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
  @Roles('admin')
  async create(@Body() createCatDto: CreateCatDto) {
    this.catsService.create(createCatDto);
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
 * Retrieves a cat by its ID.
 * 
 * @param id - The ID of the cat to retrieve.
 * @returns The cat object with the specified ID.
 */
  @Get(':id')
  findOne(
    @Param('id', new ParseIntPipe())
    id: number,
  ) {
    // get by ID logic
  }
}
