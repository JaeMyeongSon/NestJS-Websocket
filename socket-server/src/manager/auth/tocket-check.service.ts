import * as jwt from 'jsonwebtoken';
import {
  Injectable,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { Member, SessionInfo } from '@lib/entity';
import { Decrypt } from '@lib/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

@Injectable()
export class TokenCheckService {
  constructor(@Inject(DataSource) private dataSource: DataSource) {}
  private static readonly logger = new Logger(TokenCheckService.name);

  async checkLoginToken(clientJwt: string) {
    const jwtAccessToken = String(Decrypt(clientJwt));
    let decodedMemberId = null;

    interface JwtPayload {
      idx: string;
    }

    await jwt.verify(jwtAccessToken, process.env.SECRET_KEY, (err, decoded) => {
      if (err) {
        console.log('err : ' + err);
        return;
      }
      const payload = decoded as JwtPayload;
      //사용자 닉네임 조회
      decodedMemberId = payload.idx;
    });
    const memberInfo = await this.dataSource.getRepository(Member).findOne({
      where: {
        memberId: decodedMemberId,
      },
    });

    console.log('토큰을 검증해 볼까용 ? ~ ~');
    console.log(memberInfo);
    return { memberInfo };
  }
}
