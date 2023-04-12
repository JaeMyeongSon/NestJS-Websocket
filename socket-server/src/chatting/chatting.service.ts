import { InjectRedis } from '@liaoliaots/nestjs-redis';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';

import { TokenCheckService } from 'src/manager/auth/tocket-check.service';
import { promisify } from 'util';
import { RedisFunctionService } from '@lib/redis';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateFriendChatting } from '@lib/mongodb';
import { CreateFriendChattingRoom } from '@lib/mongodb';
import { ChattingMemberInfo } from '@lib/mongodb';
import { CommonService } from '@lib/common';
import { DataSource, Repository } from 'typeorm';
import { Member } from '@lib/entity';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ChattingService {
  private static readonly logger = new Logger(ChattingService.name);
  constructor(
    @InjectRedis() private readonly redisClient: Redis,
    @InjectModel('createFriendChattingRoom')
    private readonly createFriendChattingRoom: Model<CreateFriendChattingRoom>,
    @InjectModel('createFriendChatting')
    private readonly createFriendChatting: Model<CreateFriendChatting>,
    @InjectModel('chattingMemberInfo')
    private readonly chattingMemberInfo: Model<ChattingMemberInfo>,
    private readonly tokenCheckService: TokenCheckService,
    private readonly redisFunctionService: RedisFunctionService,
    private readonly commonService: CommonService,
    @InjectRepository(Member) private memberRepository: Repository<Member>,
    @Inject(DataSource) private dataSource,
  ) {}

  // 소켓 연결
  async handleConnection(client: Socket) {
    const memberInfo = await this.tokenCheckService.checkLoginToken(
      client.handshake.auth.jwtAccessToken,
    );

    // 해당 멤버가 존재하지 않을 경우 연결 종료
    if (!memberInfo) {
      client.disconnect();
      return;
    }

    client.join(memberInfo.memberInfo.memberId);
    client['data'].memberId = memberInfo.memberInfo.memberId;
    client['data'].sessionId = client.handshake.auth.sessionId;
    client['data'].jwtAccessToken = client.handshake.auth.jwtAccessToken;
    await this.sendFriendDirectMessage(client, '너냐?~~~', '나라니까?~');
    await this.getFriendDirectMessage(
      client,
      'b0262d45-8f0c-49f4-a790-76f545491bdd',
    );
    await this.getFriendDirectMessageList(client);
    // this.getFriendDirectMessageList(client);
    console.log(
      `채팅 서버에 연결되었어요 ✅ \n${memberInfo.memberInfo.memberId}`,
    );
  }

  // 메세지 받기
  async sendMessage(client: Socket, message: string) {
    ChattingService.logger.debug('받은 메세지 : ' + message);

    console.log('@@@@@@@@@@@ socketDATA @@@@@@@@@@@');
    console.log(client.data);
    const memberInfo = await this.tokenCheckService.checkLoginToken(
      client.handshake.auth.jwtAccessToken,
    );

    const socketInfo = await this.redisClient.get(
      `socket:${memberInfo.memberInfo.memberId}`,
    );

    if (!memberInfo) {
      client.disconnect();
      return;
    }

    //memberinfo 에서 닉네임 가져오기
    console.log('채팅에서 호출한 닉네임');
    console.log(memberInfo.memberInfo.nickname);

    // 메세지 요청한 클라이언트에게 메세지 전송
    client.emit(
      'S_SendDirectMessage',
      memberInfo.memberInfo.nickname + ':' + message,
    );

    //현재 접속중인 방 모든 유저에게 메세지 전송
    // client
    //   .to(client.data.roomId)
    //   .emit('C_SendMessage', memberInfo.memberInfo.nickname + ':' + message);
    client.broadcast
      .to(client.data.roomId)
      .emit(
        'S_SendDirectMessage',
        memberInfo.memberInfo.nickname + ':' + message,
      );
  }

  // 월드 귓속말 특정 소켓에만 메세지 전송
  async sendDirectMessage(
    client: Socket,
    targetMemberId: any,
    message: string,
  ) {
    // if (!targetSocket || targetSocket === undefined) {
    //   return client.emit('GetMessage', '알림 : 귓속말 대상이 존재하지 않습니다.');
    // }

    // if (!targetSocket.  nected) {
    //   return client.emit('GetMessage', '알림 : 귓속말 대상이 현재 오프라인 상태 입니다.');
    // }

    const targetSocket = await this.redisClient.get(`socket:${targetMemberId}`);

    if (!targetSocket) {
      return client.emit(
        'GetMessage',
        '알림 : 귓속말 대상이 현재 오프라인 상태이거나 존재하지 않습니다.',
      );
    }

    ChattingService.logger.debug('payload' + { message });
    ChattingService.logger.debug(
      '받는 사람 : ' + JSON.parse(targetSocket).nickname,
    );
    ChattingService.logger.debug('받은 메세지 : ' + { message });

    //현재 클라이언트에게 메세지 전송
    client.emit(
      'C_SendMessage',
      `[DM]${JSON.parse(targetSocket).nickname}에게 보낸 메세지:${message}`,
    );

    // 특정 방에 접속해있는 특정 소켓에게만 메세지 전송
    client
      .to(targetMemberId)
      .emit(
        'C_SendMessage',
        `[DM]${JSON.parse(targetSocket).nickname}이 보낸 메세지 :${message}`,
      );
  }

  // 친구 채팅 방 만들기
  async createFriendDirectMessageRooms(client: Socket, targetMemberId: any) {
    const memberId = client['data'].memberId;
    const roomId = uuidv4();

    const newChattingRoom = await new this.createFriendChattingRoom({
      roomId: roomId,
      memberIds: [memberId, targetMemberId],
    });

    await newChattingRoom.save();

    // 본인 정보에 방 추가
    const existingMemberChattingRoomInfo =
      await this.chattingMemberInfo.findOne({ memberId: memberId });
    if (existingMemberChattingRoomInfo) {
      // 문서가 존재할 경우, 해당 문서의 rooms 필드에 roomId를 추가합니다.
      existingMemberChattingRoomInfo.rooms.push(roomId);

      // 변경된 정보를 저장합니다.
      await existingMemberChattingRoomInfo.save();

      console.log(
        `Member ${memberId}'s rooms updated: `,
        existingMemberChattingRoomInfo,
      );
    } else {
      const newMemberChattingRoomInfo = await new this.chattingMemberInfo({
        memberId: memberId,
        rooms: [roomId],
      });
      await newMemberChattingRoomInfo.save();
    }

    // 상대 정보에 방 추가
    const existingTargetMemberChattingRoomInfo =
      await this.chattingMemberInfo.findOne({ memberId: targetMemberId });
    if (existingTargetMemberChattingRoomInfo) {
      // 문서가 존재할 경우, 해당 문서의 rooms 필드에 roomId를 추가합니다.
      existingTargetMemberChattingRoomInfo.rooms.push(roomId);

      // 변경된 정보를 저장합니다.
      await existingTargetMemberChattingRoomInfo.save();

      console.log(
        `Member ${targetMemberId}'s rooms updated: `,
        existingTargetMemberChattingRoomInfo,
      );
    } else {
      const newTargetMemberChattingRoomInfo = await new this.chattingMemberInfo(
        {
          memberId: targetMemberId,
          rooms: [roomId],
        },
      );
      await newTargetMemberChattingRoomInfo.save();
    }

    return roomId;
  }

  // 친구에게 다이렉트 메세지 전송
  async sendFriendDirectMessage(
    client: Socket,
    targetMemberId: any,
    message: string,
  ) {
    const memberId = client['data'].memberId;

    const messageId = uuidv4();

    const findChattingRoom = await this.createFriendChattingRoom.findOne({
      $and: [{ memberIds: memberId }, { memberIds: targetMemberId }],
    });

    console.log('채팅 룸을 찾아볼게요');
    console.log(findChattingRoom);
    // 채팅 방이 없으면 채팅 방 만들기
    if (findChattingRoom === null) {
      const room = await this.createFriendDirectMessageRooms(
        client,
        targetMemberId,
      );

      console.log('룸 만든다~~~~~~~');
      console.log(room);
      const newChatting = await new this.createFriendChatting({
        messageId: messageId,
        roomId: room,
        memberId: memberId,
        message: message,
        unReadMembers: [targetMemberId],
      });
      await newChatting.save();
    } else {
      console.log('채팅 룸을 찾았어요');
      console.log(findChattingRoom);

      const roomId = findChattingRoom.roomId;
      console.log('채팅 룸 아이디 ^^');
      console.log(roomId);
      const newChatting = await new this.createFriendChatting({
        messageId: messageId,
        roomId: roomId,
        memberId: memberId,
        message: message,
        unReadMembers: [targetMemberId],
      });
      await newChatting.save();
    }

    client.emit(
      'C_SendMessage',
      `[DM]${targetMemberId}에게 보낸 메세지:${message}`,
    );

    // 특정 방에 접속해있는 특정 소켓에게만 메세지 전송
    client
      .to(targetMemberId)
      .emit(
        'C_SendMessage',
        `[DM]${client['data'].memberId}가 보낸 메세지 :${message}`,
      );

    console.log('저장했옹');
  }

  // 친구 채팅 매세지 리스트 가져오기
  async getFriendDirectMessageList(client: Socket) {
    const memberId = client['data'].memberId;

    // 채팅방 목록
    const chattingList = [];

    // 접속 중인 채팅방 전체 불러오기
    const findChattingRoom = await this.chattingMemberInfo.find({
      memberId: memberId,
    });

    console.log('방만 정리 해볼게 ~~~~~~~~~~~~~~~~~~~~~~~~~~');

    const member = await this.dataSource.getRepository(Member).findOne({
      where: {
        memberId: memberId,
      },
    });

    // 아바타 정보를 조회
    const avatarInfo = await this.commonService.getMemberAvatarInfo(
      member.memberCode,
    );

    // 방에 있는 마지막 채팅 내용 하나씩만 불러오기
    if (findChattingRoom && findChattingRoom.length > 0) {
      for (let i = 0; i < findChattingRoom[0].rooms.length; i++) {
        console.log('방에 있는 채팅 내용 불러오기');
        console.log(findChattingRoom[0].rooms[i]);

        //createdAt 기준으로 내림차순 정렬 후, limit 1개만 가져오기
        const findChatting = await this.createFriendChatting
          .find({
            roomId: findChattingRoom[0].rooms[i],
          })
          .sort({ createdAt: -1 })
          .limit(1);

        //채팅 내용
        console.log(findChatting);

        //findChattting 내에 있는 unreadMembers 배열에 memberId가 있는지 개수만큼 확인
        //안읽은 매세지 개수 확인
        const findUnreadChatting = await this.createFriendChatting.find({
          roomId: findChattingRoom[0].rooms[i],
          unReadMembers: { $in: [memberId] },
        });

        chattingList.push({
          chattingList: findChatting,
          unReadCount: findUnreadChatting.length,
          avatarInfo: avatarInfo,
        });
      }
      return chattingList;
    }
  }

  // 친구 다이렉트 매세지 가져오기
  async getFriendDirectMessage(client: Socket, roomId: string) {
    const memberId = client['data'].memberId;

    //테스트를 위해 임의로 DTO 상수 선언
    const paginationDto = {
      page: 1,
      limit: 10,
    };

    const page = paginationDto.page ? paginationDto.page : 1;
    const limit = paginationDto.limit ? paginationDto.limit : 10;
    const skip = (page - 1) * limit;
    const findChatting = await this.createFriendChatting
      .find({
        roomId: roomId,
      })
      .skip(skip)
      .limit(limit);

    console.log('친구 채팅 내용 불러오기 페이지 네이션 ~ ~ ~~ ');
    console.log(findChatting);
  }

  // 채팅 방 입장
  async enterChatRoom(client: Socket, roomId: string) {
    const getAsync = promisify(this.redisClient.get).bind(this.redisClient);
    const setAsync = promisify(this.redisClient.set).bind(this.redisClient);
    const hmsetAsync = promisify(this.redisClient.hmset).bind(this.redisClient);

    const hgetallAsync = promisify(this.redisClient.hgetall).bind(
      this.redisClient,
    );
    const smembersAsync = promisify(this.redisClient.smembers).bind(
      this.redisClient,
    );
    const saddAsync = promisify(this.redisClient.sadd).bind(this.redisClient);

    const { nickname } = client.data;
    const redisRoomId = `room:${roomId}`;

    // 병렬 처리
    const [checkRoom, memberInfo] = await Promise.all([
      getAsync(`room:${roomId}`),
      this.tokenCheckService.checkLoginToken(
        client.handshake.auth.jwtAccessToken,
      ),
    ]);

    // 캐시에 존재하는 방 정보 사용
    if (checkRoom) {
      const roomInfoList = JSON.parse(checkRoom);
      const memberSetKey = `room:${roomId}:playerlist`;

      //redis set에 멤버 아이디가 있는지 확인
      if (
        !(await smembersAsync(memberSetKey)).includes(
          memberInfo.memberInfo.memberId,
        )
      ) {
        await saddAsync(memberSetKey, memberInfo.memberInfo.memberId);
        // roomInfoList.memberList.push({
        //   memberId: memberInfo.memberInfo.memberId,
        //   nickname: memberInfo.memberInfo.nickname,
        // });
        const roomInfo = await getAsync(`room:${roomId}`);
        if (!roomInfo) {
          await hmsetAsync(
            `room:${roomId}`,
            'memberList',
            JSON.stringify(roomInfoList.memberList),
          );
        } else {
          this.redisFunctionService.updateJson(
            `socket:${memberInfo.memberInfo.memberId}`,
            'roomId',
            redisRoomId,
          );
        }
        client.data.roomId = redisRoomId;
        // client.rooms.clear();
        client.join(redisRoomId);

        console.log('방 입장 정보 ');
        console.log(client.rooms);

        client
          .to(redisRoomId)
          .emit('C_SendMessage', `"${nickname}"님이 접속하셨습니다.`);
      } else {
        // 이미 접속한 경우 방에 입장하지 않음
        console.log('이미 접속해 있엉');
        return;
      }
    }

    // 캐시에 방 정보가 없는 경우 새로운 방 생성
    const roomInfoList = {
      roomId: roomId,
      cheifId: memberInfo.memberInfo.memberId,
    };

    await Promise.all([
      setAsync(`room:${roomId}`, JSON.stringify(roomInfoList)),
      saddAsync(`room:${roomId}:playerlist`, memberInfo.memberInfo.memberId),
    ]);

    this.redisFunctionService.updateJson(
      `socket:${memberInfo.memberInfo.memberId}`,
      'roomId',
      redisRoomId,
    );

    client.data.roomId = redisRoomId;
    client.rooms.clear();
    client.join(redisRoomId);

    console.log('방 입장 정보 ');
    console.log(client.rooms);

    client
      .to(roomId)
      .emit('C_SendMessage', `"${nickname}"님이 접속하셨습니다.`);
  }

  // 채팅 방 나가기
  async exitChatRoom(client: Socket, roomId: string) {
    // client.data.roomId = `room:lobby`;
    // client.rooms.clear();
    // client.join(`room:lobby`);

    const roomName = `room:${roomId}`;

    const { nickname } = client.data.memberId; // 추후 닉네임으로 변경예정

    const playerIds = await this.redisClient.smembers(
      `room:${roomId}:playerlist`,
    );

    console.log(playerIds);

    if (playerIds.length === 1) {
      await this.redisClient.del(roomName);
    }

    await this.redisClient.srem(
      `room:${roomId}:playerlist`,
      client.data.memberId,
    );

    this.redisFunctionService.updateJson(
      `socket:${client.data.memberId}`,
      'roomId',
      '',
    );

    client.leave(roomName);
    client
      .to(roomName)
      .emit('C_SendMessage', '"' + nickname + '"님이 방에서 나갔습니다.');
  }

  // 방 가져오기
  async getChatRoom(client: Socket, roomId: string) {
    if (
      !this.redisClient.get(roomId) ||
      this.redisClient.get(roomId) === undefined
    ) {
      return client.emit('C_SendMessage', '알림 : 존재하지 않는 방입니다.');
    }

    const room = await this.redisClient.get(roomId);

    return JSON.parse(room).roomName;
  }

  // 접속중인 사용자 닉네임 리스트 가져오기
  async getPlayerList(client: Socket) {
    const playerList = await this.redisClient.keys('socket:*');
    const playerNickNameList = [];

    // playerList 순차적으로 조회하면서 닉네임만 추출
    for (let i = 0; i < playerList.length; i++) {
      const player = await this.redisClient.get(playerList[i]);
      playerNickNameList.push(JSON.parse(player).nickname);
    }

    client.emit('GetConnectedClientList', JSON.stringify(playerNickNameList));
  }

  // 방 삭제
  async deleteChatRoom(roomId: string) {
    await this.redisClient.del(roomId); // redis에서 방 삭제
    // server.sockets.adapter.rooms.delete(roomId);
  }
}
