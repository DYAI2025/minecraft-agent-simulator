import { PersistenceService } from './PersistenceService.js';

export interface SecretMetadata {
  configured: boolean;
  last4: string;
  updatedAt: string;
}

export class SecretStoreService {
  private static instance: SecretStoreService | null = null;
  private persistence: PersistenceService;
  private secrets: Record<string, string> = {};
  private metadata: Record<string, { updatedAt: string }> = {};
  private readonly secretPath = 'secrets/providers.local.json';
  private readonly metadataPath = 'secrets/providers.metadata.json';

  private constructor() {
    this.persistence = PersistenceService.getInstance();
  }

  public static getInstance(): SecretStoreService {
    if (!SecretStoreService.instance) {
      SecretStoreService.instance = new SecretStoreService();
    }
    return SecretStoreService.instance;
  }

  public async init(): Promise<void> {
    this.secrets = await this.persistence.readJson<Record<string, string>>(this.secretPath, {});
    this.metadata = await this.persistence.readJson<Record<string, { updatedAt: string }>>(this.metadataPath, {});
  }

  public getSecret(providerId: string): string {
    return this.secrets[providerId] || '';
  }

  public getSecretMetadata(providerId: string): SecretMetadata | null {
    const secret = this.secrets[providerId];
    if (!secret) return null;
    const last4 = secret.length > 4 ? secret.slice(-4) : secret;
    const meta = this.metadata[providerId];
    const updatedAt = meta?.updatedAt || new Date().toISOString();
    return {
      configured: true,
      last4,
      updatedAt,
    };
  }

  public async setSecret(providerId: string, secret: string): Promise<void> {
    if (!providerId) return;
    this.secrets[providerId] = secret;
    this.metadata[providerId] = { updatedAt: new Date().toISOString() };
    await this.persistence.writeJson<Record<string, string>>(this.secretPath, this.secrets);
    await this.persistence.writeJson<Record<string, { updatedAt: string }>>(this.metadataPath, this.metadata);
  }

  public async deleteSecret(providerId: string): Promise<void> {
    if (!providerId) return;
    delete this.secrets[providerId];
    delete this.metadata[providerId];
    await this.persistence.writeJson<Record<string, string>>(this.secretPath, this.secrets);
    await this.persistence.writeJson<Record<string, { updatedAt: string }>>(this.metadataPath, this.metadata);
  }

  public getAllConfiguredProviderIds(): string[] {
    return Object.keys(this.secrets).filter(id => this.secrets[id] && this.secrets[id].length > 0);
  }
}
