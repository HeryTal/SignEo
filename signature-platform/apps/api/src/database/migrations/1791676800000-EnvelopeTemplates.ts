import { Table, TableForeignKey } from 'typeorm';
import type { MigrationInterface, QueryRunner } from 'typeorm';

export class EnvelopeTemplates1791676800000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Development databases may already have this table through synchronize.
    if (await queryRunner.hasTable('envelope_templates')) return;
    await queryRunner.createTable(new Table({
      name: 'envelope_templates',
      columns: [
        { name: 'id', type: 'uuid', isPrimary: true, isGenerated: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
        { name: 'title', type: 'varchar', length: '180' },
        { name: 'message', type: 'text', default: "''" },
        ...['documents', 'fields', 'recipients', 'collection_requests'].map((name) => ({ name, type: 'jsonb', default: "'[]'::jsonb" })),
        { name: 'preparation_settings', type: 'jsonb', default: "'{}'::jsonb" },
        { name: 'allow_decline', type: 'boolean', default: false },
        { name: 'expiration_days', type: 'integer', isNullable: true },
        { name: 'ownerId', type: 'uuid' },
        { name: 'workspaceId', type: 'uuid', isNullable: true },
        { name: 'created_at', type: 'timestamp', default: 'now()' },
      ],
      foreignKeys: [
        new TableForeignKey({ columnNames: ['ownerId'], referencedTableName: 'users', referencedColumnNames: ['id'], onDelete: 'CASCADE' }),
        new TableForeignKey({ columnNames: ['workspaceId'], referencedTableName: 'workspaces', referencedColumnNames: ['id'], onDelete: 'SET NULL' }),
      ],
    }));
  }

  async down(): Promise<void> {
    // Templates contain durable user documents. Never drop them automatically.
    throw new Error('Migration non réversible automatiquement : sauvegardez et retirez explicitement les modèles avant un retour arrière.');
  }
}
