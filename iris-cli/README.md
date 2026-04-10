# IRIS CLI — Threat Intelligence from Your Terminal

## Install

```bash
cd iris-cli
npm install
npm run build
npm link
```

## Usage

```bash
iris login
iris analyze 8.8.8.8
iris analyze malicious-cdn.ru --type domain
iris bulk iocs.txt --output results.json
iris history --limit 10 --risk high
iris feeds
```

## Commands

- `iris login`
- `iris logout`
- `iris whoami`
- `iris analyze <ioc> [--type ip|domain|hash|email] [--json] [--no-color]`
- `iris bulk <file> [--output results.json] [--format json|csv|table]`
- `iris history [--limit 20] [--type ip|domain|hash|email] [--risk critical|high|medium|low|clean] [--json]`
- `iris feeds`
- `iris export <queryId> [--format json|csv]`

## Global options

- `--api-url <url>`: override API URL for one command
- `--token <token>`: override auth token for one command
- `--no-color`: disable colored output
- `--json`: output raw JSON

## Kali Linux / Pentest Integration

```bash
# Pipe from nmap
nmap -sn 192.168.1.0/24 | grep "report for" | awk '{print $5}' > targets.txt
iris bulk targets.txt --output scan-results.json

# Check a suspicious IP from logs
cat /var/log/auth.log | grep "Failed password" | awk '{print $11}' | sort -u > bad-ips.txt
iris bulk bad-ips.txt --format csv > threat-report.csv

# Quick check in incident response
iris analyze 185.220.101.47 --json | jq '.verdict'
```
