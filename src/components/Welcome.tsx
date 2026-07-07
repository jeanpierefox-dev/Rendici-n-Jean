import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, googleProvider, db } from '../lib/firebase';
import { Mail, Lock, User, Chrome, AlertCircle } from 'lucide-react';

export function Welcome() {
  const { settings, enterApp, setCurrentUser } = useAppStore();
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'google' | 'email-login' | 'email-register'>('email-login');
  
  // Email & Password States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
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
        setErrorMessage('El navegador bloqueó la ventana emergente de Google. Por favor, usa la opción de Correo/Contraseña abajo o permite las ventanas emergentes.');
      } else {
        setErrorMessage(`Error de Google Auth: ${error.message || 'Inténtalo de nuevo.'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Por favor, ingresa tu correo y contraseña.');
      return;
    }
    if (authMode === 'email-register' && !name) {
      setErrorMessage('Por favor, ingresa tu nombre completo.');
      return;
    }

    try {
      setErrorMessage('');
      setLoading(true);

      if (authMode === 'email-register') {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        const role: 'user' | 'admin' = email.includes('admin') ? 'admin' : 'user';
        const userDoc = {
          id: result.user.uid,
          name: name,
          email: email,
          role: role,
          department: 'General'
        };
        await setDoc(doc(db, 'users', result.user.uid), userDoc);
        setCurrentUser(userDoc);
        enterApp();
      } else {
        const result = await signInWithEmailAndPassword(auth, email, password);
        // El perfil será cargado automáticamente por la suscripción en App.tsx
        enterApp();
      }
    } catch (error: any) {
      console.error("Error with Email Auth:", error);
      let friendlyMessage = 'Ocurrió un error al autenticar. Por favor verifica tus credenciales.';
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        friendlyMessage = 'Correo o contraseña incorrectos. Verifica tus datos.';
      } else if (error.code === 'auth/email-already-in-use') {
        friendlyMessage = 'Este correo ya se encuentra registrado. Intenta iniciar sesión.';
      } else if (error.code === 'auth/weak-password') {
        friendlyMessage = 'La contraseña debe tener al menos 6 caracteres.';
      } else if (error.code === 'auth/invalid-email') {
        friendlyMessage = 'El correo ingresado no es válido.';
      }
      setErrorMessage(friendlyMessage);
    } finally {
      setLoading(false);
    }
  };

  // Demo bypass to ensure they are NEVER locked out during preview/testing
  const handleQuickBypass = () => {
    const role: 'user' | 'admin' = email.includes('admin') ? 'admin' : 'user';
    const demoUser = {
      id: 'demo-user-id',
      name: name || 'Usuario Demo',
      email: email || 'demo@usuario.com',
      role: role,
      department: 'General'
    };
    setCurrentUser(demoUser);
    enterApp();
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
            <div className="mb-6 p-4 bg-red-500/15 border border-red-500/30 rounded-xl flex items-start space-x-3 text-red-200 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 text-red-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Authentication Method Tabs */}
          <div className="grid grid-cols-2 bg-slate-950 p-1 rounded-xl mb-6">
            <button
              onClick={() => {
                setAuthMode('email-login');
                setErrorMessage('');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'email-login' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Iniciar Sesión
            </button>
            <button
              onClick={() => {
                setAuthMode('email-register');
                setErrorMessage('');
              }}
              className={`py-2 text-xs font-semibold rounded-lg transition-all ${
                authMode === 'email-register' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              Registrarse
            </button>
          </div>

          {/* Main Auth Forms */}
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {authMode === 'email-register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase mb-1.5">Nombre Completo</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Juan Pérez"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase mb-1.5">Correo Electrónico</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-500">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>
              {authMode === 'email-register' && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Tip: Si tu correo contiene &quot;admin&quot;, se te asignará rol de administrador de forma automática.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 uppercase mb-1.5">Contraseña</label>
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
              className="w-full mt-2 py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors duration-200 shadow-md flex items-center justify-center space-x-2 disabled:opacity-70"
            >
              <span>
                {loading 
                  ? 'Procesando...' 
                  : (authMode === 'email-register' ? 'Crear Cuenta' : 'Iniciar Sesión con Correo')}
              </span>
            </button>
          </form>

          {/* Social login partition */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-slate-800 px-3 text-slate-400">O también</span>
            </div>
          </div>

          {/* Google Login button */}
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 px-6 bg-slate-950 hover:bg-slate-900 border border-slate-700 text-white font-medium rounded-xl transition-all duration-200 shadow-sm flex items-center justify-center space-x-3 disabled:opacity-70"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5" />
            <span>Ingresar con Google</span>
          </button>

          {/* Safe bypass warning option */}
          <div className="mt-6 pt-4 border-t border-slate-700/50 flex flex-col items-center">
            <button
              onClick={handleQuickBypass}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline bg-transparent border-0 cursor-pointer"
            >
              ¿Problemas con el servidor? Ingreso Rápido Local
            </button>
          </div>
        </div>
      </div>
      
      <div className="mt-8 text-slate-500 text-xs text-center">
        &copy; {new Date().getFullYear()} {settings.companyName}. Acceso multiplataforma en la nube.
      </div>
    </div>
  );
}
