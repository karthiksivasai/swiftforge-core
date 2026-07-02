import { Fragment } from "react";
import { Link } from "@tanstack/react-router";

type AnyPath = Parameters<typeof Link>[0]["to"];
const asPath = (p: string) => p as AnyPath;
import { Sparkles } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export type PlaceholderPageProps = {
  title: string;
  breadcrumbs: { label: string; path?: string }[];
  description?: string;
};

export function PlaceholderPage({ title, breadcrumbs, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/dashboard">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <Fragment key={`${crumb.label}-${idx}`}>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {isLast || !crumb.path ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink asChild>
                      <Link to={asPath(crumb.path)}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
          <Badge variant="secondary" className="font-normal">
            Coming soon
          </Badge>
        </div>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      <Card className="flex min-h-[320px] flex-col items-center justify-center gap-3 border-dashed bg-card/50 p-10 text-center shadow-none">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <Sparkles className="h-5 w-5" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Module scaffolded</h2>
        <p className="max-w-md text-sm text-muted-foreground">
          This module will be implemented in a future phase. The route, navigation, breadcrumb, and
          layout are wired up and ready for business logic.
        </p>
      </Card>
    </div>
  );
}
