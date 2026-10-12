import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Contact } from './contact.entity.js';
import { WorkspacesService } from '../workspaces/workspaces.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
type Request = {user:{sub:string}};
type Input = {name?:unknown;email?:unknown;company?:unknown;phone?:unknown;notes?:unknown};
export function contactInput(body:Input) {
 const text=(key:keyof Input,max:number)=>{const value=body[key]??'';if(typeof value!=='string'||value.trim().length>max)throw new BadRequestException('Champ invalide : '+key);return value.trim();};
 const value={name:text('name',120),email:text('email',255).toLowerCase(),company:text('company',120),phone:text('phone',32),notes:text('notes',2000)};
 if(!value.name||!/^\S+@\S+\.\S+$/.test(value.email))throw new BadRequestException('Nom et e-mail valides requis.');
 return value;
}
@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
 constructor(@InjectRepository(Contact) private readonly contacts:Repository<Contact>,private readonly workspaces:WorkspacesService){}
 @Get() async list(@Req() request:Request){const member=await this.workspaces.activeForUser(request.user.sub);return {canEdit:member.role!=='APPROVER',items:await this.contacts.find({where:{workspaceId:member.workspace.id},order:{name:'ASC'}})};}
 @Post() async create(@Req() request:Request,@Body() body:Input){const member=await this.workspaces.activeForUser(request.user.sub);this.workspaces.requireWrite(member.role);return this.persist(this.contacts.create({...contactInput(body),workspaceId:member.workspace.id}));}
 @Patch(':id') async update(@Req() request:Request,@Param('id',ParseUUIDPipe) id:string,@Body() body:Input){const member=await this.workspaces.activeForUser(request.user.sub);this.workspaces.requireWrite(member.role);const contact=await this.contacts.findOneBy({id,workspaceId:member.workspace.id});if(!contact)throw new NotFoundException('Contact introuvable.');return this.persist(Object.assign(contact,contactInput(body)));}
 @Delete(':id') async remove(@Req() request:Request,@Param('id',ParseUUIDPipe) id:string){const member=await this.workspaces.activeForUser(request.user.sub);this.workspaces.requireWrite(member.role);const result=await this.contacts.delete({id,workspaceId:member.workspace.id});if(!result.affected)throw new NotFoundException('Contact introuvable.');return {deleted:true};}
 private async persist(contact:Contact){try{return await this.contacts.save(contact);}catch(error){if((error as {code?:string}).code==='23505')throw new ConflictException('Ce contact existe déjà dans cet espace.');throw error;}}
}
