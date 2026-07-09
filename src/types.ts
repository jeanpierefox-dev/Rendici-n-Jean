export type DocType = 'Factura' | 'Boleta' | 'Otros';
export type Status = 'Pendiente' | 'Aprobado' | 'Rechazado';

export interface Comprobante {
  id: string;
  type: DocType;
  documentNumber: string;
  ruc: string;
  date: string; // ISO string
  amount: number;
  receiptPhoto?: string; // base64
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
