import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Rendicion, AppSettings, AppNotification, User, Comprobante } from '../types';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { safeUUID, recompressBase64Image } from './utils';

const savePhotoToFirestoreDoc = async (photoVal: string, keys: string[]) => {
  if (!photoVal) return;
  let photoToSave = photoVal;
  if (photoToSave.length > 850000 && photoToSave.startsWith('data:image/')) {
    try {
      photoToSave = await recompressBase64Image(photoToSave, 1000, 1300, 0.65);
    } catch (e) {
      console.warn("Could not recompress image:", e);
    }
  }

  for (const rawKey of keys) {
    if (!rawKey) continue;
    const key = rawKey.trim().replace(/\//g, '_');
    if (!key) continue;

    try {
      await setDoc(doc(db, 'receipt_photos', key), { photo: photoToSave });
    } catch (err) {
      console.error(`Failed to save receipt_photo under key ${key}:`, err);
      if (photoToSave.startsWith('data:image/')) {
        try {
          const compressedMore = await recompressBase64Image(photoToSave, 800, 1000, 0.5);
          await setDoc(doc(db, 'receipt_photos', key), { photo: compressedMore });
        } catch (retryErr) {
          console.error(`Retry saving ultra-compressed photo for key ${key} failed:`, retryErr);
        }
      }
    }
  }
};

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
  addRendicion: (name: string, advanceAmount: number, comprobantes: Omit<Comprobante, 'id'>[], signature?: string, advanceDate?: string, ingresos?: any[], rendicionType?: string) => Promise<string>;
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

      addRendicion: async (name, advanceAmount, comprobantes, signature, advanceDate, ingresos, rendicionType) => {
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
          rendicionType: rendicionType || 'Logístico'
        };

        if (advanceDate !== undefined) newRendicion.advanceDate = advanceDate;
        if (signature !== undefined) newRendicion.signature = signature;
        if (ingresos !== undefined) newRendicion.ingresos = ingresos;
        
        // Save photos to dedicated 'receipt_photos' collection in Firestore in parallel
        const uploadPromises: Promise<void>[] = [];
        const comprobantesToSave = newRendicion.comprobantes.map((c: any) => {
          const compCopy = { ...c };
          if (!compCopy.id) {
            compCopy.id = safeUUID();
          }
          if (compCopy.receiptPhoto) {
            const photoVal = compCopy.receiptPhoto;
            const keysToSave = [
              compCopy.id,
              compCopy.documentNumber,
              `${newId}_${compCopy.id}`
            ].filter(Boolean) as string[];

            uploadPromises.push(savePhotoToFirestoreDoc(photoVal, keysToSave));
            delete compCopy.receiptPhoto;
            compCopy.hasPhoto = true;
          } else if (c.receiptPhoto || c.hasPhoto) {
            compCopy.hasPhoto = true;
          }
          return compCopy;
        });

        if (uploadPromises.length > 0) {
          await Promise.all(uploadPromises);
        }

        const cleanRendicion = JSON.parse(JSON.stringify({
          ...newRendicion,
          comprobantes: comprobantesToSave
        }));
        
        await setDoc(doc(db, 'rendiciones', newId), cleanRendicion);
        
        // Optimistic / Local update - preserve local receiptPhoto if present so it is instantly available in UI and PDF exports
        const localComprobantes = newRendicion.comprobantes.map((c: any, idx: number) => ({
          ...comprobantesToSave[idx],
          receiptPhoto: c.receiptPhoto || undefined,
          hasPhoto: c.hasPhoto || !!c.receiptPhoto
        }));

        const localRendicion = {
          ...newRendicion,
          comprobantes: localComprobantes
        };

        set((state) => ({
          rendiciones: [localRendicion, ...state.rendiciones]
        }));

        get().addNotification('admin1', 'Nueva Rendición', `${currentUser.name} ha enviado el bloque "${name}" por S/ ${totalAmount.toFixed(2)}.`);
        return newId;
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

        // Separate photos before saving to firestore in parallel
        let comprobantesToSave = undefined;
        if (updateData.comprobantes) {
          const uploadPromises: Promise<void>[] = [];
          comprobantesToSave = updateData.comprobantes.map((c: any) => {
            const compCopy = { ...c };
            if (!compCopy.id) {
              compCopy.id = safeUUID();
            }
            if (compCopy.receiptPhoto) {
              const photoVal = compCopy.receiptPhoto;
              const keysToSave = [
                compCopy.id,
                compCopy.documentNumber,
                `${id}_${compCopy.id}`
              ].filter(Boolean) as string[];

              uploadPromises.push(savePhotoToFirestoreDoc(photoVal, keysToSave));
              delete compCopy.receiptPhoto;
              compCopy.hasPhoto = true;
            } else if (c.receiptPhoto || c.hasPhoto) {
              compCopy.hasPhoto = true;
            }
            return compCopy;
          });

          if (uploadPromises.length > 0) {
            await Promise.all(uploadPromises);
          }
        }
        
        const cleanUpdateData = JSON.parse(JSON.stringify({
          ...updateData,
          ...(comprobantesToSave !== undefined ? { comprobantes: comprobantesToSave } : {})
        }));

        await updateDoc(rendicionRef, cleanUpdateData);

        const updatedLocalComprobantes = updateData.comprobantes 
          ? updateData.comprobantes.map((c: any, idx: number) => {
              const savedComp = comprobantesToSave[idx];
              return {
                ...savedComp,
                receiptPhoto: c.receiptPhoto || undefined,
                hasPhoto: true
              };
            })
          : undefined;

        // Optimistic / Local update - preserve receiptPhoto in local state so it is instantly available in UI and PDF exports
        set((state) => ({
          rendiciones: state.rendiciones.map(r => r.id === id ? { 
            ...r, 
            ...updateData,
            ...(updatedLocalComprobantes !== undefined ? { comprobantes: updatedLocalComprobantes } : {})
          } : r)
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
