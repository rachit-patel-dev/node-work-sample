import { Body, Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { AutoJoinDto } from './dto';
import { CronjobService } from './cronjob.service';

/**
 * Controller for handling cronjob related operations.
 */
@Controller('cronjob')
export class CronjobController {
  constructor(private cronjobService: CronjobService) {}

  // auto join
  /**
 * Auto join method.
 * 
 * This method is used to automatically join a user to a specific location.
 * 
 * @param req - The request object containing user information.
 * @param dto - The AutoJoinDto object containing the location details.
 * @returns A Promise that resolves to the result of the auto join operation.
 */
  @Post('/autojoin')
  async autojoin(@Req() req: Request, @Body() dto: AutoJoinDto) {
    return await this.cronjobService.autoJoin(req['user'].id, dto);

    // return await this.cronjobService.autoJoin('645fbaf195be1251475466b7', dto);
  }
}
