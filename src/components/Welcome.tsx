import React from 'react';
import { useAppStore } from '../lib/store';

export function Welcome() {
  const { settings, enterApp } = useAppStore();

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
            onClick={enterApp}
            className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors duration-200 shadow-md flex items-center justify-center space-x-2"
          >
            <span>Ingresar a la aplicación</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
      
      <div className="mt-8 text-slate-500 text-sm">
        &copy; {new Date().getFullYear()} {settings.companyName}. Todos los derechos reservados.
      </div>
    </div>
  );
}
