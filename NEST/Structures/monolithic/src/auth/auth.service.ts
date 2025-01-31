import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UserDocument, UserModel } from 'schemas';
import { FirebaseAdminService } from 'src/firebase-admin/firebase-admin.service';
import { LoginDto } from './dtos';

/**
 * The AuthService class handles the authentication logic for the application.
 * It provides methods for user login and token verification.
 *
 * @class
 * @public
 * @module AuthService
 */
@Injectable()
export class AuthService {
  private firebaseApp: any;

  constructor(
    @InjectModel(UserModel) private readonly userModel: Model<UserDocument>,
    private firebase: FirebaseAdminService,
  ) {
    this.firebaseApp = this.firebase.getFirebaseApp();
  }

  /**
 * Logs in a user with the provided login credentials.
 * 
 * @param dto - The login credentials of the user.
 * @param idToken - The Firebase ID token for authentication.
 * @returns The user object if login is successful, otherwise throws an error.
 * @throws BadRequestException if the authorization token is not verified.
 * @throws HttpException if there is a database error or an internal server error.
 */
  async login(dto: LoginDto, idToken: string) {
    try {
      // verify the firebase token from headers and save it
      const decodedInfo = await this.firebaseApp.auth().verifyIdToken(idToken);
      if (dto.email.toLowerCase() !== decodedInfo.email.toLowerCase()) {
        throw new BadRequestException({
          statusCode: HttpStatus.FORBIDDEN,
          message: 'Forbidden request: Authorization token is not verified',
          path: '/auth/login',
        });
      }

      const user = await this.userModel.findOne({
        email: { $regex: `^${decodedInfo.email}$`, $options: 'i' },
      });

      // if exist no need to store it
      if (user != undefined || user != null) {
        return user;
      }

      const name =
        decodedInfo.name ||
        decodedInfo.displayName ||
        decodedInfo.email.split('@')[0].replace(/\./g, ' ');
      const newUser = await this.userModel.create({
        name: name,
        email: decodedInfo.email.toLowerCase(),
        profilePic: decodedInfo.picture ? decodedInfo.picture : '',
        firebaseUID: decodedInfo.uid || decodedInfo.user_id,
      });
      if (!newUser) {
        throw new HttpException(
          {
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            message: 'Database Error: User could not created successfully',
            path: '/auth/login',
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      return newUser;
    } catch (error) {
      throw new HttpException(
        {
          statusCode: error.status || HttpStatus.INTERNAL_SERVER_ERROR,
          message: error?.message || 'Internal Server Error',
          path: '/auth/login',
        },
        error.status || HttpStatus.INTERNAL_SERVER_ERROR,
        { cause: error },
      );
    }
  }
}
