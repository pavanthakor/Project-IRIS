import { createHash } from 'node:crypto';
import { FeedResult, IoCType } from '../types';

export abstract class BaseFeed {
  public abstract readonly name: string;

  public abstract readonly supportedTypes: readonly IoCType[];

  public abstract query(ioc: string, type: IoCType): Promise<FeedResult>;

  public supportsType(type: IoCType): boolean {
    return this.supportedTypes.includes(type);
  }

  public isEnabled(): boolean {
    const envKey = `FEED_${this.name.toUpperCase().replace(/\s+/g, '_')}_ENABLED`;
    return process.env[envKey] !== 'false';
  }

  protected deterministicConfidence(seed: string): number {
    const hash = createHash('sha256').update(seed).digest('hex');
    const firstByte = Number.parseInt(hash.slice(0, 2), 16);
    return Math.max(25, Math.min(95, Math.round((firstByte / 255) * 100)));
  }
}