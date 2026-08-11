import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Rendicion, AppSettings, AppNotification, User, Comprobante } from '../types';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { safeUUID, recompressBase64Image } from './utils';

const savedPhotoFingerprints = new Set<string>();

const savePhotoToFirestoreDoc = async (photoVal: string, keys: string[]) => {
  if (!photoVal) return;

  const validKeys = Array.from(new Set(
    keys
      .filter(Boolean)
      .map(k => k.trim().replace(/\//g, '_'))
      .filter(Boolean)
  ));

  const keysToSave = validKeys.filter(key => {
    const fingerprint = `${key}_${photoVal.length}`;
    return !savedPhotoFingerprints.has(fingerprint);
  });

  if (keysToSave.length === 0) return;

  let photoToSave = photoVal;
  if (photoToSave.length > 1500000 && photoToSave.startsWith('data:image/')) {
    try {
      photoToSave = await recompressBase64Image(photoToSave, 1000, 1200, 0.65);
    } catch (e) {
      console.warn("Could not recompress image:", e);
    }
  }

  await Promise.all(keysToSave.map(async (key) => {
    const fingerprint = `${key}_${photoVal.length}`;
    try {
      await setDoc(doc(db, 'receipt_photos', key), { photo: photoToSave });
      savedPhotoFingerprints.add(fingerprint);
    } catch (err: any) {
      if (err?.code === 'resource-exhausted' || String(err).includes('quota')) {
        console.warn(`Firestore write quota exceeded for key ${key}. Local photo preserved in session.`);
        savedPhotoFingerprints.add(fingerprint);
      } else {
        console.error(`Failed to save receipt_photo under key ${key}:`, err);
        if (photoToSave.startsWith('data:image/')) {
          try {
            const compressedMore = await recompressBase64Image(photoToSave, 800, 1000, 0.5);
            await setDoc(doc(db, 'receipt_photos', key), { photo: compressedMore });
            savedPhotoFingerprints.add(fingerprint);
          } catch (retryErr) {
            console.error(`Retry saving photo for key ${key} failed:`, retryErr);
          }
        }
      }
    }
  }));
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
  addRendicion: (name: string, advanceAmount: number, comprobantes: Omit<Comprobante, 'id'>[], signature?: string, advanceDate?: string, ingresos?: any[], rendicionType?: string, previousBalance?: number, previousBalanceSourceId?: string, previousBalanceSourceName?: string) => Promise<string>;
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

      addRendicion: async (name, advanceAmount, comprobantes, signature, advanceDate, ingresos, rendicionType, previousBalance, previousBalanceSourceId, previousBalanceSourceName) => {
        const { currentUser } = get();
        const totalAmount = comprobantes.reduce((sum, c) => sum + c.amount, 0);
        const newId = safeUUID();
        
        const uploadPromises: Promise<void>[] = [];
        const localComprobantes: any[] = [];
        const comprobantesToSave: any[] = [];

        for (const c of comprobantes) {
          const compId = (c as any).id || safeUUID();
          const compCopy = { ...c, id: compId };

          if (compCopy.receiptPhoto) {
            const photoVal = compCopy.receiptPhoto;
            const keysToSave = [compId].filter(Boolean) as string[];

            uploadPromises.push(savePhotoToFirestoreDoc(photoVal, keysToSave));

            const cleanCopy = { ...compCopy, hasPhoto: true };
            delete cleanCopy.receiptPhoto;
            comprobantesToSave.push(cleanCopy);
            localComprobantes.push({ ...compCopy, hasPhoto: true });
          } else {
            comprobantesToSave.push({ ...compCopy });
            localComprobantes.push({ ...compCopy });
          }
        }

        const localRendicion: any = {
          id: newId,
          name,
          status: 'Pendiente',
          createdAt: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          comprobantes: localComprobantes,
          totalAmount,
          advanceAmount,
          rendicionType: rendicionType || 'Logístico'
        };

        if (advanceDate !== undefined) localRendicion.advanceDate = advanceDate;
        if (signature !== undefined) localRendicion.signature = signature;
        if (ingresos !== undefined) localRendicion.ingresos = ingresos;
        if (previousBalance !== undefined) localRendicion.previousBalance = previousBalance;
        if (previousBalanceSourceId !== undefined) localRendicion.previousBalanceSourceId = previousBalanceSourceId;
        if (previousBalanceSourceName !== undefined) localRendicion.previousBalanceSourceName = previousBalanceSourceName;

        // 1. Instantly update local store so UI is immediate
        set((state) => ({
          rendiciones: [localRendicion, ...state.rendiciones]
        }));

        get().addNotification('admin1', 'Nueva Rendición', `${currentUser.name} ha enviado el bloque "${name}" por S/ ${totalAmount.toFixed(2)}.`);

        // 2. Perform Firestore save asynchronously in background for ultra-fast UI save
        const cleanRendicion = JSON.parse(JSON.stringify({
          ...localRendicion,
          comprobantes: comprobantesToSave
        }));

        setDoc(doc(db, 'rendiciones', newId), cleanRendicion)
          .catch(err => console.error("Error saving rendicion doc to Firestore:", err));

        if (uploadPromises.length > 0) {
          Promise.all(uploadPromises).catch(err => console.error("Error in background photo uploads:", err));
        }

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

        const uploadPromises: Promise<void>[] = [];
        let comprobantesToSave = undefined;
        let updatedLocalComprobantes = undefined;

        if (updateData.comprobantes) {
          const localComps: any[] = [];
          const saveComps: any[] = [];

          for (const c of updateData.comprobantes) {
            const compId = (c as any).id || safeUUID();
            const compCopy = { ...c, id: compId };

            if (compCopy.receiptPhoto) {
              const photoVal = compCopy.receiptPhoto;
              const keysToSave = [compId].filter(Boolean) as string[];

              uploadPromises.push(savePhotoToFirestoreDoc(photoVal, keysToSave));

              const cleanCopy = { ...compCopy, hasPhoto: true };
              delete cleanCopy.receiptPhoto;
              saveComps.push(cleanCopy);
              localComps.push({ ...compCopy, hasPhoto: true });
            } else {
              saveComps.push({ ...compCopy });
              localComps.push({ ...compCopy });
            }
          }

          updatedLocalComprobantes = localComps;
          comprobantesToSave = saveComps;
        }

        // 1. Instantly update local Zustand state so UI re-renders immediately!
        set((state) => ({
          rendiciones: state.rendiciones.map(r => r.id === id ? { 
            ...r, 
            ...updateData,
            ...(updatedLocalComprobantes !== undefined ? { comprobantes: updatedLocalComprobantes } : {})
          } : r)
        }));

        // 2. Perform Firestore save asynchronously in background for instant user feedback
        const cleanUpdateData = JSON.parse(JSON.stringify({
          ...updateData,
          ...(comprobantesToSave !== undefined ? { comprobantes: comprobantesToSave } : {})
        }));

        updateDoc(rendicionRef, cleanUpdateData)
          .catch(err => console.error("Error updating rendicion in Firestore:", err));

        if (uploadPromises.length > 0) {
          Promise.all(uploadPromises).catch(err => console.error("Error in background photo uploads:", err));
        }
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
