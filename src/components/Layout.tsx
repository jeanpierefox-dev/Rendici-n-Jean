import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { auth } from '../lib/firebase';
import { NotificationBell } from './NotificationBell';
import { LayoutDashboard, FileText, Settings, LogOut, UserCircle, Menu, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation } from 'react-router';

export function Layout({ children }: { children: React.ReactNode }) {
  const { settings, currentUser, switchUser } = useAppStore();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  const handlePushPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  };

  const navItems = currentUser.role === 'admin' 
    ? [
        { label: 'Panel Administrativo', icon: LayoutDashboard, path: '/admin' },
        { label: 'Configuración', icon: Settings, path: '/settings' },
      ]
    : [
        { label: 'Mis Rendiciones', icon: FileText, path: '/' },
        { label: 'Nueva Rendición', icon: FileText, path: '/new' },
      ];

  const renderSidebarContent = (onLinkClick?: () => void) => (
    <>
      <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 bg-slate-950/50">
        {settings.companyLogo ? (
          <img src={settings.companyLogo} alt="Logo" className="h-8 max-w-[150px] object-contain brightness-0 invert" />
        ) : (
          <span className="font-bold text-lg text-white truncate">
            {settings.companyName}
          </span>
        )}
        {onLinkClick && (
          <button 
            onClick={onLinkClick} 
            className="md:hidden p-1 rounded-md text-slate-400 hover:text-white focus:outline-none"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>
      
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path === '/admin' && location.pathname.startsWith('/admin'));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onLinkClick}
              className={cn(
                "flex items-center px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                isActive 
                  ? "bg-slate-800 text-white" 
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <Icon className="mr-3 h-5 w-5" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 bg-slate-950/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center min-w-0">
            <UserCircle className="w-8 h-8 text-slate-400 shrink-0" />
            <div className="ml-3 overflow-hidden">
              <p className="text-sm font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-xs text-slate-400 capitalize">{currentUser.role}</p>
            </div>
          </div>
          
          <button
            onClick={async () => {
              const newRole = currentUser.role === 'admin' ? 'user' : 'admin';
              
              // 1. Update global store state instantly
              useAppStore.setState({
                currentUser: { ...currentUser, role: newRole }
              });

              // 2. Persist to Firestore if we are connected with Google
              if (auth.currentUser) {
                try {
                  const { doc, setDoc } = await import('firebase/firestore');
                  const { db } = await import('../lib/firebase');
                  await setDoc(doc(db, 'users', auth.currentUser.uid), { role: newRole }, { merge: true });
                } catch (e) {
                  console.error("No se pudo actualizar el rol en Firestore:", e);
                }
              }
            }}
            className="text-[10px] bg-slate-800 hover:bg-slate-700 hover:text-white text-blue-400 font-medium px-2 py-1 rounded border border-slate-700 transition-colors"
            title="Cambiar entre Administrador y Colaborador"
          >
            Cambiar Rol
          </button>
        </div>
        
        <button 
          onClick={() => {
            auth.signOut().catch(() => {});
            useAppStore.setState({ hasEnteredApp: false });
          }}
          className="mt-4 flex items-center justify-center w-full px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
        >
          Cerrar Sesión
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans">
      {/* Mobile Top Bar */}
      <header className="md:hidden flex h-16 bg-slate-900 border-b border-slate-800 items-center justify-between px-4 text-white shrink-0 sticky top-0 z-30">
        <div className="flex items-center space-x-2">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 -ml-2 text-slate-400 hover:text-white focus:outline-none"
          >
            <Menu className="h-6 w-6" />
          </button>
          {settings.companyLogo ? (
            <img src={settings.companyLogo} alt="Logo" className="h-6 max-w-[120px] object-contain brightness-0 invert" />
          ) : (
            <span className="font-bold text-base text-white truncate max-w-[150px]">
              {settings.companyName}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button 
            onClick={handlePushPermission}
            className="text-[10px] text-blue-400 hover:underline border border-slate-700 rounded px-1.5 py-0.5 bg-slate-800"
          >
            Push
          </button>
          <NotificationBell />
        </div>
      </header>

      {/* Sidebar Mobile Drawer Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Mobile Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-64 bg-slate-900 border-r border-slate-800 flex flex-col text-slate-300 z-50 md:hidden transition-transform duration-300 ease-in-out",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {renderSidebarContent(() => setIsMobileMenuOpen(false))}
      </aside>

      {/* Sidebar Desktop (always visible on md+) */}
      <aside className="hidden md:flex w-64 bg-slate-900 border-r border-slate-800 flex-col text-slate-300 shrink-0">
        {renderSidebarContent()}
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header Desktop only */}
        <header className="hidden md:flex h-16 bg-white border-b border-gray-200 items-center justify-between px-8 shrink-0">
          <h1 className="text-xl font-semibold text-gray-800">
            {navItems.find(i => location.pathname === i.path)?.label || 'Rendiciones'}
          </h1>
          <div className="flex items-center space-x-4">
            <button 
              onClick={handlePushPermission}
              className="text-xs text-blue-600 hover:underline"
            >
              Habilitar Push
            </button>
            <NotificationBell />
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
