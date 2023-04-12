import { IoAdapter } from '@nestjs/platform-socket.io';
import { RedisClient } from 'redis';
import { ServerOptions } from 'socket.io';
import { createAdapter } from 'socket.io-redis';
import * as dotenv from 'dotenv';
dotenv.config();
const pubClient = new RedisClient({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD,
});
const subClient = pubClient.duplicate();
const redisAdapter = createAdapter({ pubClient, subClient });
export class RedisIoAdapter extends IoAdapter {
  createIOServer(port: number, options?: ServerOptions): any {
    console.log('@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@');
    console.log('host: ', process.env.REDIS_HOST);
    console.log('port: ', process.env.REDIS_PORT);
    const server = super.createIOServer(port, options);
    server.adapter(redisAdapter);
    return server;
  }
}
