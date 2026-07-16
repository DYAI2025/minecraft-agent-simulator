import { GoogleGenAI } from '@google/genai';
import { LLMProviderType, LLMProviderConfig } from '../types/index.js';

export class LLMProviderService {
  /**
   * Calls the specified provider to get a structured bot action.
   */
  public static async getBotDecision(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string,
    responseSchema?: any
  ): Promise<{ reason_summary?: string; rationale?: string; action: string; parameters: any; message?: string }> {
    
    // Select correct provider execution path
    switch (provider.type) {
      case LLMProviderType.GEMINI:
        return await this.callGemini(provider, systemInstruction, prompt, responseSchema);
      case LLMProviderType.OPENAI:
        return await this.callOpenAI(provider, systemInstruction, prompt, responseSchema);
      case LLMProviderType.ANTHROPIC:
        return await this.callAnthropic(provider, systemInstruction, prompt, responseSchema);
      case LLMProviderType.OPENROUTER:
        return await this.callOpenRouter(provider, systemInstruction, prompt, responseSchema);
      case LLMProviderType.OLLAMA:
        return await this.callOllama(provider, systemInstruction, prompt);
      case LLMProviderType.LMSTUDIO:
        return await this.callLMStudio(provider, systemInstruction, prompt);
      default:
        throw new Error(`Unsupported LLM provider: ${provider.type}`);
    }
  }

  /**
   * Official @google/genai SDK Integration for Gemini API.
   */
  private static async callGemini(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string,
    responseSchema?: any
  ): Promise<any> {
    const apiKey = provider.apiKey || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable or configured provider API key is required.');
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const modelName = provider.defaultModel || 'gemini-3.5-flash';

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema,
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Empty response received from Gemini API');
      }

