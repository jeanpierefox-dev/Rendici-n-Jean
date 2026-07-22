import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { Link } from 'react-router';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  FolderOpen, PlusCircle, Clock, CheckCircle2, XCircle, 
  FileText, ChevronDown, ChevronUp, Calendar, Pencil, 
  Coins, Landmark, AlertCircle, ArrowRight, Loader2, Paperclip,
  Eye, Download, X
} from 'lucide-react';
import { exportToPDF, exportSingleRendicionPDF } from '../lib/export';
import { Comprobante } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatLocalDate } from '../lib/utils';

export function DashboardUser() {
  const { rendiciones, currentUser, settings } = useAppStore();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);

  const handleViewPhoto = async (c: Comprobante, rendicionId: string) => {
    if (c.receiptPhoto) {
      let photo = c.receiptPhoto;
      if (!photo.startsWith('data:')) {
        photo = 'data:image/jpeg;base64,' + photo;
      }
      setSelectedImage(photo);
    } else {
      const compId = c.id;
      if (!compId) {
        alert('Este comprobante no posee identificador único para consultar el archivo adjunto.');
        return;
      }
      setLoadingPhotoId(compId);
      try {
        const docSnap = await getDoc(doc(db, 'receipt_photos', compId));
        if (docSnap.exists() && docSnap.data()?.photo) {
          let photo = docSnap.data().photo;
          if (!photo.startsWith('data:')) {
            photo = 'data:image/jpeg;base64,' + photo;
          }
          useAppStore.setState(state => ({
            rendiciones: state.rendiciones.map(r => r.id === rendicionId ? {
              ...r,
              comprobantes: r.comprobantes.map(comp => (comp.id === compId || comp.documentNumber === c.documentNumber) ? { ...comp, receiptPhoto: photo, hasPhoto: true } : comp)
            } : r)
          }));
          setSelectedImage(photo);
        } else {
          alert('No se encontró el archivo adjunto en la base de datos o el bloque fue guardado sin imagen.');
        }
      } catch (err) {
        console.error("Error fetching photo:", err);
        alert('Error al descargar el archivo adjunto.');
      } finally {
        setLoadingPhotoId(null);
      }
    }
  };

  // Filter only current user's rendiciones
  const myRendiciones = rendiciones.filter(r => r.userId === currentUser.id);

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    // Avoid triggering expand if clicking on active buttons inside the row
    const target = e.target as HTMLElement;
    if (target.closest('a') || target.closest('button')) {
      return;
    }
    setExpandedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

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
      {/* Header section */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Mis Rendiciones (Bloques)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Revisa, gestiona y reporta tus gastos organizados en bloques de rendición.
          </p>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button 
            onClick={() => exportToPDF(myRendiciones, settings)}
            className="flex-1 sm:flex-none text-center px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-xs"
          >
            Exportar Todos PDF
          </button>
          <Link 
            to="/new" 
            className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-xs"
          >
            <PlusCircle className="w-4.5 h-4.5 mr-2" />
            Nuevo Bloque
          </Link>
        </div>
      </div>

      {/* Main expandable list */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {myRendiciones.length === 0 ? (
          <div className="bg-white rounded-xl p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <FolderOpen className="w-8 h-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No hay bloques de rendiciones</h3>
            <p className="text-gray-500 text-sm mb-6">Aún no has registrado ningún bloque de gastos.</p>
            <Link 
              to="/new" 
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors shadow-xs"
            >
              Crear tu primer bloque
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {myRendiciones.map((rendicion) => {
              const advance = rendicion.advanceAmount || 0;
              const balance = advance - rendicion.totalAmount;
              const isExpanded = !!expandedIds[rendicion.id];
              const createdDateFormatted = format(parseISO(rendicion.createdAt), 'dd MMM yyyy', { locale: es });

              return (
                <div 
                  key={rendicion.id} 
                  className={`transition-colors ${isExpanded ? 'bg-slate-50/40' : 'hover:bg-gray-50/50'}`}
                >
                  {/* List Row Header (Always visible) */}
                  <div 
                    onClick={(e) => toggleExpand(rendicion.id, e)}
                    className="p-4 sm:p-5 flex items-center justify-between cursor-pointer select-none transition-all"
                  >
                    <div className="flex items-center space-x-3 min-w-0 flex-1">
                      {/* Date Column */}
                      <div className="flex flex-col shrink-0 items-center justify-center w-14 sm:w-16 h-14 bg-gray-100 border border-gray-200/60 rounded-xl p-1 text-center">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {format(parseISO(rendicion.createdAt), 'MMM', { locale: es }).substring(0, 3)}
                        </span>
                        <span className="text-base font-extrabold text-gray-800 leading-none">
                          {format(parseISO(rendicion.createdAt), 'dd')}
                        </span>
                        <span className="text-[9px] font-medium text-gray-500">
                          {format(parseISO(rendicion.createdAt), 'yyyy')}
                        </span>
                      </div>

                      {/* Info Column */}
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-gray-900 truncate text-sm sm:text-base">
                          {rendicion.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500">
                          <span className="inline-flex items-center">
                            <Calendar className="w-3.5 h-3.5 mr-1 text-gray-400" />
                            {createdDateFormatted}
                          </span>
                          <span className="inline-flex items-center">
                            <Coins className="w-3.5 h-3.5 mr-1 text-gray-400" />
                            {rendicion.comprobantes.length} comprobantes
                          </span>
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-50/70 text-blue-700 text-[10px] font-bold rounded border border-blue-100 uppercase tracking-wide">
                            {rendicion.rendicionType || 'Logístico'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Actions and Status Column */}
                    <div className="flex items-center space-x-4 shrink-0">
                      {/* Status badge */}
                      <div className={`inline-flex items-center px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wide shrink-0 ${getStatusClass(rendicion.status)}`}>
                        {getStatusIcon(rendicion.status)}
                        <span className="ml-1 sm:inline hidden">{rendicion.status}</span>
                      </div>

                      {/* Expand / Collapse trigger */}
                      <div className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                        {isExpanded ? (
                          <ChevronUp className="w-5 h-5" />
                        ) : (
                          <ChevronDown className="w-5 h-5" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Card Details (Conditionally rendered) */}
                  {isExpanded && (
                    <div className="px-4 pb-5 sm:px-5 sm:pb-6 border-t border-gray-100 bg-white/50 animate-fade-in">
                      <div className="pt-5 grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Summary panel */}
                        <div className="md:col-span-2 space-y-4">
                          <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                            Resumen Financiero del Bloque
                          </h4>
                          
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="p-3 bg-gray-50 border border-gray-200/50 rounded-xl">
                              <span className="block text-xs text-gray-500">Monto Recibido</span>
                              <span className="text-base font-extrabold text-gray-900 mt-1 block">
                                S/ {advance.toFixed(2)}
                              </span>
                            </div>
                            
                            <div className="p-3 bg-gray-50 border border-gray-200/50 rounded-xl">
                              <span className="block text-xs text-gray-500">Gastado Total</span>
                              <span className="text-base font-extrabold text-gray-900 mt-1 block">
                                S/ {rendicion.totalAmount.toFixed(2)}
                              </span>
                            </div>

                            <div className="p-3 bg-gray-50 border border-gray-200/50 rounded-xl col-span-2 sm:col-span-1">
                              <span className="block text-xs text-gray-500">
                                {balance > 0 ? 'Por Devolver' : balance < 0 ? 'Por Reembolsar' : 'Saldo Conciliado'}
                              </span>
                              <span className={`text-base font-extrabold mt-1 block ${balance > 0 ? 'text-amber-600' : balance < 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                S/ {Math.abs(balance).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Extra block details */}
                          <div className="text-xs space-y-2 border-t border-gray-100 pt-3 text-gray-500">
                            {rendicion.advanceDate && (
                              <div className="flex justify-between max-w-md">
                                <span>Fecha Desembolso de Adelanto:</span>
                                <span className="font-semibold text-gray-700">
                                  {format(new Date(rendicion.advanceDate + 'T00:00:00'), 'dd/MM/yyyy')}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between max-w-md">
                              <span>Fecha de Registro de Rendición:</span>
                              <span className="font-semibold text-gray-700">
                                {format(parseISO(rendicion.createdAt), 'dd/MM/yyyy hh:mm a')}
                              </span>
                            </div>
                            <div className="flex justify-between max-w-md">
                              <span>Comprobantes Reportados:</span>
                              <span className="font-semibold text-gray-700">
                                {rendicion.comprobantes.length} documentos cargados
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Fast Actions panel */}
                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex flex-col justify-between space-y-4">
                          <div>
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                              Acciones del Bloque
                            </h4>
                            <p className="text-xs text-gray-500">
                              Descarga el reporte oficial completo con las imágenes de comprobantes o edita los datos registrados.
                            </p>
                          </div>

                          <div className="space-y-2.5">
                            {/* Download PDF Button */}
                            <button
                              onClick={async () => {
                                setGeneratingPdfId(rendicion.id);
                                try {
                                  await exportSingleRendicionPDF(rendicion, settings, true);
                                } catch (err) {
                                  console.error(err);
                                  alert('Error al generar el reporte PDF.');
                                } finally {
                                  setGeneratingPdfId(null);
                                }
                              }}
                              disabled={generatingPdfId !== null}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer gap-2 disabled:opacity-50"
                            >
                              {generatingPdfId === rendicion.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                  Generando Reporte PDF...
                                </>
                              ) : (
                                <>
                                  <FileText className="w-3.5 h-3.5 text-white" />
                                  Descargar Reporte (PDF)
                                </>
                              )}
                            </button>

                            {/* Edit Button */}
                            <Link
                              to={`/edit/${rendicion.id}`}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2.5 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer gap-2"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-600" />
                              Editar / Agregar Comprobantes
                            </Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Attachment Viewer Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/80" onClick={() => setSelectedImage(null)}>
          <div className="bg-white p-4 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Paperclip className="w-4 h-4 text-blue-600" /> Archivo Adjunto del Comprobante
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={selectedImage}
                  download="comprobante_adjunto"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar Archivo
                </a>
                <button onClick={() => setSelectedImage(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto flex items-center justify-center min-h-[300px]">
              {selectedImage.startsWith('data:application/pdf') ? (
                <iframe src={selectedImage} title="PDF Adjunto" className="w-full h-[70vh] rounded-lg border border-gray-200" />
              ) : (
                <img src={selectedImage} alt="Comprobante ampliado" className="w-full h-auto max-h-[72vh] object-contain rounded-lg" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
