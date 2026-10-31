export type SidebarStore = {
  id: string;
  logo?: null | string;
  name: string;
};
export type SidebarSelection = {
  availableStores: SidebarStore[];
  error?: unknown;
  manager: boolean;
  onChange: (id: string, onSuccess?: () => void) => void;
  pending: boolean;
  selectedOrganization?: string;
  selectedStore?: string;
  user?: { email: null | string; id: string; image?: null | string; name?: null | string };
};
