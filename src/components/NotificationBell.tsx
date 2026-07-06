import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { Bell } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '../lib/utils';

export function NotificationBell() {
  const { notifications, currentUser, markNotificationAsRead } = useAppStore();
  const [isOpen, setIsOpen] = useState(false);

  const myNotifications = notifications.filter(n => n.userId === currentUser.id);
  const unreadCount = myNotifications.filter(n => !n.read).length;

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden z-50">
          <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-gray-700">Notificaciones</h3>
            <span className="text-xs text-gray-500">{unreadCount} nuevas</span>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {myNotifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-gray-500">
                No tienes notificaciones
              </div>
            ) : (
              myNotifications.map(n => (
                <div 
                  key={n.id} 
                  onClick={() => {
                    markNotificationAsRead(n.id);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors",
                    !n.read ? "bg-blue-50/50" : ""
                  )}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium text-sm text-gray-800">{n.title}</span>
                    <span className="text-[10px] text-gray-400">
                      {format(new Date(n.createdAt), 'dd MMM HH:mm', { locale: es })}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
