export type DocType = 'Factura' | 'Boleta' | 'Otros';
export type Status = 'Pendiente' | 'Aprobado' | 'Rechazado';
export type LiquidacionStatus = 'Pendiente' | 'Liquidado' | 'Traspasado';
export type LiquidacionType = 'Favor Empresa' | 'Favor Trabajador' | 'Equilibrado';

export interface LiquidacionInfo {
  status: LiquidacionStatus;
  type?: LiquidacionType;
  monto?: number; // Monto liquidado / devuelto / reembolsado
  voucherPhoto?: string; // base64 o referencia de recibo / uñero / voucher de pago
  hasVoucher?: boolean;
  voucherObs?: string; // N° operación, notas de liquidación
  fecha?: string; // YYYY-MM-DD
  carriedOverToId?: string; // ID de la rendición a la que se traspasó
  carriedOverToName?: string;
  carriedOverFromId?: string; // ID de la rendición de la que proviene
  carriedOverFromName?: string;
  carriedOverAmount?: number; // Saldo heredado
}

export interface Comprobante {
  id: string;
  type: DocType;
  documentNumber: string;
  ruc: string;
  razonSocial?: string;
  date: string; // ISO string
  amount: number;
  receiptPhoto?: string; // base64
  hasPhoto?: boolean;
  category?: string;
  observation?: string;
}

export interface Ingreso {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD or ISO string
  reference?: string;
}

export interface Rendicion {
  id: string;
  name: string;
  status: Status;
  createdAt: string; // ISO string
  userId: string;
  userName: string;
  comprobantes: Comprobante[];
  totalAmount: number;
  advanceAmount: number;
  advanceDate?: string; // YYYY-MM-DD or ISO string
  signature?: string; // base64
  ingresos?: Ingreso[];
  rendicionType?: string;
  liquidacion?: LiquidacionInfo;
  previousBalance?: number; // Saldo a favor/contra arrastrado de la rendición anterior
  previousBalanceSourceId?: string;
  previousBalanceSourceName?: string;
}

export interface AppSettings {
  companyLogo?: string; // base64
  companyName: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  createdAt: string;
  read: boolean;
}

export interface User {
  id: string;
  name: string;
  role: 'user' | 'admin';
  email?: string;
  department?: string;
  password?: string;
  createdAt?: string;
}
