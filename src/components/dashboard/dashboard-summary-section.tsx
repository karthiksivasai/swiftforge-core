import { DashboardKpiCard } from "@/components/dashboard/dashboard-kpi-card";
import type { DashboardKpiCardModel } from "@/lib/dashboard/types";

type Props = {
  title: string;
  cards: DashboardKpiCardModel[];
};

export function DashboardSummarySection({ title, cards }: Props) {
  if (cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <DashboardKpiCard key={c.key} card={c} />
        ))}
      </div>
    </section>
  );
}
