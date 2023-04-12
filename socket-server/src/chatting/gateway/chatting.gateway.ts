import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Redis } from 'ioredis';
import { ChattingService } from '../chatting.service';
import { Logger } from '@nestjs/common';
import { Socket, Server } from 'socket.io';
import {
  CHATTING_SOCKET_CLIENT_MESSAGE,
  CHATTING_SOCKET_SERVER_MESSAGE,
} from '@lib/constants';

@WebSocketGateway({
  namespace: 'chatting',
  pingInterval: 10000, //10초마다 클라이언트에게 ping을 보냄
  pingTimeout: 5000, //클라이언트로부터 ping을 5초동안 받지 못하면 연결 해제
})
export class ChattingGateway {
  constructor(
    @InjectRedis() private readonly redisClient: Redis,
    private readonly chattingService: ChattingService,
  ) {}
  private static readonly logger = new Logger(ChattingGateway.name);

  async handleConnection(client: Socket) {
    ChattingGateway.logger.debug('채팅 소켓 연결' + client.id);
    await this.chattingService.handleConnection(client);
  }

  async handleDisconnect(client: Socket) {
    ChattingGateway.logger.debug(`삭제 되는 RoomId :  ${client.data.roomId}`);
    ChattingGateway.logger.debug(
      `삭제 되는 memberId :  ${client.data.memberId}`,
    );
    const playerIds = await this.redisClient.smembers(
      `${client.data.roomId}:playerlist`,
    );
    console.log(playerIds);
    if (playerIds.length === 1) {
      await this.redisClient.del(`${client.data.roomId}`);
    }
    await this.redisClient.srem(
      `${client.data.roomId}:playerlist`,
      client.data.memberId,
    );

    console.log('채팅 소켓 연결 해제' + client.id);
  }

  //메시지가 전송되면 모든 유저에게 메시지 전송
  @SubscribeMessage(CHATTING_SOCKET_SERVER_MESSAGE.SendMessage)
  async sendMessage(client: Socket, message: string) {
    return this.chattingService.sendMessage(client, message);
  }

  // 월드 DM이 전송되면 특정 유저에게 메시지 전송
  @SubscribeMessage(CHATTING_SOCKET_SERVER_MESSAGE.SendDirectMessage)
  async sendDirectMessage(
    client: Socket,
    payload: { targetMemberId: string; message: string },
  ) {
    console.log('DM 이벤트 발생 ');

    console.log(payload);
    return this.chattingService.sendDirectMessage(
      client,
      payload.targetMemberId,
      payload.message,
    );
  }

  // 친구 DM이 전송되면 친구 에게 메시지 전송
  @SubscribeMessage(CHATTING_SOCKET_SERVER_MESSAGE.SendFriendDirectMessage)
  async sendFriendDirectMessage(
    client: Socket,
    payload: { targetMemberId: string; message: string },
  ) {
    console.log('DM 이벤트 발생 ');

    console.log(payload);
    return this.chattingService.sendFriendDirectMessage(
      client,
      payload.targetMemberId,
      payload.message,
    );
  }

  // 채팅 방 입장
  @SubscribeMessage(CHATTING_SOCKET_SERVER_MESSAGE.EnterChatRoom)
  async enterChatRoom(client: Socket, roomId: string) {
    //이미 접속해있는 방 일 경우 재접속 차단
    console.log(client.rooms);
    console.log(client.rooms.has(roomId));
    if (client.rooms.has(roomId)) {
      ChattingGateway.logger.debug('이미 접속 중인 입니다.');
      return client.emit(
        CHATTING_SOCKET_CLIENT_MESSAGE.ClientSendMessage,
        '알림 : 이미 접속 중인 방 입니다.',
      );
    }

    await this.chattingService.enterChatRoom(client, roomId);
  }

  // 채팅 방 나가기
  @SubscribeMessage(CHATTING_SOCKET_SERVER_MESSAGE.ExitChatRoom)
  async exitChatRoom(client: Socket) {
    ChattingGateway.logger.debug(
      '채팅 방 퇴장 이벤트 발생' + client.data.roomId,
    );
    await this.chattingService.exitChatRoom(client, client.data.roomId);
  }
}
