import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Workspace } from '../workspaces/workspace.entity.js';
@Entity('contacts')
@Index(['workspaceId','email'],{unique:true})
export class Contact {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'uuid'}) workspaceId!:string;
 @ManyToOne(()=>Workspace,{onDelete:'CASCADE'}) workspace!:Relation<Workspace>;
 @Column({length:120}) name!:string;
 @Column({length:255}) email!:string;
 @Column({length:120,default:''}) company!:string;
 @Column({length:32,default:''}) phone!:string;
 @Column({type:'text',default:''}) notes!:string;
 @CreateDateColumn() createdAt!:Date;
 @UpdateDateColumn() updatedAt!:Date;
}
