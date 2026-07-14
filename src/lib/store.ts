import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Rendicion, AppSettings, AppNotification, User, Comprobante } from '../types';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { safeUUID } from './utils';

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
  addRendicion: (name: string, advanceAmount: number, comprobantes: Omit<Comprobante, 'id'>[], signature?: string, advanceDate?: string, ingresos?: any[]) => Promise<void>;
  updateRendicion: (id: string, updates: Partial<Rendicion>) => Promise<void>;
  updateRendicionStatus: (id: string, newStatus: Rendicion['status']) => Promise<void>;
  deleteRendicion: (id: string) => Promise<void>;
  updateSettings: (newSettings: Partial<AppSettings>) => void;
  addNotification: (userId: string, title: string, message: string) => void;
  markNotificationAsRead: (id: string) => void;
  switchUser: (role: 'user' | 'admin') => void;
  setCurrentUser: (user: User) => void;
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

      addRendicion: async (name, advanceAmount, comprobantes, signature, advanceDate, ingresos) => {
        const { currentUser } = get();
        const totalAmount = comprobantes.reduce((sum, c) => sum + c.amount, 0);
        const newId = safeUUID();
        
        const newRendicion: any = {
          id: newId,
          name,
          status: 'Pendiente',
          createdAt: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          comprobantes: comprobantes.map(c => ({ ...c, id: (c as any).id || safeUUID() })),
          totalAmount,
          advanceAmount,
        };

        if (advanceDate !== undefined) newRendicion.advanceDate = advanceDate;
        if (signature !== undefined) newRendicion.signature = signature;
        if (ingresos !== undefined) newRendicion.ingresos = ingresos;
        
        // Save photos to dedicated 'receipt_photos' collection in Firestore
        const comprobantesToSave = [];
        for (const c of newRendicion.comprobantes) {
          const compCopy = { ...c };
          if (compCopy.receiptPhoto) {
            try {
              await setDoc(doc(db, 'receipt_photos', compCopy.id), { photo: compCopy.receiptPhoto });
            } catch (err) {
              console.error("Error saving receipt photo to Firestore:", err);
            }
            delete compCopy.receiptPhoto;
            compCopy.hasPhoto = true;
          }
          comprobantesToSave.push(compCopy);
        }

        const cleanRendicion = JSON.parse(JSON.stringify({
          ...newRendicion,
          comprobantes: comprobantesToSave
        }));
        
        await setDoc(doc(db, 'rendiciones', newId), cleanRendicion);
        
        // Optimistic / Local update - KEEP original with receiptPhoto in local state
        set((state) => ({
          rendiciones: [newRendicion, ...state.rendiciones]
        }));

        get().addNotification('admin1', 'Nueva Rendición', `${currentUser.name} ha enviado el bloque "${name}" por S/ ${totalAmount.toFixed(2)}.`);
      },

      updateRendicion: async (id, updates) => {
        const rendicionRef = doc(db, 'rendiciones', id);
        
        const updateData: any = {};
        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            updateData[key] = value;
          }
        }
        
        if (updateData.comprobantes) {
          updateData.totalAmount = updateData.comprobantes.reduce((sum: number, c: any) => sum + c.amount, 0);
        }

        // Separate photos before saving to firestore
        let comprobantesToSave = undefined;
        if (updateData.comprobantes) {
          comprobantesToSave = [];
          for (const c of updateData.comprobantes) {
            const compCopy = { ...c };
            if (compCopy.receiptPhoto) {
              try {
                await setDoc(doc(db, 'receipt_photos', compCopy.id), { photo: compCopy.receiptPhoto });
              } catch (err) {
                console.error("Error saving receipt photo to Firestore:", err);
              }
              delete compCopy.receiptPhoto;
              compCopy.hasPhoto = true;
            }
            comprobantesToSave.push(compCopy);
          }
        }
        
        const cleanUpdateData = JSON.parse(JSON.stringify({
          ...updateData,
          ...(comprobantesToSave !== undefined ? { comprobantes: comprobantesToSave } : {})
        }));

        await updateDoc(rendicionRef, cleanUpdateData);

        // Optimistic / Local update - KEEP original with receiptPhoto in local state
        set((state) => ({
          rendiciones: state.rendiciones.map(r => r.id === id ? { ...r, ...updateData } : r)
        }));
      },

      updateRendicionStatus: async (id, newStatus) => {
        const { settings, rendiciones } = get();
        const r = rendiciones.find(r => r.id === id);
        if (r) {
          await updateDoc(doc(db, 'rendiciones', id), { status: newStatus });
          
          // Optimistic / Local update
          set((state) => ({
            rendiciones: state.rendiciones.map(item => item.id === id ? { ...item, status: newStatus } : item)
          }));

          get().addNotification(r.userId, 'Estado Actualizado', `Tu rendición "${r.name}" de S/ ${r.totalAmount.toFixed(2)} ha sido ${newStatus.toLowerCase()}.`);
          
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Jean-Barsa Rendiciones', {
              body: `Tu rendición ha sido ${newStatus.toLowerCase()}.`,
              icon: settings.companyLogo
            });
          }
        }
      },

      deleteRendicion: async (id) => {
        await deleteDoc(doc(db, 'rendiciones', id));
        // Optimistic / Local update
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
          id: safeUUID(),
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
      setCurrentUser: (user) => {
        set({ currentUser: user });
      }
    }),
    {
      name: 'jean-barsa-storage',
    }
  )
);
