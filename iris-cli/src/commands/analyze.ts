import { Command, Option } from 'commander';
import { analyzeIoC, createApiClient } from '../api';
import { getTokenOrThrow } from '../auth';
import { resolveRuntimeOptions } from '../config';
import type { GlobalOptionsGetter, IoCType } from '../types';
import { renderThreatAnalysis, setColorEnabled } from '../utils/display';
import { detectIoCType } from '../utils/ioc';
import { createSpinner, setSpinnerEnabled } from '../utils/spinner';

interface AnalyzeCommandOptions {
  type?: IoCType;
  json?: boolean;
}

export function registerAnalyzeCommand(program: Command, getGlobalOptions: GlobalOptionsGetter): void {
  program
    .command('analyze <ioc>')
    .description('Query a single IoC and display threat analysis')
    .addOption(
      new Option('--type <type>', 'indicator type')
        .choices(['ip', 'domain', 'hash', 'email'])
    )
    .option('--json', 'output raw JSON')
    .action(async (ioc: string, options: AnalyzeCommandOptions) => {
      const globals = getGlobalOptions();
      const runtime = resolveRuntimeOptions({
        ...globals,
        json: Boolean(globals.json || options.json),
      });

      setColorEnabled(runtime.color);
      setSpinnerEnabled(process.stdout.isTTY && !runtime.json);

      const token = getTokenOrThrow(runtime.token);
      const resolvedType = options.type ?? detectIoCType(ioc);

      if (!resolvedType) {
        throw new Error('Unable to auto-detect IoC type. Pass --type ip|domain|hash|email.');
      }

      const client = createApiClient({ apiUrl: runtime.apiUrl, token });
      const spinner = createSpinner(`Analyzing ${ioc} across 5 feeds...`);

      if (!runtime.json) {
        spinner.start();
      }

      const profile = await analyzeIoC(client, ioc, resolvedType);

      if (!runtime.json) {
        spinner.succeed(`Analysis complete in ${(profile.queryDurationMs / 1000).toFixed(1)}s`);
        renderThreatAnalysis(profile);
        return;
      }

      if (spinner.isSpinning) {
        spinner.stop();
      }

      console.log(JSON.stringify(profile, null, 2));
    });
}