      return JSON.parse(text.trim());
    } catch (err: any) {
      console.error('Gemini API Error:', err);
      throw new Error(`Gemini API Error: ${err.message || err}`);
    }
  }

  /**
   * OpenAI API Integration.
   */
  private static async callOpenAI(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string,
    responseSchema?: any
  ): Promise<any> {
    const apiKey = provider.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API Key is required but not configured.');
    }

    const url = provider.customUrl || 'https://api.openai.com/v1/chat/completions';
    const model = provider.defaultModel || 'gpt-4o-mini';

    const payload: any = {
      model,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
    };

    if (responseSchema) {
      payload.response_format = { type: 'json_object' };
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenAI API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Empty content in OpenAI completion.');
      }

      return JSON.parse(text.trim());
    } catch (err: any) {
      console.error('OpenAI Call Error:', err);
      throw new Error(`OpenAI Error: ${err.message || err}`);
    }
  }

  /**
   * Anthropic API Integration.
   */
  private static async callAnthropic(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string,
    responseSchema?: any
  ): Promise<any> {
    const apiKey = provider.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API Key is required but not configured.');
    }

    const url = provider.customUrl || 'https://api.anthropic.com/v1/messages';
    const model = provider.defaultModel || 'claude-3-5-haiku-latest';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: systemInstruction,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Anthropic API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const text = data.content?.[0]?.text;
      if (!text) {
        throw new Error('Empty response content from Anthropic.');
      }

      // Parse JSON out of markdown block if any, or direct parse
      return this.extractJson(text);
    } catch (err: any) {
      console.error('Anthropic Call Error:', err);
      throw new Error(`Anthropic Error: ${err.message || err}`);
    }
  }

  /**
   * OpenRouter API Integration.
   */
  private static async callOpenRouter(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string,
    responseSchema?: any
  ): Promise<any> {
    const apiKey = provider.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error('OpenRouter API Key is required but not configured.');
    }

    const url = provider.customUrl || 'https://openrouter.ai/api/v1/chat/completions';
    const model = provider.defaultModel || 'google/gemini-2.5-flash';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://ai.studio/build',
          'X-Title': 'MISSI - Minecraft Scenario Simulator'
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          response_format: responseSchema ? { type: 'json_object' } : undefined,
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`OpenRouter API error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Empty response content from OpenRouter.');
      }

      return this.extractJson(text);
    } catch (err: any) {
      console.error('OpenRouter Call Error:', err);
      throw new Error(`OpenRouter Error: ${err.message || err}`);
    }
  }

  /**
   * Ollama Local Integration.
   */
  private static async callOllama(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string
  ): Promise<any> {
    const baseUrl = provider.customUrl || 'http://localhost:11434';
    const model = provider.defaultModel || 'llama3';

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          stream: false,
          format: 'json'
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const text = data.message?.content;
      if (!text) {
        throw new Error('Empty response from Ollama.');
      }

      return JSON.parse(text.trim());
    } catch (err: any) {
      console.error('Ollama Call Error:', err);
      throw new Error(`Ollama Local Provider is offline or unreachable at ${baseUrl}. Details: ${err.message || err}`);
    }
  }

  /**
   * LM Studio Local Integration.
   */
  private static async callLMStudio(
    provider: LLMProviderConfig,
    systemInstruction: string,
    prompt: string
  ): Promise<any> {
    const baseUrl = provider.customUrl || 'http://localhost:1234';
    const model = provider.defaultModel || 'meta-llama-3-8b-instruct';

    try {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LM Studio error (${res.status}): ${errText}`);
      }

      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('Empty response from LM Studio.');
      }

      return this.extractJson(text);
    } catch (err: any) {
      console.error('LM Studio Call Error:', err);
      throw new Error(`LM Studio Local Provider is offline or unreachable at ${baseUrl}. Details: ${err.message || err}`);
    }
  }

  /**
   * Utility helper to extract JSON from a markdown code block if model wrapped it.
   */
  private static extractJson(text: string): any {
    try {
      // Direct parse check
      return JSON.parse(text.trim());
    } catch {
      // Find markdown JSON block ```json ... ```
      const match = text.match(/```(?:json)?([\s\S]*?)```/);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1].trim());
        } catch (innerErr) {
          throw new Error(`Failed to parse extracted JSON block: ${text}`);
        }
      }
      throw new Error(`Failed to parse JSON response: ${text}`);
    }
  }

  /**
   * Performs a rapid, cheap connection test to verify provider and key validity.
   */
  public static async testConnection(provider: LLMProviderConfig): Promise<{ success: boolean; message: string }> {
    const sysInstruction = "You are a connectivity test runner. Respond with exactly the JSON: {\"rationale\": \"tested\", \"action\": \"idle\", \"parameters\": {}}";
    const prompt = "Execute connection test. Return idle action JSON.";
    
    try {
      const result = await this.getBotDecision(provider, sysInstruction, prompt);
      if (result) {
        return {
          success: true,
          message: `Successfully connected to ${provider.name} using model "${provider.defaultModel || 'default'}". Gateway returned valid decision structure.`,
        };
      }
      throw new Error("Invalid decision structure returned from test call.");
    } catch (err: any) {
      throw new Error(`Connection Test Failed: ${err.message || err}`);
    }
  }

  /**
   * Classifies provider errors into normalized error codes.
   */
  public static classifyError(err: any, provider: LLMProviderConfig): {
    code:
      | 'missing_key'
      | 'bad_request'
      | 'unauthorized'
      | 'unreachable'
      | 'quota_exceeded'
      | 'unknown_provider_error';
    message: string;
  } {
    let msg = (err.message || String(err)).trim();

    // Redact the specific apiKey if configured
    if (provider?.apiKey) {
      const escapedKey = provider.apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (escapedKey.length > 3) {
        const regex = new RegExp(escapedKey, 'gi');
        msg = msg.replace(regex, '[REDACTED_API_KEY]');
      }
    }

    // Also redact general patterns resembling high-entropy credentials/keys
    msg = msg.replace(/(AIzaSy[A-Za-z0-9_-]{33})/g, '[REDACTED_GEMINI_KEY]');
    msg = msg.replace(/(sk-[A-Za-z0-9]{32,})/g, '[REDACTED_OPENAI_KEY]');

    const lower = msg.toLowerCase();

    // 1. Missing API Key
    if (
      lower.includes('api key is required') ||
      lower.includes('key is required') ||
      lower.includes('missing api key') ||
      lower.includes('api key is missing') ||
      (!provider.apiKey && provider.type !== LLMProviderType.OLLAMA && provider.type !== LLMProviderType.LMSTUDIO)
    ) {
      return { code: 'missing_key', message: msg };
    }

    // 2. Unauthorized (401 or 403 or invalid credentials)
    if (
      lower.includes('401') ||
      lower.includes('403') ||
      lower.includes('unauthorized') ||
      lower.includes('forbidden') ||
      lower.includes('invalid api key') ||
      lower.includes('invalid_api_key') ||
      lower.includes('key is invalid') ||
      lower.includes('invalid credentials')
    ) {
      return { code: 'unauthorized', message: msg };
    }

    // 3. Quota Exceeded (429 or rate limits)
    if (
      lower.includes('429') ||
      lower.includes('too many requests') ||
      lower.includes('rate limit') ||
      lower.includes('quota exceeded') ||
      lower.includes('resource exhausted') ||
      lower.includes('resource_exhausted')
    ) {
      return { code: 'quota_exceeded', message: msg };
    }

    // 4. Unreachable / Networks / Timeouts
    if (
      lower.includes('fetch failed') ||
      lower.includes('econnrefused') ||
      lower.includes('enotfound') ||
      lower.includes('unreachable') ||
      lower.includes('offline or unreachable') ||
      lower.includes('network error') ||
      lower.includes('timeout') ||
      lower.includes('timed out') ||
      lower.includes('etimedout') ||
      lower.includes('dns')
    ) {
      return { code: 'unreachable', message: msg };
    }

    // 5. Bad Request (Invalid parameter, invalid model, parsing, structure mismatch)
    if (
      lower.includes('model not found') ||
      lower.includes('invalid_model') ||
      lower.includes('unsupported model') ||
      (lower.includes('not found') && lower.includes('model')) ||
      lower.includes('invalid parameters') ||
      lower.includes('bad request') ||
      lower.includes('400') ||
      lower.includes('json') ||
      lower.includes('unexpected response') ||
      lower.includes('parse')
    ) {
      return { code: 'bad_request', message: msg };
    }

    // 6. Default
    return { code: 'unknown_provider_error', message: msg };
  }
}
