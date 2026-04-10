import { Command } from 'commander';
import { getCurrentIdentity, logout, promptLogin } from '../auth';
import { resolveRuntimeOptions } from '../config';
import type { GlobalOptionsGetter } from '../types';
import { printSuccess, setColorEnabled } from '../utils/display';

export function registerAuthCommands(program: Command, getGlobalOptions: GlobalOptionsGetter): void {
  program
    .command('login')
    .description('Authenticate against IRIS API and save token locally')
    .action(async () => {
      const runtime = resolveRuntimeOptions(getGlobalOptions());
      setColorEnabled(runtime.color);

      const { user } = await promptLogin(runtime.apiUrl);
      printSuccess(`Logged in as ${user.email} (${user.tier} tier)`);
    });

  program
    .command('logout')
    .description('Clear saved auth token')
    .action(() => {
      const runtime = resolveRuntimeOptions(getGlobalOptions());
      setColorEnabled(runtime.color);

      logout();
      printSuccess('Logged out');
    });

  program
    .command('whoami')
    .description('Show current authenticated identity')
    .action(() => {
      const runtime = resolveRuntimeOptions(getGlobalOptions());
      setColorEnabled(runtime.color);

      const identity = getCurrentIdentity(runtime);
      console.log(`${identity.email} · ${identity.tier} tier · API: ${identity.apiUrl}`);
    });
}
