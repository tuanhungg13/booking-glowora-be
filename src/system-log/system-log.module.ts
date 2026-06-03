import { Global, Module } from '@nestjs/common';
import { SystemLogService } from './system-log.service';
import { SystemLogController } from './system-log.controller';
import { RequestContextService } from '../common/request-context.service';
import { SystemAuditInterceptor } from '../common/interceptors/system-audit.interceptor';

@Global()
@Module({
  controllers: [SystemLogController],
  providers: [RequestContextService, SystemAuditInterceptor, SystemLogService],
  exports: [RequestContextService, SystemAuditInterceptor, SystemLogService],
})
export class SystemLogModule {}
