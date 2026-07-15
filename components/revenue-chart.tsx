// Multi-year revenue: table + inline SVG mini bar chart. No chart library.
import { getTranslations } from "next-intl/server";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Revenue } from "@/lib/generated/prisma/client";

export async function RevenueChart({ revenues }: { revenues: Revenue[] }) {
  const t = await getTranslations("company");
  if (revenues.length === 0) return null;

  const max = Math.max(...revenues.map((r) => r.amount));
  const barWidth = 34;
  const chartHeight = 90;
  const width = revenues.length * (barWidth + 10);
  const currency = revenues[0].currency;

  return (
    <div className="flex flex-col sm:flex-row gap-6 items-start">
      <Table className="w-auto">
        <TableHeader>
          <TableRow>
            <TableHead>{t("revenueYear")}</TableHead>
            <TableHead className="text-right">{t("revenueAmount", { currency })}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {revenues.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums">{r.year}</TableCell>
              <TableCell className="text-right tabular-nums">
                {r.amount.toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <svg
        width={width}
        height={chartHeight + 18}
        role="img"
        aria-label={t("revenues")}
        className="mt-1"
      >
        {revenues.map((r, i) => {
          const h = max > 0 ? (r.amount / max) * chartHeight : 0;
          const x = i * (barWidth + 10);
          return (
            <g key={r.id}>
              <rect
                x={x}
                y={chartHeight - h}
                width={barWidth}
                height={h}
                rx={3}
                className="fill-primary/70"
              />
              <text
                x={x + barWidth / 2}
                y={chartHeight + 12}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {r.year}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
