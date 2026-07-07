import React from 'react';
import { useAppStore } from '../lib/store';
import { Link } from 'react-router';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { FolderOpen, PlusCircle, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { exportToPDF, exportToExcel } from '../lib/export';

export function DashboardUser() {
  const { rendiciones, currentUser, settings } = useAppStore();

  const myRendiciones = rendiciones.filter(r => r.userId === currentUser.id);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Pendiente': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'Aprobado': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'Rechazado': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'Pendiente': return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Aprobado': return 'bg-green-50 text-green-700 border-green-200';
      case 'Rechazado': return 'bg-red-50 text-red-700 border-red-200';
      default: return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Mis Rendiciones (Bloques)</h2>
          <p className="text-sm text-gray-500 mt-1">Gestiona y revisa el estado de tus bloques de gastos reportados.</p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button 
            onClick={() => exportToPDF(myRendiciones, settings)}
            className="flex-1 sm:flex-none text-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Exportar PDF
          </button>
          <Link 
            to="/new" 
            className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Nuevo Bloque
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {myRendiciones.length === 0 ? (
          <div className="col-span-full bg-white rounded-xl border border-gray-200 p-12 text-center flex flex-col items-center shadow-sm">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No hay bloques de rendiciones</h3>
            <p className="text-gray-500 mb-6">Aún no has agrupado ningún gasto.</p>
            <Link to="/new" className="text-blue-600 font-medium hover:underline">
              Crear tu primer bloque
            </Link>
          </div>
        ) : (
          myRendiciones.map((rendicion) => {
            const advance = rendicion.advanceAmount || 0;
            const balance = advance - rendicion.totalAmount;
            return (
            <div key={rendicion.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
              <div className="p-5 flex-1">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-lg text-slate-800 truncate pr-2">{rendicion.name}</h3>
                  <div className={`inline-flex items-center px-2 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wide ${getStatusClass(rendicion.status)}`}>
                    {getStatusIcon(rendicion.status)}
                    <span className="ml-1.5">{rendicion.status}</span>
                  </div>
                </div>
                
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Monto Entregado:</span>
                    <span className="font-medium text-gray-900">S/ {advance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Documentos:</span>
                    <span className="font-medium text-gray-900">{rendicion.comprobantes.length}</span>
                  </div>
                  <div className="flex justify-between pt-2 mt-2 border-t border-gray-100">
                    <span className="font-medium">Total Gastado:</span>
                    <span className="font-bold text-gray-900">S/ {rendicion.totalAmount.toFixed(2)}</span>
                  </div>
                  {advance > 0 && (
                    <div className={`flex justify-between font-bold ${balance > 0 ? 'text-amber-600' : balance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      <span>{balance > 0 ? 'A Devolver:' : balance < 0 ? 'A Reembolsar:' : 'Saldo Exacto:'}</span>
                      <span>S/ {Math.abs(balance).toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center mt-auto">
                <span className="text-xs text-gray-500 font-medium">{format(parseISO(rendicion.createdAt), 'dd MMM yyyy', { locale: es })}</span>
                <Link to={`/edit/${rendicion.id}`} className="text-xs font-semibold text-blue-600 hover:underline">
                  {rendicion.status === 'Pendiente' ? 'Editar Bloque' : 'Ver Detalle'}
                </Link>
              </div>
            </div>
          )})
        )}
      </div>
    </div>
  );
}
