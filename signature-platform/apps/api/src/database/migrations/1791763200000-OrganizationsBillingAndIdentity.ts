import type { MigrationInterface, QueryRunner } from 'typeorm';

export class OrganizationsBillingAndIdentity1791763200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        name varchar(120) NOT NULL,
        billing_email varchar(255),
        billing_customer_id varchar(255),
        subscription_plan varchar(24) NOT NULL DEFAULT 'FREE',
        subscription_status varchar(24) NOT NULL DEFAULT 'TRIAL',
        included_envelopes_per_month integer NOT NULL DEFAULT 5,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query('ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS "organizationId" uuid');
    await queryRunner.query('CREATE TEMP TABLE workspace_organization_map (workspace_id uuid PRIMARY KEY, organization_id uuid NOT NULL) ON COMMIT DROP');
    await queryRunner.query('INSERT INTO workspace_organization_map (workspace_id, organization_id) SELECT id, uuid_generate_v4() FROM workspaces WHERE "organizationId" IS NULL');
    await queryRunner.query(`
      INSERT INTO organizations (id, name, billing_email)
      SELECT map.organization_id, workspace.name, owner.email
      FROM workspace_organization_map map
      JOIN workspaces workspace ON workspace.id = map.workspace_id
      LEFT JOIN LATERAL (
        SELECT user_record.email
        FROM workspace_members member
        JOIN users user_record ON user_record.id = member."userId"
        WHERE member."workspaceId" = workspace.id AND member.role = 'ADMIN'
        ORDER BY member.created_at ASC LIMIT 1
      ) owner ON true
    `);
    await queryRunner.query('UPDATE workspaces workspace SET "organizationId" = map.organization_id FROM workspace_organization_map map WHERE workspace.id = map.workspace_id');
    await queryRunner.query('ALTER TABLE workspaces ALTER COLUMN "organizationId" SET NOT NULL');
    const foreignKeys = await queryRunner.getTable('workspaces');
    if (!foreignKeys?.foreignKeys.some((key) => key.columnNames.length === 1 && key.columnNames[0] === 'organizationId')) {
      await queryRunner.query(`ALTER TABLE workspaces ADD CONSTRAINT "FK_workspaces_organization" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE CASCADE`);
    }
    await queryRunner.query(`UPDATE workspace_members SET role = CASE role WHEN 'MEMBER' THEN 'MANAGER' WHEN 'VIEWER' THEN 'SIGNER' ELSE role END`);
    await queryRunner.query(`ALTER TABLE workspace_members ALTER COLUMN role SET DEFAULT 'SIGNER'`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity_verifications (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        status varchar(24) NOT NULL DEFAULT 'NOT_STARTED',
        provider varchar(80),
        provider_reference varchar(255) UNIQUE,
        verified_at timestamptz,
        rejection_reason varchar(500),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migration non réversible automatiquement : les organisations, abonnements et vérifications d’identité doivent être archivés explicitement.');
  }
}
