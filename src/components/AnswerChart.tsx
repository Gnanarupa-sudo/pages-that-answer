import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { Chart } from "@/lib/rag.functions";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function AnswerChart({ chart }: { chart: Chart }) {
  const rows = chart.points.map((p) => {
    const r: Record<string, string | number> = { label: p.label };
    chart.series.forEach((s, i) => (r[s] = p.values[i] ?? 0));
    return r;
  });
  const first = chart.series[0] ?? "value";
  return (
    <figure className="mt-4 rounded-lg border border-border bg-card p-4">
      <figcaption className="font-display text-lg mb-2">{chart.title}</figcaption>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          {chart.type === "pie" ? (
            <PieChart>
              <Pie data={rows} dataKey={first} nameKey="label" outerRadius="80%" label>
                {rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          ) : chart.type === "line" ? (
            <LineChart data={rows}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
              {chart.series.map((s, i) => <Line key={s} dataKey={s} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />)}
            </LineChart>
          ) : (
            <BarChart data={rows}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="label" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Legend />
              {chart.series.map((s, i) => <Bar key={s} dataKey={s} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
