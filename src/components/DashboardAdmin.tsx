import React, { useMemo, useState } from 'react';
import { useAppStore } from '../lib/store';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToPDF, exportToExcel, exportSingleRendicionPDF, exportRendicionReceiptsPDF, formatPhotoDataUrl, fetchPhotoForComprobante } from '../lib/export';
import { Check, X, Eye, Download, FileSpreadsheet, ChevronDown, ChevronUp, FileText, ShieldCheck, Trash2, Loader2, Paperclip, Upload, DollarSign, ArrowRightLeft, MessageSquare } from 'lucide-react';
import { Rendicion, Comprobante } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatLocalDate, fileToBase64, compressImageToBase64 } from '../lib/utils';
import { ModalLiquidacion } from './ModalLiquidacion';
import { ModalShareWhatsApp } from './ModalShareWhatsApp';
import { generateSingleRendicionWhatsAppMessage, generateGeneralSummaryWhatsAppMessage } from '../lib/whatsapp';
import { ModalReceiptViewer } from './ModalReceiptViewer';

export function DashboardAdmin() {
  const { rendiciones, settings, updateRendicionStatus, deleteRendicion } = useAppStore();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);
  const [uploadingCompId, setUploadingCompId] = useState<string | null>(null);
  const [generatingPdfKey, setGeneratingPdfKey] = useState<string | null>(null);
  const [liquidatingRendicion, setLiquidatingRendicion] = useState<Rendicion | null>(null);
  const [shareWhatsAppModal, setShareWhatsAppModal] = useState<{ title: string; text: string; rendicionObj?: Rendicion } | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('all');

  // Available months for selector
  const availableMonths = useMemo(() => {
    const monthMap = new Map<string, string>();
    rendiciones.forEach(r => {
      if (r.createdAt) {
        try {
          const d = parseISO(r.createdAt);
          const key = format(d, 'yyyy-MM');
          const label = format(d, 'MMMM yyyy', { locale: es });
          const cap = label.charAt(0).toUpperCase() + label.slice(1);
          if (!monthMap.has(key)) {
            monthMap.set(key, cap);
          }
        } catch (e) {}
      }
    });
    return Array.from(monthMap.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [rendiciones]);

  // Available users for selector
  const availableUsers = useMemo(() => {
    const usersMap = new Map<string, string>();
    rendiciones.forEach(r => {
      if (r.userId && r.userName) {
        usersMap.set(r.userId, r.userName);
      }
    });
    return Array.from(usersMap.entries());
  }, [rendiciones]);

  // Filtered rendiciones list
  const filteredRendiciones = useMemo(() => {
    return rendiciones.filter(r => {
      // Month filter
      if (selectedMonth !== 'all') {
        if (!r.createdAt) return false;
        try {
          const d = parseISO(r.createdAt);
          if (format(d, 'yyyy-MM') !== selectedMonth) return false;
        } catch (e) {
          return false;
        }
      }

      // User filter
      if (selectedUserFilter !== 'all' && r.userId !== selectedUserFilter) {
        return false;
      }

      return true;
    });
  }, [rendiciones, selectedMonth, selectedUserFilter]);

  const selectedMonthLabel = useMemo(() => {
    if (selectedMonth === 'all') return null;
    const found = availableMonths.find(([k]) => k === selectedMonth);
    return found ? found[1] : selectedMonth;
  }, [selectedMonth, availableMonths]);

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

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`¿Estás seguro de que deseas eliminar la rendición "${name}"? Esta acción es irreversible.`)) {
      try {
        await deleteRendicion(id);
      } catch (error) {
        console.error("Error al eliminar la rendición:", error);
        alert("Hubo un error al intentar eliminar la rendición.");
      }
    }
  };

  // Group by month for chart
  const chartData = useMemo(() => {
    const data: Record<string, number> = {};
    rendiciones.forEach(r => {
      const monthStr = format(parseISO(r.createdAt), 'MMM yyyy', { locale: es });
      data[monthStr] = (data[monthStr] || 0) + r.totalAmount;
    });
    return Object.entries(data).map(([name, amount]) => ({ name, amount }));
  }, [rendiciones]);

  const stats = useMemo(() => {
    const pending = rendiciones.filter(r => r.status === 'Pendiente').length;
    const approved = rendiciones.filter(r => r.status === 'Aprobado').reduce((acc, r) => acc + r.totalAmount, 0);
    const total = rendiciones.reduce((acc, r) => acc + r.totalAmount, 0);
    return { pending, approved, total };
  }, [rendiciones]);

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="space-y-8">
      {/* Header & Export Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Panel de Administración</h2>
          <p className="text-sm text-gray-500 mt-1">Supervisa, aprueba y liquida los bloques de rendiciones por mes o colaborador.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => {
              if (filteredRendiciones.length === 0) {
                alert("No hay rendiciones registradas en el filtro seleccionado.");
                return;
              }
              const msg = generateGeneralSummaryWhatsAppMessage(
                filteredRendiciones, 
                settings, 
                undefined, 
                selectedMonthLabel || undefined
              );
              setShareWhatsAppModal({
                title: selectedMonthLabel ? `Resumen Mensual: ${selectedMonthLabel}` : "Resumen General de Viáticos para WhatsApp",
                text: msg
              });
            }}
            className="flex items-center px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-sm font-bold transition-colors shadow-sm cursor-pointer"
            title="Generar y compartir resumen corporativo general vía WhatsApp"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Compartir por WhatsApp
          </button>
          <button 
            onClick={async () => {
              try {
                await exportToPDF(filteredRendiciones, settings);
              } catch (e) {
                console.error("Error exporting PDF", e);
                alert("Error al generar el reporte PDF.");
              }
            }}
            className="flex items-center px-3.5 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm cursor-pointer"
            title="Descargar Resumen General de Rendiciones en PDF"
          >
            <Download className="w-4 h-4 mr-2 text-blue-600" />
            Reporte PDF (Resumen)
          </button>
          <button 
            onClick={async () => {
              try {
                await exportRendicionReceiptsPDF(filteredRendiciones, settings);
              } catch (e: any) {
                console.error("Error exporting receipts PDF", e);
                alert(e.message || "Error al generar el reporte de recibos PDF.");
              }
            }}
            className="flex items-center px-3.5 py-2 bg-emerald-50 border border-emerald-300/80 rounded-md text-sm font-bold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-sm cursor-pointer"
            title="Descargar Recibos Adjuntos en Hojas Fedatadas (PDF)"
          >
            <Paperclip className="w-4 h-4 mr-2 text-emerald-700" />
            Reporte Recibos (PDF)
          </button>
          <button 
            onClick={() => exportToExcel(filteredRendiciones, settings)}
            className="flex items-center px-3.5 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Reporte Excel
          </button>
        </div>
      </div>

      {/* MONTHLY & USER FILTER CONTROLS */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-sm border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <span>🗓️ Filtro de Rendiciones por Mes y Colaborador</span>
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            Filtra para auditar liquidaciones de un mes específico o consultar gastos de un colaborador en particular.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300 font-semibold">Mes:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-slate-800 text-white text-xs font-bold border border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">🗓️ Todos los meses ({rendiciones.length} bloques)</option>
              {availableMonths.map(([key, label]) => (
                <option key={key} value={key}>
                  📅 {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-300 font-semibold">Colaborador:</span>
            <select
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
              className="bg-slate-800 text-white text-xs font-bold border border-slate-700 rounded-xl px-3 py-2 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="all">👥 Todos los colaboradores</option>
              {availableUsers.map(([uId, uName]) => (
                <option key={uId} value={uId}>
                  👤 {uName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Bloques Pendientes</p>
          <p className="text-2xl font-black text-amber-600 mt-1">{stats.pending}</p>
          <p className="text-[11px] text-gray-500 mt-1">Bloques en revisión</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Fondos Entregados</p>
          <p className="text-2xl font-black text-slate-800 mt-1">S/ {stats.totalFondos.toFixed(2)}</p>
          <p className="text-[11px] text-gray-500 mt-1">Total desembolsado</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Gastos Sustentados</p>
          <p className="text-2xl font-black text-amber-900 mt-1">S/ {stats.totalGastado.toFixed(2)}</p>
          <p className="text-[11px] text-green-600 mt-1 font-semibold">S/ {stats.approved.toFixed(2)} aprobados</p>
        </div>

        <div className={`p-5 rounded-xl border shadow-xs ${
          stats.saldoGlobal > 0 ? 'bg-rose-50 border-rose-200' : stats.saldoGlobal < 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'
        }`}>
          <p className={`text-xs font-bold uppercase tracking-wider ${
            stats.saldoGlobal > 0 ? 'text-rose-800' : stats.saldoGlobal < 0 ? 'text-emerald-800' : 'text-blue-800'
          }`}>
            Saldo / Liquidación
          </p>
          <p className={`text-2xl font-black mt-1 ${
            stats.saldoGlobal > 0 ? 'text-rose-700' : stats.saldoGlobal < 0 ? 'text-emerald-700' : 'text-blue-700'
          }`}>
            S/ {Math.abs(stats.saldoGlobal).toFixed(2)}
          </p>
          <p className={`text-[11px] font-bold mt-1 ${
            stats.saldoGlobal > 0 ? 'text-rose-700' : stats.saldoGlobal < 0 ? 'text-emerald-700' : 'text-blue-700'
          }`}>
            {stats.saldoGlobal > 0 ? '🔴 Favor Trabajador' : stats.saldoGlobal < 0 ? '🟢 Favor Empresa' : '🔵 Saldado'}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-800 mb-6">Gastos por Mes</h3>
        <div className="h-72 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(val) => `S/${val}`} />
                <Tooltip 
                  cursor={{fill: '#f3f4f6'}}
                  contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="amount" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              No hay datos suficientes para graficar
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-800">Solicitudes Recientes (Bloques)</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                <th className="px-6 py-4 w-10"></th>
                <th className="px-6 py-4">Bloque</th>
                <th className="px-6 py-4">Usuario</th>
                <th className="px-6 py-4">Docs</th>
                <th className="px-6 py-4">Monto Total</th>
                <th className="px-6 py-4">Liquidación</th>
                <th className="px-6 py-4">Fecha Reg.</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {filteredRendiciones.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron rendiciones en el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredRendiciones.map((rendicion) => (
                  <React.Fragment key={rendicion.id}>
                  <tr className="hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => toggleRow(rendicion.id)}>
                    <td className="px-6 py-4 text-gray-400">
                      {expandedRow === rendicion.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{rendicion.name}</div>
                      <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100 uppercase tracking-wide mt-1">
                        {rendicion.rendicionType || 'Logístico'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-gray-700">{rendicion.userName}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-gray-500 bg-gray-100 px-2.5 py-0.5 rounded-full text-xs font-medium">{rendicion.comprobantes.length}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-gray-900 font-medium">S/ {rendicion.totalAmount.toFixed(2)}</div>
                      {(rendicion.advanceAmount || 0) > 0 && (
                        <div className="text-gray-500 text-xs mt-0.5">
                          Adelanto: S/ {rendicion.advanceAmount.toFixed(2)}
                          {rendicion.advanceDate && ` (F. Desembolso: ${format(new Date(rendicion.advanceDate + 'T00:00:00'), 'dd/MM/yyyy')})`}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {rendicion.liquidacion?.status === 'Liquidado' ? (
                        <button
                          onClick={() => setLiquidatingRendicion(rendicion)}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 hover:bg-emerald-200 transition-colors cursor-pointer"
                          title="Ver detalle del voucher / uñero de liquidación"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                          Liquidado (S/ 0.00)
                        </button>
                      ) : rendicion.liquidacion?.status === 'Traspasado' ? (
                        <button
                          onClick={() => setLiquidatingRendicion(rendicion)}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300 hover:bg-blue-200 transition-colors cursor-pointer"
                          title="Ver detalle del traspaso de saldo"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5 mr-1 text-blue-600" />
                          Traspasado
                        </button>
                      ) : (
                        <button
                          onClick={() => setLiquidatingRendicion(rendicion)}
                          className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
                          title="Liquidar o traspasar saldo de la rendición"
                        >
                          <DollarSign className="w-3.5 h-3.5 mr-1 text-amber-600" />
                          Liquidar Saldo
                        </button>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-gray-500">
                      {format(parseISO(rendicion.createdAt), 'dd MMM yyyy', { locale: es })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium border
                        ${rendicion.status === 'Pendiente' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                          rendicion.status === 'Aprobado' ? 'bg-green-50 text-green-700 border-green-200' : 
                          'bg-red-50 text-red-700 border-red-200'}`}>
                        {rendicion.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-2">
                        {rendicion.status === 'Pendiente' && (
                          <>
                            <button 
                              onClick={() => updateRendicionStatus(rendicion.id, 'Aprobado')}
                              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors cursor-pointer"
                              title="Aprobar"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button 
                              onClick={() => updateRendicionStatus(rendicion.id, 'Rechazado')}
                              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                              title="Rechazar"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </>
                        )}
                        <button 
                          onClick={async () => {
                            setGeneratingPdfKey(`${rendicion.id}_table_report`);
                            try {
                              await exportSingleRendicionPDF(rendicion, settings, true);
                            } catch (err) {
                              console.error(err);
                              alert('Error al generar el reporte PDF.');
                            } finally {
                              setGeneratingPdfKey(null);
                            }
                          }}
                          disabled={generatingPdfKey !== null}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer disabled:opacity-50"
                          title="Descargar Reporte Completo con Comprobantes (PDF)"
                        >
                          {generatingPdfKey === `${rendicion.id}_table_report` ? (
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                          ) : (
                            <Download className="w-5 h-5" />
                          )}
                        </button>
                        <button 
                          onClick={() => handleDelete(rendicion.id, rendicion.name)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Eliminar Rendición"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {expandedRow === rendicion.id && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={8} className="px-3 md:px-8 py-4 border-b border-gray-200">
                        <div className="pl-3 md:pl-8 border-l-2 border-blue-200">
                          <div className="flex flex-wrap gap-4 mb-4">
                            <div className="bg-slate-100/80 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
                              <span className="font-bold text-slate-500 uppercase tracking-wide mr-1.5">Tipo de Rendición:</span>
                              <span className="font-bold text-slate-900 uppercase">{rendicion.rendicionType || 'Logístico'}</span>
                            </div>
                          </div>

                          {rendicion.ingresos && rendicion.ingresos.length > 0 && (
                            <div className="mb-6 bg-indigo-50/30 border border-indigo-100/50 rounded-xl p-4 max-w-2xl">
                              <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider mb-2">Detalle de Ingresos (Desembolsos)</h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                  <thead>
                                    <tr className="text-indigo-800/75 border-b border-indigo-100">
                                      <th className="pb-1 font-semibold">Fecha</th>
                                      <th className="pb-1 font-semibold">Referencia / Glosa</th>
                                      <th className="pb-1 font-semibold text-right">Monto</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-indigo-50/50">
                                    {rendicion.ingresos.map((ing: any, idx: number) => (
                                      <tr key={ing.id || idx}>
                                        <td className="py-1.5 text-slate-600 font-medium">{format(new Date(ing.date + 'T00:00:00'), 'dd/MM/yyyy')}</td>
                                        <td className="py-1.5 text-slate-700">{ing.reference || <span className="text-slate-400 italic">Sin referencia</span>}</td>
                                        <td className="py-1.5 text-indigo-950 font-bold text-right">S/ {ing.amount.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Detalle de Comprobantes</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm min-w-[500px]">
                              <thead>
                                <tr className="text-gray-500 border-b border-gray-200">
                                  <th className="pb-2 font-medium">Fecha</th>
                                  <th className="pb-2 font-medium">Tipo y N°</th>
                                  <th className="pb-2 font-medium">RUC</th>
                                  <th className="pb-2 font-medium">Categoría / Obs.</th>
                                  <th className="pb-2 font-medium">Monto</th>
                                  <th className="pb-2 font-medium text-right">Comprobante</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {rendicion.comprobantes.map((c, i) => (
                                  <tr key={i}>
                                    <td className="py-2 text-gray-600">{formatLocalDate(c.date)}</td>
                                    <td className="py-2 text-gray-900 font-medium">{c.type} {c.documentNumber}</td>
                                    <td className="py-2 text-gray-600">
                                      <div className="font-semibold">{c.ruc}</div>
                                      {c.razonSocial && <div className="text-[11px] text-slate-500 font-medium truncate max-w-[150px]" title={c.razonSocial}>{c.razonSocial}</div>}
                                    </td>
                                    <td className="py-2 text-gray-700">
                                      <span className="font-semibold text-slate-800">{c.category || 'Otros'}</span>
                                      {c.observation && <span className="block text-xs text-gray-400 mt-0.5 max-w-[200px] truncate" title={c.observation}>{c.observation}</span>}
                                    </td>
                                    <td className="py-2 text-gray-900 font-medium">S/ {c.amount.toFixed(2)}</td>
                                    <td className="py-2 text-right">
                                      <div className="flex items-center justify-end gap-2">
                                        {c.receiptPhoto || c.hasPhoto ? (
                                          <button 
                                            onClick={() => handleViewPhoto(c, rendicion.id)}
                                            disabled={loadingPhotoId === c.id}
                                            className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50"
                                            title="Ver copia digital guardada"
                                          >
                                            {loadingPhotoId === c.id ? (
                                              <>
                                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Cargando...
                                              </>
                                            ) : (
                                              <>
                                                <Eye className="w-3 h-3 mr-1" /> Ver
                                              </>
                                            )}
                                          </button>
                                        ) : null}

                                        <label className={`inline-flex items-center text-[11px] font-semibold px-2 py-1 rounded transition-colors cursor-pointer border ${uploadingCompId === (c.id || c.documentNumber) ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'}`} title="Adjuntar o reemplazar archivo del recibo (Imagen o PDF)">
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
                              {(rendicion.advanceAmount || 0) > 0 && (
                                <tfoot className="bg-gray-100">
                                  <tr>
                                    <td colSpan={3} className="py-2 text-right font-medium text-gray-700 pr-4">
                                      Monto Entregado (Adelanto)
                                      {rendicion.advanceDate && ` [Desembolso: ${format(new Date(rendicion.advanceDate + 'T00:00:00'), 'dd/MM/yyyy')}]`}:
                                    </td>
                                    <td className="py-2 font-bold text-gray-900">S/ {rendicion.advanceAmount.toFixed(2)}</td>
                                    <td></td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="py-2 text-right font-medium text-gray-700 pr-4">Total Gastado:</td>
                                    <td className="py-2 font-bold text-gray-900">S/ {rendicion.totalAmount.toFixed(2)}</td>
                                    <td></td>
                                  </tr>
                                  <tr>
                                    <td colSpan={3} className="py-2 text-right font-medium text-gray-700 pr-4">Saldo ({rendicion.advanceAmount - rendicion.totalAmount > 0 ? 'A Devolver' : 'A Reembolsar'}):</td>
                                    <td className="py-2 font-bold text-gray-900">S/ {Math.abs(rendicion.advanceAmount - rendicion.totalAmount).toFixed(2)}</td>
                                    <td></td>
                                  </tr>
                                </tfoot>
                              )}
                            </table>
                          </div>
                          {rendicion.signature && (
                            <div className="mt-4 pt-4 border-t border-gray-200">
                              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Firma del Solicitante</h4>
                              <img src={rendicion.signature} alt="Firma" className="h-16 w-auto object-contain border border-gray-200 rounded p-2 bg-white" />
                            </div>
                          )}

                          {/* Export Actions Panel for Admins */}
                          <div className="mt-6 pt-4 border-t border-gray-200 flex flex-wrap gap-3">
                            <button
                              onClick={() => {
                                const msg = generateSingleRendicionWhatsAppMessage(rendicion, settings);
                                setShareWhatsAppModal({
                                  title: `Compartir ${rendicion.name}`,
                                  text: msg,
                                  rendicionObj: rendicion
                                });
                              }}
                              className="inline-flex items-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer shadow-xs"
                              title="Compartir resumen corporativo de esta rendición en WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4 text-white" />
                              Compartir por WhatsApp
                            </button>

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
                              className="inline-flex items-center px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-blue-200/50 disabled:opacity-50"
                              title="Descargar Informe de Liquidación de Gastos (puro informe sin fotos de recibos)"
                            >
                              {generatingPdfKey === `${rendicion.id}_report` ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                  Generando Informe...
                                </>
                              ) : (
                                <>
                                  <FileText className="w-4 h-4 text-blue-600" />
                                  Descargar Informe (PDF)
                                </>
                              )}
                            </button>

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
                              className="inline-flex items-center px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-emerald-200/70 disabled:opacity-50"
                              title="Descargar Reporte de Recibos en Hojas Fedatadas (con imágenes adjuntadas)"
                            >
                              {generatingPdfKey === `${rendicion.id}_receipts` ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-700" />
                                  Generando Recibos PDF...
                                </>
                              ) : (
                                <>
                                  <Paperclip className="w-4 h-4 text-emerald-700" />
                                  Descargar Recibos (PDF)
                                </>
                              )}
                            </button>

                            <button
                              onClick={() => setLiquidatingRendicion(rendicion)}
                              className="inline-flex items-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer shadow-2xs"
                              title="Gestionar liquidación a S/ 0 (devolución uñero o reembolso) o traspasar saldo"
                            >
                              <ShieldCheck className="w-4 h-4" />
                              {rendicion.liquidacion?.status === 'Liquidado' 
                                ? 'Ver / Modificar Liquidación' 
                                : 'Liquidar / Uñero / Reembolso'}
                            </button>
                            <button
                              onClick={() => handleDelete(rendicion.id, rendicion.name)}
                              className="inline-flex items-center px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-red-200/50"
                              title="Eliminar esta rendición permanentemente"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                              Eliminar Rendición
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
            </tbody>
          </table>
        </div>
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

      {/* Image / Attachment Modal */}
      {selectedImage && (
        <ModalReceiptViewer
          receiptUrl={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  );
}
