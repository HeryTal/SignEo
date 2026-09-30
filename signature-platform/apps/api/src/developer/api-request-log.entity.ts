import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { ApiKey } from './api-key.entity.js';

@Entity('api_request_logs')
export class ApiRequestLog {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ length: 8 }) method!: string;
  @Column({ length: 255 }) path!: string;
  @ManyToOne(() => ApiKey, { onDelete: 'CASCADE' }) apiKey!: Relation<ApiKey>;
  @CreateDateColumn({ name: 'created_at' }) createdAt!: Date;
}
