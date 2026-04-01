import { Types } from 'mongoose';
import { Ticket } from '../models/ticket.model';
import { Sprint } from '../models/sprint.model';
import { llmClient } from '../llm/llm-client';
import logger from '../utils/logger';

export interface DetectBlockersPayload {
  sprintId: string;
}

export interface BlockerResult {
  ticketId: string;
  ticketKey: string;
  isBlocked: boolean;
  blockedReason: string;
  blockedDurationDays: number;
  suggestedActions: string[];
}

function extractJsonArray(text: string): unknown[] {
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) {
    throw new Error('No JSON array found in LLM response');
  }
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error('LLM response is not a JSON array');
  }
  return parsed;
}

function isBlockerItem(
  x: unknown,
): x is {
  ticketKey: string;
  isBlocked: boolean;
  blockedReason?: string;
  suggestedActions?: string[];
} {
  if (x === null || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.ticketKey === 'string' &&
    typeof o.isBlocked === 'boolean' &&
    (o.blockedReason === undefined || typeof o.blockedReason === 'string') &&
    (o.suggestedActions === undefined || Array.isArray(o.suggestedActions))
  );
}

export async function detectBlockers(
  payload: DetectBlockersPayload,
): Promise<BlockerResult[]> {
  const { sprintId } = payload;

  logger.info({ sprintId }, 'Starting blocker detection');

  if (!Types.ObjectId.isValid(sprintId)) {
    throw new Error(`Invalid sprintId: ${sprintId}`);
  }

  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    throw new Error(`Sprint ${sprintId} not found`);
  }

  const tickets = await Ticket.find({ sprintId: sprint._id }).lean();

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const staleTickets = tickets.filter(
    (t) =>
      t.status !== 'DONE' &&
      t.lastActivityAt &&
      new Date(t.lastActivityAt) < threeDaysAgo,
  );

  if (staleTickets.length === 0) {
    logger.info({ sprintId }, 'No stale tickets found');
    return [];
  }

  const ticketSummaries = staleTickets.map((t) => {
    const days = Math.floor(
      (now.getTime() - new Date(t.lastActivityAt).getTime()) /
        (1000 * 60 * 60 * 24),
    );
    return `- ${t.key}: "${t.title}" (Status: ${t.status}, Last activity: ${days} days ago)`;
  });

  const prompt = `You are analyzing potentially blocked tickets in a sprint.

Sprint: "${sprint.name}"
Tickets with no activity in 3+ days:

${ticketSummaries.join('\n')}

For each ticket, determine:
1. Is it truly blocked (vs. just not being worked on)?
2. What might be blocking it?
3. What actions should be taken?

Respond ONLY with JSON array:
[
  {
    "ticketKey": "PROJ-42",
    "isBlocked": true,
    "blockedReason": "Waiting for API documentation",
    "suggestedActions": ["Contact backend team for API docs", "Unblock by mocking API"]
  }
]`;

  const response = await llmClient.complete(prompt);
  const parsed = extractJsonArray(response);

  const results: BlockerResult[] = [];

  for (const item of parsed) {
    if (!isBlockerItem(item) || !item.isBlocked) continue;

    const ticket = staleTickets.find(
      (t) => t.key.toUpperCase() === item.ticketKey.toUpperCase(),
    );
    if (!ticket) continue;

    await Ticket.findByIdAndUpdate(ticket._id, {
      isBlocked: true,
      blockedReason: item.blockedReason ?? 'Marked blocked by AI analysis',
    });

    const daysSinceActivity = Math.floor(
      (now.getTime() - new Date(ticket.lastActivityAt).getTime()) /
        (1000 * 60 * 60 * 24),
    );

    const suggestedActions = Array.isArray(item.suggestedActions)
      ? item.suggestedActions.filter((a): a is string => typeof a === 'string')
      : [];

    results.push({
      ticketId: ticket._id.toString(),
      ticketKey: ticket.key,
      isBlocked: true,
      blockedReason: item.blockedReason ?? 'Unknown',
      blockedDurationDays: daysSinceActivity,
      suggestedActions,
    });
  }

  logger.info(
    { sprintId, blockedCount: results.length },
    'Blocker detection complete',
  );

  return results;
}
