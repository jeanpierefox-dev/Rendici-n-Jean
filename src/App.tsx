/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route, Navigate } from 'react-router';
import { useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc, where } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from './lib/firebase';
import { Layout } from './components/Layout';
import { DashboardUser } from './components/DashboardUser';
import { FormRendicion } from './components/FormRendicion';
import { DashboardAdmin } from './components/DashboardAdmin';
import { Settings } from './components/Settings';
import { Welcome } from './components/Welcome';
import { UsersManager } from './components/UsersManager';
import { useAppStore } from './lib/store';
import { Rendicion } from './types';

export default function App() {
  const { currentUser, hasEnteredApp, setCurrentUser } = useAppStore();
  const [user, loading] = useAuthState(auth);

  // 1. Sync Google User profile when Google Auth state changes
  useEffect(() => {
    if (!user) return;
    
    const userRef = doc(db, 'users', user.uid);
    getDoc(userRef).then((docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!currentUser || currentUser.id !== user.uid || currentUser.role !== data.role || currentUser.name !== data.name) {
          setCurrentUser(data as any);
          useAppStore.setState({ hasEnteredApp: true });
        }
      } else {
        // Safe fallback: Auto-create Firestore document if it does not exist yet
        const role: 'user' | 'admin' = user.email?.includes('admin') ? 'admin' : 'user';
        const userDoc = {
          id: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'Usuario',
          email: user.email || '',
          role: role,
          department: 'General'
        };
        setDoc(userRef, userDoc, { merge: true }).then(() => {
          setCurrentUser(userDoc);
          useAppStore.setState({ hasEnteredApp: true });
        }).catch((err) => {
          console.error("Error creating user profile in Firestore:", err);
          setCurrentUser(userDoc);
          useAppStore.setState({ hasEnteredApp: true });
        });
      }
    }).catch((err) => {
      console.error("Error loading user profile:", err);
      // Fallback to local state if Firestore query fails so the user can still use the app
      const role: 'user' | 'admin' = user.email?.includes('admin') ? 'admin' : 'user';
      const fallbackUser = {
        id: user.uid,
        name: user.displayName || user.email?.split('@')[0] || 'Usuario',
        email: user.email || '',
        role: role,
        department: 'General'
      };
      setCurrentUser(fallbackUser);
      useAppStore.setState({ hasEnteredApp: true });
    });
  }, [user?.uid]);

  // 1b. Custom Login session gate (checks if user is NOT logged in with either Google or custom credential)
  useEffect(() => {
    if (!user) {
      if (!currentUser || (currentUser.id && !currentUser.id.startsWith('user_') && !currentUser.id.startsWith('local_'))) {
        useAppStore.setState({ hasEnteredApp: false });
      }
    }
  }, [user, currentUser?.id]);

  // 2. Effect to subscribe to rendiciones safely
  useEffect(() => {
    if (!currentUser) return;

    let q;
    if (currentUser.role === 'admin') {
      // Admin can view everything, ordered by creation date
      q = query(collection(db, 'rendiciones'), orderBy('createdAt', 'desc'));
    } else {
      // Normal user can only view their own rendiciones (required by Firestore Rules)
      // We query without ordering to avoid needing a composite index in Firestore
      q = query(collection(db, 'rendiciones'), where('userId', '==', currentUser.id));
    }

    const unsubscribe = onSnapshot(
      q, 
      (snapshot) => {
        let rendiciones = snapshot.docs.map(doc => {
          const remoteData = doc.data() as Rendicion;
          const localRendicion = useAppStore.getState().rendiciones.find(r => r.id === doc.id);
          const mergedComprobantes = (remoteData.comprobantes || []).map((c: any) => {
            const localC = localRendicion?.comprobantes?.find((lc: any) => lc.id === c.id);
            return {
              ...c,
              receiptPhoto: c.receiptPhoto || localC?.receiptPhoto
            };
          });
          return {
            ...remoteData,
            id: doc.id,
            comprobantes: mergedComprobantes
          } as Rendicion;
        });

        // Sort client-side for regular users since we didn't specify orderBy in query
        if (currentUser.role !== 'admin') {
          rendiciones.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA; // Descending
          });
        }
        
        useAppStore.setState({ rendiciones });
      },
      (error) => {
        console.error("Error subscribing to rendiciones:", error);
      }
    );

    return () => unsubscribe();
  }, [currentUser?.id, currentUser?.role]);

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Cargando...</div>;
  }

  if (!hasEnteredApp || !currentUser) {
    return <Welcome />;
  }

  return (
    <Layout>
      <Routes>
        {currentUser.role === 'admin' ? (
          <>
            <Route path="/admin" element={<DashboardAdmin />} />
            <Route path="/users" element={<UsersManager />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<DashboardUser />} />
            <Route path="/new" element={<FormRendicion />} />
            <Route path="/edit/:id" element={<FormRendicion />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}
