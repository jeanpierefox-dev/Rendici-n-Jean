/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Routes, Route, Navigate } from 'react-router';
import { useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import { db, auth } from './lib/firebase';
import { Layout } from './components/Layout';
import { DashboardUser } from './components/DashboardUser';
import { FormRendicion } from './components/FormRendicion';
import { DashboardAdmin } from './components/DashboardAdmin';
import { Settings } from './components/Settings';
import { Welcome } from './components/Welcome';
import { useAppStore } from './lib/store';
import { Rendicion } from './types';

export default function App() {
  const { currentUser, hasEnteredApp, setCurrentUser } = useAppStore();
  const [user, loading] = useAuthState(auth);

  useEffect(() => {
    if (user) {
      // Load user profile
      const userRef = doc(db, 'users', user.uid);
      getDoc(userRef).then((docSnap) => {
        if (docSnap.exists()) {
          setCurrentUser(docSnap.data() as any);
          useAppStore.setState({ hasEnteredApp: true });
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
          });
        }
      }).catch((err) => {
        console.error("Error loading user profile:", err);
        // Fallback to local state if Firestore query fails so the user can still use the app
        const role: 'user' | 'admin' = user.email?.includes('admin') ? 'admin' : 'user';
        setCurrentUser({
          id: user.uid,
          name: user.displayName || user.email?.split('@')[0] || 'Usuario',
          email: user.email || '',
          role: role,
          department: 'General'
        });
        useAppStore.setState({ hasEnteredApp: true });
      });
      
      // Subscribe to rendiciones
      const rendicionesRef = collection(db, 'rendiciones');
      const q = query(rendicionesRef, orderBy('createdAt', 'desc'));
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const rendiciones = snapshot.docs.map(doc => ({
          ...doc.data(),
          id: doc.id
        })) as Rendicion[];
        
        useAppStore.setState({ rendiciones });
      });

      return () => unsubscribe();
    } else {
      useAppStore.setState({ hasEnteredApp: false });
    }
  }, [user]);

  if (loading) {
    return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white">Cargando...</div>;
  }

  if (!hasEnteredApp || !user) {
    return <Welcome />;
  }

  return (
    <Layout>
      <Routes>
        {currentUser.role === 'admin' ? (
          <>
            <Route path="/admin" element={<DashboardAdmin />} />
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
