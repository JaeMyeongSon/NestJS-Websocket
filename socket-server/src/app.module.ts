import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ManagerService } from './manager/manager.service';
import { ManagerController } from './manager/manager.controller';
import { ChattingModule } from './chatting/chatting.module';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { RedisConfigService } from 'redis-config.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EntityModule, Member, SessionInfo } from '@lib/entity';
import { DataSource } from 'typeorm';
import { CommonModule } from '@lib/common';
import { SchemaModule } from '@lib/mongodb';

@Module({
  imports: [
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.${process.env.NODE_ENV}.env`,
    }),
    TypeOrmModule.forFeature([Member, DataSource, SessionInfo]),
    ChattingModule,
    EntityModule,
    CommonModule,
    SchemaModule,
  ],
  controllers: [AppController, ManagerController],
  providers: [AppService, ManagerService],
})
export class AppModule {}
