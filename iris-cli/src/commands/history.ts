import { Command, Option } from 'commander';
import { createApiClient, getHistory } from '../api';
import { getTokenOrThrow } from '../auth';
import { resolveRuntimeOptions } from '../config';
import type { GlobalOptionsGetter, IoCType, QueryHistoryItem } from '../types';
import { printInfo, setColorEnabled } from '../utils/display';
import { printTable } from '../utils/table';

interface HistoryOptions {
  limit?: string;
  type?: IoCType;
  risk?: 'critical' | 'high' | 'medium' | 'low' | 'clean';
  json?: boolean;
}

function scoreBand(score: number | null): 'critical' | 'high' | 'medium' | 'low' | 'clean' | 'unknown' {
  if (score === null || Number.isNaN(score)) return 'unknown';
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  if (score > 0) return 'low';
  return 'clean';
}

async function fetchHistoryUpToLimit(
  getPage: (page: number, pageSize: number) => Promise<{ items: QueryHistoryItem[]; total: number }>,
  limit: number
): Promise<QueryHistoryItem[]> {
  const pageSize = Math.min(100, Math.max(1, limit));
  let page = 1;
  let collected: QueryHistoryItem[] = [];

  while (collected.length < limit) {
    const pageData = await getPage(page, pageSize);
    if (pageData.items.length === 0) break;

    collected = collected.concat(pageData.items);

    if (collected.length >= pageData.total) {
      break;
    }

    page += 1;
  }

  return collected.slice(0, limit);
}

export function registerHistoryCommand(program: Command, getGlobalOptions: GlobalOptionsGetter): void {
  program
    .command('history')
    .description('View past IoC queries')
    .option('--limit <number>', 'number of records to fetch', '20')
    .addOption(new Option('--type <type>', 'filter by IoC type').choices(['ip', 'domain', 'hash', 'email']))
    .addOption(
      new Option('--risk <risk>', 'filter by risk level').choices([
        'critical',
        'high',
        'medium',
        'low',
        'clean',
      ])
    )
    .option('--json', 'output raw JSON')
    .action(async (options: HistoryOptions) => {
      const globals = getGlobalOptions();
      const runtime = resolveRuntimeOptions({
        ...globals,
        json: Boolean(globals.json || options.json),
      });

      setColorEnabled(runtime.color);

      const limit = Number.parseInt(options.limit ?? '20', 10);
      if (Number.isNaN(limit) || limit < 1) {
        throw new Error('Limit must be a positive integer.');
      }

      const token = getTokenOrThrow(runtime.token);
      const client = createApiClient({ apiUrl: runtime.apiUrl, token });

      const items = await fetchHistoryUpToLimit(
        (page, pageSize) => getHistory(client, page, pageSize),
        limit
      );

      const filtered = items.filter(item => {
        if (options.type && item.iocType !== options.type) {
          return false;
        }

        if (options.risk && scoreBand(item.riskScore) !== options.risk) {
          return false;
        }

        return true;
      });

      if (runtime.json) {
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      if (filtered.length === 0) {
        printInfo('No history entries matched your filters.');
        return;
      }

      const rows = filtered.map(item => [
        item.id,
        item.iocValue,
        item.iocType.toUpperCase(),
        item.riskScore ?? '-',
        scoreBand(item.riskScore).toUpperCase(),
        new Date(item.queriedAt).toLocaleString(),
      ]);

      printTable(['Query ID', 'IoC', 'Type', 'Score', 'Risk', 'Queried At'], rows);
    });
}
