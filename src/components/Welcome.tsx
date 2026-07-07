import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { 
  signInWithPopup 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { User, AlertCircle, Briefcase, Key, Check } from 'lucide-react';

export function Welcome() {
  const { settings, enterApp, setCurrentUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  
  // Local Access States
  const [customName, setCustomName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'user' | 'admin'>('user');
  const [errorMessage, setErrorMessage] = useState('');

  const handleGoogleLogin = async () => {
    try {
      setErrorMessage('');
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
    } catch (error: any) {
      console.error("Error signing in with Google:", error);
      if (error.code === 'auth/popup-blocked') {
        setErrorMessage('El navegador bloqueó la ventana emergente de Google. Por favor, permite las ventanas emergentes en tu navegador o usa el Ingreso Rápido Local abajo.');
      } else {
        setErrorMessage(`Error de Google Auth: ${error.message || 'Inténtalo de nuevo.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLocalAccess = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = customName.trim();
    if (!cleanName) {
      setErrorMessage('Por favor, ingresa tu Nombre o Código de Colaborador.');
      return;
    }

    setLoading(true);
    const role: 'user' | 'admin' = selectedRole;
    const demoUser = {
      id: 'local_' + cleanName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
      name: cleanName,
      email: 'local@empresa.com',
      role: role,
      department: 'General'
    };
    
    // Sign out from any active firebase session to avoid conflicts
    auth.signOut().catch(() => {});
    
    setCurrentUser(demoUser);
    enterApp();
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700">
        <div className="p-6 sm:p-10 flex flex-col">
          <div className="flex flex-col items-center text-center">
            {settings.companyLogo ? (
              <img 
                src={settings.companyLogo} 
                alt={settings.companyName} 
                className="h-16 w-auto mb-4 object-contain" 
              />
            ) : (
              <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {settings.companyName.charAt(0)}
                </span>
              </div>
            )}
            
            <h1 className="text-xl font-bold mb-1">Bienvenido a</h1>
            <h2 className="text-2xl font-extrabold text-blue-400 mb-6">{settings.companyName}</h2>
          </div>

          {/* Error Message Display */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-200 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Option 1: Live Cloud Connection with Google */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-2 flex items-center">
              <Key className="w-3.5 h-3.5 mr-1 text-blue-400" />
              Opción 1: Acceso Seguro con Cuenta Google
            </h3>
            <button
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-3.5 px-6 bg-slate-950 hover:bg-slate-900 border border-slate-700 text-white font-medium rounded-xl transition-all duration-200 shadow-sm flex items-center justify-center space-x-3 disabled:opacity-70 group"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 group-hover:scale-105 transition-transform" />
              <span className="font-semibold text-sm">Ingresar con Google</span>
            </button>
            <p className="text-[10px] text-slate-500 text-center">
              Sincroniza tus datos de rendiciones en vivo de forma segura en la nube.
            </p>
          </div>

          {/* Division partition */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700/60"></div>
            </div>
            <div className="relative flex justify-center text-[10px] uppercase">
              <span className="bg-slate-800 px-3 text-slate-500 font-semibold tracking-wider">O también</span>
            </div>
          </div>

          {/* Option 2: Quick Local Entry without account */}
          <form onSubmit={handleLocalAccess} className="space-y-4">
            <h3 className="text-xs font-semibold uppercase text-slate-400 tracking-wider mb-2 flex items-center">
              <User className="w-3.5 h-3.5 mr-1 text-emerald-400" />
              Opción 2: Ingreso Rápido Local
            </h3>
            
            <div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Tu Nombre o Código de Colaborador"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Briefcase className="w-4 h-4" />
                </span>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value as 'user' | 'admin')}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all appearance-none cursor-pointer"
                >
                  <option value="user" className="bg-slate-900 text-white">Colaborador (Mis Rendiciones)</option>
                  <option value="admin" className="bg-slate-900 text-white">Administrador (Panel de Control)</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-6 bg-slate-750 hover:bg-slate-700 border border-slate-600 text-slate-200 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-70 shadow-sm"
            >
              <span>Ingresar en Modo Local</span>
            </button>
          </form>

        </div>
      </div>
      
      <div className="mt-8 text-slate-500 text-xs text-center">
        &copy; {new Date().getFullYear()} {settings.companyName}. Acceso simplificado sin contraseñas.
      </div>
    </div>
  );
}
