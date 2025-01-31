import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  ActivityModel,
  ActivityDocument,
  UserModel,
  UserDocument,
  FavoriteListDocument,
  FavoriteListModel,
  FeedbackModel,
  FeedbackDocument,
  GameInterestModel,
  GameInterestDocument,
  UserPaymentAccountModel,
  UserPaymentAccountDocument,
  TransactionModel,
  TransactionDocument,
  TransferableAmountModel,
  TransferableAmountDocument,
  ClubFollowerModel,
  ClubFollowerDocument,
  CommunityModel,
  CommunityDocument,
} from 'schemas';

import {
  CreateActivityDto,
} from './dto';
import { WebportalService } from 'src/webportal/webportal.service';
import { NotificationService } from 'src/notification/notification.service';
import { ChatService } from 'src/chat/chat.service';
import { StripeService } from 'src/stripe/stripe.service';
/**
 * `ActivityService` is a service class in NestJS responsible for managing activities. It provides functionality to create an activity and send notifications to the players involved. 
 * 
 * The class is injected with various dependencies such as models for Activity, User, FavoriteList, Feedback, GameInterest, Community, UserPaymentAccount, Transaction, TransferableAmount, ClubFollower, and services like WebportalService, NotificationService, ChatService, and StripeService.
 * 
 * The `createActivity` method is used to create a new activity. It takes a `CreateActivityDto` object as input, which contains the data for creating the activity. The method checks if the players are already in the activity, calculates the number of players, and sends notifications to the players. If the activity is full, it sends a notification to all players. If the activity is associated with a group, it sends notifications to all members of the group. Otherwise, it sends notifications to all users with the same level and game type.
 */
@Injectable()
export class ActivityService {
  
