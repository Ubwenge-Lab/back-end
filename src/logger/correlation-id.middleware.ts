// src/logger/correlation-id.middleware.ts
// Express middleware to generate/propagate x-request-id headers

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { correlationStorage } from './correlation.storage';

// Augment Express Request to carry correlationId
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId = (req.headers['x-request-id'] as string) || uuidv4();

    // Attach to request object for easy access in controllers/interceptors
    req.correlationId = correlationId;

    // Echo back in response headers
    res.setHeader('x-request-id', correlationId);

    // Run the rest of the request inside AsyncLocalStorage context
    correlationStorage.run({ correlationId }, () => {
      next();
    });
  }
}
