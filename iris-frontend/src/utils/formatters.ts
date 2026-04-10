import { format } from 'date-fns';
import type { FeedStatus, RiskLevel, Verdict } from '../types';
import { TACTIC_COLORS } from './constants';

function clamp(n: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, n));
}

/**
 * Human-friendly relative time.
 * Examples: "2m ago", "1h ago", "3d ago", "Apr 9".
 */
export function timeAgo(date: string): string {
	const d = new Date(date);
	if (Number.isNaN(d.getTime())) return '';

	const diffMs = Date.now() - d.getTime();
	if (diffMs < 0) return 'now';

	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return 'now';
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(hours / 24);
	if (days < 7) return `${days}d ago`;

	return format(d, 'MMM d');
}

export function riskColor(level: RiskLevel): string {
	switch (level) {
		case 'CRITICAL':
			return 'text-iris-danger';
		case 'HIGH':
			return 'text-iris-danger';
		case 'MEDIUM':
			return 'text-iris-warning';
		case 'LOW':
			return 'text-iris-success';
		case 'NONE':
			return 'text-iris-text-dim';
		case 'UNKNOWN':
		default:
			return 'text-iris-info';
	}
}

export function riskBgColor(level: RiskLevel): string {
	switch (level) {
		case 'CRITICAL':
			return 'bg-iris-danger/15';
		case 'HIGH':
			return 'bg-iris-danger/10';
		case 'MEDIUM':
			return 'bg-iris-warning/10';
		case 'LOW':
			return 'bg-iris-success/10';
		case 'NONE':
			return 'bg-iris-border/20';
		case 'UNKNOWN':
		default:
			return 'bg-iris-info/10';
	}
}

/**
 * Score → CSS color string (green → red).
 * Intended for inline styles, e.g. `style={{ color: scoreColor(score) }}`.
 */
export function scoreColor(score: number): string {
	const s = clamp(score, 0, 100) / 100;
	const hue = 120 * s; // 0 = red, 120 = green
	return `hsl(${hue} 85% 55%)`;
}

export function formatLatency(ms: number): string {
	if (!Number.isFinite(ms) || ms < 0) return '';
	if (ms >= 1000) {
		const s = ms / 1000;
		const rounded = Math.round(s * 10) / 10;
		const text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
		return `${text}s`;
	}
	return `${Math.round(ms)}ms`;
}

export function truncateIoC(ioc: string, max: number): string {
	const m = Math.floor(max);
	if (m <= 0) return '';
	if (ioc.length <= m) return ioc;
	if (m === 1) return '…';
	return `${ioc.slice(0, m - 1)}…`;
}

export type FeedStatusColor = { bg: string; text: string; dot: string };

export function feedStatusColor(status: FeedStatus): FeedStatusColor {
	switch (status) {
		case 'success':
			return { bg: 'bg-iris-success/10', text: 'text-iris-success', dot: 'bg-iris-success' };
		case 'cached':
			return { bg: 'bg-iris-accent/10', text: 'text-iris-accent', dot: 'bg-iris-accent' };
		case 'timeout':
			return { bg: 'bg-iris-warning/10', text: 'text-iris-warning', dot: 'bg-iris-warning' };
		case 'circuit_open':
			return { bg: 'bg-iris-warning/10', text: 'text-iris-warning', dot: 'bg-iris-warning' };
		case 'disabled':
			return { bg: 'bg-iris-border/20', text: 'text-iris-text-muted', dot: 'bg-iris-text-muted' };
		case 'unsupported':
			return { bg: 'bg-iris-border/20', text: 'text-iris-text-muted', dot: 'bg-iris-text-muted' };
		case 'failed':
		default:
			return { bg: 'bg-iris-danger/10', text: 'text-iris-danger', dot: 'bg-iris-danger' };
	}
}

export function tacticColor(tactic: string): { bg: string; text: string } {
	return TACTIC_COLORS[tactic] ?? { bg: 'bg-iris-elevated', text: 'text-iris-text' };
}

export type VerdictUIConfig = {
	color: string;
	bg: string;
	icon: string;
	label: string;
	description: string;
};

export function verdictConfig(verdict: Verdict): VerdictUIConfig {
	switch (verdict) {
		case 'Malicious':
			return {
				color: 'text-iris-danger',
				bg: 'bg-iris-danger/10',
				icon: 'shield-alert',
				label: 'Malicious',
				description: 'Strong indicators of malicious activity across multiple sources.',
			};
		case 'Suspicious':
			return {
				color: 'text-iris-warning',
				bg: 'bg-iris-warning/10',
				icon: 'alert-triangle',
				label: 'Suspicious',
				description: 'Some signals suggest elevated risk; additional context recommended.',
			};
		case 'Clean':
			return {
				color: 'text-iris-success',
				bg: 'bg-iris-success/10',
				icon: 'shield-check',
				label: 'Clean',
				description: 'No meaningful malicious indicators were detected by configured feeds.',
			};
		case 'Unknown':
		default:
			return {
				color: 'text-iris-text-dim',
				bg: 'bg-iris-border/20',
				icon: 'help-circle',
				label: 'Unknown',
				description: 'Insufficient data to determine a confident verdict.',
			};
	}
}
