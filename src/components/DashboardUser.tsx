import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { Link } from 'react-router';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { 
  FolderOpen, PlusCircle, Clock, CheckCircle2, XCircle, 
  FileText, ChevronDown, ChevronUp, Calendar, Pencil, 
  Coins, Landmark, AlertCircle, ArrowRight, Loader2, Paperclip,
  Eye, Download, X, Upload, ShieldCheck, DollarSign, ArrowRightLeft,
  MessageSquare
} from 'lucide-react';
import { exportToPDF, exportSingleRendicionPDF, exportRendicionReceiptsPDF, formatPhotoDataUrl, fetchPhotoForComprobante } from '../lib/export';
import { Rendicion, Comprobante } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatLocalDate, fileToBase64, compressImageToBase64 } from '../lib/utils';
import { ModalLiquidacion } from './ModalLiquidacion';
import { ModalShareWhatsApp } from './ModalShareWhatsApp';
import { generateSingleRendicionWhatsAppMessage, generateGeneralSummaryWhatsAppMessage } from '../lib/whatsapp';

export function DashboardUser() {
  const { rendiciones, currentUser, settings } = useAppStore();
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [generatingPdfKey, setGeneratingPdfKey] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);
  const [uploadingCompId, setUploadingCompId] = useState<string | null>(null);
  const [liquidatingRendicion, setLiquidatingRendicion] = useState<Rendicion | null>(null);
  const [shareWhatsAppModal, setShareWhatsAppModal] = useState<{ title: string; text: string; rendicionObj?: Rendicion } | null>(null);

  const handleDirectUploadAttachment = async (
    e: React.ChangeEvent<HTMLInputElement>,
    rendicion: Rendicion,
    comprobanteTarget: Comprobante
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetId = comprobanteTarget.id || comprobanteTarget.documentNumber || Date.now().toString();
    setUploadingCompId(targetId);
    try {
      let base64Photo = '';
      if (file.type === 'application/pdf') {
        base64Photo = await fileToBase64(file);
      } else {
        base64Photo = await compressImageToBase64(file, 1000, 1300, 0.65);
      }

      base64Photo = formatPhotoDataUrl(base64Photo);

      const updatedComprobantes = rendicion.comprobantes.map(c => {
        const isMatch = (c.id && c.id === comprobanteTarget.id) || (c.documentNumber && c.documentNumber === comprobanteTarget.documentNumber);
        if (isMatch) {
          return {
            ...c,
            receiptPhoto: base64Photo,
            hasPhoto: true
          };
        }
        return c;
      });

      await useAppStore.getState().updateRendicion(rendicion.id, {
        comprobantes: updatedComprobantes
      });

      // Keep base64Photo in local state so it is instantly available for viewing and PDF export
      useAppStore.setState(state => ({
        rendiciones: state.rendiciones.map(r => r.id === rendicion.id ? {
          ...r,
          comprobantes: updatedComprobantes
        } : r)
      }));

      alert('¡Copia digital del recibo adjuntada con éxito! Quedará visible al lado derecho de la Hoja Fedatada en el reporte PDF.');
    } catch (err) {
      console.error("Error uploading attachment:", err);
      alert('Error al subir la imagen del comprobante.');
    } finally {
      setUploadingCompId(null);
      e.target.value = '';
    }
  };

  const handleViewPhoto = async (c: Comprobante, rendicionId: string) => {
    if (c.receiptPhoto) {
      const photo = formatPhotoDataUrl(c.receiptPhoto);
      setSelectedImage(photo);
      return;
    }

    setLoadingPhotoId(c.id || c.documentNumber);
    try {
      const photo = await fetchPhotoForComprobante(c, rendicionId);
      if (photo) {
        const formattedPhoto = formatPhotoDataUrl(photo);
        useAppStore.setState(state => ({
          rendiciones: state.rendiciones.map(r => r.id === rendicionId ? {
            ...r,
            comprobantes: r.comprobantes.map(comp => (comp.id === c.id || comp.documentNumber === c.documentNumber) ? { ...comp, receiptPhoto: formattedPhoto, hasPhoto: true } : comp)
          } : r)
        }));
        setSelectedImage(formattedPhoto);
      } else {
        alert('No se encontró el archivo adjunto en la base de datos o el bloque fue guardado sin imagen.');
      }
    } catch (err) {
      console.error("Error fetching photo:", err);
      alert('Error al descargar el archivo adjunto.');
    } finally {
      setLoadingPhotoId(null);
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
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          <button 
            onClick={() => {
              if (myRendiciones.length === 0) {
                alert("No tienes rendiciones registradas para compartir.");
                return;
              }
              const msg = generateGeneralSummaryWhatsAppMessage(myRendiciones, settings, currentUser.name);
              setShareWhatsAppModal({
                title: "Resumen General para WhatsApp",
                text: msg
              });
            }}
            className="flex-1 sm:flex-none text-center px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-xs inline-flex items-center justify-center gap-1.5"
            title="Compartir Resumen Corporativo de Gastos vía WhatsApp"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Compartir por WhatsApp
          </button>
          <button 
            onClick={async () => {
              try {
                await exportToPDF(myRendiciones, settings);
              } catch (e) {
                console.error("Error exporting PDF", e);
                alert("Error al generar el reporte PDF.");
              }
            }}
            className="flex-1 sm:flex-none text-center px-3.5 py-2.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-xs"
            title="Exportar Resumen General de mis Rendiciones en PDF"
          >
            Exportar Resumen (PDF)
          </button>
          <button 
            onClick={async () => {
              try {
                await exportRendicionReceiptsPDF(myRendiciones, settings);
              } catch (e: any) {
                console.error("Error exporting receipts PDF", e);
                alert(e.message || "Error al generar el reporte de recibos PDF.");
              }
            }}
            className="flex-1 sm:flex-none text-center px-3.5 py-2.5 bg-emerald-50 border border-emerald-300/80 rounded-lg text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer shadow-xs"
            title="Exportar Todos los Recibos Adjuntos en Hojas Fedatadas (PDF)"
          >
            Exportar Recibos (PDF)
          </button>
          <Link 
            to="/new" 
            className="flex-1 sm:flex-none flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
          >
            <PlusCircle className="w-4 h-4 mr-1.5" />
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
                    <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
                      {/* Liquidación status badge */}
                      {rendicion.liquidacion?.status === 'Liquidado' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setLiquidatingRendicion(rendicion); }}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition-colors cursor-pointer"
                          title="Ver constancia de liquidación"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          <span className="hidden sm:inline">Liquidado</span> (0.00)
                        </button>
                      ) : rendicion.liquidacion?.status === 'Traspasado' ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); setLiquidatingRendicion(rendicion); }}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200 transition-colors cursor-pointer"
                          title="Ver traspaso"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-1 text-blue-600" />
                          Traspasado
                        </button>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); setLiquidatingRendicion(rendicion); }}
                          className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Liquidar o traspasar saldo"
                        >
                          <DollarSign className="w-3.5 h-3.5 mr-1 text-amber-600" />
                          <span className="hidden sm:inline">Liquidar</span> Saldo
                        </button>
                      )}

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
                            {/* WhatsApp Share Single Rendicion Button */}
                            <button
                              onClick={() => {
                                const msg = generateSingleRendicionWhatsAppMessage(rendicion, settings);
                                setShareWhatsAppModal({
                                  title: `Compartir ${rendicion.name}`,
                                  text: msg,
                                  rendicionObj: rendicion
                                });
                              }}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200/80 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer gap-2"
                              title="Generar y compartir resumen formal de este bloque en WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                              Compartir por WhatsApp
                            </button>

                            {/* Download Main PDF Button */}
                            <button
                              onClick={async () => {
                                setGeneratingPdfKey(`${rendicion.id}_report`);
                                try {
                                  await exportSingleRendicionPDF(rendicion, settings, false);
                                } catch (err) {
                                  console.error(err);
                                  alert('Error al generar el reporte PDF.');
                                } finally {
                                  setGeneratingPdfKey(null);
                                }
                              }}
                              disabled={generatingPdfKey !== null}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer gap-2 disabled:opacity-50"
                              title="Descargar Informe de Liquidación de Gastos (puro informe sin fotos de recibos)"
                            >
                              {generatingPdfKey === `${rendicion.id}_report` ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                  Generando Informe...
                                </>
                              ) : (
                                <>
                                  <FileText className="w-3.5 h-3.5 text-white" />
                                  Descargar Informe (PDF)
                                </>
                              )}
                            </button>

                            {/* Download Receipts PDF Button */}
                            <button
                              onClick={async () => {
                                setGeneratingPdfKey(`${rendicion.id}_receipts`);
                                try {
                                  await exportRendicionReceiptsPDF(rendicion, settings);
                                } catch (err: any) {
                                  console.error(err);
                                  alert(err.message || 'Error al generar el reporte de recibos PDF.');
                                } finally {
                                  setGeneratingPdfKey(null);
                                }
                              }}
                              disabled={generatingPdfKey !== null}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer gap-2 disabled:opacity-50"
                              title="Descargar Reporte de Recibos en Hojas Fedatadas"
                            >
                              {generatingPdfKey === `${rendicion.id}_receipts` ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                                  Generando Recibos...
                                </>
                              ) : (
                                <>
                                  <Paperclip className="w-3.5 h-3.5 text-white" />
                                  Descargar Recibos (PDF)
                                </>
                              )}
                            </button>

                            {/* Edit Button */}
                            <Link
                              to={`/edit/${rendicion.id}`}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer gap-2"
                            >
                              <Pencil className="w-3.5 h-3.5 text-gray-600" />
                              Editar / Agregar Comprobantes
                            </Link>

                            {/* Liquidar Button */}
                            <button
                              onClick={() => setLiquidatingRendicion(rendicion)}
                              className="w-full inline-flex items-center justify-center px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer gap-2"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              {rendicion.liquidacion?.status === 'Liquidado' 
                                ? 'Ver / Modificar Liquidación' 
                                : 'Liquidar / Uñero / Reembolso'}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Detailed list of comprobantes in this block */}
                      <div className="mt-6 pt-5 border-t border-gray-200">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-blue-600" /> Detalle de Comprobantes del Bloque ({rendicion.comprobantes.length})
                          </h4>
                          <span className="text-xs text-gray-500">
                            Puedes adjuntar o actualizar la copia digital directamente de cada recibo
                          </span>
                        </div>

                        <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white shadow-xs">
                          <table className="w-full text-left text-xs min-w-[600px]">
                            <thead>
                              <tr className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                <th className="p-2.5 font-bold">Fecha</th>
                                <th className="p-2.5 font-bold">Documento</th>
                                <th className="p-2.5 font-bold">RUC / Razón Social</th>
                                <th className="p-2.5 font-bold">Categoría</th>
                                <th className="p-2.5 font-bold text-right">Monto</th>
                                <th className="p-2.5 font-bold text-right">Copia Digital / Recibo</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {rendicion.comprobantes.map((c, i) => (
                                <tr key={c.id || i} className="hover:bg-gray-50/60 transition-colors">
                                  <td className="p-2.5 text-gray-600 font-medium">{formatLocalDate(c.date)}</td>
                                  <td className="p-2.5 font-bold text-gray-900">{c.type} {c.documentNumber}</td>
                                  <td className="p-2.5 text-gray-600">
                                    <div className="font-semibold text-gray-800">{c.ruc}</div>
                                    {c.razonSocial && <div className="text-[10px] text-gray-500 truncate max-w-[150px]">{c.razonSocial}</div>}
                                  </td>
                                  <td className="p-2.5 text-gray-700 font-medium">{c.category || 'Otros'}</td>
                                  <td className="p-2.5 text-gray-900 font-extrabold text-right">S/ {c.amount.toFixed(2)}</td>
                                  <td className="p-2.5 text-right">
                                    <div className="flex items-center justify-end gap-2">
                                      {(c.receiptPhoto || c.hasPhoto) && (
                                        <button 
                                          onClick={() => handleViewPhoto(c, rendicion.id)}
                                          disabled={loadingPhotoId === c.id}
                                          className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs font-semibold px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 border border-blue-200/60 transition-colors disabled:opacity-50"
                                          title="Ver archivo guardado"
                                        >
                                          {loadingPhotoId === c.id ? (
                                            <>
                                              <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Cargando...
                                            </>
                                          ) : (
                                            <>
                                              <Eye className="w-3 h-3 mr-1" /> Ver Adjunto
                                            </>
                                          )}
                                        </button>
                                      )}

                                      <label className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-1 rounded transition-colors cursor-pointer border shadow-xs ${uploadingCompId === (c.id || c.documentNumber) ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`} title="Adjuntar o reemplazar archivo del recibo (Imagen o PDF)">
                                        {uploadingCompId === (c.id || c.documentNumber) ? (
                                          <>
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin text-emerald-600" /> Subiendo...
                                          </>
                                        ) : (
                                          <>
                                            <Paperclip className="w-3 h-3 mr-1 text-emerald-600" />
                                            {c.receiptPhoto || c.hasPhoto ? 'Cambiar Recibo' : '📎 Adjuntar Recibo'}
                                          </>
                                        )}
                                        <input 
                                          type="file" 
                                          accept="image/*,application/pdf" 
                                          className="hidden" 
                                          disabled={uploadingCompId !== null}
                                          onChange={(e) => handleDirectUploadAttachment(e, rendicion, c)} 
                                        />
                                      </label>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
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

      {/* Modal de Liquidación / Uñero / Reembolso / Traspaso */}
      {liquidatingRendicion && (
        <ModalLiquidacion
          rendicion={liquidatingRendicion}
          onClose={() => setLiquidatingRendicion(null)}
        />
      )}

      {/* Share WhatsApp Modal */}
      {shareWhatsAppModal && (
        <ModalShareWhatsApp
          title={shareWhatsAppModal.title}
          initialMessage={shareWhatsAppModal.text}
          rendicionObj={shareWhatsAppModal.rendicionObj}
          settings={settings}
          onClose={() => setShareWhatsAppModal(null)}
        />
      )}

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
