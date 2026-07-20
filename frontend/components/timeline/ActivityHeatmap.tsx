"use client";

import { HeatmapDay } from "@/lib/api";

function colorFor(count: number): string {
  if (count === 0) return "#ECE7E2";
  if (count === 1) return "rgba(201,106,40,0.35)";
  if (count <= 3) return "rgba(201,106,40,0.65)";
  return "#C96A28";
}

export default function ActivityHeatmap({ days, highlightedDate }: { days: HeatmapDay[]; highlightedDate?: string | null }) {
  const byDate = new Map(days.map((d) => [d.date, d.count]));

  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 179);
  // align start to a Sunday so the grid reads like GitHub's
  start.setDate(start.getDate() - start.getDay());

  const cells: { date: string; count: number }[] = [];
  const cursor = new Date(start);
  while (cursor <= today) {
    const iso = cursor.toISOString().slice(0, 10);
    cells.push({ date: iso, count: byDate.get(iso) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const total = days.reduce((sum, d) => sum + d.count, 0);

  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto pb-2">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((cell) => (
              <div
                key={cell.date}
                title={`${cell.date}: ${cell.count} event${cell.count !== 1 ? "s" : ""}`}
                className={`w-[11px] h-[11px] rounded-sm transition-shadow duration-150 ${
                  highlightedDate === cell.date ? "ring-2 ring-signal ring-offset-1 ring-offset-bg" : ""
                }`}
                style={{ background: colorFor(cell.count) }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="text-xs font-mono text-muted mt-2">
        {total} real career event{total !== 1 ? "s" : ""} in the last 180 days.
      </p>
    </div>
  );
}
