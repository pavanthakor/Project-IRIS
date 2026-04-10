import { Command } from 'commander';
import { getHealth } from '../api';
import { getTokenOrThrow } from '../auth';
import { resolveRuntimeOptions } from '../config';
import type { GlobalOptionsGetter } from '../types';
import { failureIcon, successIcon, setColorEnabled } from '../utils/display';
import { printTable } from '../utils/table';

const FEED_ORDER = ['VirusTotal', 'AbuseIPDB', 'Shodan', 'IPInfo', 'AbstractEmail'];

function statusText(status: string): string {
  if (status === 'healthy') return `${successIcon()} Healthy`;
  if (status === 'circuit_open') return `${failureIcon()} Degraded`;
  if (status === 'disabled') return '• Disabled';
  return status;
}

export function registerFeedsCommand(program: Command, getGlobalOptions: GlobalOptionsGetter): void {
  program
    .command('feeds')
    .description('Check threat feed health')
    .action(async () => {
      const runtime = resolveRuntimeOptions(getGlobalOptions());
      setColorEnabled(runtime.color);

      const token = getTokenOrThrow(runtime.token);
      const health = await getHealth(runtime.apiUrl, token);

      if (runtime.json) {
        console.log(JSON.stringify(health, null, 2));
        return;
      }

      const rows = FEED_ORDER.map(feedName => {
        const feedStatus = health.feeds?.[feedName] ?? 'unknown';
        const circuit =
          (typeof health.feedHealth?.[feedName]?.state === 'string'
            ? health.feedHealth[feedName]?.state
            : feedStatus === 'circuit_open'
              ? 'OPEN'
              : feedStatus === 'disabled'
                ? 'N/A'
                : 'CLOSED') ?? 'UNKNOWN';

        return [feedName, statusText(feedStatus), circuit];
      });

      printTable(['Feed', 'Status', 'Circuit'], rows);
    });
}
