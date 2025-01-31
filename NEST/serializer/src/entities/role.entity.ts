/**
 * Represents a role entity with an identifier (id) and a name.
 *
 * @class RoleEntity
 */
export class RoleEntity {
  /**
   * The unique identifier for the role.
   * @type {number}
   */
  id: number;

  /**
   * The name of the role.
   * @type {string}
   */
  name: string;

  /**
   * Creates an instance of RoleEntity.
   *
   * @param {Partial<RoleEntity>} partial - Partial data to initialize the role entity.
   */
  constructor(partial: Partial<RoleEntity>) {
    Object.assign(this, partial);
  }
}
