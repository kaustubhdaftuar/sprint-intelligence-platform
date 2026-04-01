import { Types } from 'mongoose';
import { Sprint } from '../models/sprint.model';
import { Ticket } from '../models/ticket.model';
import { llmClient } from '../llm/llm-client';
import logger from '../utils/logger';

export interface GenerateSprintSummaryPayload {
  sprintId: string;
}

export interface SprintSummary {
  overview: string;
  achievements: string[];
  challenges: string[];
  metrics: {
    velocityTarget: number;
    actualVelocity: number;
    completionRate: number;
  };
  retrospectiveQuestions: string[];
}

function extractJsonObject(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('No JSON object found in LLM response');
  }
  return JSON.parse(match[0]) as Record<string, unknown>;
}

function asStringArray(x: unknown): string[] {
  if (!Array.isArray(x)) return [];
  return x.filter((i): i is string => typeof i === 'string');
}

export async function generateSprintSummary(
  payload: GenerateSprintSummaryPayload,
): Promise<SprintSummary> {
  const { sprintId } = payload;

  logger.info({ sprintId }, 'Starting sprint summary generation');

  if (!Types.ObjectId.isValid(sprintId)) {
    throw new Error(`Invalid sprintId: ${sprintId}`);
  }

  const sprint = await Sprint.findById(sprintId);
  if (!sprint) {
    throw new Error(`Sprint ${sprintId} not found`);
  }
  if (sprint.status !== 'DONE') {
    throw new Error('Sprint must be DONE to generate summary');
  }

  const tickets = await Ticket.find({ sprintId: sprint._id }).lean();
  const doneTickets = tickets.filter((t) => t.status === 'DONE');
  const incompleteTickets = tickets.filter((t) => t.status !== 'DONE');

  const prompt = `Generate a sprint retrospective summary.

Sprint: "${sprint.name}"
Goal: "${sprint.goal || ''}"
Duration: ${sprint.startDate.toISOString().split('T')[0]} to ${sprint.endDate.toISOString().split('T')[0]}

Metrics:
- Velocity target: ${sprint.velocityTarget ?? 0} points
- Actual velocity: ${sprint.actualVelocity ?? 0} points
- Completed: ${doneTickets.length}/${tickets.length} tickets

Completed work:
${doneTickets.map((t) => `- ${t.key}: ${t.title}`).join('\n') || '(none)'}

Incomplete work:
${incompleteTickets.map((t) => `- ${t.key}: ${t.title}`).join('\n') || '(none)'}

Generate a retrospective summary in JSON:
{
  "overview": "2-3 sentence summary of the sprint",
  "achievements": ["achievement 1", "achievement 2"],
  "challenges": ["challenge 1", "challenge 2"],
  "retrospectiveQuestions": ["question 1", "question 2"]
}`;

  const response = await llmClient.complete(prompt);
  const summary = extractJsonObject(response);

  const overview =
    typeof summary.overview === 'string' ? summary.overview : '';
  const achievements = asStringArray(summary.achievements);
  const challenges = asStringArray(summary.challenges);
  const retrospectiveQuestions = asStringArray(
    summary.retrospectiveQuestions,
  );

  const completionRate =
    tickets.length > 0
      ? (doneTickets.length / tickets.length) * 100
      : 0;

  return {
    overview,
    achievements,
    challenges,
    retrospectiveQuestions,
    metrics: {
      velocityTarget: sprint.velocityTarget ?? 0,
      actualVelocity: sprint.actualVelocity ?? 0,
      completionRate,
    },
  };
}
