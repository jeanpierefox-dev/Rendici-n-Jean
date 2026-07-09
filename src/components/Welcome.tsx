import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User, AlertCircle, Briefcase, ShieldCheck, Lock, CheckCircle2 } from 'lucide-react';

export function Welcome() {
  const { settings, enterApp, setCurrentUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  
  // Custom Login States
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleCloudAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cleanUsername = username.trim();
    const cleanPassword = password;

    if (!cleanUsername) {
      setErrorMessage('Por favor, ingresa tu Nombre de Usuario.');
      return;
    }
    if (!cleanPassword) {
      setErrorMessage('Por favor, ingresa tu Contraseña.');
      return;
    }

    try {
      setErrorMessage('');
      setSuccessMessage('');
      setLoading(true);

      const lowercaseUsername = cleanUsername.toLowerCase().replace(/[^a-z0-9_]/g, '');
      const cleanId = 'user_' + lowercaseUsername;
      
      const userRef = doc(db, 'users', cleanId);
      const docSnap = await getDoc(userRef);

      if (docSnap.exists()) {
        const existingData = docSnap.data();
        
        // Verify Password
        if (existingData.password && existingData.password !== cleanPassword) {
          throw new Error('La contraseña ingresada es incorrecta para este usuario.');
        }

        // If password is correct, log them in using the database role
        const loggedInUser = {
          id: cleanId,
          name: existingData.name || cleanUsername,
          role: existingData.role || 'user',
          email: existingData.email || `${cleanId}@empresa.com`,
          department: existingData.department || 'General',
          ...existingData,
        } as any;

        setCurrentUser(loggedInUser);
        setSuccessMessage('¡Ingreso exitoso!');
        setTimeout(() => {
          enterApp();
        }, 800);
      } else {
        // If user does not exist, only allow "admin" to self-register as bootstrap admin.
        if (lowercaseUsername === 'admin') {
          const newUserDoc = {
            id: cleanId,
            name: 'Administrador Principal',
            role: 'admin' as const,
            password: cleanPassword,
            email: 'admin@empresa.com',
            department: 'Administración',
            createdAt: new Date().toISOString()
          };

          await setDoc(userRef, newUserDoc);
          setCurrentUser(newUserDoc);
          setSuccessMessage('¡Usuario "admin" creado con éxito! Iniciando sesión...');
          setTimeout(() => {
            enterApp();
          }, 800);
        } else {
          throw new Error('Su usuario no está registrado. Por favor, solicite a un Administrador que cree su cuenta.');
        }
      }
    } catch (error: any) {
      console.error("Login or Firebase connection error:", error);
      
      if (error.message && (error.message.includes('incorrecta') || error.message.includes('no está registrado'))) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage(`Error de conexión a la nube. Por favor, verifique su red.`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4 text-white">
      <div className="max-w-md w-full bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-700 animate-fade-in">
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
            
            <h1 className="text-xl font-bold mb-1">Acceso de Colaboradores</h1>
            <h2 className="text-2xl font-extrabold text-blue-400 mb-6">{settings.companyName}</h2>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="mb-6 p-4 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-200 text-sm animate-fade-in">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-500/15 border border-emerald-500/30 rounded-xl flex items-start space-x-3 text-emerald-200 text-sm animate-fade-in">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Secure Login Form */}
          <form onSubmit={handleCloudAccess} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Nombre de Usuario
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <User className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  required
                  placeholder="Ej. juanperez o colaborador01"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-md flex items-center justify-center space-x-2 disabled:opacity-70 text-sm cursor-pointer"
            >
              <ShieldCheck className="w-5 h-5" />
              <span>{loading ? 'Ingresando...' : 'Ingresar y Sincronizar'}</span>
            </button>
          </form>

        </div>
      </div>
      
      <div className="mt-8 text-slate-500 text-xs text-center flex flex-col space-y-1">
        <span>&copy; {new Date().getFullYear()} {settings.companyName}. Acceso de alto rendimiento.</span>
        <span className="text-[10px] text-slate-600">Sincronización en vivo sin necesidad de registro por correo electrónico.</span>
      </div>
    </div>
  );
}
