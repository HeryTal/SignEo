// One-time schema snapshot generator. Never overwrite a released migration.
import 'reflect-metadata';
import {config} from 'dotenv';
import {randomUUID} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {DataSource} from 'typeorm';
config({path:'.env',override:true,quiet:true});
const {default:source}=await import('../apps/api/dist/database/data-source.js');
const schema='baseline_'+randomUUID().replaceAll('-','');
const bootstrap=new DataSource({...source.options,entities:[],migrations:[],schema:'public'});
await bootstrap.initialize();
await bootstrap.query('CREATE SCHEMA "'+schema+'"');
const db=new DataSource({...source.options,schema,migrations:[]});
try {
 await db.initialize();
 const log=await db.driver.createSchemaBuilder().log();
 const queries=log.upQueries.map(query=>query.query.replaceAll('"'+schema+'"','"__SIGNEO_SCHEMA__"'));
 const root='apps/api/src/database/migrations';
 await mkdir(root,{recursive:true});
 const header="import type { MigrationInterface, QueryRunner } from 'typeorm';\n";
 const setup="const schema=(runner.connection.options as {schema?:string}).schema??'public';\nconst qualified=(sql:string)=>sql.replaceAll('__SIGNEO_SCHEMA__',schema.replaceAll('\\\"','\\\"\\\"'));\n";
 const initial=header+'const queries='+JSON.stringify(queries,null,2)+';\nexport class InitialSchema1791590400000 implements MigrationInterface {\nasync up(runner:QueryRunner){\n'+setup+"if(await runner.hasTable('users'))return;\nawait runner.query('CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"');\nfor(const sql of queries)await runner.query(qualified(sql));\n}\nasync down(){throw new Error('Restore a verified backup to reverse the initial schema.');}\n}\n";
 await writeFile(root+'/1791590400000-InitialSchema.ts',initial,{flag:'wx'});
 const tables=['auth_sessions','contacts','webhook_deliveries'];
 const additions=Object.fromEntries(tables.map(table=>[table,queries.filter(sql=>sql.includes('"'+table+'"') && (sql.startsWith('CREATE TABLE')||sql.startsWith('CREATE INDEX')||sql.startsWith('CREATE UNIQUE INDEX')||sql.startsWith('ALTER TABLE')))]));
 const upgrade=header+'const additions='+JSON.stringify(additions,null,2)+';\nexport class ProductionReadiness1791849600000 implements MigrationInterface {\nasync up(runner:QueryRunner){\n'+setup+"await runner.query('ALTER TABLE \"'+schema.replaceAll('\"','\"\"')+'\".users ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0');\nfor(const [table,queries] of Object.entries(additions)){if(await runner.hasTable(table))continue;for(const sql of queries)await runner.query(qualified(sql));}\n}\nasync down(){throw new Error('Archive sessions, contacts and deliveries before rolling back.');}\n}\n";
 await writeFile(root+'/1791849600000-ProductionReadiness.ts',upgrade,{flag:'wx'});
 console.log('Frozen baseline:',queries.length,'statements; additive migration:',Object.keys(additions).length,'tables');
}finally{await db.destroy().catch(()=>{});await bootstrap.query('DROP SCHEMA "'+schema+'" CASCADE');await bootstrap.destroy();}
