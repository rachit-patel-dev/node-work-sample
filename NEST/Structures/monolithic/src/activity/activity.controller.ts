import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { ActivityService } from './activity.service';
import {
  CreateActivityDto,
  FavoriteListDto,
  GivePlayerFeedBackDto,
  lockPlayersDto,
  requestedPlayersDto,
  UpdateActivityDto,
} from './dto';
import { ApiTags } from '@nestjs/swagger';

/**
 * Controller for handling activity-related operations.
 *
 * @remarks
 * This controller is responsible for creating, updating, and deleting activities, as well as managing player invitations and feedback.
 *
 * @param Activity - The activity service used for handling activity-related operations.
 *
 * @returns
 * Returns the result of the activity-related operation.
 *
 * @beta
 */
@ApiTags('activity')
@Controller('activity')
export class ActivityController {
  constructor(private Activity: ActivityService) {}

  /**
 * Create a new activity.
 * 
 * @param {CreateActivityDto} dto - The data for creating the activity.
 * @returns {Promise<any>} - The created activity.
 * @throws {Error} - If there is an error creating the activity.
 */
  @Post('/createActivity')
  async createActivity(@Body() dto: CreateActivityDto) {
    try {
      return await this.Activity.createActivity(dto);
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
 * Update an existing activity.
 * 
 * @param {string} activityId - The ID of the activity to update.
 * @param {UpdateActivityDto} dto - The data for updating the activity.
 * @returns {Promise<any>} - The updated activity.
 */
  @Put('/updateActivity/:activityId')
  async updateActivity(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
  ) {
    return await this.Activity.updateActivity(activityId, dto);
  }

  /**
 * Delete an activity.
 * 
 * @param {string} activityId - The ID of the activity to delete.
 * @param {string} data - The data containing the email of the user.
 * @returns {Promise<any>} - The result of the delete operation.
 */
  @Delete('/deleteActivity/:activityId')
  async deleteActivity(
    @Param('activityId') activityId: string,
    @Body() data: string,
  ) {
    return await this.Activity.deleteActivity(activityId, data['email']);
  }

  /**
 * Get an activity by its ID.
 * 
 * @param {string} activityId - The ID of the activity.
 * @param {string} data - The data containing the email of the user.
 * @returns {Promise<any>} - The activity with the specified ID.
 */
  @Post('/getActivityById/:activityId')
  async getActivityById(
    @Param('activityId') activityId: string,
    @Body() data: string,
  ) {
    return await this.Activity.getActivityById(activityId, data['email']);
  }

  /**
 * Invite players to an activity.
 * 
 * @param {string} activityId - The ID of the activity to invite players to.
 * @param {requestedPlayersDto} dto - The data for inviting players.
 * @param {Request} req - The request object containing user information.
 * @returns {Promise<any>} - The result of the invitation operation.
 */
  @Post('invitePlayers/:activityId')
  async invitePlayers(
    @Param('activityId') activityId: string,
    @Body() dto: requestedPlayersDto,
    @Req() req: Request,
  ) {
    return await this.Activity.invitePlayers(activityId, dto, req['user'].id);
    // return await this.Activity.invitePlayers(
    //   activityId,
    //   dto,
    //   '648a0218070c7b7077940918',
    // );
  }

  /**
 * Accept an invitation to join an activity.
 * 
 * @param {string} activityId - The ID of the activity.
 * @param {string} dto - The data containing the email of the user.
 * @returns {Promise<any>} - The result of accepting the invitation.
 */
  @Post('acceptInvite/:activityId')
  async acceptInvite(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.acceptInvite(activityId, dto['email']);
  }

  /**
 * Decline an invitation to join an activity.
 * 
 * @param {string} activityId - The ID of the activity.
 * @param {string} dto - The data containing the email of the user.
 * @returns {Promise<any>} - The result of declining the invitation.
 */
  @Post('declineInvite/:activityId')
  async declineInvite(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.declineInvite(
      activityId,
      dto['email'],
      dto['message'],
    );
  }

  /**
 * Get the list of invited players for a specific activity.
 * 
 * @param {string} activityId - The ID of the activity.
 * @returns {Promise<any>} - The list of invited players.
 */
  @Get('getInvitedList/:activityId')
  async getInvitedList(@Param('activityId') activityId: string) {
    return await this.Activity.inviteList(activityId);
  }

  /**
 * Add players to an activity.
 * 
 * @param {string} activityId - The ID of the activity to add players to.
 * @param {requestedPlayersDto} dto - The data for adding players.
 * @returns {Promise<any>} - The result of the add players operation.
 */
  @Post('addPlayer/:activityId')
  async addPlayers(
    @Param('activityId') activityId: string,
    @Body() dto: requestedPlayersDto,
  ) {
    return await this.Activity.justAddPlayers(activityId, dto);
  }

  /**
 * Add lock players to an activity.
 * 
 * @param {string} activityId - The ID of the activity to add lock players to.
 * @param {lockPlayersDto} dto - The data for adding lock players.
 * @returns {Promise<any>} - The result of the add lock players operation.
 */
  @Post('addLockPlayer/:activityId')
  async addLockPlayer(
    @Param('activityId') activityId: string,
    @Body() dto: lockPlayersDto,
  ) {
    return await this.Activity.addLockPlayer(activityId, dto);
  }

  /**
 * Leave an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The email of the user leaving the activity.
 * @returns A promise that resolves to the result of the leave activity operation.
 */
  @Post('leaveActivity/:activityId')
  async leaveActivity(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.leaveActivity(activityId, dto['email']);
  }

  /**
 * Remove a player from an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data object containing the admin email and the email of the player to be removed.
 * @returns A promise that resolves to the result of the removePlayer method.
 */
  @Post('removePlayer/:activityId')
  async removePlayer(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.removePlayer(
      activityId,
      dto['admin_email'],
      dto['email'],
    );
  }

  /**
 * Change the role of a player in an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data object containing the admin email and the email of the player whose role is being changed.
 * @returns A promise that resolves to the result of the role change operation.
 */
  @Post('changeRole/:activityId')
  async changeRole(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.roleChange(
      activityId,
      dto['admin_email'],
      dto['email'],
    );
  }

  /**
 * Registers the result of an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data transfer object containing the result information.
 * @param req - The request object containing the user information.
 * @returns A promise that resolves to the result of the registration.
 */
  @Post('registerResult/:activityId')
  async registerResult(
    @Param('activityId') activityId: string,
    @Body() dto: string,
    @Req() req: Request,
  ) {
    return await this.Activity.registerResult(
      activityId,
      dto['team1Score'],
      dto['team2Score'],
      req['user'].id,
    );
  }

  /**
 * Updates the result of an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data object containing the updated result.
 * @param req - The request object containing the user ID.
 * @returns A promise that resolves to the updated result.
 */
  @Put('updateResult/:activityId')
  async updateResult(
    @Param('activityId') activityId: string,
    @Body() dto: string,
    @Req() req: Request,
  ) {
    return await this.Activity.updateResult(
      activityId,
      dto['team1Score'],
      dto['team2Score'],
      req['user'].id,
    );
  }

  /**
 * Registers the second result for an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data for the second result.
 * @param req - The request object containing user information.
 * @returns A promise that resolves to the result of registering the second result.
 */
  @Post('registerSecondResult/:activityId')
  async registerSecondResult(
    @Param('activityId') activityId: string,
    @Body() dto: string,
    @Req() req: Request,
  ) {
    return await this.Activity.registerSecondResult(
      activityId,
      dto,
      req['user'].id,
    );
  }

  /**
 * Update the review push for a specific activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data object containing the email and status.
 * @returns A promise that resolves to the result of the update.
 */
  @Post('updateReviewPush/:activityId')
  async updateReviewPush(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.updateReviewPush(
      activityId,
      dto['email'],
      dto['status'],
    );
  }

  /**
 * Exchange a player in the activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data object containing the admin email, current position, and new position of the player.
 * @returns A promise that resolves to the result of the exchange operation.
 */
  @Post('exchangePlayer/:activityId')
  async exchangePlayer(
    @Param('activityId') activityId: string,
    @Body() dto: string,
  ) {
    return await this.Activity.exchangePlayer(
      activityId,
      dto['admin_email'],
      dto['current_position'],
      dto['position'],
    );
  }

  /**
 * Exchange a player's position in the second game of an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data object containing the current position and the new position of the player.
 * @param req - The request object containing the user's ID.
 * @returns A promise that resolves to the result of the exchange operation.
 */
  @Post('exchangePlayerSecondGame/:activityId')
  async exchangePlayerSecondGame(
    @Param('activityId') activityId: string,
    @Body() dto: string,
    @Req() req: Request,
  ) {
    return await this.Activity.exchangePlayerSecondGame(
      activityId,
      req['user'].id,
      dto['current_position'],
      dto['position'],
    );

    // return await this.Activity.exchangePlayerSecondGame(
    //   activityId,
    //   '64b01ee72e9006c9625bf13d',
    //   dto['current_position'],
    //   dto['position'],
    // );

    // 64b01ee72e9006c9625bf13d
  }

  /**
 * Add an activity to the user's favorite list.
 * 
 * @param activityId - The ID of the activity to add to the favorite list.
 * @param dto - The data transfer object containing the user's email and optional type.
 * @returns A promise that resolves to the result of adding the activity to the favorite list.
 */
  @Post('addFavorite/:activityId')
  async addedFavoriteList(
    @Param('activityId') activityId: string,
    @Body() dto: FavoriteListDto,
  ) {
    return await this.Activity.addFavActivity(activityId, dto);
  }

  /**
 * Retrieves the favorite activities for a given email.
 *
 * @param email - The email of the user.
 * @returns A Promise that resolves to the favorite activities.
 */
  @Get('getFavActivities/:email')
  async getFavoriteList(@Param('email') email: string) {
    return await this.Activity.getFavActivities(email);
  }

  /**
 * Updates the second result of an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param dto - The data for updating the second result.
 * @param req - The request object containing user information.
 * @returns The updated result of the activity.
 */
  @Put('updateRegisterSecondResult/:activityId')
  async updateRegisterSecondResult(
    @Param('activityId') activityId: string,
    @Body() dto: string,
    @Req() req: Request,
  ) {
    return await this.Activity.updateRegisterSecondResult(
      activityId,
      dto,
      req['user'].id,
    );
  }

  /**
 * Deletes the second result registration for a specific activity.
 * 
 * @param activityId The ID of the activity.
 * @param req The request object containing the user ID.
 * @returns A promise that resolves to the result of the deletion.
 */
  @Delete('deleteRegisterSecondResult/:activityId')
  async deleteRegisterSecondResult(
    @Param('activityId') activityId: string,
    @Req() req: Request,
  ) {
    return await this.Activity.deleteRegisterSecondResult(
      activityId,
      req['user'].id,
    );

    // return await this.Activity.deleteRegisterSecondResult(
    //   activityId,
    //   '64a6da55de871702a3fce438',
    // );
  }

  /**
 * Give feedback for a player in an activity.
 *
 * @param activityId - The ID of the activity.
 * @param dto - The feedback data for the player.
 * @returns The result of giving feedback for the player.
 */
  @Post('givePlayerFeedBack/:activityId')
  async givePlayerFeedBack(
    @Param('activityId') activityId: string,
    @Body() dto: GivePlayerFeedBackDto,
  ) {
    return await this.Activity.givePlayerFeedBack(activityId, dto);
  }

  /**
 * Request to join an activity.
 *
 * @param activityId - The ID of the activity.
 * @param dto - The requested players data.
 * @returns A promise that resolves to the result of the request to join the activity.
 */
  @Post('requestToJoinActivity/:activityId')
  async requestToJoinActivity(
    @Param('activityId') activityId: string,
    @Body() dto: requestedPlayersDto,
  ) {
    return await this.Activity.requestToJoinActivity(activityId, dto);
  }

  /**
 * Retrieves the list of requested players for a specific activity.
 *
 * @param activityId The ID of the activity.
 * @returns A promise that resolves to the list of requested players.
 */
  @Get('getRequestedPlayers/:activityId')
  async getRequestedPlayers(@Param('activityId') activityId: string) {
    return await this.Activity.getRequestedPlayers(activityId);
  }

  /**
 * Check if a user with the given email has requested to join the activity with the specified activityId.
 * 
 * @param activityId - The ID of the activity.
 * @param email - The email of the user.
 * @returns A boolean indicating whether the user has requested to join the activity or not.
 */
  @Get('isRequested/:activityId/:email')
  async isRequested(
    @Param('activityId') activityId: string,
    @Param('email') email: string,
  ) {
    return await this.Activity.isRequested(activityId, email);
  }

  // acceptRequest
  /**
 * Accepts a request to join an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param data - The request data containing the email of the user.
 * @returns A promise that resolves to the result of accepting the request.
 */
  @Post('acceptRequest/:activityId')
  async acceptRequest(
    @Param('activityId') activityId: string,
    @Body() data: string,
  ) {
    return await this.Activity.acceptRequest(activityId, data['email']);
  }

  /**
 * Rejects a request to join an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param data - The request data containing the email and message.
 * @param req - The request object.
 * @returns A promise that resolves to the result of rejecting the request.
 */
  @Post('rejectRequest/:activityId')
  async rejectRequest(
    @Param('activityId') activityId: string,
    @Body() data: string,
    @Req() req: Request,
  ) {
    return await this.Activity.rejectRequest(
      activityId,
      data['email'],
      data['message'],
      req['user'].id,
    );
  }

  /**
 * Check if a user is invited to an activity.
 * 
 * @param activityId - The ID of the activity.
 * @param email - The email of the user.
 * @returns A promise that resolves to a boolean indicating if the user is invited.
 */
  @Get('isInvited/:activityId/:email')
  async isInvited(
    @Param('activityId') activityId: string,
    @Param('email') email: string,
  ) {
    return await this.Activity.isInvited(activityId, email);
  }

  /**
 * Sends an extra notification for a specific activity.
 * 
 * @param activityId The ID of the activity.
 * @returns A promise that resolves to the result of sending the extra notification.
 */
  @Post('sendExtraNotificationPro/:activityId')
  async sendExtraNotificationPro(@Param('activityId') activityId: string) {
    return await this.Activity.sendExtraNotificationPro(activityId);
  }

  /**
 * Retrieves the latest update information.
 * 
 * @returns A string indicating the latest update version.
 */
  @Get('update')
  async update() {
    return 'update 31';
  }
}
