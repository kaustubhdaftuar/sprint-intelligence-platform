import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { env } from '@/utils/env';
import logger from '@/utils/logger';

/**
 * LLM Client - Multi-provider wrapper with automatic fallback.
 * 
 * Provider priority:
 * 1. Anthropic Claude (best quality, $5 free credit)
 * 2. Groq Llama (free forever, fast)
 * 3. OpenAI GPT-3.5 (backup, $5 free credit)
 * 
 * If one provider fails, automatically tries the next.
 */

type Provider = 'anthropic' | 'groq' | 'openai';

interface CompletionOptions {
  provider?: Provider;
  maxTokens?: number;
  temperature?: number;
}

export class LLMClient {
  private anthropic: Anthropic;
  private groq?: Groq;
  private currentProvider: Provider = 'anthropic';

  constructor() {
    // Initialize Anthropic (required)
    this.anthropic = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });

    // Initialize Groq if key provided (optional fallback)
    if (env.GROQ_API_KEY) {
      this.groq = new Groq({
        apiKey: env.GROQ_API_KEY,
      });
    }
  }

  /**
   * Complete a prompt using the best available provider.
   * Automatically falls back to other providers if one fails.
   */
  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    const provider = options.provider || this.currentProvider;
    
    try {
      switch (provider) {
        case 'anthropic':
          return await this.callAnthropic(prompt, options);
        case 'groq':
          return await this.callGroq(prompt, options);
        case 'openai':
          throw new Error('OpenAI provider not implemented yet');
        default:
          throw new Error(`Unknown provider: ${provider}`);
      }
    } catch (error) {
      logger.warn(
        { provider, error: (error as Error).message },
        'LLM provider failed, attempting fallback'
      );
      
      // Try fallback providers
      return await this.fallback(prompt, options, provider);
    }
  }

  /**
   * Call Anthropic Claude.
   */
  private async callAnthropic(
    prompt: string,
    options: CompletionOptions
  ): Promise<string> {
    logger.debug({ provider: 'anthropic' }, 'Calling Anthropic API');
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.7,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    logger.info(
      {
        provider: 'anthropic',
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      'LLM completion successful'
    );

    return content.text;
  }

  /**
   * Call Groq Llama.
   */
  private async callGroq(
    prompt: string,
    options: CompletionOptions
  ): Promise<string> {
    if (!this.groq) {
      throw new Error('Groq API key not configured');
    }

    logger.debug({ provider: 'groq' }, 'Calling Groq API');
    
    const response = await this.groq.chat.completions.create({
      model: 'llama-3.1-70b-versatile',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_tokens: options.maxTokens || 1024,
      temperature: options.temperature || 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from Groq');
    }

    logger.info(
      {
        provider: 'groq',
        tokensUsed: response.usage?.total_tokens,
      },
      'LLM completion successful'
    );

    return content;
  }

  /**
   * Fallback to other providers if primary fails.
   */
  private async fallback(
    prompt: string,
    options: CompletionOptions,
    failedProvider: Provider
  ): Promise<string> {
    const providers: Provider[] = ['groq', 'anthropic'];
    
    // Try each provider except the one that failed
    for (const provider of providers) {
      if (provider === failedProvider) continue;
      
      // Skip if provider not configured
      if (provider === 'groq' && !this.groq) continue;
      
      try {
        logger.info({ provider }, 'Attempting fallback provider');
        this.currentProvider = provider; // Update current for future calls
        return await this.complete(prompt, { ...options, provider });
      } catch (error) {
        logger.warn(
          { provider, error: (error as Error).message },
          'Fallback provider also failed'
        );
        continue;
      }
    }
    
    throw new Error('All LLM providers failed');
  }
}

// Singleton instance
export const llmClient = new LLMClient();