import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CatsService } from './cats.service';
import { CreateCatDto } from './dto/create-cat.dto';
import { Cat } from './entities/cat.entity';

/**
 * Controller for managing cats.
 *
 * @remarks
 * This controller is responsible for handling HTTP requests related to cats.
 *
 * @example
 * ```typescript
 * const controller = new CatsController(catsService);
 * ```
 */
@ApiBearerAuth()
@ApiTags('cats')
@Controller('cats')
export class CatsController {
  constructor(private readonly catsService: CatsService) {}

  /**
 * Create a new cat.
 * 
 * @param createCatDto - The data for creating a cat.
 * @returns A promise that resolves to the created cat.
 * @throws {ForbiddenException} If the request is forbidden.
 */
  @Post()
  @ApiOperation({ summary: 'Create cat' })
  @ApiResponse({ status: 403, description: 'Forbidden.' })
  async create(@Body() createCatDto: CreateCatDto): Promise<Cat> {
    return this.catsService.create(createCatDto);
  }

  /**
 * Find a cat by its ID.
 * 
 * @param id - The ID of the cat.
 * @returns The found cat.
 */
  @Get(':id')
  @ApiResponse({
    status: 200,
    description: 'The found record',
    type: Cat,
  })
  findOne(@Param('id') id: string): Cat {
    return this.catsService.findOne(+id);
  }
}
