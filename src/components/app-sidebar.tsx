import { Link, useRouterState } from "@tanstack/react-router";

// Sidebar link targets come from a config array and resolve through splat
// routes; TanStack's typed `to` prop only accepts registered literal paths,
// so widen dynamic strings here.
type AnyPath = Parameters<typeof Link>[0]["to"];
const asPath = (p: string) => p as AnyPath;
import { ChevronRight } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { NAVIGATION, type NavGroup, type NavSection } from "@/lib/navigation";
import { useTenant } from "@/lib/tenant";

function isSectionActive(section: NavSection, pathname: string) {
  if (section.standalone && section.path) return pathname === section.path;
  return pathname === `/${section.slug}` || pathname.startsWith(`/${section.slug}/`);
}

function isGroupActive(sectionSlug: string, group: NavGroup, pathname: string) {
  return pathname.startsWith(`/${sectionSlug}/${group.slug}/`);
}

export function AppSidebar() {
  const tenant = useTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-r">
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2.5 px-1.5 py-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-sm font-semibold">
            {tenant.logoInitials}
          </div>
          <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">{tenant.shortName}</span>
            <span className="truncate text-xs text-muted-foreground">Courier ERP</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {NAVIGATION.map((section) => {
          const Icon = section.icon;
          const sectionActive = isSectionActive(section, pathname);

          // Standalone (Dashboard)
          if (section.standalone && section.path) {
            return (
              <SidebarGroup key={section.slug}>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={sectionActive} tooltip={section.label}>
                        <Link to={asPath(section.path)}>
                          <Icon />
                          <span>{section.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            );
          }

          return (
            <SidebarGroup key={section.slug}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {/* Direct leaves under a section (e.g. Transaction) */}
                  {section.items?.map((leaf) => (
                    <SidebarMenuItem key={leaf.path}>
                      <SidebarMenuButton
                        asChild
                        isActive={pathname === leaf.path}
                        tooltip={leaf.label}
                        size="sm"
                      >
                        <Link to={asPath(leaf.path)}>
                          <span className="ml-1 h-1 w-1 rounded-full bg-current opacity-50" />
                          <span>{leaf.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}

                  {/* Grouped leaves */}
                  {section.groups?.map((group) => {
                    const GroupIcon = group.icon;
                    const active = isGroupActive(section.slug, group, pathname);
                    return (
                      <Collapsible
                        key={group.slug}
                        asChild
                        defaultOpen={active}
                        className="group/collapsible"
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton tooltip={group.label}>
                              {GroupIcon ? <GroupIcon /> : null}
                              <span>{group.label}</span>
                              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {group.items.map((leaf) => (
                                <SidebarMenuSubItem key={leaf.path}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={pathname === leaf.path}
                                  >
                                    <Link to={asPath(leaf.path)}>{leaf.label}</Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="border-t">
        <div className="px-2 py-1 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          <div className="truncate font-medium text-foreground">{tenant.name}</div>
          <div className="truncate">{tenant.primaryBranch}</div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
