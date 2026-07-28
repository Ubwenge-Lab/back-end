import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { correlationStorage } from '../logger/correlation.storage';

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const store = correlationStorage.getStore();

    if (store && request.user) {
      store.userId = request.user.sub || request.user.id;
      store.userRole = request.user.role;
      store.ipAddress = request.ip || request.connection?.remoteAddress;
    }

    return next.handle();
  }
}
