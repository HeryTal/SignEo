import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { User } from '../users/user.entity.js';
import { WorkspaceMember } from './workspace-member.entity.js';
import { Workspace } from './workspace.entity.js';
import { WorkspacesController } from './workspaces.controller.js';
import { WorkspacesService } from './workspaces.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Workspace, WorkspaceMember]),
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'local-development-secret-change-me' }),
  ],
  controllers: [WorkspacesController],
  providers: [WorkspacesService, JwtAuthGuard],
  exports: [WorkspacesService],
})
export class WorkspacesModule {}
