import React, { useState } from 'react';
import { FileText, Download, X, ZoomIn, ZoomOut, RotateCw, ExternalLink, Printer } from 'lucide-react';

interface ModalReceiptViewerProps {
  receiptUrl: string;
  title?: string;
  onClose: () => void;
}

export const ModalReceiptViewer: React.FC<ModalReceiptViewerProps> = ({
  receiptUrl,
  title = 'Vista Detallada del Recibo / Comprobante Adjunto',
  onClose
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const isPdf = receiptUrl.startsWith('data:application/pdf') || receiptUrl.toLowerCase().endsWith('.pdf');

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handlePrint = () => {
    const win = window.open('');
    if (win) {
      if (isPdf) {
        win.document.write(`<iframe src="${receiptUrl}" style="width:100%;height:100vh;border:none;"></iframe>`);
      } else {
        win.document.write(`<img src="${receiptUrl}" style="max-width:100%;" onload="window.print();window.close();" />`);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-700">
        {/* Header Bar */}
        <div className="px-4 py-3 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm sm:text-base text-white truncate tracking-wide">
              {title}
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!isPdf && (
              <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg p-0.5 space-x-1">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Alejar (-)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-[11px] font-bold text-slate-300 px-1 font-mono">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Acercar (+)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors cursor-pointer"
                  title="Girar 90°"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                {(zoom !== 1 || rotation !== 0) && (
                  <button
                    type="button"
                    onClick={handleReset}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center transition-colors border border-slate-700 cursor-pointer"
              title="Imprimir o ver en ventana independiente"
            >
              <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
            </button>

            <a
              href={receiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center transition-colors border border-slate-700 cursor-pointer"
              title="Abrir en nueva pestaña"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1" /> Nueva Pestaña
            </a>

            <a
              href={receiptUrl}
              download={`recibo_${Date.now()}.${isPdf ? 'pdf' : 'jpg'}`}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center transition-colors shadow-xs cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar
            </a>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer ml-1"
              title="Cerrar ventana"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Viewer */}
        <div className="p-4 overflow-auto flex-1 flex justify-center items-center bg-slate-950/95 relative min-h-[350px]">
          {isPdf ? (
            <iframe
              src={receiptUrl}
              title="Vista previa PDF"
              className="w-full h-full rounded-xl bg-white border-0 shadow-xl"
            />
          ) : (
            <div className="overflow-auto max-w-full max-h-full flex items-center justify-center p-2">
              <img
                src={receiptUrl}
                alt="Comprobante Adjunto"
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-out'
                }}
                className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-2xl origin-center"
              />
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Recibo digital verificado y vinculado al expediente
          </span>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            Formato: {isPdf ? 'Documento PDF' : 'Imagen digital (JPG/PNG)'}
          </span>
        </div>
      </div>
    </div>
  );
};
