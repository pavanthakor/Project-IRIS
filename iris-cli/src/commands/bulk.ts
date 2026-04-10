import fs from 'node:fs/promises';
import path from 'node:path';
import { Command, Option } from 'commander';
import { analyzeIoC, createApiClient } from '../api';
import { getTokenOrThrow } from '../auth';
import { resolveRuntimeOptions } from '../config';
import type { GlobalOptionsGetter, IoCType, ThreatProfile } from '../types';
import { printInfo, printSuccess, setColorEnabled } from '../utils/display';
import { parseBulkLine } from '../utils/ioc';
import { printTable } from '../utils/table';

interface BulkCommandOptions {
  output?: string;
  format?: 'json' | 'csv' | 'table';
}

interface BulkResult {
  ioc: string;
  type: IoCType;
  score: number | null;
  verdict: string;
  queryId?: string;
  error?: string;
  profile?: ThreatProfile;
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

function toCsv(results: BulkResult[]): string {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };

  const headers = ['ioc', 'type', 'score', 'verdict', 'queryId', 'error'];
  const rows = results.map(result =>
    [
      escape(result.ioc),
      escape(result.type),
      escape(result.score),
      escape(result.verdict),
      escape(result.queryId),
      escape(result.error),
    ].join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export function registerBulkCommand(program: Command, getGlobalOptions: GlobalOptionsGetter): void {
  program
    .command('bulk <file>')
    .description('Query multiple IoCs from a file')
    .option('--output <file>', 'save results to file')
    .addOption(
      new Option('--format <format>', 'output format').choices(['json', 'csv', 'table']).default('table')
    )
    .action(async (file: string, options: BulkCommandOptions) => {
      const globals = getGlobalOptions();
      const runtime = resolveRuntimeOptions({
        ...globals,
        json: Boolean(globals.json),
      });

      setColorEnabled(runtime.color);

      const token = getTokenOrThrow(runtime.token);
      const client = createApiClient({ apiUrl: runtime.apiUrl, token });

      const filePath = path.resolve(process.cwd(), file);
      const raw = await fs.readFile(filePath, 'utf8');
      const parsedLines = raw
        .split(/\r?\n/)
        .map(parseBulkLine)
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (parsedLines.length === 0) {
        throw new Error('No valid IoCs found in file.');
      }

      const results: BulkResult[] = [];

      for (let i = 0; i < parsedLines.length; i += 1) {
        const entry = parsedLines[i];
        if (!entry) continue;

        printInfo(`[${i + 1}/${parsedLines.length}] Analyzing ${entry.ioc}...`);

        try {
          const profile = await analyzeIoC(client, entry.ioc, entry.type);
          results.push({
            ioc: entry.ioc,
            type: entry.type,
            score: profile.riskScore,
            verdict: profile.verdict,
            queryId: profile.queryId,
            profile,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          results.push({
            ioc: entry.ioc,
            type: entry.type,
            score: null,
            verdict: 'Error',
            error: message,
          });
        }

        if (i < parsedLines.length - 1) {
          await delay(1000);
        }
      }

      const format = runtime.json ? 'json' : options.format ?? 'table';

      if (format === 'table') {
        const rows = results.map(result => [
          result.ioc,
          result.type.toUpperCase(),
          result.score ?? '-',
          result.verdict,
        ]);

        printTable(['IoC', 'Type', 'Score', 'Verdict'], rows);
      }

      if (format === 'json') {
        console.log(JSON.stringify(results, null, 2));
      }

      if (format === 'csv') {
        console.log(toCsv(results));
      }

      if (options.output) {
        const outputPath = path.resolve(process.cwd(), options.output);
        const content =
          format === 'table'
            ? JSON.stringify(results, null, 2)
            : format === 'json'
              ? JSON.stringify(results, null, 2)
              : toCsv(results);

        await fs.writeFile(outputPath, content, 'utf8');
        printSuccess(`Saved output to ${outputPath}`);
      }
    });
}
