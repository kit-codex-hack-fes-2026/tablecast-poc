import type { PosCapabilities, PosCatalog, PosDevice, PosDeviceCode, PosInvoice } from "./model";

export type PosRemoteOrder = {
  amount: number;
  currency: string;
  id: string;
  locationId: string;
  paymentIds: string[];
  status: "cancelled" | "completed" | "open" | "unknown";
};
export type PosRemoteCheckout = {
  amount: number;
  currency: string;
  id: string;
  locationId: string;
  orderId: string;
  paymentIds: string[];
  status: "cancelled" | "completed" | "pending" | "unknown";
};
export type PosRemotePayment = {
  amount: number;
  checkoutId: null | string;
  completed: boolean;
  currency: string;
  id: string;
  locationId: string;
  orderId: string;
};
export interface PosAdapter {
  cancelOrder?(id: string): Promise<PosRemoteOrder>;
  capabilities: PosCapabilities;
  catalog?(locationId?: string): Promise<PosCatalog>;
  checkout?: {
    cancel(id: string): Promise<PosRemoteCheckout>;
    get(id: string): Promise<PosRemoteCheckout>;
    start(order: PosRemoteOrder, deviceId: string, key: string): Promise<PosRemoteCheckout>;
  };
  createOrder?(invoice: PosInvoice, locationId: string, key: string): Promise<PosRemoteOrder>;
  devices?: {
    createCode(locationId: string, name: string, key: string): Promise<PosDeviceCode>;
    getCode(id: string): Promise<PosDeviceCode>;
    list(locationId: string): Promise<PosDevice[]>;
  };
  getOrder?(id: string): Promise<PosRemoteOrder>;
  getPayment?(id: string): Promise<PosRemotePayment>;
  quote?(invoice: PosInvoice, locationId: string): Promise<{ amount: number; currency: string }>;
  settleZeroOrder?(id: string, key: string): Promise<PosRemoteOrder>;
}
