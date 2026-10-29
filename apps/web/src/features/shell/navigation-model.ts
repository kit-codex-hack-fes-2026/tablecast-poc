import {
  Blocks,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  CircleHelp,
  CreditCard,
  FileClock,
  Gamepad2,
  Gift,
  History,
  House,
  KeyRound,
  LayoutDashboard,
  LayoutList,
  Mic,
  MonitorSmartphone,
  Palette,
  Plug,
  Settings2,
  Store,
  Tablet,
  Tags,
  TicketPercent,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { tv } from "tailwind-variants";

export const navigationGroups = {
  operations: { label: "nav_operations", Icon: LayoutDashboard },
  menu: { label: "admin_config", Icon: UtensilsCrossed },
  rewards: { label: "nav_rewards", Icon: Gift },
  store: { label: "nav_store_management", Icon: Store },
  workspace: { label: "nav_workspace", Icon: Plug },
  help: { label: "help_title", Icon: BookOpen },
} as const;

export const navigationGroupStyle = tv({
  base: "min-w-0",
  variants: {
    tone: {
      operations:
        "[--nav-color:var(--color-nav-operations)] [--nav-surface:var(--color-nav-operations-soft)]",
      menu: "[--nav-color:var(--color-nav-menu)] [--nav-surface:var(--color-nav-menu-soft)]",
      rewards:
        "[--nav-color:var(--color-nav-rewards)] [--nav-surface:var(--color-nav-rewards-soft)]",
      store: "[--nav-color:var(--color-nav-store)] [--nav-surface:var(--color-nav-store-soft)]",
      workspace:
        "[--nav-color:var(--color-nav-workspace)] [--nav-surface:var(--color-nav-workspace-soft)]",
      help: "[--nav-color:var(--color-nav-help)] [--nav-surface:var(--color-nav-help-soft)]",
    },
  },
});

export const navigationPages = {
  home: { group: "operations", label: "home_title", Icon: House, to: "/admin/stores/$storeId" },
  floor: {
    group: "operations",
    label: "admin_live",
    Icon: LayoutDashboard,
    to: "/admin/stores/$storeId/floor",
  },
  visits: {
    group: "operations",
    label: "admin_history",
    Icon: History,
    to: "/admin/stores/$storeId/visits",
  },
  statistics: {
    group: "operations",
    label: "statistics_title",
    Icon: ChartNoAxesCombined,
    to: "/admin/stores/$storeId/statistics",
    manager: true,
  },
  products: {
    group: "menu",
    label: "editor_products",
    Icon: UtensilsCrossed,
    to: "/admin/stores/$storeId/menu/products",
  },
  categories: {
    group: "menu",
    label: "editor_categories",
    Icon: Tags,
    to: "/admin/stores/$storeId/menu/categories",
  },
  plans: {
    group: "menu",
    label: "editor_plans",
    Icon: LayoutList,
    to: "/admin/stores/$storeId/menu/plans",
  },
  guides: {
    group: "menu",
    label: "assistance_guides",
    Icon: CircleHelp,
    to: "/admin/stores/$storeId/menu/guides",
  },
  cast: { group: "menu", label: "editor_cast", Icon: Mic, to: "/admin/stores/$storeId/menu/cast" },
  design: {
    group: "menu",
    label: "theme_title",
    Icon: Palette,
    to: "/admin/stores/$storeId/design",
  },
  changes: {
    group: "menu",
    label: "admin_drafts",
    Icon: FileClock,
    to: "/admin/stores/$storeId/menu/changes",
  },
  history: {
    group: "menu",
    label: "configuration_history_title",
    Icon: History,
    to: "/admin/stores/$storeId/menu/history",
    manager: true,
  },
  games: {
    group: "menu",
    label: "games_title",
    Icon: Gamepad2,
    to: "/admin/stores/$storeId/games",
  },
  points: {
    group: "rewards",
    label: "customer_points_policy",
    Icon: Gift,
    to: "/admin/stores/$storeId/points",
  },
  coupons: {
    group: "rewards",
    label: "coupons",
    Icon: TicketPercent,
    to: "/admin/stores/$storeId/coupons",
  },
  members: {
    group: "store",
    label: "org_members",
    Icon: Users,
    to: "/admin/stores/$storeId/members",
  },
  devices: {
    group: "store",
    label: "device_title",
    Icon: MonitorSmartphone,
    to: "/admin/stores/$storeId/devices",
  },
  pos: {
    group: "store",
    label: "pos_title",
    Icon: Plug,
    to: "/admin/stores/$storeId/pos",
    manager: true,
  },
  profile: {
    group: "store",
    label: "store_profile",
    Icon: Store,
    to: "/admin/stores/$storeId/profile",
  },
  billing: {
    group: "store",
    label: "billing_title",
    Icon: CreditCard,
    to: "/billing/$organizationId",
  },
  organisations: {
    group: "workspace",
    label: "nav_all_stores",
    Icon: Building2,
    to: "/organisations",
  },
  plugins: {
    group: "workspace",
    label: "mcp_plugin_install",
    Icon: Blocks,
    to: "/account/integrations/plugins",
  },
  manual: {
    group: "workspace",
    label: "mcp_manual_install",
    Icon: BookOpen,
    to: "/account/integrations/manual",
  },
  sessions: {
    group: "workspace",
    label: "mcp_oauth_sessions",
    Icon: KeyRound,
    to: "/account/mcp-sessions",
  },
} as const;
export type NavigationPageId = keyof typeof navigationPages;
export type NavigationContext = {
  manager?: boolean;
  selectedOrganization?: string;
  selectedStore?: string;
};

export function navigationTarget(id: NavigationPageId, context: NavigationContext) {
  const path = navigationPages[id].to;
  if (path.includes("$storeId") && !context.selectedStore) return undefined;
  if (path.includes("$organizationId") && !context.selectedOrganization) return undefined;
  return path
    .replace("$storeId", encodeURIComponent(context.selectedStore ?? ""))
    .replace("$organizationId", encodeURIComponent(context.selectedOrganization ?? ""));
}

const helpNavigation = {
  "": { Icon: BookOpen },
  "getting-started": { Icon: Tablet },
  mcp: { Icon: Plug },
  configuration: { Icon: Settings2 },
  analytics: { Icon: ChartNoAxesCombined },
  troubleshooting: { Icon: CircleHelp },
} as const;
export function helpNavigationItem(url: string) {
  const slug = url.split(/[?#]/)[0]?.split("/").at(-1) ?? "";
  return Object.entries(helpNavigation).find(([key]) => key === slug)?.[1] ?? helpNavigation[""];
}

export function searchNavigation(
  query: string,
  label: (
    key:
      | (typeof navigationGroups)[keyof typeof navigationGroups]["label"]
      | (typeof navigationPages)[NavigationPageId]["label"],
  ) => string,
  context: NavigationContext,
) {
  const terms = query.normalize("NFKC").toLocaleLowerCase().trim().split(/\s+/);
  if (!terms[0]) return [];
  return Object.entries(navigationPages)
    .flatMap(([key, page]) => {
      if (context.manager === false && "manager" in page && page.manager) return [];
      const title = label(page.label);
      const group = label(navigationGroups[page.group].label);
      const text = `${title} ${group} ${page.to}`.normalize("NFKC").toLocaleLowerCase();
      if (!terms.every((term) => text.includes(term))) return [];
      if (!isNavigationPageId(key)) return [];
      const id = key;
      return [
        {
          id,
          ...page,
          title,
          description: group,
          url: navigationTarget(id, context) ?? `/admin/go/${id}`,
        },
      ];
    })
    .slice(0, 8);
}

export function isNavigationPageId(value: string): value is NavigationPageId {
  return Object.hasOwn(navigationPages, value);
}
export function isNavigationGroupId(value: string): value is keyof typeof navigationGroups {
  return Object.hasOwn(navigationGroups, value);
}
