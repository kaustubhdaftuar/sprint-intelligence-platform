import { Sprint } from '../models/sprint.model';
import { Ticket } from '../models/ticket.model';
import { llmClient } from '../llm/llm-client';
import { validateRiskScoreResponse } from '../validators/risk-score.validator';
import logger from '../utils/logger';

export interface ScoreSprintRiskInput {
  sprintId: string;
}

export async function scoreSprintRisk(input: ScoreSprintRiskInput) {
  logger.info({ sprintId: input.sprintId }, 'Starting sprint risk scoring');

  // 1. Fetch sprint data
  const sprint = await Sprint.findById(input.sprintId);
  if (!sprint) {
    throw new Error(`Sprint ${input.sprintId} not found`);
  }

  // 2. Fetch sprint tickets
  const tickets = await Ticket.find({ sprintId: sprint._id });
  
  // 3. Calculate metrics
  const totalTickets = tickets.length;
  const completedTickets = tickets.filter(t => t.status === 'DONE').length;
  const blockedTickets = tickets.filter(t => t.isBlocked).length;
  const totalPoints = tickets.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  const completedPoints = tickets
    .filter(t => t.status === 'DONE')
    .reduce((sum, t) => sum + (t.storyPoints || 0), 0);
  
  const now = new Date();
  const totalDays = Math.ceil(
    (sprint.endDate.getTime() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysElapsed = Math.ceil(
    (now.getTime() - sprint.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const daysRemaining = Math.max(0, totalDays - daysElapsed);

  // 4. Build LLM prompt
  const prompt = `You are a Scrum expert analyzing sprint risk.

Sprint: "${sprint.name}"
Status: ${sprint.status}
Duration: ${totalDays} days total, ${daysElapsed} days elapsed, ${daysRemaining} days remaining

Metrics:
- Total tickets: ${totalTickets}
- Completed tickets: ${completedTickets}
- Blocked tickets: ${blockedTickets}
- Total story points: ${totalPoints}
- Completed points: ${completedPoints}
- Team velocity target: ${sprint.velocityTarget || 'Not set'}
- Sprint capacity: ${sprint.capacityPoints}

Calculate a risk score (0-100, where higher = more risk).

Respond ONLY with valid JSON in this exact format:
{
  "riskScore": <number between 0-100>,
  "riskLevel": "<LOW|MEDIUM|HIGH|CRITICAL>",
  "factors": ["factor 1", "factor 2", "factor 3"],
  "recommendations": ["action 1", "action 2"]
}

Rules:
- LOW: 0-25
- MEDIUM: 26-50
- HIGH: 51-75
- CRITICAL: 76-100

Consider:
- Is the team on track? (completed vs total points)
- Are there blockers?
- Is capacity reasonable?
- Time remaining vs work remaining`;

  // 5. Call LLM
  logger.debug({ sprintId: input.sprintId }, 'Calling LLM for risk analysis');
  const llmResponse = await llmClient.complete(prompt);

  // 6. Parse and validate response
  let parsedResponse;
  try {
    parsedResponse = JSON.parse(llmResponse);
  } catch (error) {
    logger.error({ llmResponse }, 'Failed to parse LLM response as JSON');
    throw new Error('LLM returned invalid JSON');
  }

  const validatedResponse = validateRiskScoreResponse(parsedResponse);

  // 7. Save to database
  await Sprint.findByIdAndUpdate(sprint._id, {
    riskScore: validatedResponse.riskScore,
    // Store full analysis in a separate field (you'd add this to Sprint model)
    // aiAnalysis: validatedResponse
  });

  logger.info(
    {
      sprintId: input.sprintId,
      riskScore: validatedResponse.riskScore,
      riskLevel: validatedResponse.riskLevel,
    },
    'Sprint risk scored successfully'
  );

  return validatedResponse;
}