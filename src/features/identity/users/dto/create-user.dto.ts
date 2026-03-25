import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsArray,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { UserStatus } from '@prisma/client';

export class UserRoleAssignmentDto {
  @IsUUID()
  shopId!: string;

  @IsUUID()
  roleId!: string;
}

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

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
