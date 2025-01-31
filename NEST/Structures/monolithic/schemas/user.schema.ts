import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * Represents a User in the system.
 *
 * @remarks
 * This class is used to store information about a user.
 *
 * @public
 */
@Schema({ timestamps: true })
export class User {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true, unique: true })
  email: string;

  @Prop({ type: String, required: true })
  firebaseUID: string;

  @Prop({ type: String })
  ageRange: string;

  @Prop({ type: String })
  gender: string;

  @Prop({ type: String, default: '' })
  profilePic: string;

  @Prop({ type: String })
  fcmToken: string;

  @Prop({ type: String })
  facebookLink: string;

  @Prop({ type: String })
  instagramLink: string;

  @Prop({ type: String })
  phone: string;

  @Prop({ type: Boolean })
  isPhoneVerfied: boolean;

  @Prop({ type: String })
  aboutMe?: string;

  @Prop({ type: Boolean, default: false })
  onboarded: boolean;

  @Prop({ type: Boolean, default: false })
  isExistingUser: boolean;

  @Prop({ type: Boolean, default: false })
  isCoach: boolean;

  @Prop({ type: String })
  stripeCustomerId: string;

  @Prop({ type: String })
  stripeSubscriptionId: string;

  @Prop({ type: Boolean, default: false })
  pro: boolean;

  @Prop({ type: String, default: 'en' })
  lang: string;

  // @Prop({ type: Number, default: 0.0 })
  // rating: 0.0;

  @Prop({ type: Number, default: 0 })
  noOfGames: 0; // total number of games, no matter which games. ex- I've played 2 padel, 3 tennis and 5 badminton, so noOfGames=10

  @Prop({ type: Number, default: 0 })
  noOfTrainings: 0; // similar as noOfGames

  @Prop({ type: Number, default: 0 })
  noOfTournaments: 0; // similar as noOfGames

  @Prop({ type: Boolean, default: true })
  showUpcomingActivities: boolean;

  @Prop({ type: Boolean, default: true })
  showPlayedActivities: boolean;

  @Prop({ type: String, enum: ['IAP', 'STRIPE'] })
  subscriptionMethod: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ stripeCustomerId: 1, stripeSubscriptionId: 1 });
UserSchema.index({ fcmToken: 1 });

export const UserModel = User.name;
export type UserDocument = User & Document;
