import { Pie, PieChart, Cell, Tooltip, Legend, Label } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

type DiskSlice = {
  type: string;
  sizeBytes: number;
};

interface Props {
  data: DiskSlice[];
}

const COLORS = ["#6C28D9", "#8884d8", "#22c55e", "#eab308", "#ef4444", "#06b6d4"];

const chartConfig: ChartConfig = {
  usage: {
    label: "Disk Usage",
  },
};

export function DiskPieChart({ data }: Props) {
  const total = data.reduce((acc, cur) => acc + cur.sizeBytes, 0) || 1;
  const formatted = data
    .filter((d) => d.sizeBytes > 0)
    .map((d) => ({ ...d, percent: (d.sizeBytes / total) * 100 }));

  return (
    <ChartContainer config={chartConfig} className="w-full max-w-full h-[220px]">
      <PieChart>
        <Pie data={formatted} dataKey="sizeBytes" nameKey="type" outerRadius={80} innerRadius={50} stroke="transparent">
          {formatted.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
          ))}
          <Label
            position="center"
            content={({ viewBox }) => {
              if (!viewBox || typeof viewBox.cx !== "number" || typeof viewBox.cy !== "number") return null;
              return (
                <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle" className="fill-foreground">
                  <tspan className="text-xs">Total</tspan>
                  <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 14} className="text-sm font-medium">
                    {formatBytes(total)}
                  </tspan>
                </text>
              );
            }}
          />
        </Pie>
        <Legend />
        <ChartTooltip cursor={false} content={<ChartTooltipContent nameKey="type" valueFormatter={(v) => formatBytes(Number(v))} />} />
      </PieChart>
    </ChartContainer>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${sizes[i]}`;
}


