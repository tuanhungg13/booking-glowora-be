import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus } from '@prisma/client';
import { UserRoleAssignmentDto } from './create-user.dto';

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UserRoleAssignmentDto)
  roleAssignments?: UserRoleAssignmentDto[];
}
