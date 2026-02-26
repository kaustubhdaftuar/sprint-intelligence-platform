import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';
import { env } from '../utils/env';
import logger from '../utils/logger';

/**
 * LLM Client - Multi-provider wrapper with automatic fallback.
 * 
 * Provider priority:
 * 1. Google Gemini Flash 2.0 (free tier, fast)
 * 2. Anthropic Claude (fallback, $5 credit)
 * 3. Groq Llama (fallback, free forever)
 */

type Provider = 'gemini' | 'anthropic' | 'groq';

interface CompletionOptions {
  provider?: Provider;
  maxTokens?: number;
  temperature?: number;
}

export class LLMClient {
  private gemini: GoogleGenerativeAI;
  private anthropic?: Anthropic;
  private groq?: Groq;
  private currentProvider: Provider = 'gemini';

  constructor() {
    // Initialize Gemini (required, primary provider)
    this.gemini = new GoogleGenerativeAI(env.GEMINI_API_KEY);

    // Initialize Anthropic if key provided (optional fallback)
    if (env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: env.ANTHROPIC_API_KEY,
      });
    }

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
        case 'gemini':
          return await this.callGemini(prompt, options);
        case 'anthropic':
          return await this.callAnthropic(prompt, options);
        case 'groq':
          return await this.callGroq(prompt, options);
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
   * Call Google Gemini Flash 2.0.
   */
  private async callGemini(
    prompt: string,
    options: CompletionOptions
  ): Promise<string> {
    logger.debug({ provider: 'gemini' }, 'Calling Gemini API');
    
    // Get the generative model
    const model = this.gemini.getGenerativeModel({ 
      model: 'gemini-2.5-flash-lite' // Gemini 1.5 Flash (experimental, free)
    });

    // Generate content
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 1024,
      },
    });

    const response = result.response;
    const text = response.text();

    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    logger.info(
      {
        provider: 'gemini',
        promptLength: prompt.length,
        responseLength: text.length,
      },
      'LLM completion successful'
    );

    return text;
  }

  /**
   * Call Anthropic Claude.
   */
  private async callAnthropic(
    prompt: string,
    options: CompletionOptions
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error('Anthropic API key not configured');
    }

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
    const providers: Provider[] = ['gemini', 'anthropic', 'groq'];
    
    // Try each provider except the one that failed
    for (const provider of providers) {
      if (provider === failedProvider) continue;
      
      // Skip if provider not configured
      if (provider === 'anthropic' && !this.anthropic) continue;
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