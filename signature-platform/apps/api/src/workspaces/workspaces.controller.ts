import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { type WorkspaceRole } from './workspace-member.entity.js';
import { WorkspacesService } from './workspaces.service.js';

type AuthenticatedRequest = Request & { user: { sub: string } };

@Controller('workspaces')
@UseGuards(JwtAuthGuard)
export class WorkspacesController {
  constructor(private readonly workspaces: WorkspacesService) {}
  @Get('current') current(@Req() request: AuthenticatedRequest) { return this.workspaces.membersForActive(request.user.sub); }
  @Post() create(@Req() request: AuthenticatedRequest, @Body() body: { name?: string }) { return this.workspaces.createWorkspace(request.user.sub, body.name ?? ''); }
  @Post('select') select(@Req() request: AuthenticatedRequest, @Body() body: { workspaceId?: string }) { if (!body.workspaceId) throw new BadRequestException('Espace requis.'); return this.workspaces.selectWorkspace(request.user.sub, body.workspaceId); }
  @Post('members') addMember(@Req() request: AuthenticatedRequest, @Body() body: { email?: string; role?: WorkspaceRole }) { if (!body.email?.trim() || !body.role) throw new BadRequestException('E-mail et rôle requis.'); return this.workspaces.addMember(request.user.sub, body.email, body.role); }
  @Patch('members/:id') updateRole(@Req() request: AuthenticatedRequest, @Param('id') id: string, @Body() body: { role?: WorkspaceRole }) { if (!body.role) throw new BadRequestException('Rôle requis.'); return this.workspaces.updateMemberRole(request.user.sub, id, body.role); }
  @Delete('members/:id') removeMember(@Req() request: AuthenticatedRequest, @Param('id') id: string) { return this.workspaces.removeMember(request.user.sub, id); }
}
