import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { signInWithPopup } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';

export function Welcome() {
  const { settings, enterApp, setCurrentUser } = useAppStore();
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      
      const role: 'user' | 'admin' = result.user.email?.includes('admin') ? 'admin' : 'user';
      
      const userDoc = {
        id: result.user.uid,
        name: result.user.displayName || 'Usuario',
        email: result.user.email || '',
        role: role,
        department: 'General'
      };
      
      await setDoc(doc(db, 'users', result.user.uid), userDoc, { merge: true });
      
      setCurrentUser(userDoc);
      enterApp();
    } catch (error) {
      console.error("Error signing in:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700">
        <div className="p-10 flex flex-col items-center text-center">
          {settings.companyLogo ? (
            <img 
              src={settings.companyLogo} 
              alt={settings.companyName} 
              className="h-20 w-auto mb-6 object-contain" 
            />
          ) : (
            <div className="w-20 h-20 bg-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
              <span className="text-3xl font-bold text-white">
                {settings.companyName.charAt(0)}
              </span>
            </div>
          )}
          
          <h1 className="text-2xl font-bold mb-2">Bienvenido a</h1>
          <h2 className="text-3xl font-extrabold text-blue-400 mb-8">{settings.companyName}</h2>
          
          <p className="text-slate-400 mb-10 text-sm">
            Sistema de gestión y aprobación de rendiciones de gastos y viáticos.
          </p>
          
          <button 
            onClick={handleLogin}
            disabled={loading}
            className="w-full py-3.5 px-6 bg-white hover:bg-gray-100 text-slate-900 font-semibold rounded-xl transition-colors duration-200 shadow-md flex items-center justify-center space-x-3 disabled:opacity-70"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            <span>{loading ? 'Iniciando sesión...' : 'Ingresar con Google'}</span>
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-slate-500 text-sm">
        &copy; {new Date().getFullYear()} {settings.companyName}. Todos los derechos reservados.
      </div>
    </div>
  );
}
