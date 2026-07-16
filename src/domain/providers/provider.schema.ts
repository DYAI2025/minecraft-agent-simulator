import { LLMProviderType, LLMProviderConfig } from '../../types/index.js';

export function validateLLMProviderConfig(config: any): LLMProviderConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Invalid provider configuration: must be an object.');
  }

  const id = typeof config.id === 'string' ? config.id.trim() : '';
  if (!id) {
    throw new Error('Provider config must have a unique ID.');
  }

  let type = LLMProviderType.GEMINI;
  if (Object.values(LLMProviderType).includes(config.type)) {
    type = config.type as LLMProviderType;
  } else {
    throw new Error(`Unsupported provider type: ${config.type}`);
  }

  const name = typeof config.name === 'string' ? config.name.trim() : id;
  const apiKey = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  const customUrl = typeof config.customUrl === 'string' ? config.customUrl.trim() : undefined;
  const defaultModel = typeof config.defaultModel === 'string' ? config.defaultModel.trim() : '';

  return {
    id,
    type,
    name,
    apiKey,
    customUrl,
    defaultModel,
  };
}

export interface MaskedProviderResponse {
  id: string;
  type: LLMProviderType;
  name: string;
  customUrl?: string;
  defaultModel: string;
  isConfigured: boolean;
  secretMetadata?: {
    configured: boolean;
    last4: string;
    updatedAt: string;
  } | null;
  lastTest?: {
    status: 'untested' | 'passed' | 'failed';
    testedAt?: string;
    errorCode?: string;
    message?: string;
  };
}

export function maskProvider(
  provider: LLMProviderConfig,
  secretMetadata?: { configured: boolean; last4: string; updatedAt: string } | null
): MaskedProviderResponse {
  return {
    id: provider.id,
    type: provider.type,
    name: provider.name,
    customUrl: provider.customUrl,
    defaultModel: provider.defaultModel,
    isConfigured: !!(provider.apiKey && provider.apiKey.length > 0),
    secretMetadata: secretMetadata || null,
    lastTest: provider.lastTest,
  };
}
