import React, { useRef, useState, useEffect } from 'react';
import { PenTool, RotateCcw, CheckCircle, Trash2, Edit3 } from 'lucide-react';

interface DigitalSignaturePadProps {
  initialSignature?: string;
  onSaveSignature: (base64Png: string | undefined) => void;
  disabled?: boolean;
}

export const DigitalSignaturePad: React.FC<DigitalSignaturePadProps> = ({
  initialSignature,
  onSaveSignature,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [currentSignature, setCurrentSignature] = useState<string | undefined>(initialSignature);
  const [isModePad, setIsModePad] = useState<boolean>(!initialSignature);

  useEffect(() => {
    setCurrentSignature(initialSignature);
    if (!initialSignature) {
      setIsModePad(true);
    }
  }, [initialSignature]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = '#1e3a8a'; // Deep navy blue ink
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing || disabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      const base64 = canvas.toDataURL('image/png');
      setCurrentSignature(base64);
      onSaveSignature(base64);
    }
  };

  const handleApplySignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasDrawn) return;
    const base64 = canvas.toDataURL('image/png');
    setCurrentSignature(base64);
    onSaveSignature(base64);
    setIsModePad(false);
  };

  const handleClearSignature = () => {
    setCurrentSignature(undefined);
    onSaveSignature(undefined);
    clearCanvas();
    setIsModePad(true);
  };

  return (
    <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-5 w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div>
          <h4 className="font-bold text-gray-800 flex items-center text-sm">
            <PenTool className="w-4 h-4 mr-2 text-indigo-600" />
            Firma Digital del Empleado
          </h4>
          <p className="text-xs text-gray-500 mt-0.5">
            Firme digitalmente sobre la recuadro trazo a trazo para formalizar la rendición.
          </p>
        </div>

        {currentSignature && !isModePad && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setIsModePad(true);
                setTimeout(clearCanvas, 50);
              }}
              className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 mr-1" />
              Firmar Nuevamente
            </button>
            <button
              type="button"
              onClick={handleClearSignature}
              className="inline-flex items-center px-2.5 py-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 rounded-lg transition-colors cursor-pointer"
              title="Borrar firma"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Borrar
            </button>
          </div>
        )}
      </div>

      {currentSignature && !isModePad ? (
        <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-xl flex flex-col items-center justify-center">
          <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-2xs max-w-xs w-full flex flex-col items-center">
            <img src={currentSignature} alt="Firma Registrada" className="h-20 max-w-full object-contain" />
            <div className="w-full border-t border-slate-200 mt-2 pt-1.5 text-center">
              <span className="text-[11px] font-bold text-slate-500 block">X _______________________</span>
              <span className="text-[10px] text-emerald-700 font-bold flex items-center justify-center mt-0.5">
                <CheckCircle className="w-3 h-3 mr-1" /> Firma Digital Registrada
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="relative w-full max-w-md bg-slate-50/80 border-2 border-dashed border-slate-300 rounded-xl overflow-hidden shadow-inner touch-none">
            <canvas
              ref={canvasRef}
              width={400}
              height={150}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              onTouchStart={startDrawing}
              onTouchMove={draw}
              onTouchEnd={stopDrawing}
              className="w-full h-36 bg-white cursor-crosshair block"
            />
            <div className="absolute bottom-6 left-8 right-8 border-b border-dashed border-gray-300 pointer-events-none flex justify-between items-center text-[11px] text-gray-400 font-medium px-1">
              <span>X</span>
              <span>Firma sobre la línea</span>
            </div>
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-gray-400 font-medium">
                Dibuje su firma aquí con el mouse o pantalla táctil
              </div>
            )}
          </div>

          <div className="flex items-center justify-between w-full max-w-md mt-3 gap-2">
            <button
              type="button"
              onClick={clearCanvas}
              disabled={!hasDrawn}
              className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Limpiar Trazo
            </button>

            <button
              type="button"
              onClick={handleApplySignature}
              disabled={!hasDrawn}
              className="inline-flex items-center px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Guardar Firma Digital
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
