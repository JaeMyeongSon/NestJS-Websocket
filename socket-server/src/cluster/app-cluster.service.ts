import { Logger } from '@nestjs/common';
import cluster from 'node:cluster';
import * as os from 'os';
import { Injectable } from '@nestjs/common';

const numCPUs = os.cpus().length;

@Injectable()
export class AppClusterService {
  private static readonly logger = new Logger(AppClusterService.name);

  static clusterize(callback: () => any): void {
    if (cluster.isPrimary) {
      AppClusterService.logger.debug(`마스터 서버 시작 ${process.pid}`);
      for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
      }
      cluster.on('exit', (worker, code, signal) => {
        AppClusterService.logger.debug(
          `워커 ${worker.process.pid} 죽음. 다시 살림`,
        );

        cluster.fork();
      });
    } else {
      AppClusterService.logger.debug(
        console.log(`클러스터 서버 시작 ${process.pid}`),
      );

      callback();
    }
  }
}
