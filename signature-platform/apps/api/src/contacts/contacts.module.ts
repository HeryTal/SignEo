import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Contact } from './contact.entity.js';
import { ContactsController } from './contacts.controller.js';
import { WorkspacesModule } from '../workspaces/workspaces.module.js';
import { AuthModule } from '../auth/auth.module.js';
@Module({imports:[TypeOrmModule.forFeature([Contact]),WorkspacesModule,AuthModule],controllers:[ContactsController]})
export class ContactsModule {}
