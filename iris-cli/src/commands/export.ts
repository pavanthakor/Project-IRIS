import { Command, Option } from 'commander';
import { createApiClient, getQueryById } from '../api';
import { getTokenOrThrow } from '../auth';
import { resolveRuntimeOptions } from '../config';
import type { GlobalOptionsGetter, ThreatProfile } from '../types';
import { setColorEnabled } from '../utils/display';

interface ExportOptions {
  format?: 'json' | 'csv';
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === undefined || value === null) return '';
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(profile: ThreatProfile): string {
  const headers = [
    'queryId',
    'ioc',
    'type',
    'riskScore',
    'riskLevel',
    'verdict',
    'queryDurationMs',
    'feedName',
    'feedStatus',
    'feedLatencyMs',
    'detections',
    'totalEngines',
  ];

  const rows =
    profile.feeds.length > 0
      ? profile.feeds.map(feed => [
          profile.queryId,
          profile.ioc,
          profile.type,
          profile.riskScore,
          profile.riskLevel,
          profile.verdict,
          profile.queryDurationMs,
          feed.feedName,
          feed.status,
          feed.latencyMs,
          feed.detections ?? '',
          feed.totalEngines ?? '',
        ])
      : [
          [
            profile.queryId,
            profile.ioc,
            profile.type,
            profile.riskScore,
            profile.riskLevel,
            profile.verdict,
            profile.queryDurationMs,
            '',
            '',
            '',
            '',
            '',
          ],
        ];

  const csvRows = rows.map(row => row.map(value => escapeCsv(value)).join(','));
  return [headers.join(','), ...csvRows].join('\n');
}

export function registerExportCommand(program: Command, getGlobalOptions: GlobalOptionsGetter): void {
  program
    .command('export <queryId>')
    .description('Export a query result by ID')
    .addOption(new Option('--format <format>', 'export format').choices(['json', 'csv']).default('json'))
    .action(async (queryId: string, options: ExportOptions) => {
      const globals = getGlobalOptions();
      const runtime = resolveRuntimeOptions({
        ...globals,
        json: Boolean(globals.json),
      });

      setColorEnabled(runtime.color);

      const token = getTokenOrThrow(runtime.token);
      const client = createApiClient({ apiUrl: runtime.apiUrl, token });
      const profile = await getQueryById(client, queryId);

      const format = runtime.json ? 'json' : options.format ?? 'json';

      if (format === 'json') {
        console.log(JSON.stringify(profile, null, 2));
        return;
      }

      console.log(toCsv(profile));
    });
}
