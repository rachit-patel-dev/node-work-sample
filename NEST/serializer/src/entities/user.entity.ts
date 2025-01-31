import { Exclude, Expose, Transform } from 'class-transformer';
import { RoleEntity } from './role.entity';

/**
 * Represents a user entity with an identifier (id), first name, last name,
 * password (excluded from serialization), full name (exposed), and a role.
 *
 * @class UserEntity
 */
export class UserEntity {
  /**
   * The unique identifier for the user.
   * @type {number}
   */
  id: number;

  /**
   * The first name of the user.
   * @type {string}
   */
  firstName: string;

  /**
   * The last name of the user.
   * @type {string}
   */
  lastName: string;

  /**
   * The password of the user (excluded from serialization).
   * @type {string}
   */
  @Exclude()
  password: string;

  /**
   * The full name of the user (exposed).
   * @type {string}
   */
  @Expose()
  get fullName(): string {
    return `${this.firstName} ${this.lastName}`;
  }

  /**
   * The role of the user with transformation applied to get the role name.
   * @type {RoleEntity}
   */
  @Transform(({ value }) => value.name)
  role: RoleEntity;

  /**
   * Creates an instance of UserEntity.
   *
   * @param {Partial<UserEntity>} partial - Partial data to initialize the user entity.
   */
  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }
}