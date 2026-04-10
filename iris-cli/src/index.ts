import { getApiErrorMessage } from './api';
import { runCli } from './cli';
import { printError } from './utils/display';

void runCli().catch(error => {
  printError(getApiErrorMessage(error));
  process.exit(1);
});
