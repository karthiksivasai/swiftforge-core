import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";

// Sidebar link targets come from a config array and resolve through splat
// routes; TanStack's typed `to` prop only accepts registered literal paths,
// so widen dynamic strings here.
type AnyPath = Parameters<typeof Link>[0]["to"];
const asPath = (p: string) => p as AnyPath;

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NAVIGATION, type NavGroup, type NavSection, type NavLeaf } from "@/lib/navigation";
import { useTenant } from "@/lib/tenant";
import { cn } from "@/lib/utils";

function isSectionActive(section: NavSection, pathname: string) {
  if (section.standalone && section.path) return pathname === section.path;
  return pathname === `/${section.slug}` || pathname.startsWith(`/${section.slug}/`);
}

function isGroupActive(sectionSlug: string, group: NavGroup, pathname: string) {
  return pathname.startsWith(`/${sectionSlug}/${group.slug}/`);
}

/** Top-level "card" — either a standalone link or a collapsible container. */
function SectionCard({
  section,
  pathname,
}: {
  section: NavSection;
  pathname: string;
}) {
  const Icon = section.icon;
  const active = isSectionActive(section, pathname);

  // Standalone (Dashboard)
  if (section.standalone && section.path) {
    return (
      <Link
        to={asPath(section.path)}
        className={cn(
          "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
          "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:mx-auto",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-white/5",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="group-data-[collapsible=icon]:hidden">{section.label}</span>
      </Link>
    );
  }

  return (
    <Collapsible
      defaultOpen={active}
      className={cn(
        "group/section rounded-xl overflow-hidden",
        "data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground data-[state=open]:shadow-sm",
        "group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none",
      )}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
          "group-data-[state=closed]/section:text-sidebar-foreground group-data-[state=closed]/section:hover:bg-white/5",
          "group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:text-sidebar-foreground group-data-[collapsible=icon]:hover:bg-white/5",
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
          {section.label}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 opacity-70 transition-transform group-data-[state=open]/section:rotate-180",
            "group-data-[collapsible=icon]:hidden",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden group-data-[collapsible=icon]:hidden">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {section.items?.map((leaf) => (
            <LeafLink key={leaf.path} leaf={leaf} pathname={pathname} indent={0} />
          ))}
          {section.groups?.map((group) => (
            <GroupCollapsible
              key={group.slug}
              sectionSlug={section.slug}
              group={group}
              pathname={pathname}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function GroupCollapsible({
  sectionSlug,
  group,
  pathname,
}: {
  sectionSlug: string;
  group: NavGroup;
  pathname: string;
}) {
  const active = isGroupActive(sectionSlug, group, pathname);
  return (
    <Collapsible defaultOpen={active} className="group/group">
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          active ? "bg-muted text-foreground" : "text-foreground/80 hover:bg-muted/60",
        )}
      >
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown className="h-4 w-4 opacity-70 transition-transform group-data-[state=open]/group:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden">
        <div className="ml-3 mt-0.5 flex flex-col gap-0.5 border-l border-border/60 pl-2">
          {group.items.map((leaf) => (
            <LeafLink key={leaf.path} leaf={leaf} pathname={pathname} indent={1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function LeafLink({
  leaf,
  pathname,
  indent,
}: {
  leaf: NavLeaf;
  pathname: string;
  indent: number;
}) {
  const active = pathname === leaf.path;
  return (
    <Link
      to={asPath(leaf.path)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm transition-colors",
        indent === 0 ? "" : "text-[13px]",
        active
          ? "bg-muted font-medium text-foreground"
          : "text-foreground/75 hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {leaf.label}
    </Link>
  );
}

export function AppSidebar() {
  const tenant = useTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="border-b border-white/10">
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-sidebar text-sm font-semibold">
            {tenant.logoInitials}
          </div>
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold text-sidebar-foreground">
              {tenant.shortName}
            </span>
            <span className="truncate text-xs text-sidebar-foreground/60">Courier ERP</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-2 px-3 py-4 group-data-[collapsible=icon]:px-1.5">
        <SidebarMenu className="gap-2">
          {NAVIGATION.map((section) => (
            <SidebarMenuItem key={section.slug}>
              <SectionCard section={section} pathname={pathname} />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-white/10">
        <div className="px-2 py-1 text-xs text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          <div className="truncate font-medium text-sidebar-foreground">{tenant.name}</div>
          <div className="truncate">{tenant.primaryBranch}</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
