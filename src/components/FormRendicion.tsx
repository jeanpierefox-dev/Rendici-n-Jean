import React, { useState, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { useNavigate, useParams } from 'react-router';
import { fileToBase64 } from '../lib/utils';
import { UploadCloud, CheckCircle, Plus, Trash2, FileText, PenTool, Cloud, Loader2 } from 'lucide-react';
import { Comprobante, DocType, Rendicion } from '../types';
import { format } from 'date-fns';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function FormRendicion() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  
  const { addRendicion, updateRendicion, rendiciones } = useAppStore();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [comprobantes, setComprobantes] = useState<Omit<Comprobante, 'id'>[]>([]);
  const [signature, setSignature] = useState<string | undefined>();
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  
  useEffect(() => {
    if (isEditing && id && !isLoaded) {
      const existing = rendiciones.find(r => r.id === id);
      if (existing) {
        setName(existing.name);
        setAdvanceAmount(existing.advanceAmount.toString());
        if (existing.advanceDate) {
          setAdvanceDate(existing.advanceDate);
        }
        setComprobantes(existing.comprobantes);
        setSignature(existing.signature);
        setShowDocForm(existing.comprobantes.length === 0);
        setIsLoaded(true);
      }
    }
  }, [id, isEditing, rendiciones, isLoaded]);
  
  // Current Form state for adding a document
  const [type, setType] = useState<DocType>('Factura');
  const [documentNumber, setDocumentNumber] = useState('');
  const [ruc, setRuc] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<string | undefined>();
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showDocForm, setShowDocForm] = useState(true);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setReceiptPhoto(base64);
      } catch (err) {
        console.error('Error reading file', err);
      }
    }
  };

  const autoSaveBlock = async (
    updatedComprobantes?: any[],
    updatedSignature?: string
  ) => {
    if (!id || !isEditing) return;
    setSaveStatus('saving');
    try {
      await updateRendicion(id, {
        name: name.trim() || 'Sin Nombre',
        advanceAmount: parseFloat(advanceAmount) || 0,
        advanceDate: advanceDate,
        comprobantes: (updatedComprobantes !== undefined ? updatedComprobantes : comprobantes) as Comprobante[],
        signature: updatedSignature !== undefined ? updatedSignature : signature
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Error auto-saving:', err);
      setSaveStatus('error');
    }
  };

  const handleFieldBlur = () => {
    if (isEditing && id) {
      autoSaveBlock();
    }
  };

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    const newDoc = {
      id: crypto.randomUUID(),
      type,
      documentNumber,
      ruc,
      date: new Date(date).toISOString(),
      amount: parseFloat(amount),
      receiptPhoto,
    };
    
    const updatedComprobantes = [...comprobantes, newDoc];
    setComprobantes(updatedComprobantes);
    
    // Reset Form
    setType('Factura');
    setDocumentNumber('');
    setRuc('');
    setDate('');
    setAmount('');
    setReceiptPhoto(undefined);
    setShowDocForm(false);

    if (isEditing && id) {
      // Save changes automatically in Firestore
      await autoSaveBlock(updatedComprobantes);
    } else {
      // Transition from /new to /edit/:id seamlessly
      setSaveStatus('saving');
      try {
        const newId = crypto.randomUUID();
        const blockName = name.trim() || 'Rendición Temporal';
        const blockAdvance = parseFloat(advanceAmount) || 0;
        
        const { currentUser } = useAppStore.getState();
        const totalAmount = updatedComprobantes.reduce((sum, c) => sum + c.amount, 0);
        
        const newRendicion: Rendicion = {
          id: newId,
          name: blockName,
          status: 'Pendiente',
          createdAt: new Date().toISOString(),
          userId: currentUser.id,
          userName: currentUser.name,
          comprobantes: updatedComprobantes as Comprobante[],
          totalAmount,
          advanceAmount: blockAdvance,
          advanceDate,
          signature
        };
        
        await setDoc(doc(db, 'rendiciones', newId), newRendicion);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        
        // Redirect to edit view so that they are in continuous auto-saving mode
        setIsLoaded(true); // Don't trigger initial loading effect since we already have local state
        navigate(`/edit/${newId}`, { replace: true });
      } catch (err) {
        console.error("Error creating block on document add:", err);
        setSaveStatus('error');
      }
    }
  };

  const removeDocument = async (index: number) => {
    const updatedComprobantes = comprobantes.filter((_, i) => i !== index);
    setComprobantes(updatedComprobantes);
    
    if (isEditing && id) {
      await autoSaveBlock(updatedComprobantes);
    }
  };

  const handleSubmitBlock = async () => {
    if (!name) return;
    setLoading(true);
    
    try {
      if (isEditing && id) {
        await updateRendicion(id, {
          name,
          advanceAmount: parseFloat(advanceAmount) || 0,
          advanceDate,
          comprobantes: comprobantes as Comprobante[],
          signature,
          status: 'Pendiente' // Enviar/guardar final siempre restablece el bloque a pendiente para que administración lo revise
        });
      } else {
        await addRendicion(name, parseFloat(advanceAmount) || 0, comprobantes, signature, advanceDate);
      }
      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (error) {
      console.error(error);
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center min-h-[400px]">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Bloque {isEditing ? 'Actualizado' : 'Registrado'}</h2>
        <p className="text-gray-500">Tus rendiciones se han {isEditing ? 'actualizado y enviado' : 'enviado'} exitosamente.</p>
      </div>
    );
  }

  const totalAmount = comprobantes.reduce((sum, c) => sum + c.amount, 0);
  const advanceVal = parseFloat(advanceAmount) || 0;
  const balance = advanceVal - totalAmount;
  
  const balanceText = balance > 0 
    ? 'A favor de la empresa (Devolver)' 
    : balance < 0 
      ? 'A favor del empleado (Reembolsar)' 
      : 'Sin saldo pendiente';
  const balanceClass = balance > 0 
    ? 'text-amber-700 bg-amber-50 border-amber-200' 
    : balance < 0 
      ? 'text-blue-700 bg-blue-50 border-blue-200' 
      : 'text-gray-700 bg-gray-50 border-gray-200';

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header with Cloud Sync Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{isEditing ? 'Editar Bloque de Rendición' : 'Crear Bloque de Rendición'}</h2>
          <p className="text-sm text-gray-500 mt-1">Agrupa múltiples comprobantes en un solo envío.</p>
        </div>
        
        <div className="flex items-center space-x-2 text-xs font-medium">
          {saveStatus === 'saving' && (
            <span className="inline-flex items-center text-amber-600 bg-amber-50 px-2.5 py-1.5 rounded-full border border-amber-200 animate-pulse">
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5 text-amber-500" />
              Sincronizando con la nube...
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="inline-flex items-center text-emerald-600 bg-emerald-50 px-2.5 py-1.5 rounded-full border border-emerald-200 shadow-sm">
              <Cloud className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
              Sincronizado y guardado en vivo
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="inline-flex items-center text-red-600 bg-red-50 px-2.5 py-1.5 rounded-full border border-red-200">
              <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
              Error al guardar
            </span>
          )}
          {saveStatus === 'idle' && isEditing && (
            <span className="inline-flex items-center text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-full border border-slate-200 shadow-sm">
              <Cloud className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
              Conexión activa - Cambios autoguardados
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white border border-gray-200 shadow-sm rounded-xl p-6">
        <div className="md:col-span-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del Bloque</label>
          <input 
            type="text" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleFieldBlur}
            placeholder="Ej. Viaje a Lima - Enero 2024"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Fecha de Desembolso / Entrega</label>
          <input 
            type="date" 
            value={advanceDate}
            onChange={(e) => setAdvanceDate(e.target.value)}
            onBlur={handleFieldBlur}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Monto Entregado (Adelanto) S/</label>
          <input 
            type="number"
            step="0.01" 
            min="0"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            onBlur={handleFieldBlur}
            placeholder="Ej. 500.00"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base"
            required
          />
        </div>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50">
          <h3 className="font-semibold text-gray-800 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-gray-500" /> 
            Documentos Añadidos ({comprobantes.length})
          </h3>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center w-full sm:w-auto">
            <div className="text-sm font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 text-center">
              Total Gastado: S/ {totalAmount.toFixed(2)}
            </div>
            {advanceVal > 0 && (
              <div className={`text-xs font-bold px-3 py-1.5 rounded-md border text-center ${balanceClass}`}>
                Saldo: S/ {Math.abs(balance).toFixed(2)} <span className="font-normal">({balanceText})</span>
              </div>
            )}
          </div>
        </div>

        {comprobantes.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">RUC</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {comprobantes.map((c, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{format(new Date(c.date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{c.type} {c.documentNumber}</td>
                    <td className="px-4 py-3 text-gray-500">{c.ruc}</td>
                    <td className="px-4 py-3 text-right font-medium">S/ {c.amount.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => removeDocument(i)} className="text-red-500 hover:text-red-700 p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showDocForm ? (
          <form onSubmit={addDocument} className="p-6 border-t border-gray-100 bg-blue-50/30">
            <h4 className="font-medium text-gray-800 mb-4 text-sm">Agregar Nuevo Comprobante</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" required>
                  <option value="Factura">Factura</option>
                  <option value="Boleta">Boleta</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Número</label>
                <input type="text" value={documentNumber} onChange={(e) => setDocumentNumber(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">RUC</label>
                <input type="text" maxLength={11} value={ruc} onChange={(e) => setRuc(e.target.value.replace(/[^0-9]/g, ''))} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-xs font-medium text-gray-700 mb-1">Monto (S/)</label>
                <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500" required />
              </div>
              
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">Foto (Opcional)</label>
                <div className="flex items-center space-x-4">
                  <input type="file" id="file-upload" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                  <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50">
                    <UploadCloud className="w-4 h-4 mr-2" /> Subir archivo
                  </label>
                  {receiptPhoto && <span className="text-xs text-green-600 font-medium">Archivo adjunto listo</span>}
                </div>
              </div>
            </div>
            
            <div className="mt-5 flex justify-end space-x-3">
              {comprobantes.length > 0 && (
                <button type="button" onClick={() => setShowDocForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">Cancelar</button>
              )}
              <button type="submit" className="px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md transition-colors flex items-center">
                <Plus className="w-4 h-4 mr-1" /> Añadir Comprobante
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-center">
            <button type="button" onClick={() => setShowDocForm(true)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-md transition-colors flex items-center shadow-sm">
              <Plus className="w-4 h-4 mr-1" /> Agregar otro comprobante
            </button>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-semibold text-gray-800 flex items-center">
            <PenTool className="w-5 h-5 mr-2 text-gray-500" />
            Firma (Opcional)
          </h4>
          <p className="text-sm text-gray-500 mt-1">Sube una imagen con tu firma para este documento.</p>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end">
          <input 
            type="file" 
            id="signature-upload" 
            accept="image/*" 
            className="hidden" 
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) {
                const base64 = await fileToBase64(file);
                setSignature(base64);
                if (isEditing && id) {
                  await autoSaveBlock(comprobantes, base64);
                }
              }
            }} 
          />
          <label htmlFor="signature-upload" className="cursor-pointer inline-flex inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            <UploadCloud className="w-4 h-4 mr-2" /> Subir Firma
          </label>
          {signature && (
            <div className="mt-3">
              <span className="text-xs text-green-600 font-medium mb-1 block text-right">Firma adjunta</span>
              <img src={signature} alt="Firma" className="h-12 w-auto object-contain border border-gray-200 rounded p-1 bg-white" />
            </div>
          )}
        </div>
      </div>
      
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 w-full">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors order-2 sm:order-1 text-center"
        >
          Cancelar
        </button>
        <button
          onClick={handleSubmitBlock}
          disabled={loading || !name}
          className="w-full sm:w-auto px-6 py-2.5 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-sm order-1 sm:order-2 text-center"
        >
          {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Enviar Bloque de Rendición')}
        </button>
      </div>
    </div>
  );
}
