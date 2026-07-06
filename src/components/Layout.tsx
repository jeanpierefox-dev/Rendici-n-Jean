import React from 'react';
import { useAppStore } from '../lib/store';
import { NotificationBell } from './NotificationBell';
import { LayoutDashboard, FileText, Settings, LogOut, UserCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import { Link, useLocation } from 'react-router';

export function Layout({ children }: { children: React.ReactNode }) {
  const { settings, currentUser, switchUser } = useAppStore();
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

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col text-slate-300">
        <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950/50">
          {settings.companyLogo ? (
            <img src={settings.companyLogo} alt="Logo" className="h-8 max-w-[150px] object-contain brightness-0 invert" />
          ) : (
            <span className="font-bold text-lg text-white truncate">
              {settings.companyName}
            </span>
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
            <div className="flex items-center">
              <UserCircle className="w-8 h-8 text-slate-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-white">{currentUser.name}</p>
                <p className="text-xs text-slate-400 capitalize">{currentUser.role}</p>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => switchUser(currentUser.role === 'admin' ? 'user' : 'admin')}
            className="mt-4 flex items-center justify-center w-full px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 rounded-md hover:bg-slate-700 hover:text-white transition-colors border border-slate-700"
          >
            Cambiar a vista {currentUser.role === 'admin' ? 'Usuario' : 'Administrador'}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 z-10">
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
        <div className="flex-1 overflow-auto p-8">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
