import { Test, TestingModule } from '@nestjs/testing';
import { ManagerGateway } from './manager.gateway';

describe('ManagerGateway', () => {
  let gateway: ManagerGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ManagerGateway],
    }).compile();

    gateway = module.get<ManagerGateway>(ManagerGateway);
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });
});
