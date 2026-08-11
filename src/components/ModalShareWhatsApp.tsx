import React, { useState } from 'react';
import { X, Send, Copy, Check, MessageSquare, Share2, Sparkles } from 'lucide-react';
import { shareToWhatsApp, copyToClipboard } from '../lib/whatsapp';

interface ModalShareWhatsAppProps {
  title: string;
  initialMessage: string;
  onClose: () => void;
}

export const ModalShareWhatsApp: React.FC<ModalShareWhatsAppProps> = ({
  title,
  initialMessage,
  onClose,
}) => {
  const [message, setMessage] = useState(initialMessage);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-700 px-6 py-4 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-white/10 backdrop-blur-md rounded-xl">
              <MessageSquare className="w-5 h-5 text-emerald-200" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight flex items-center gap-2">
                {title}
                <span className="text-[10px] bg-emerald-500/40 text-emerald-100 font-medium px-2 py-0.5 rounded-full border border-emerald-300/30">
                  Formato Corporativo
                </span>
              </h3>
              <p className="text-xs text-emerald-100/80 mt-0.5">
                Envía este resumen ejecutivo vía WhatsApp o cópialo a tu portapapeles
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

        {/* Content Body */}
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              Vista Previa del Mensaje
            </label>
            <span className="text-[11px] text-slate-400 font-medium">
              Puedes editar el texto antes de enviar
            </span>
          </div>

          <div className="relative">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={12}
              className="w-full text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl p-4 text-slate-800 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 leading-relaxed shadow-inner resize-y"
            />
          </div>

          {copied && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs px-3 py-2 rounded-lg flex items-center justify-center font-medium gap-1.5 animate-in fade-in duration-150">
              <Check className="w-4 h-4 text-emerald-600" />
              ¡Resumen formal copiado al portapapeles! Listo para pegar en WhatsApp.
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
                ¡Copiado!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                Copiar Texto
              </>
            )}
          </button>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
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
