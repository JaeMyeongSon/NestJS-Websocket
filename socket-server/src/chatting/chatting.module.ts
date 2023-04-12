import { Module } from '@nestjs/common';
import { ChattingService } from './chatting.service';
import { ChattingController } from './chatting.controller';
import { ChattingGateway } from './gateway/chatting.gateway';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Member, SessionInfo } from '@lib/entity';
import { DataSource } from 'typeorm';
import { TokenCheckService } from 'src/manager/auth/tocket-check.service';
import { RedisFunctionService } from '@lib/redis';
import { CreateFriendChattingSchema } from '@lib/mongodb';
import { MongooseModule } from '@nestjs/mongoose';
import { CreateFriendChattingRoomSchema } from '@lib/mongodb';
import { ChattingMemberInfoSchema } from '@lib/mongodb';
import { CommonModule } from '@lib/common';

@Module({
  imports: [
    TypeOrmModule.forFeature([Member, DataSource, SessionInfo]),
    MongooseModule.forFeature([
      {
        name: 'createFriendChatting',
        schema: CreateFriendChattingSchema,
      },
      {
        name: 'createFriendChattingRoom',
        schema: CreateFriendChattingRoomSchema,
      },
      {
        name: 'chattingMemberInfo',
        schema: ChattingMemberInfoSchema,
      },
    ]),
    CommonModule,
  ],
  providers: [
    ChattingService,
    ChattingGateway,
    TokenCheckService,
    RedisFunctionService,
  ],
  controllers: [ChattingController],
  exports: [ChattingGateway, ChattingService],
})
export class ChattingModule {}
