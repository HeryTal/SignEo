import type { MigrationInterface, QueryRunner } from 'typeorm';
const additions={
  "auth_sessions": [
    "CREATE TABLE \"__SIGNEO_SCHEMA__\".\"auth_sessions\" (\"id\" uuid NOT NULL DEFAULT uuid_generate_v4(), \"userId\" uuid NOT NULL, \"label\" character varying(160) NOT NULL DEFAULT 'Navigateur web', \"expiresAt\" TIMESTAMP WITH TIME ZONE NOT NULL, \"revokedAt\" TIMESTAMP WITH TIME ZONE, \"createdAt\" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT \"PK_641507381f32580e8479efc36cd\" PRIMARY KEY (\"id\"))",
    "CREATE INDEX \"IDX_925b24d7fc2f9324ce972aee02\" ON \"__SIGNEO_SCHEMA__\".\"auth_sessions\"  (\"userId\") ",
    "ALTER TABLE \"__SIGNEO_SCHEMA__\".\"auth_sessions\" ADD CONSTRAINT \"FK_925b24d7fc2f9324ce972aee025\" FOREIGN KEY (\"userId\") REFERENCES \"__SIGNEO_SCHEMA__\".\"users\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION"
  ],
  "contacts": [
    "CREATE TABLE \"__SIGNEO_SCHEMA__\".\"contacts\" (\"id\" uuid NOT NULL DEFAULT uuid_generate_v4(), \"workspaceId\" uuid NOT NULL, \"name\" character varying(120) NOT NULL, \"email\" character varying(255) NOT NULL, \"company\" character varying(120) NOT NULL DEFAULT '', \"phone\" character varying(32) NOT NULL DEFAULT '', \"notes\" text NOT NULL DEFAULT '', \"createdAt\" TIMESTAMP NOT NULL DEFAULT now(), \"updatedAt\" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT \"PK_b99cd40cfd66a99f1571f4f72e6\" PRIMARY KEY (\"id\"))",
    "CREATE UNIQUE INDEX \"IDX_d027af27a300737fb7e13a7866\" ON \"__SIGNEO_SCHEMA__\".\"contacts\"  (\"workspaceId\", \"email\") ",
    "ALTER TABLE \"__SIGNEO_SCHEMA__\".\"contacts\" ADD CONSTRAINT \"FK_60c505f7ac4b3dae62c6fbc486f\" FOREIGN KEY (\"workspaceId\") REFERENCES \"__SIGNEO_SCHEMA__\".\"workspaces\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION"
  ],
  "webhook_deliveries": [
    "CREATE TABLE \"__SIGNEO_SCHEMA__\".\"webhook_deliveries\" (\"id\" uuid NOT NULL DEFAULT uuid_generate_v4(), \"endpointId\" uuid NOT NULL, \"payload\" text NOT NULL, \"event\" character varying(64) NOT NULL, \"status\" character varying(24) NOT NULL DEFAULT 'PENDING', \"attempts\" integer NOT NULL DEFAULT '0', \"nextAttemptAt\" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), \"lockedUntil\" TIMESTAMP WITH TIME ZONE, \"responseStatus\" integer, \"lastError\" character varying(500), \"deliveredAt\" TIMESTAMP WITH TIME ZONE, \"createdAt\" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT \"PK_535dd409947fb6d8fc6dfc0112a\" PRIMARY KEY (\"id\"))",
    "CREATE INDEX \"IDX_2ea65145f74113a92ac3107d54\" ON \"__SIGNEO_SCHEMA__\".\"webhook_deliveries\"  (\"status\", \"nextAttemptAt\") ",
    "ALTER TABLE \"__SIGNEO_SCHEMA__\".\"webhook_deliveries\" ADD CONSTRAINT \"FK_9f63fc91ff6cbd3f8238b9a7812\" FOREIGN KEY (\"endpointId\") REFERENCES \"__SIGNEO_SCHEMA__\".\"webhook_endpoints\"(\"id\") ON DELETE CASCADE ON UPDATE NO ACTION"
  ]
};
export class ProductionReadiness1791849600000 implements MigrationInterface {
async up(runner:QueryRunner){
const schema=(runner.connection.options as {schema?:string}).schema??'public';
const qualified=(sql:string)=>sql.replaceAll('__SIGNEO_SCHEMA__',schema.replaceAll('\"','\"\"'));
await runner.query('ALTER TABLE "'+schema.replaceAll('"','""')+'".users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0');
for(const [table,queries] of Object.entries(additions)){if(await runner.hasTable(table))continue;for(const sql of queries)await runner.query(qualified(sql));}
}
async down(){throw new Error('Archive sessions, contacts and deliveries before rolling back.');}
}
