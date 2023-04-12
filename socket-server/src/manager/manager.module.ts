import { Member, SessionInfo } from '@lib/entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppModule } from 'src/app.module';
import { DataSource } from 'typeorm';
import { TokenCheckService } from './auth/tocket-check.service';
import { ManagerGateway } from './gateway/manager.gateway';
import { ManagerService } from './manager.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Member, DataSource, SessionInfo]),
    AppModule,
  ],
  providers: [ManagerGateway, ManagerService, TokenCheckService],
  exports: [ManagerGateway],
})
export class ManagerModule {}
