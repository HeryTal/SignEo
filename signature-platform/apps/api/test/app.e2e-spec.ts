import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppController } from '../src/app.controller.js';
import { AppService } from '../src/app.service.js';
describe('HTTP bootstrap (database-independent)',()=>{
 let app:INestApplication;
 beforeAll(async()=>{const module=await Test.createTestingModule({controllers:[AppController],providers:[AppService]}).compile();app=module.createNestApplication();await app.init();});
 afterAll(async()=>{await app?.close();});
 it('serves health root',async()=>{await request(app.getHttpServer()).get('/').expect(200);});
});
