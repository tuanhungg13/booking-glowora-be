import { Global, Module } from '@nestjs/common';
import { SystemLogService } from './system-log.service';
import { SystemLogController } from './system-log.controller';
import { RequestContextService } from '../common/request-context.service';

@Global()
@Module({
  controllers: [SystemLogController],
  providers: [RequestContextService, SystemLogService],
  exports: [RequestContextService, SystemLogService],
})
export class SystemLogModule {}
