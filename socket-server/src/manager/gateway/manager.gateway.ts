import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Decrypt } from '@lib/common';
import { Injectable, Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Redis } from 'ioredis';
import { ManagerService } from '../manager.service';
import { TokenCheckService } from '../auth/tocket-check.service';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  pingInterval: 10000, //10초마다 클라이언트에게 ping을 보냄
  pingTimeout: 5000, //클라이언트로부터 ping을 5초동안 받지 못하면 연결 해제
})
@Injectable()
export class ManagerGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  constructor(
    @InjectRedis() private readonly redisClient: Redis,
    private readonly managerService: ManagerService,
    private readonly tokenCheckService: TokenCheckService,
  ) {}
  private static readonly logger = new Logger(ManagerGateway.name);
  @WebSocketServer()
  server: Server;

  // 초기화
  async afterInit() {
    // 기본 로비 셋팅
    // await this.redisClient.set(
    //   'room:lobby',
    //   JSON.stringify({ roomId: 'room:lobby', roomName: '로비', cheifId: null }),
    // );
    ManagerGateway.logger.debug('서버가 실행되었어요.');
  }

  //소켓 연결
  async handleConnection(client: Socket) {
    const jwtAccessToken = String(
      Decrypt(client.handshake.auth.jwtAccessToken),
    );
    const sessionId = String(Decrypt(client.handshake.auth.sessionId));
    return this.managerService.handleConnection(
      this.server,
      client,
      jwtAccessToken,
      sessionId,
    );
  }

  //소켓 해제
  async handleDisconnect(client: Socket) {
    await this.redisClient.del(`socket:${client.data.memberId}`);

    ManagerGateway.logger.debug('disonnected', client.id);
    ManagerGateway.logger.debug(`${client.id} 소켓 연결 해제 ❌`);
  }

  // 테스트 디버그 메세지
  @SubscribeMessage('debugMessage')
  async debugMessage(client: Socket, message: string) {
    ManagerGateway.logger.debug('디버그 메세지 : ' + message);
  }
}
