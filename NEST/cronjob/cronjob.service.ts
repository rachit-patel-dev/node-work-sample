import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CommunityDocument,
  CommunityModel,
  UserDocument,
  UserModel,
} from 'schemas';
import { AutoJoinDto } from './dto';

/**
 * CronjobService is a service class that handles cronjob-related tasks.
 *
 * @remarks
 * This class is responsible for performing automatic joining of users to groups based on their location.
 * It interacts with the User and Community models to retrieve and update data.
 *
 * @example
 * ```
 * const cronjobService = new CronjobService(userModel, communityModel);
 * const result = await cronjobService.autoJoin(userId, dto);
 * console.log(result);
 * ```
 */
@Injectable()
export class CronjobService {
  constructor(
    @InjectModel(UserModel) private readonly userModel: Model<UserDocument>,

    @InjectModel(CommunityModel)
    private readonly communityModel: Model<CommunityDocument>,
  ) {}

  /**
 * Join a user to a group based on their location.
 * 
 * @param {string} userId - The ID of the user to join the group.
 * @param {AutoJoinDto} dto - The DTO containing the latitude and longitude of the user's location.
 * @returns {object} - An object with a message indicating the success of the operation.
 * @throws {HttpException} - If the user is not found, the group is not found, or the user is already a member of the group.
 * @throws {HttpException} - If there is an error during the operation.
 */
  async autoJoin(userId: string, dto: AutoJoinDto) {
    try {
      const user = await this.userModel.findById(userId);

      if (!user) {
        // return { error: 'Group not found' };
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      const groups = await this.communityModel.aggregate([
        {
          $geoNear: {
            near: {
              type: 'Point',
              coordinates: [dto.lng, dto.lat],
            },
            distanceField: 'distance',
            spherical: true,
            query: {
              groupType: 'LOCAL',
            },
          },
        },
        {
          $limit: 1,
        },
      ]);

      if (groups.length === 0) {
        throw new HttpException('Group not found', HttpStatus.NOT_FOUND);
      }

      const isMember = groups.some((group) => {
        return group.members?.some((member) => member.email === user.email);
      });

      if (isMember) {
        throw new HttpException(
          'User is already a member of this group',
          HttpStatus.NOT_FOUND,
        );
      }

      // const allGroups = await this.getAllGroupsByMember(user.email);

      await Promise.all(
        groups.map(async (group) => {
          const result = await this.communityModel.updateOne(
            { _id: group._id },
            { $push: { members: user } },
          );

          if (!result) {
            // return { error: 'Group not found' };
            throw new HttpException('Group not found', HttpStatus.NOT_FOUND);
          }
        }),
      );

      return { message: 'User joined the group successfully' };
    } catch (error) {
      // return { error: error.message };
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}
