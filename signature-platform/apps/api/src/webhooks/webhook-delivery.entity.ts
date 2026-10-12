import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { WebhookEndpoint } from './webhook-endpoint.entity.js';
@Entity('webhook_deliveries')
@Index(['status','nextAttemptAt'])
export class WebhookDelivery {
 @PrimaryGeneratedColumn('uuid') id!:string;
 @Column({type:'uuid'}) endpointId!:string;
 @ManyToOne(()=>WebhookEndpoint,{onDelete:'CASCADE'}) endpoint!:Relation<WebhookEndpoint>;
 @Column({type:'text'}) payload!:string;
 @Column({length:64}) event!:string;
 @Column({length:24,default:'PENDING'}) status!:'PENDING'|'DELIVERED'|'FAILED';
 @Column({default:0}) attempts!:number;
 @Column({type:'timestamptz',default:()=>'now()'}) nextAttemptAt!:Date;
 @Column({type:'timestamptz',nullable:true}) lockedUntil!:Date|null;
 @Column({type:'int',nullable:true}) responseStatus!:number|null;
 @Column({type:'varchar',length:500,nullable:true}) lastError!:string|null;
 @Column({type:'timestamptz',nullable:true}) deliveredAt!:Date|null;
 @CreateDateColumn() createdAt!:Date;
}
