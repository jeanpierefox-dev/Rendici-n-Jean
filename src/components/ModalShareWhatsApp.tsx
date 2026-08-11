import React, { useState } from 'react';
import { X, Send, Copy, Check, MessageSquare, Ticket, FileText, Building2, User, Calendar, Tag, AlertCircle, Sparkles } from 'lucide-react';
import { shareToWhatsApp, copyToClipboard, getRendicionTotalFondos } from '../lib/whatsapp';
import { Rendicion, AppSettings } from '../types';
import { format, parseISO } from 'date-fns';

interface ModalShareWhatsAppProps {
  title: string;
  initialMessage: string;
  rendicionObj?: Rendicion;
  settings?: AppSettings;
  onClose: () => void;
}

export const ModalShareWhatsApp: React.FC<ModalShareWhatsAppProps> = ({
  title,
  initialMessage,
  rendicionObj,
  settings,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'ticket' | 'text'>('ticket');
  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);

  const companyName = settings?.companyName || 'Empresa';

  const handleCopy = async () => {
    const success = await copyToClipboard(message);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } else {
      alert("No se pudo copiar el texto al portapapeles.");
    }
  };

  const handleSendWhatsApp = () => {
    shareToWhatsApp(message);
  };

  // Calculations for Visual Ticket
  const fundsInfo = rendicionObj ? getRendicionTotalFondos(rendicionObj) : null;
  const totalGastado = rendicionObj?.totalAmount || 0;
  const balance = fundsInfo ? totalGastado - fundsInfo.totalFondos : 0; // > 0 favor trabajador, < 0 favor empresa

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 my-auto">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10">
              <Ticket className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight flex items-center gap-2">
                {title}
                <span className="text-[10px] bg-emerald-500/40 text-emerald-100 font-semibold px-2 py-0.5 rounded-full border border-emerald-300/30">
                  Ticket Corporativo
                </span>
              </h3>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                Resumen ejecutivo estructurado para reporte oficial vía WhatsApp
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* View Toggle Tabs */}
        <div className="bg-slate-100 p-1.5 border-b border-slate-200 flex space-x-1">
          <button
            type="button"
            onClick={() => setActiveTab('ticket')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'ticket'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Ticket className="w-3.5 h-3.5 text-emerald-600" />
            Vista Ticket Corporativo (Cuadros)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              activeTab === 'text'
                ? 'bg-white text-emerald-800 shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            Texto WhatsApp (Formato Cuadro)
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4">

          {activeTab === 'ticket' && rendicionObj && fundsInfo ? (
            /* VISUAL TICKET CARD */
            <div className="bg-slate-50 border-2 border-slate-300 rounded-2xl overflow-hidden shadow-sm relative">
              {/* Ticket Top Banner */}
              <div className="bg-slate-800 text-white p-5 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <div className="flex items-center space-x-2 text-emerald-400 font-bold text-xs uppercase tracking-wider">
                    <Building2 className="w-4 h-4" />
                    <span>{companyName}</span>
                  </div>
                  <h4 className="text-lg font-black text-white mt-1 leading-snug">
                    {rendicionObj.name}
                  </h4>
                  <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {rendicionObj.userName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {rendicionObj.createdAt ? format(parseISO(rendicionObj.createdAt), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')}
                    </span>
                  </div>
                </div>

                <div className="text-right flex flex-col items-end">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide border ${
                    rendicionObj.status === 'Aprobado'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : rendicionObj.status === 'Rechazado'
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}>
                    {rendicionObj.status}
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono mt-1">
                    Tipo: {rendicionObj.rendicionType || 'Logístico'}
                  </span>
                </div>
              </div>

              {/* Receipt Dashed Divider Line */}
              <div className="relative my-0">
                <div className="border-t-2 border-dashed border-slate-300 w-full" />
                <div className="absolute -top-2.5 -left-3 w-5 h-5 bg-white border border-slate-300 rounded-full" />
                <div className="absolute -top-2.5 -right-3 w-5 h-5 bg-white border border-slate-300 rounded-full" />
              </div>

              {/* Financial Box Summary Grid */}
              <div className="p-5 space-y-4 bg-white">
                <h5 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Resumen de Balanza Financiera
                </h5>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Cuadro 1: Total Fondos */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      1. Fondos Recibidos
                    </span>
                    <div className="mt-2">
                      <span className="text-xl font-black text-slate-800">
                        S/ {fundsInfo.totalFondos.toFixed(2)}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
                        <div>• Inicial: S/ {fundsInfo.initialAdvance.toFixed(2)}</div>
                        {fundsInfo.previousBalance !== 0 && (
                          <div>• Saldo Ant: S/ {fundsInfo.previousBalance.toFixed(2)}</div>
                        )}
                        {fundsInfo.additionalIngresos > 0 && (
                          <div>• Adicionales: S/ {fundsInfo.additionalIngresos.toFixed(2)}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Cuadro 2: Total Gastado */}
                  <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-3.5 flex flex-col justify-between">
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">
                      2. Gastos Sustentados
                    </span>
                    <div className="mt-2">
                      <span className="text-xl font-black text-amber-900">
                        S/ {totalGastado.toFixed(2)}
                      </span>
                      <div className="text-[10px] text-amber-700 mt-1">
                        • {rendicionObj.comprobantes?.length || 0} comprobantes adjuntos
                      </div>
                    </div>
                  </div>

                  {/* Cuadro 3: Resultado / Liquidación */}
                  <div className={`border rounded-xl p-3.5 flex flex-col justify-between ${
                    balance > 0 
                      ? 'bg-rose-50 border-rose-200' 
                      : balance < 0 
                      ? 'bg-emerald-50 border-emerald-200' 
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${
                      balance > 0 ? 'text-rose-800' : balance < 0 ? 'text-emerald-800' : 'text-blue-800'
                    }`}>
                      3. Liquidación Final
                    </span>
                    <div className="mt-2">
                      <span className={`text-xl font-black ${
                        balance > 0 ? 'text-rose-700' : balance < 0 ? 'text-emerald-700' : 'text-blue-700'
                      }`}>
                        S/ {Math.abs(balance).toFixed(2)}
                      </span>
                      <div className={`text-[10px] font-bold mt-1 ${
                        balance > 0 ? 'text-rose-700' : balance < 0 ? 'text-emerald-700' : 'text-blue-700'
                      }`}>
                        {balance > 0 ? '🔴 Favor Trabajador' : balance < 0 ? '🟢 Favor Empresa' : '🔵 Saldo Equilibrado'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Comprobantes Table / Cuadro */}
                {rendicionObj.comprobantes && rendicionObj.comprobantes.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <div className="flex items-center justify-between mb-2.5">
                      <h5 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-slate-500" />
                        Detalle de Comprobantes ({rendicionObj.comprobantes.length})
                      </h5>
                    </div>

                    <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[11px]">
                            <th className="p-2.5">N° / Tipo</th>
                            <th className="p-2.5">Proveedor / Razón Social</th>
                            <th className="p-2.5">Categoría</th>
                            <th className="p-2.5 text-right">Monto</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {rendicionObj.comprobantes.map((c, idx) => (
                            <tr key={c.id || idx} className="hover:bg-slate-50/80 transition-colors">
                              <td className="p-2.5 font-medium text-slate-800">
                                <span className="font-bold text-slate-900">{c.type || 'Doc'}</span>
                                {c.documentNumber ? ` ${c.documentNumber}` : ''}
                              </td>
                              <td className="p-2.5 text-slate-600 font-normal truncate max-w-[150px]">
                                {c.razonSocial || '-'}
                              </td>
                              <td className="p-2.5">
                                <span className="inline-block bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                                  {c.category || 'General'}
                                </span>
                              </td>
                              <td className="p-2.5 text-right font-bold text-slate-900">
                                S/ {c.amount.toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Ticket Footer */}
              <div className="bg-slate-100 p-3 text-center border-t border-slate-200 text-[11px] text-slate-500 font-mono">
                _Ticket de Rendición Oficial de Gastos - {companyName}_
              </div>
            </div>
          ) : (
            /* TEXTAREA VIEW FOR WHATSAPP FORMATED BOXES */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                  Texto con Formato de Ticket en Cuadros
                </label>
                <span className="text-[11px] text-slate-400 font-medium">
                  Puedes editar el contenido antes de enviar
                </span>
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={13}
                className="w-full text-xs font-mono bg-slate-900 text-emerald-300 border border-slate-800 rounded-xl p-4 focus:ring-2 focus:ring-emerald-500 leading-relaxed shadow-inner resize-y"
              />
            </div>
          )}

          {copied && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-lg flex items-center justify-center font-medium gap-1.5 animate-in fade-in duration-150">
              <Check className="w-4 h-4 text-emerald-600" />
              ¡Resumen formal en cuadro copiado al portapapeles! Listo para pegar en WhatsApp.
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleCopy}
            className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2.5 border border-slate-300 hover:bg-white text-slate-700 rounded-xl text-xs font-bold transition-all shadow-2xs gap-2 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                ¡Texto Copiado!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                Copiar Texto Ticket
              </>
            )}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md gap-2 cursor-pointer"
            >
              <Send className="w-4 h-4" />
              Abrir en WhatsApp
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
