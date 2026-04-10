import ora, { Ora } from 'ora';

let spinnerEnabled = true;

export function setSpinnerEnabled(enabled: boolean): void {
  spinnerEnabled = enabled;
}

export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: 'dots',
    isEnabled: spinnerEnabled,
  });
}
