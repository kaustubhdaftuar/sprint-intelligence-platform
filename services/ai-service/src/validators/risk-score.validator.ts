import { z } from 'zod';

/**
 * Validates LLM response for sprint risk scoring.
 * If LLM returns invalid JSON, this catches it before saving to DB.
 */
export const RiskScoreResponseSchema = z.object({
  riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  factors: z.array(z.string()).min(1).max(10),
  recommendations: z.array(z.string()).min(0).max(10),
});

export type RiskScoreResponse = z.infer<typeof RiskScoreResponseSchema>;

export function validateRiskScoreResponse(data: unknown): RiskScoreResponse {
  const result = RiskScoreResponseSchema.safeParse(data);
  
  if (!result.success) {
    throw new Error(`Invalid LLM response: ${result.error.message}`);
  }
  
  return result.data;
}