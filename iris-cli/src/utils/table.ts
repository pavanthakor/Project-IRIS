import Table from 'cli-table3';

type Cell = string | number;

export function renderTable(headers: string[], rows: Cell[][]): string {
  const table = new Table({
    head: headers,
    style: {
      head: [],
      border: [],
    },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(row);
  }

  return table.toString();
}

export function printTable(headers: string[], rows: Cell[][]): void {
  console.log(renderTable(headers, rows));
}
