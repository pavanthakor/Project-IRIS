import { FeedResult, MitreTechnique } from '../types';
import mitreAttackData from '../data/mitre-attack.json';

type TechniqueWithKeywords = MitreTechnique & {
  keywords: string[];
};

type MitreDataShape = {
  techniques?: TechniqueWithKeywords[];
};

const MITRE_DATA = mitreAttackData as MitreDataShape;

const TECHNIQUES: TechniqueWithKeywords[] = Array.isArray(MITRE_DATA.techniques)
  ? MITRE_DATA.techniques
  : [];

const TECHNIQUE_BY_ID = new Map<string, TechniqueWithKeywords>(
  TECHNIQUES.map((technique) => [technique.id, technique])
);

const toMitreTechnique = (technique: TechniqueWithKeywords): MitreTechnique => ({
  id: technique.id,
  name: technique.name,
  tactic: technique.tactic,
  description: technique.description
});

const addTechniqueById = (
  resultMap: Map<string, MitreTechnique>,
  id: string
): void => {
  const technique = TECHNIQUE_BY_ID.get(id);
  if (!technique) {
    return;
  }

  resultMap.set(id, toMitreTechnique(technique));
};

export async function mapToMitre(
  feeds: readonly FeedResult[]
): Promise<MitreTechnique[]> {
  try {
    const successfulFeeds = feeds.filter((feed) => feed.status === 'success');
    const collected = new Set<string>();

    for (const feed of successfulFeeds) {
      for (const tag of feed.tags ?? []) {
        const normalizedTag = tag.toLowerCase().trim();
        if (normalizedTag) {
          collected.add(normalizedTag);
        }
      }

      const family = feed.malwareFamily?.toLowerCase().trim();
      if (family) {
        collected.add(family);
      }
    }

    const collectedValues = Array.from(collected);
    const matched = new Map<string, MitreTechnique>();

    const hasTagContaining = (...needles: string[]): boolean =>
      collectedValues.some((tag) => needles.some((needle) => tag.includes(needle)));

    const isLikelyIpResult = (feed: FeedResult): boolean => {
      const normalizedFeedName = feed.feedName.toLowerCase();
      if (normalizedFeedName === 'abuseipdb' || normalizedFeedName === 'shodan' || normalizedFeedName === 'ipinfo') {
        return true;
      }

      const dataType = feed.data?.['type'];
      if (typeof dataType === 'string' && dataType.toLowerCase() === 'ip') {
        return true;
      }

      return Boolean(feed.geo);
    };

    for (const technique of TECHNIQUES) {
      const keywords = Array.isArray(technique.keywords)
        ? technique.keywords
        : [];

      const isMatch = keywords.some((keyword) => {
        const normalizedKeyword = keyword.toLowerCase().trim();
        if (!normalizedKeyword) {
          return false;
        }

        return collectedValues.some((tag) => tag.includes(normalizedKeyword));
      });

      if (isMatch) {
        matched.set(technique.id, toMitreTechnique(technique));
      }
    }

    const hasMalwareFamily = feeds.some(
      (feed) => typeof feed.malwareFamily === 'string' && feed.malwareFamily.trim().length > 0
    );

    if (hasMalwareFamily) {
      addTechniqueById(matched, 'T1204');
      addTechniqueById(matched, 'T1105');
    }

    if (hasTagContaining('vpn', 'proxy', 'tor')) {
      addTechniqueById(matched, 'T1090');
      addTechniqueById(matched, 'T1573');
    }

    if (hasTagContaining('hosting')) {
      addTechniqueById(matched, 'T1583');
    }

    if (hasTagContaining('disposable', 'free-email')) {
      addTechniqueById(matched, 'T1585');
      addTechniqueById(matched, 'T1566');
    }

    if (hasTagContaining('no-mx-record', 'smtp-invalid')) {
      addTechniqueById(matched, 'T1566');
    }

    if (collectedValues.some((tag) => tag.startsWith('cve-'))) {
      addTechniqueById(matched, 'T1190');
    }

    if (hasTagContaining('botnet')) {
      addTechniqueById(matched, 'T1583');
      addTechniqueById(matched, 'T1059');
    }

    if (hasTagContaining('ransomware')) {
      addTechniqueById(matched, 'T1486');
    }

    if (hasTagContaining('rat', 'trojan')) {
      addTechniqueById(matched, 'T1071');
      addTechniqueById(matched, 'T1055');
    }

    const hasHighConfidenceIpSignal = successfulFeeds.some(
      (feed) =>
        typeof feed.confidenceScore === 'number' &&
        feed.confidenceScore > 80 &&
        isLikelyIpResult(feed)
    );

    if (hasHighConfidenceIpSignal) {
      addTechniqueById(matched, 'T1071');
    }

    return Array.from(matched.values());
  } catch {
    return [];
  }
}