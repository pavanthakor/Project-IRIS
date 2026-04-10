import chalk from 'chalk';
import type { FeedResult, RiskLevel, ThreatProfile, Verdict } from '../types';
import { renderTable } from './table';

let colorsEnabled = true;

export function setColorEnabled(enabled: boolean): void {
  colorsEnabled = enabled;
}

const ansiRegex = /\x1B\[[0-9;]*m/g;

function stripAnsi(input: string): string {
  return input.replace(ansiRegex, '');
}

function paint(text: string, painter: (value: string) => string): string {
  return colorsEnabled ? painter(text) : text;
}

export function colorRiskLevel(level: RiskLevel, text: string): string {
  if (level === 'CRITICAL' || level === 'HIGH') return paint(text, chalk.red);
  if (level === 'MEDIUM') return paint(text, chalk.yellow);
  return paint(text, chalk.green);
}

export function colorVerdict(verdict: Verdict): string {
  if (verdict === 'Malicious') return paint(verdict, chalk.red);
  if (verdict === 'Suspicious') return paint(verdict, chalk.yellow);
  if (verdict === 'Clean') return paint(verdict, chalk.green);
  return verdict;
}

export function successIcon(): string {
  return paint('✓', chalk.green);
}

export function failureIcon(): string {
  return paint('✗', chalk.red);
}

export function printSuccess(message: string): void {
  console.log(`${successIcon()} ${message}`);
}

export function printInfo(message: string): void {
  console.log(message);
}

export function printError(message: string): void {
  console.error(`${failureIcon()} ${paint(message, chalk.red)}`);
}

function buildRiskBar(score: number, width = 20): string {
  const normalized = Math.max(0, Math.min(100, score));
  const filled = Math.round((normalized / 100) * width);
  return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
}

function feedResultText(feed: FeedResult): string {
  if (typeof feed.detections === 'number' && typeof feed.totalEngines === 'number') {
    return `${feed.detections}/${feed.totalEngines} engines`;
  }

  if (typeof feed.confidenceScore === 'number') {
    return `Score: ${feed.confidenceScore}`;
  }

  if (feed.tags && feed.tags.length > 0) {
    return feed.tags.slice(0, 3).join(', ');
  }

  if (feed.malwareFamily) {
    return feed.malwareFamily;
  }

  if (feed.error) {
    return feed.error;
  }

  return '—';
}

function feedStatusText(feed: FeedResult): string {
  const seconds = (feed.latencyMs / 1000).toFixed(1);

  if (feed.status === 'success' || feed.status === 'cached') {
    return `${successIcon()} Success (${seconds}s)`;
  }

  if (feed.status === 'disabled') {
    return '• Disabled';
  }

  if (feed.status === 'circuit_open') {
    return `${failureIcon()} Circuit open`;
  }

  return `${failureIcon()} ${feed.status} (${seconds}s)`;
}

function boxLine(content: string, innerWidth: number): string {
  const visibleLength = stripAnsi(content).length;
  const padding = visibleLength < innerWidth ? ' '.repeat(innerWidth - visibleLength) : '';
  return `│ ${content}${padding} │`;
}

export function renderThreatAnalysis(profile: ThreatProfile): void {
  const width = 95;
  const innerWidth = width - 4;
  const divider = `├${'─'.repeat(width - 2)}┤`;

  const title = 'IRIS Threat Analysis';
  const targetType = profile.type.toUpperCase();
  const durationSec = (profile.queryDurationMs / 1000).toFixed(1);
  const queried = `${profile.feeds.length} feeds in ${durationSec}s`;

  const riskLine = `RISK SCORE: ${String(profile.riskScore).padEnd(3)} ${buildRiskBar(profile.riskScore)} ${profile.riskLevel}`;
  const verdictLine = `VERDICT:    ${colorVerdict(profile.verdict)}`;

  const geo = profile.geoLocation;
  const location = geo
    ? [geo.country, geo.asn, geo.org].filter(Boolean).join(' · ')
    : 'Unknown';

  const feedRows = profile.feeds.map(feed => [
    feed.feedName,
    feedResultText(feed),
    feedStatusText(feed),
  ]);

  const feedTable = renderTable(['Feed', 'Result', 'Status'], feedRows);

  console.log(`┌${'─'.repeat(width - 2)}┐`);
  console.log(boxLine(paint(title, chalk.bold), innerWidth));
  console.log(boxLine(`Target: ${profile.ioc} (${targetType})`, innerWidth));
  console.log(boxLine(`Queried: ${queried}`, innerWidth));
  console.log(divider);
  console.log(boxLine('', innerWidth));
  console.log(boxLine(colorRiskLevel(profile.riskLevel, riskLine), innerWidth));
  console.log(boxLine(verdictLine, innerWidth));
  console.log(boxLine('', innerWidth));
  console.log(boxLine(`LOCATION:   ${location}`, innerWidth));
  console.log(boxLine('', innerWidth));
  console.log(divider);
  console.log(boxLine('FEED RESULTS', innerWidth));
  for (const line of feedTable.split('\n')) {
    console.log(boxLine(line, innerWidth));
  }
  console.log(boxLine('', innerWidth));
  console.log(boxLine('MITRE ATT&CK', innerWidth));

  if (profile.mitreTechniques.length === 0) {
    console.log(boxLine('No mapped techniques', innerWidth));
  } else {
    for (const technique of profile.mitreTechniques) {
      const techniqueLine = `${paint(technique.id, chalk.cyan)} ${technique.name} (${technique.tactic})`;
      console.log(boxLine(techniqueLine, innerWidth));
    }
  }

  console.log(`└${'─'.repeat(width - 2)}┘`);
}
