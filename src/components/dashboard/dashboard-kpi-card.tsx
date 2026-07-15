import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardKpiCardModel } from "@/lib/dashboard/types";
import { cn } from "@/lib/utils";

type Props = {
  card: DashboardKpiCardModel;
  className?: string;
};

export function DashboardKpiCard({ card, className }: Props) {
  return (
    <Card className={cn("shadow-none", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">{card.value}</div>
        {card.hint ? <p className="text-xs text-muted-foreground">{card.hint}</p> : null}
      </CardContent>
    </Card>
  );
}
