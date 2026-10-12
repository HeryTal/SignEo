import { Column, CreateDateColumn, Entity, Index, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from '../users/user.entity.js';
@Entity('auth_sessions')
export class AuthSession {
 @PrimaryGeneratedColumn('uuid') id!: string;
 @Index() @Column({type:'uuid'}) userId!: string;
 @ManyToOne(() => User, {onDelete:'CASCADE'}) user!: Relation<User>;
 @Column({length:160, default:'Navigateur web'}) label!: string;
 @Column({type:'timestamptz'}) expiresAt!: Date;
 @Column({type:'timestamptz', nullable:true}) revokedAt!: Date | null;
 @CreateDateColumn() createdAt!: Date;
}
