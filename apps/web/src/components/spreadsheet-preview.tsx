"use client";

import { useMemo, useState } from "react";

type Cell = string | number | boolean | null;
type WorkbookPreview = { sheets?: Array<{ name?: string; rows?: Cell[][] }> };

function columnName(index: number) {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

export function SpreadsheetPreview({ content }: { content: string }) {
  const workbook = useMemo<WorkbookPreview>(() => {
    try {
      return JSON.parse(content) as WorkbookPreview;
    } catch {
      return { sheets: [] };
    }
  }, [content]);
  const sheets = workbook.sheets ?? [];
  const [activeIndex, setActiveIndex] = useState(0);
  const sheet = sheets[Math.min(activeIndex, Math.max(0, sheets.length - 1))];
  const rows = sheet?.rows ?? [];
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);

  return <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-line bg-white" data-spreadsheet-preview="true">
    <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-slate-50 px-2 pt-2">
      {sheets.map((item, index) => <button key={`${item.name}-${index}`} className={`shrink-0 rounded-t-lg border border-b-0 px-3 py-2 text-xs font-semibold ${index === activeIndex ? "border-brand bg-white text-brand" : "border-line bg-slate-100 text-slate-600"}`} onClick={() => setActiveIndex(index)} type="button">{item.name || `Sheet ${index + 1}`}</button>)}
    </div>
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="border-separate border-spacing-0 text-xs text-ink">
        <thead className="sticky top-0 z-20">
          <tr><th className="sticky left-0 z-30 min-w-12 border-b border-r border-line bg-slate-100 px-2 py-1.5" />
            {Array.from({ length: columnCount }, (_, index) => <th key={index} className="min-w-28 border-b border-r border-line bg-slate-100 px-2 py-1.5 text-center font-semibold text-slate-600">{columnName(index)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => <tr key={rowIndex}>
            <th className="sticky left-0 z-10 border-b border-r border-line bg-slate-100 px-2 py-1.5 text-right font-medium text-slate-500">{rowIndex + 1}</th>
            {Array.from({ length: columnCount }, (_, columnIndex) => <td key={columnIndex} className="max-w-96 whitespace-pre-wrap border-b border-r border-line bg-white px-2 py-1.5 align-top">{String(row[columnIndex] ?? "")}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}
