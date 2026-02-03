import { Request, Response, NextFunction } from 'express';
import { clients, messages, usage } from './db';
import type { User, LimitError } from './types';

export const PLAN_LIMITS = {
  free: {
    clients: 5,
    messagesPerClient: 50,
    aiRespond: 20,
    aiImprove: 30,
    transcribe: 10,
  },
  paid: {
    clients: 25,
    messagesPerClient: 250,
    aiRespond: 200,
    aiImprove: 300,
    transcribe: 100,
  },
  power: {
    clients: Infinity,
    messagesPerClient: Infinity,
    aiRespond: Infinity,
    aiImprove: Infinity,
    transcribe: Infinity,
  },
} as const;

function limitError(
  limitType: LimitError['limitType'],
  current: number,
  limit: number,
  message: string
): LimitError {
  return {
    error: 'limit_exceeded',
    limitType,
    current,
    limit,
    resetDate: usage.getNextMonthStart(),
    message,
  };
}

// Middleware to check client creation limit
export function checkClientLimit(req: Request, res: Response, next: NextFunction) {
  const user = req.user as User;
  const limits = PLAN_LIMITS[user.plan];

  if (limits.clients === Infinity) {
    return next();
  }

  const currentCount = clients.countByUser(user.id);
  if (currentCount >= limits.clients) {
    return res.status(429).json(
      limitError(
        'clients',
        currentCount,
        limits.clients,
        `You've reached the limit of ${limits.clients} clients on your ${user.plan} plan`
      )
    );
  }

  next();
}

// Middleware to check messages per client limit
export function checkMessageLimit(req: Request, res: Response, next: NextFunction) {
  const user = req.user as User;
  const limits = PLAN_LIMITS[user.plan];
  const clientId = parseInt(req.body.clientId, 10);

  if (limits.messagesPerClient === Infinity) {
    return next();
  }

  // Verify client belongs to user
  const client = clients.findByIdAndUser(clientId, user.id);
  if (!client) {
    return res.status(404).json({ error: 'Client not found' });
  }

  const currentCount = messages.countByClient(clientId);
  if (currentCount >= limits.messagesPerClient) {
    return res.status(429).json(
      limitError(
        'messagesPerClient',
        currentCount,
        limits.messagesPerClient,
        `This client has reached the limit of ${limits.messagesPerClient} messages on your ${user.plan} plan`
      )
    );
  }

  next();
}

// Factory to create AI limit check middleware
export function checkAILimit(type: 'aiRespond' | 'aiImprove' | 'transcribe') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user as User;
    const limits = PLAN_LIMITS[user.plan];
    const limit = limits[type];

    if (limit === Infinity) {
      return next();
    }

    const currentUsage = usage.get(user.id);
    const countKey = type === 'aiRespond' ? 'ai_respond_count'
                   : type === 'aiImprove' ? 'ai_improve_count'
                   : 'transcribe_count';
    const current = currentUsage[countKey];

    if (current >= limit) {
      const typeLabels = {
        aiRespond: 'AI response',
        aiImprove: 'AI improve',
        transcribe: 'transcription',
      };
      return res.status(429).json(
        limitError(
          type,
          current,
          limit,
          `You've used all ${limit} ${typeLabels[type]} credits this month`
        )
      );
    }

    next();
  };
}
