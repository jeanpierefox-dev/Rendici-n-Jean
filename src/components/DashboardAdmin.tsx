import React, { useMemo, useState } from 'react';
import { useAppStore } from '../lib/store';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToPDF, exportToExcel, exportSingleRendicionPDF, exportRendicionReceiptsPDF } from '../lib/export';
import { Check, X, Eye, Download, FileSpreadsheet, ChevronDown, ChevronUp, FileText, ShieldCheck, Trash2, Loader2, Paperclip } from 'lucide-react';
import { Rendicion, Comprobante } from '../types';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { formatLocalDate } from '../lib/utils';

export function DashboardAdmin() {
  const { rendiciones, settings, updateRendicionStatus, deleteRendicion } = useAppStore();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loadingPhotoId, setLoadingPhotoId] = useState<string | null>(null);
  const [generatingPdfId, setGeneratingPdfId] = useState<string | null>(null);

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
          // Update the store's state so it's cached in memory!
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
          <p className="text-sm text-gray-500 mt-1">Supervisa y aprueba los bloques de rendiciones de la empresa.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button 
            onClick={() => exportToPDF(rendiciones, settings)}
            className="flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-2" />
            Reporte PDF
          </button>
          <button 
            onClick={() => exportToExcel(rendiciones, settings)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Reporte Excel
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Bloques Pendientes</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">{stats.pending}</p>
          <p className="text-xs text-amber-600 mt-1 font-medium">Requieren atención</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Aprobado</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">S/ {stats.approved.toFixed(2)}</p>
          <p className="text-xs text-green-600 mt-1 font-medium">Gasto validado</p>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Volumen Total Procesado</p>
          <p className="text-3xl font-bold text-gray-900 mt-2">S/ {stats.total.toFixed(2)}</p>
          <p className="text-xs text-blue-600 mt-1 font-medium">Histórico acumulado</p>
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
                <th className="px-6 py-4">Fecha Reg.</th>
                <th className="px-6 py-4">Estado</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {rendiciones.map((rendicion) => (
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
                            setGeneratingPdfId(rendicion.id);
                            try {
                              await exportSingleRendicionPDF(rendicion, settings, false);
                            } catch (err) {
                              console.error(err);
                              alert('Error al generar el reporte PDF.');
                            } finally {
                              setGeneratingPdfId(null);
                            }
                          }}
                          disabled={generatingPdfId !== null}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer disabled:opacity-50"
                          title="Descargar Reporte (PDF)"
                        >
                          {generatingPdfId === rendicion.id ? (
                            <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                          ) : (
                            <Download className="w-5 h-5" />
                          )}
                        </button>
                        {rendicion.comprobantes.some(c => c.hasPhoto || c.receiptPhoto) && (
                          <button 
                            onClick={async () => {
                              setGeneratingPdfId(rendicion.id + '-receipts');
                              try {
                                await exportRendicionReceiptsPDF(rendicion, settings);
                              } catch (err: any) {
                                console.error(err);
                                alert(err?.message || 'Error al descargar los recibos.');
                              } finally {
                                setGeneratingPdfId(null);
                              }
                            }}
                            disabled={generatingPdfId !== null}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer disabled:opacity-50"
                            title="Descargar Recibos Adjuntos"
                          >
                            {generatingPdfId === rendicion.id + '-receipts' ? (
                              <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                            ) : (
                              <Paperclip className="w-5 h-5" />
                            )}
                          </button>
                        )}
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
                                      {c.receiptPhoto || c.hasPhoto ? (
                                        <button 
                                          onClick={() => handleViewPhoto(c, rendicion.id)}
                                          disabled={loadingPhotoId === c.id}
                                          className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs font-medium disabled:opacity-50"
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
                                      ) : (
                                        <span className="text-gray-400 text-xs italic">-</span>
                                      )}
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
                              onClick={async () => {
                                setGeneratingPdfId(rendicion.id);
                                try {
                                  await exportSingleRendicionPDF(rendicion, settings, false);
                                } catch (err) {
                                  console.error(err);
                                  alert('Error al generar el reporte PDF.');
                                } finally {
                                  setGeneratingPdfId(null);
                                }
                              }}
                              disabled={generatingPdfId !== null}
                              className="inline-flex items-center px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-blue-200/50 disabled:opacity-50"
                              title="Descargar Reporte de Liquidación de Gastos"
                            >
                              {generatingPdfId === rendicion.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                                  Generando PDF...
                                </>
                              ) : (
                                <>
                                  <FileText className="w-4 h-4 text-blue-600" />
                                  Descargar Reporte PDF
                                </>
                              )}
                            </button>

                            {rendicion.comprobantes.some(c => c.hasPhoto || c.receiptPhoto) && (
                              <button
                                onClick={async () => {
                                  setGeneratingPdfId(rendicion.id + '-receipts');
                                  try {
                                    await exportRendicionReceiptsPDF(rendicion, settings);
                                  } catch (err: any) {
                                    console.error(err);
                                    alert(err?.message || 'Error al descargar los recibos.');
                                  } finally {
                                    setGeneratingPdfId(null);
                                  }
                                }}
                                disabled={generatingPdfId !== null}
                                className="inline-flex items-center px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-indigo-200/50 disabled:opacity-50"
                                title="Descargar Recibos Adjuntos en otro PDF"
                              >
                                {generatingPdfId === rendicion.id + '-receipts' ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                                    Generando Recibos...
                                  </>
                                ) : (
                                  <>
                                    <Paperclip className="w-4 h-4 text-indigo-600" />
                                    Descargar Recibos Adjuntos
                                  </>
                                )}
                              </button>
                            )}
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
              ))}
              {rendiciones.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    No hay bloques de rendiciones registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Image / Attachment Modal */}
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
