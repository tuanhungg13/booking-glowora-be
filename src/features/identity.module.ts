import { Module } from '@nestjs/common';
import { AuthModule } from './identity/auth/auth.module';
import { UsersModule } from './identity/users/users.module';
import { RolesModule } from './identity/roles/roles.module';
import { PermissionsModule } from './identity/permissions/permissions.module';

/**
 * Feature: Identity
 * - Auth (login, register, JWT)
 * - Users
 * - Roles
 * - Permissions (RBAC)
 */
@Module({
  imports: [AuthModule, UsersModule, RolesModule, PermissionsModule],
  exports: [AuthModule, UsersModule, RolesModule, PermissionsModule],
})
export class IdentityModule {}