  /**
 * Constructor for the ActivityService class.
 * 
 * @param {Model<ActivityDocument>} activityModel - The ActivityModel injected dependency.
 * @param {Model<UserDocument>} userModel - The UserModel injected dependency.
 * @param {Model<FavoriteListDocument>} favoriteListModel - The FavoriteListModel injected dependency.
 * @param {Model<FeedbackDocument>} feedback - The FeedbackModel injected dependency.
 * @param {Model<GameInterestDocument>} gameInterestModel - The GameInterestModel injected dependency.
 * @param {WebportalService} webportalService - The WebportalService injected dependency.
 * @param {NotificationService} notificationService - The NotificationService injected dependency.
 * @param {ChatService} chatService - The ChatService injected dependency.
 * @param {Model<CommunityDocument>} communityService - The CommunityModel injected dependency.
 * @param {StripeService} stripeService - The StripeService injected dependency.
 * @param {Model<UserPaymentAccountDocument>} userPaymentAccountModel - The UserPaymentAccountModel injected dependency.
 * @param {Model<TransactionDocument>} transactionModel - The TransactionModel injected dependency.
 * @param {Model<TransferableAmountDocument>} transferableAmountModel - The TransferableAmountModel injected dependency.
 * @param {Model<ClubFollowerDocument>} clubFollowerModel - The ClubFollowerModel injected dependency.
 */
  constructor(
    @InjectModel(ActivityModel)
    private readonly activityModel: Model<ActivityDocument>,
    // private userService: UserService,

    @InjectModel(UserModel)
    private readonly userModel: Model<UserDocument>,

    @InjectModel(FavoriteListModel)
    private readonly favoriteListModel: Model<FavoriteListDocument>,

    @InjectModel(FeedbackModel)
    private readonly feedback: Model<FeedbackDocument>,

    @InjectModel(GameInterestModel)
    private readonly gameInterestModel: Model<GameInterestDocument>,

    @Inject(WebportalService)
    private readonly webportalService: WebportalService,

    private readonly notificationService: NotificationService,

    private readonly chatService: ChatService,

    @InjectModel(CommunityModel)
    private readonly communityService: Model<CommunityDocument>,

    // ? Following Code by Tahmid K.
    private readonly stripeService: StripeService,
    @InjectModel(UserPaymentAccountModel)
    private readonly userPaymentAccountModel: Model<UserPaymentAccountDocument>,
    @InjectModel(TransactionModel)
    private readonly transactionModel: Model<TransactionDocument>,
    @InjectModel(TransferableAmountModel)
    private readonly transferableAmountModel: Model<TransferableAmountDocument>,
    @InjectModel(ClubFollowerModel)
    private readonly clubFollowerModel: Model<ClubFollowerDocument>,
  ) {}
/**
 * Creates a new activity.
 * 
 * @param {CreateActivityDto} CreateActivityDto - The data for creating the activity.
 * @returns {Promise<ActivityDocument>} - The created activity.
 * @throws {HttpException} - If there is an error creating the activity.
 */
  async createActivity(CreateActivityDto: CreateActivityDto) {
    try {
      const createdActivity = new this.activityModel(CreateActivityDto);

      // check if the player is already in the CreateActivityDto
      const activity = await createdActivity.save();

      // calculate the number of player
      const player1 = CreateActivityDto['player1'];
      const player2 = CreateActivityDto['player2'];
      const player3 = CreateActivityDto['player3'];
      const player4 = CreateActivityDto['player4'];

      const player = [player1, player2, player3, player4];

      const playerCount = player.filter((player) => player['email'] !== '');

      const playerCountWithoutEmptyString = playerCount.filter(
        (player) => player !== '',
      );

      const playerEmail = playerCountWithoutEmptyString.filter(
        (player) => player['email'] !== player1['email'],
      );
      const playerEmailOnly = playerEmail.map((player) => player['email']);

      playerEmailOnly.forEach(async (player) => {
        const route = {
          type: 'Game',
          id: createdActivity._id.toString(),
          email: createdActivity?.player1?.email,
        };
        await this.notificationService.sendNotificationUsingEmail(
          player,
          `${createdActivity.player1.name}`,
          `${createdActivity.player1.name} had added you in a game. Click and check the details!`,
          route,
          createdActivity?.player1?.profilePic,
        );
      });

      const playerLevel = CreateActivityDto['level'];
      const gameType = CreateActivityDto['gameType'];
      const level = playerLevel.map((level) => level['im']);
      const date = CreateActivityDto['date'];
      const clubName = CreateActivityDto['locations'];
      const username = CreateActivityDto.player1['name'];

      const playerAllreadyInActivity = [
        CreateActivityDto?.player1['email'],
        CreateActivityDto?.player2['email'] || '',
        CreateActivityDto?.player3['email'] || '',
        CreateActivityDto?.player4['email'] || '',
      ].filter((email) => email !== undefined && email !== '');

      const playerAllreadyInActivityWithoutMailinator =
        playerAllreadyInActivity.filter(
          (email) => !email.includes('@mailinator.com'),
        );

      if (playerCountWithoutEmptyString.length === 4) {
        const allPlayer = [
          activity.player1,
          activity.player2,
          activity.player3,
          activity.player4,
        ];

        allPlayer.forEach(async (player) => {
          const route = {
            type: 'Game',
            id: activity._id,
            email: activity?.player1?.email,
          };

          await this.notificationService.sendNotificationUsingEmail(
            player.email,
            `${player.name}`,
            `The game is full. Click and check the details!`,
            route,
            player.profilePic,
          );
        });

        return activity;
      } else {
        if (CreateActivityDto['groupId']) {
          const group = await this.communityService.findById(activity.groupId);

          const members = group.members;

          // get all email of the members
          const emailsofCommunityMember = members.map((member) => member.email);

          await this.notificationService.getAllUserTokenUsingCommunity(
            createdActivity._id,
            clubName,
            date,
            username,
            CreateActivityDto.email,
            emailsofCommunityMember,
            playerAllreadyInActivityWithoutMailinator,
          );

          return activity;
        } else {
          await this.notificationService.getAllUserFcmTokenUsingLevel(
            createdActivity._id,
            level,
            gameType,
            date,
            clubName,
            username,
            CreateActivityDto.email,
            playerAllreadyInActivityWithoutMailinator,
          );

          return activity;
        }
      }
    } catch (error) {
      throw new HttpException(
        {
          statusCode: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: error?.message || 'Internal Server Error',
          functionName: 'createActivity',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        { cause: error },
      );
    }
  }
}
