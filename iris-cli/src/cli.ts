import { Command } from 'commander';
import { registerAnalyzeCommand } from './commands/analyze';
import { registerAuthCommands } from './commands/auth';
import { registerBulkCommand } from './commands/bulk';
import { registerExportCommand } from './commands/export';
import { registerFeedsCommand } from './commands/feeds';
import { registerHistoryCommand } from './commands/history';
import type { GlobalOptions } from './types';

export function createProgram(): Command {
  const program = new Command();

  program
    .name('iris')
    .description('IRIS Threat Intelligence CLI — query, analyze, and report from your terminal')
    .version('IRIS CLI v1.0.0', '--version', 'show CLI version')
    .option('--api-url <url>', 'override API URL for this command')
    .option('--token <token>', 'override auth token for this command')
    .option('--no-color', 'disable colored output (for piping)')
    .option('--json', 'output raw JSON (for scripting)')
    .showHelpAfterError('(run "iris --help" to see usage)');

  const getGlobalOptions = (): GlobalOptions => program.opts<GlobalOptions>();

  registerAuthCommands(program, getGlobalOptions);
  registerAnalyzeCommand(program, getGlobalOptions);
  registerBulkCommand(program, getGlobalOptions);
  registerHistoryCommand(program, getGlobalOptions);
  registerFeedsCommand(program, getGlobalOptions);
  registerExportCommand(program, getGlobalOptions);

  return program;
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  if (argv.length <= 2) {
    program.outputHelp();
    return;
  }

  await program.parseAsync(argv);
}
