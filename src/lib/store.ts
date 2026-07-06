import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Rendicion, AppSettings, AppNotification, User, Comprobante } from '../types';

// Initial Mock Data
const MOCK_USERS: User[] = [
  { id: '1', name: 'Jean Piere', role: 'user' },
  { id: 'admin1', name: 'Administrador', role: 'admin' },
];

const DEFAULT_SETTINGS: AppSettings = {
  companyName: 'Jean-Barsa S.A.C.',
};

interface AppState {
  hasEnteredApp: boolean;
  rendiciones: Rendicion[];
  settings: AppSettings;
  notifications: AppNotification[];
  currentUser: User;
  
  enterApp: () => void;
  addRendicion: (name: string, advanceAmount: number, comprobantes: Omit<Comprobante, 'id'>[], signature?: string) => void;
  updateRendicion: (id: string, updates: Partial<Rendicion>) => void;
  updateRendicionStatus: (id: string, newStatus: Rendicion['status']) => void;
  deleteRendicion: (id: string) => void;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  addNotification: (userId: string, title: string, message: string) => void;
  markNotificationAsRead: (id: string) => void;
  switchUser: (role: 'user' | 'admin') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasEnteredApp: false,
      rendiciones: [],
      settings: DEFAULT_SETTINGS,
      notifications: [],
      currentUser: MOCK_USERS[0],

      enterApp: () => set({ hasEnteredApp: true }),

      addRendicion: (name, advanceAmount, comprobantes, signature) => {
        const { currentUser } = get();
        const totalAmount = comprobantes.reduce((sum, c) => sum + c.amount, 0);
        const newRendicion: Rendicion = {
          id: crypto.randomUUID(),
          name,
          status: 'Pendiente',
          createdAt: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          comprobantes: comprobantes.map(c => ({ ...c, id: crypto.randomUUID() })),
          totalAmount,
          advanceAmount,
          signature
        };
        
        set((state) => ({
          rendiciones: [newRendicion, ...state.rendiciones]
        }));
        
        get().addNotification('admin1', 'Nueva Rendición', `${currentUser.name} ha enviado el bloque "${name}" por S/ ${totalAmount.toFixed(2)}.`);
      },

      updateRendicion: (id, updates) => {
        set((state) => {
          const newRendiciones = state.rendiciones.map(r => {
            if (r.id === id) {
              const updatedRendicion = { ...r, ...updates };
              if (updates.comprobantes) {
                updatedRendicion.totalAmount = updates.comprobantes.reduce((sum, c) => sum + c.amount, 0);
              }
              return updatedRendicion;
            }
            return r;
          });
          return { rendiciones: newRendiciones };
        });
      },

      updateRendicionStatus: (id, newStatus) => {
        set((state) => {
          const { settings } = get();
          const newRendiciones = state.rendiciones.map(r => {
            if (r.id === id) {
              get().addNotification(r.userId, 'Estado Actualizado', `Tu rendición "${r.name}" de S/ ${r.totalAmount.toFixed(2)} ha sido ${newStatus.toLowerCase()}.`);
              
              if ('Notification' in window && Notification.permission === 'granted') {
                new Notification('Jean-Barsa Rendiciones', {
                  body: `Tu rendición ha sido ${newStatus.toLowerCase()}.`,
                  icon: settings.companyLogo
                });
              }

              return { ...r, status: newStatus };
            }
            return r;
          });
          return { rendiciones: newRendiciones };
        });
      },

      deleteRendicion: (id) => {
        set((state) => ({
          rendiciones: state.rendiciones.filter(r => r.id !== id)
        }));
      },

      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings }
        }));
      },

      addNotification: (userId, title, message) => {
        const newNotification: AppNotification = {
          id: crypto.randomUUID(),
          userId,
          title,
          message,
          createdAt: new Date().toISOString(),
          read: false,
        };
        set((state) => ({
          notifications: [newNotification, ...state.notifications]
        }));
      },

      markNotificationAsRead: (id) => {
        set((state) => ({
          notifications: state.notifications.map(n => 
            n.id === id ? { ...n, read: true } : n
          )
        }));
      },
      
      switchUser: (role) => {
        const user = MOCK_USERS.find(u => u.role === role);
        if (user) {
          set({ currentUser: user });
        }
      },
    }),
    {
      name: 'jean-barsa-storage',
    }
  )
);
