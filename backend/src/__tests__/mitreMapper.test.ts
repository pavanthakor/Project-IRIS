import { describe, it, expect } from 'vitest';
import { mapToMitre } from '../services/mitreMapper';
import { FeedResult } from '../types';

const createMockFeed = (tags: string[], malwareFamily?: string): FeedResult => ({
  feedName: 'mock-feed',
  status: 'success',
  tags,
  malwareFamily,
  latencyMs: 50,
});

describe('MITRE Mapper', () => {
  it('should match "c2" tag to T1071', async () => {
    const feeds = [createMockFeed(['c2', 'some-other-tag'])];
    const techniques = await mapToMitre(feeds);
    expect(techniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'T1071' }),
      ])
    );
  });

  it('should include T1204 and T1105 for "Emotet" malware family', async () => {
    const feeds = [createMockFeed([], 'Emotet')];
    const techniques = await mapToMitre(feeds);
    expect(techniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'T1204' }),
        expect.objectContaining({ id: 'T1105' }),
      ])
    );
  });

  it('should include T1486 for "ransomware" tag', async () => {
    const feeds = [createMockFeed(['ransomware'])];
    const techniques = await mapToMitre(feeds);
    expect(techniques).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'T1486' }),
      ])
    );
  });

  it('should return an empty array for no matching tags', async () => {
    const feeds = [createMockFeed(['non-existent-tag'])];
    const techniques = await mapToMitre(feeds);
    expect(techniques).toHaveLength(0);
  });

  it('should deduplicate techniques from multiple feeds', async () => {
    const feeds = [
      createMockFeed(['c2']),
      createMockFeed(['command-and-control']),
    ];
    const techniques = await mapToMitre(feeds);
    expect(techniques).toHaveLength(1);
    const techniqueIds = techniques.map((technique) => technique.id);
    expect(techniqueIds).toContain('T1071');
  });
});
