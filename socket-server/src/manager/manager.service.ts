import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Member, SessionInfo } from '@lib/entity';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Redis } from 'ioredis';
import { Server, Socket } from 'socket.io';
import { DataSource, Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { CHATTING_SOCKET_SERVER_GLOBAL } from '@lib/constants';

@Injectable()
export class ManagerService {
  constructor(
    @InjectRedis() private readonly redisClient: Redis,
    @InjectRepository(SessionInfo)
    private sessionRepository: Repository<SessionInfo>,
    @Inject(DataSource) private dataSource: DataSource,
  ) {}
  private static readonly logger = new Logger(ManagerService.name);

  //소켓 연결
  async handleConnection(
    server: Server,
    client: Socket,
    jwtAccessToken: string,
    sessionId: string,
  ) {
    interface JwtPayload {
      idx: string;
    }

    console.log(`jwtAccessToken : ${jwtAccessToken}`);
    console.log(`sessionId : ${sessionId}`);

    //토큰 검증
    await jwt.verify(jwtAccessToken, process.env.SECRET_KEY, (err, decoded) => {
      if (err) {
        client.disconnect();
        console.log('err : ' + err);
        return;
      }
      const payload = decoded as JwtPayload;
      client['data'].memberId = payload.idx;
    });

    const sessionInfo = await this.sessionRepository.findOne({
      where: {
        memberId: client.data.memberId,
      },
    });

    // 세션 아이디 검증
    if (sessionId !== sessionInfo.sessionId) {
      console.log('세션 아이디가 일치하지 않습니다.');
      client.disconnect();
      return;
    }

    // 중복 로그인 검증
    const socketInfo = await this.redisClient.get(
      `socket:${client.data.memberId}`,
    );
    if (socketInfo) {
      const socketData = JSON.parse(socketInfo);

      console.log('중복 로그인 감지 : ' + socketData.socketId);
      // 클라이언트에게 중복 로그인 알림
      server
        .to(socketData.socketId)
        .emit(
          CHATTING_SOCKET_SERVER_GLOBAL.DropPlayer,
          '중복 로그인이 감지되었습니다.\n다시 로그인 후 접속 해주세요.',
        );
      // 서버에서 소켓 연결 제거
      server.sockets.sockets.get(socketData.socketId)?.disconnect();
      // 서버에 저장된 소켓 정보 삭제
      await this.redisClient.del(`socket:${client.data.memberId}`);
    }

    //사용자 닉네임 조회
    const memberNickname = await this.dataSource.getRepository(Member).findOne({
      where: {
        memberId: client.data.memberId,
      },
    });

    if (memberNickname.nickname !== null) {
      //소켓에 사용자 정보 저장
      client['data'].nickname = memberNickname.nickname;
      client['data'].sessionId = sessionId;
      client['data'].roomId = '';

      // client.join('room:lobby');
      ManagerService.logger.debug(
        '사용자 정보 : ' + JSON.stringify(client.data),
      );
      ManagerService.logger.debug('소켓 연결됨 ✅', client.id);

      await this.redisClient.set(
        `socket:${client.data.memberId}`,
        JSON.stringify(client.data),
      );
      console.log(`${client.id} 소켓 연결`);

      //소켓 연결시 클라이언트에게 사용자 정보 전송
      client.emit(
        CHATTING_SOCKET_SERVER_GLOBAL.PlayerConnected,
        JSON.stringify(client.data),
      );
    } else {
      client.disconnect();
      return;
    }
  }
}
