import {Controller,Get,ServiceUnavailableException} from '@nestjs/common';
import {DataSource} from 'typeorm';
import {access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
@Controller('health')
export class HealthController {
 constructor(private readonly db:DataSource){}
 @Get('live') live(){return {status:'ok'};}
 @Get('ready') async ready(){try{await this.db.query('SELECT 1');if(process.env.NODE_ENV==='production')await access(resolve(process.env.UPLOAD_DIRECTORY!),constants.R_OK|constants.W_OK);return {status:'ready'};}catch{throw new ServiceUnavailableException('Service not ready');}}
}
