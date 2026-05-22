import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

// Production threshold (Render → Supabase same region): 500ms
// Development threshold (localhost → remote Supabase): 2000ms
const SLOW_THRESHOLD_MS = process.env.NODE_ENV === 'production' ? 500 : 2000;

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
