import { IsOptional, IsString } from 'class-validator';

/**
 * Represents a favorite list data transfer object.
 */
export class FavoriteListDto {
  @IsString()
  email: string;

  @IsString()
  @IsOptional()
  type: string;
}
