import React, { useMemo, useState } from 'react';
import { useAppStore } from '../lib/store';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToPDF, exportToExcel, exportSingleRendicionPDF } from '../lib/export';
import { Check, X, Eye, Download, FileSpreadsheet, ChevronDown, ChevronUp, FileText, ShieldCheck } from 'lucide-react';
import { Rendicion } from '../types';

export function DashboardAdmin() {
  const { rendiciones, settings, updateRendicionStatus } = useAppStore();
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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
                      <span className="font-semibold text-gray-900">{rendicion.name}</span>
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
                          onClick={() => exportSingleRendicionPDF(rendicion, settings, true)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                          title="Descargar Reporte + Hoja Fedatada (PDF)"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  
                  {expandedRow === rendicion.id && (
                    <tr className="bg-gray-50/50">
                      <td colSpan={8} className="px-3 md:px-8 py-4 border-b border-gray-200">
                        <div className="pl-3 md:pl-8 border-l-2 border-blue-200">
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
                                  <th className="pb-2 font-medium">Monto</th>
                                  <th className="pb-2 font-medium text-right">Comprobante</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {rendicion.comprobantes.map((c, i) => (
                                  <tr key={i}>
                                    <td className="py-2 text-gray-600">{format(new Date(c.date), 'dd/MM/yyyy')}</td>
                                    <td className="py-2 text-gray-900 font-medium">{c.type} {c.documentNumber}</td>
                                    <td className="py-2 text-gray-600">{c.ruc}</td>
                                    <td className="py-2 text-gray-900 font-medium">S/ {c.amount.toFixed(2)}</td>
                                    <td className="py-2 text-right">
                                      {c.receiptPhoto ? (
                                        <button 
                                          onClick={() => setSelectedImage(c.receiptPhoto!)}
                                          className="inline-flex items-center text-blue-600 hover:text-blue-800 text-xs font-medium"
                                        >
                                          <Eye className="w-3 h-3 mr-1" /> Ver
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
                              onClick={() => exportSingleRendicionPDF(rendicion, settings, false)}
                              className="inline-flex items-center px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-blue-200/50"
                              title="Descargar Reporte de Liquidación de Gastos"
                            >
                              <FileText className="w-4 h-4 text-blue-600" />
                              Reporte Formal PDF
                            </button>
                            <button
                              onClick={() => exportSingleRendicionPDF(rendicion, settings, true)}
                              className="inline-flex items-center px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors gap-2 cursor-pointer border border-indigo-200/50"
                              title="Descargar Reporte con Acta Fedatada Certificada"
                            >
                              <ShieldCheck className="w-4 h-4 text-indigo-600" />
                              Descargar Hoja Fedatada
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

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/80" onClick={() => setSelectedImage(null)}>
          <div className="bg-white p-2 rounded-xl max-w-4xl max-h-[90vh] overflow-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end p-2">
              <button onClick={() => setSelectedImage(null)} className="p-1 text-gray-500 hover:bg-gray-100 rounded-full">
                <X className="w-6 h-6" />
              </button>
            </div>
            <img src={selectedImage} alt="Comprobante ampliado" className="w-full h-auto max-h-[75vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
