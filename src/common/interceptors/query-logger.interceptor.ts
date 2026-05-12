import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

const SLOW_THRESHOLD_MS = 500;

@Injectable()
export class QueryLoggerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('QueryLogger');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          const flag = ms > SLOW_THRESHOLD_MS ? ' ⚠️  [SLOW]' : '';
          this.logger.log(`${method} ${url} → ${ms}ms${flag}`);
        },
        error: (err) => {
          const ms = Date.now() - start;
          this.logger.error(
            `${method} ${url} → ${ms}ms [ERROR: ${err?.message ?? err}]`,
          );
        },
      }),
    );
  }
}
