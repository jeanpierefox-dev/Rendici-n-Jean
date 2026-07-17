import React, { useState, useEffect } from 'react';
import { useAppStore } from '../lib/store';
import { useNavigate, useParams } from 'react-router';
import { fileToBase64, compressImageToBase64, formatLocalDate, safeUUID, recompressBase64Image } from '../lib/utils';
import { UploadCloud, CheckCircle, Plus, Trash2, FileText, PenTool, Cloud, Loader2, Edit3, DollarSign, Calendar, Tag } from 'lucide-react';
import { Comprobante, DocType, Rendicion, Ingreso } from '../types';
import { format } from 'date-fns';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

export function FormRendicion() {
  const { id } = useParams<{ id: string }>();
  const isEditing = Boolean(id);
  
  const { addRendicion, updateRendicion, rendiciones } = useAppStore();
  const navigate = useNavigate();

  // Primary Rendicion fields
  const [name, setName] = useState('');
  const [rendicionType, setRendicionType] = useState('Logístico');
  const [comprobantes, setComprobantes] = useState<Comprobante[]>([]);
  const [ingresos, setIngresos] = useState<Ingreso[]>([]);
  const [signature, setSignature] = useState<string | undefined>();
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Comprobante Form state
  const [editingComprobanteId, setEditingComprobanteId] = useState<string | null>(null);
  const [type, setType] = useState<DocType>('Factura');
  const [documentNumber, setDocumentNumber] = useState('');
  const [ruc, setRuc] = useState('');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptPhoto, setReceiptPhoto] = useState<string | undefined>();
  const [category, setCategory] = useState('Transporte');
  const [observation, setObservation] = useState('');
  const [showDocForm, setShowDocForm] = useState(true);

  const [razonSocial, setRazonSocial] = useState('');
  const [loadingRuc, setLoadingRuc] = useState(false);
  const [rucError, setRucError] = useState('');
  const [emisorDocType, setEmisorDocType] = useState<'RUC' | 'DNI'>('RUC');

  // Deterministic fallback Peru business/person name generator for smooth offline / iframe experiences
  const getDeterministicFallback = (docNum: string, type: 'RUC' | 'DNI') => {
    const cleanNum = String(docNum).trim();
    let hash = 0;
    for (let i = 0; i < cleanNum.length; i++) {
      hash = (hash << 5) - hash + cleanNum.charCodeAt(i);
      hash |= 0;
    }
    const absHash = Math.abs(hash);

    const firstNames = ["Juan", "María", "José", "Luis", "Ana", "Carlos", "Jorge", "Rosa", "Pedro", "Elena", "Miguel", "Lucía"];
    const middleNames = ["Antonio", "Beatriz", "Francisco", "Gabriela", "Manuel", "Patricia", "Roberto", "Sofía", "David", "Carmen"];
    const lastNames = ["Quispe", "Flores", "Sánchez", "García", "Rodríguez", "Rojas", "Huamán", "Mamani", "Vargas", "Castillo", "Diaz", "Chavez", "Ramirez", "Mendoza"];
    
    if (type === 'DNI' || cleanNum.startsWith("10")) {
      const fName = firstNames[absHash % firstNames.length];
      const mName = middleNames[(absHash >> 1) % middleNames.length];
      const lName1 = lastNames[(absHash >> 2) % lastNames.length];
      const lName2 = lastNames[(absHash >> 3) % lastNames.length];
      return `${fName} ${mName} ${lName1} ${lName2}`.toUpperCase();
    } else {
      const companyKeywords = ["Transportes", "Servicios Integrales", "Distribuidora de Alimentos", "Inversiones", "Comercializadora", "Consultora", "Constructoras y Edificaciones", "Corporación", "Consorcio", "Sistemas y Tecnología"];
      const companyNames = ["Andes", "Pacífico", "Sol", "Oriente", "Valle", "Unión", "América", "Llama", "Libertad", "Pachacútec", "Inca", "Amazonas", "Progreso", "Perú"];
      const companySuffixes = ["S.A.C.", "E.I.R.L.", "S.A.", "S.R.L."];
      const kw = companyKeywords[absHash % companyKeywords.length];
      const name = companyNames[(absHash >> 1) % companyNames.length];
      const suffix = companySuffixes[(absHash >> 2) % companySuffixes.length];
      return `${kw} ${name} ${suffix}`.toUpperCase();
    }
  };

  const fetchRucInfo = async (rucVal: string) => {
    if (!rucVal || (rucVal.length !== 11 && rucVal.length !== 8)) return;
    setLoadingRuc(true);
    setRucError('');

    // Helper to query apis.net.pe through allorigins CORS proxy if the standard endpoint fails/redirects
    const fetchViaCorsProxy = async (): Promise<string | null> => {
      try {
        const isDni = emisorDocType === 'DNI';
        const targetUrl = isDni 
          ? `https://api.apis.net.pe/v1/dni?numero=${rucVal}`
          : `https://api.apis.net.pe/v1/ruc?numero=${rucVal}`;
        
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const corsRes = await fetch(proxyUrl);
        if (corsRes.ok) {
          const wrapper = await corsRes.json();
          if (wrapper && wrapper.contents) {
            const innerData = JSON.parse(wrapper.contents);
            if (innerData && (innerData.nombre || innerData.razonSocial)) {
              return innerData.nombre || innerData.razonSocial;
            }
          }
        }
      } catch (proxyErr) {
        console.error('Error in CORS proxy fetch:', proxyErr);
      }
      return null;
    };

    try {
      // 1. Try fetching via our server API route
      const res = await fetch(`/api/ruc/${rucVal}?type=${emisorDocType}`);
      
      if (res.ok) {
        const text = await res.text();
        
        // If the platform gateway redirected to cookie check page (HTML response in sandboxed iframe)
        if (text.trim().startsWith('<')) {
          console.log('Iframe sandbox redirect detected. Falling back to CORS proxy...');
          const proxyName = await fetchViaCorsProxy();
          if (proxyName) {
            setRazonSocial(proxyName);
            setRucError(''); // Success!
            return;
          } else {
            setRucError('⚠️ Abre la app en Nueva Pestaña (botón arriba derecha) para búsqueda SUNAT en tiempo real. Por favor escribe el nombre manualmente.');
            return;
          }
        }
        
        try {
          const data = JSON.parse(text);
          if (data && data.razonSocial && data.source !== "offline-sunat-generator" && data.source !== "offline-sunat-generator-invalid-length") {
            setRazonSocial(data.razonSocial);
            setRucError(''); // Clear error on complete success
          } else {
            // Server didn't find it or had fallback. Let's try CORS proxy as a second chance before giving up
            const proxyName = await fetchViaCorsProxy();
            if (proxyName) {
              setRazonSocial(proxyName);
              setRucError('');
            } else {
              setRucError(emisorDocType === 'DNI' ? '⚠️ DNI no encontrado en SUNAT. Escríbelo manualmente.' : '⚠️ RUC no encontrado en SUNAT. Escríbelo manualmente.');
            }
          }
        } catch (jsonErr) {
          const proxyName = await fetchViaCorsProxy();
          if (proxyName) {
            setRazonSocial(proxyName);
            setRucError('');
          } else {
            setRucError('⚠️ SUNAT no responde. Por favor escribe el nombre de la empresa de forma manual.');
          }
        }
      } else {
        // Server returned non-ok status. Try CORS proxy
        const proxyName = await fetchViaCorsProxy();
        if (proxyName) {
          setRazonSocial(proxyName);
          setRucError('');
        } else {
          setRucError('⚠️ SUNAT no responde. Por favor escribe el nombre de la empresa de forma manual.');
        }
      }
    } catch (err) {
      console.error('Error fetching RUC info:', err);
      // Main fetch failed (e.g. offline). Try CORS proxy
      const proxyName = await fetchViaCorsProxy();
      if (proxyName) {
        setRazonSocial(proxyName);
        setRucError('');
      } else {
        setRucError('⚠️ SUNAT no responde. Por favor escribe el nombre de la empresa de forma manual.');
      }
    } finally {
      setLoadingRuc(false);
    }
  };

  const handleRucChange = (val: string) => {
    const maxLen = emisorDocType === 'RUC' ? 11 : 8;
    const cleanVal = val.replace(/[^0-9]/g, '').slice(0, maxLen);
    setRuc(cleanVal);
    if (cleanVal.length === 0) {
      setRazonSocial('');
      setRucError('');
    }
  };

  // Ingreso Form state
  const [editingIngresoId, setEditingIngresoId] = useState<string | null>(null);
  const [ingAmount, setIngAmount] = useState('');
  const [ingDate, setIngDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [ingReference, setIngReference] = useState('');
  const [showIngForm, setShowIngForm] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Load existing Rendicion if editing
  useEffect(() => {
    if (isEditing && id && !isLoaded) {
      const existing = rendiciones.find(r => r.id === id);
      if (existing) {
        setName(existing.name);
        setRendicionType(existing.rendicionType || 'Logístico');
        setComprobantes(existing.comprobantes || []);
        setSignature(existing.signature);
        
        // Populate ingresos with on-the-fly migration for old records if needed
        if (existing.ingresos && existing.ingresos.length > 0) {
          setIngresos(existing.ingresos);
        } else if (existing.advanceAmount > 0) {
          setIngresos([{
            id: 'initial',
            amount: existing.advanceAmount,
            date: existing.advanceDate || existing.createdAt.split('T')[0],
            reference: 'Monto Inicial Desembolsado'
          }]);
        } else {
          setIngresos([]);
        }

        setShowDocForm(existing.comprobantes ? existing.comprobantes.length === 0 : true);
        setIsLoaded(true);
      }
    }
  }, [id, isEditing, rendiciones, isLoaded]);

  // Handle image attachment for expense receipts
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/') && file.size > 800 * 1024) {
        alert('Por límite de sistema, los archivos PDF no deben superar los 800KB. Por favor, comprima el archivo o tome una foto.');
        return;
      }
      try {
        // Compress image to 640x640 at 0.30 quality for ultra-fast saving, syncing, and loading without losing readability
        const base64 = await compressImageToBase64(file, 640, 640, 0.30); 
        
        const sizeInBytes = base64.length * 0.75;
        if (sizeInBytes > 950 * 1024) {
          alert('El archivo adjunto es muy pesado (máx 950KB comprimido). Intente con una foto de menor resolución.');
          return;
        }
        
        setReceiptPhoto(base64);
      } catch (err) {
        console.error('Error reading file', err);
      }
    }
  };

  // Safe auto-save to Firestore stripping out undefined values
  const autoSaveBlock = async (
    updatedComprobantes: Comprobante[],
    updatedIngresos: Ingreso[],
    updatedSignature?: string
  ) => {
    if (!id || !isEditing) return;
    setSaveStatus('saving');
    setErrorMessage('');
    
    // Sum of all ingresos is the main advanceAmount for backward compatibility with admins and statistics
    const sumIngresos = updatedIngresos.reduce((sum, ing) => sum + ing.amount, 0);
    // Find earliest date or main date
    const primaryDate = updatedIngresos.length > 0 ? updatedIngresos[0].date : (new Date().toISOString().split('T')[0]);

    // Clear heavy base64 strings from local state IMMEDIATELY to prevent UI lag while we wait for network sync
    const clearedComprobantes = updatedComprobantes.map(c => ({
      ...c,
      receiptPhoto: undefined,
      hasPhoto: c.hasPhoto || !!c.receiptPhoto
    }));
    setComprobantes(clearedComprobantes);

    try {
      const payload: any = {
        name: name.trim() || 'Sin Nombre',
        rendicionType,
        advanceAmount: sumIngresos,
        advanceDate: primaryDate,
        comprobantes: updatedComprobantes,
        ingresos: updatedIngresos,
        signature: updatedSignature !== undefined ? updatedSignature : signature
      };
      
      await updateRendicion(id, payload);

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err: any) {
      console.error('Error auto-saving:', err);
      setSaveStatus('error');
      setErrorMessage(err?.message || 'Error al guardar');
    }
  };

  const handleFieldBlur = () => {
    if (isEditing && id) {
      autoSaveBlock(comprobantes, ingresos, signature);
    }
  };

  const handleTypeChange = async (newType: string) => {
    setRendicionType(newType);
    if (isEditing && id) {
      setSaveStatus('saving');
      try {
        await updateRendicion(id, { rendicionType: newType });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err: any) {
        setSaveStatus('error');
        setErrorMessage(err?.message || 'Error al guardar');
      }
    }
  };

  // --- COMPROBANTE (EXPENSE DOCUMENT) OPERATIONS ---
  const handleEditComprobante = (comp: Comprobante) => {
    setEditingComprobanteId(comp.id);
    setType(comp.type);
    setDocumentNumber(comp.documentNumber);
    setRuc(comp.ruc);
    setEmisorDocType(comp.ruc.length === 8 ? 'DNI' : 'RUC');
    setRazonSocial(comp.razonSocial || '');
    setRucError('');
    // Format date string safely for input element
    const formattedDate = comp.date.includes('T') ? comp.date.split('T')[0] : comp.date;
    setDate(formattedDate);
    setAmount(comp.amount.toString());
    setReceiptPhoto(comp.receiptPhoto);
    setCategory(comp.category || 'Transporte');
    setObservation(comp.observation || '');
    setShowDocForm(true);
  };

  const handleCancelEditComprobante = () => {
    setEditingComprobanteId(null);
    setType('Factura');
    setDocumentNumber('');
    setRuc('');
    setEmisorDocType('RUC');
    setRazonSocial('');
    setRucError('');
    setDate('');
    setAmount('');
    setReceiptPhoto(undefined);
    setCategory('Transporte');
    setObservation('');
    setShowDocForm(comprobantes.length === 0);
  };

  const addOrUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let updatedComprobantes: Comprobante[];

    if (editingComprobanteId) {
      // Editing mode
      updatedComprobantes = comprobantes.map(c => {
        if (c.id === editingComprobanteId) {
          return {
            ...c,
            type,
            documentNumber,
            ruc,
            razonSocial,
            date,
            amount: parseFloat(amount),
            receiptPhoto,
            category,
            observation: category === 'Otros' || observation ? observation : '',
          };
        }
        return c;
      });
    } else {
      // Creation mode
      const newDoc: Comprobante = {
        id: safeUUID(),
        type,
        documentNumber,
        ruc,
        razonSocial,
        date,
        amount: parseFloat(amount),
        receiptPhoto,
        category,
        observation: category === 'Otros' || observation ? observation : '',
      };
      updatedComprobantes = [...comprobantes, newDoc];
    }
    
    setComprobantes(updatedComprobantes);
    
    // Reset Form State
    setEditingComprobanteId(null);
    setType('Factura');
    setDocumentNumber('');
    setRuc('');
    setEmisorDocType('RUC');
    setRazonSocial('');
    setRucError('');
    setDate('');
    setAmount('');
    setReceiptPhoto(undefined);
    setCategory('Transporte');
    setObservation('');
    setShowDocForm(false);

    if (isEditing && id) {
      // Safe save in Firestore
      await autoSaveBlock(updatedComprobantes, ingresos, signature);
    } else {
      // Seamlessly transition from /new to /edit/:id on first document addition
      setSaveStatus('saving');
      try {
        const blockName = name.trim() || 'Rendición Temporal';
        const sumIngresos = ingresos.reduce((sum, ing) => sum + ing.amount, 0);
        const primaryDate = ingresos.length > 0 ? ingresos[0].date : (new Date().toISOString().split('T')[0]);
        
        // Clear heavy base64 strings from local state IMMEDIATELY to prevent memory bloat and UI lag
        const clearedComprobantes = updatedComprobantes.map(c => ({
          ...c,
          receiptPhoto: undefined,
          hasPhoto: c.hasPhoto || !!c.receiptPhoto
        }));
        setComprobantes(clearedComprobantes);

        // Use addRendicion store action! This separates photos and stores them correctly
        const newId = await addRendicion(
          blockName,
          sumIngresos,
          updatedComprobantes,
          signature,
          primaryDate,
          ingresos,
          rendicionType
        );

        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
        
        // Navigate and retain states
        setIsLoaded(true);
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
      await autoSaveBlock(updatedComprobantes, ingresos, signature);
    }
  };


  // --- INGRESO (DISBURSEMENT / ADELANTO) OPERATIONS ---
  const handleEditIngreso = (ing: Ingreso) => {
    setEditingIngresoId(ing.id);
    setIngAmount(ing.amount.toString());
    setIngDate(ing.date);
    setIngReference(ing.reference || '');
    setShowIngForm(true);
  };

  const handleCancelEditIngreso = () => {
    setEditingIngresoId(null);
    setIngAmount('');
    setIngDate(new Date().toISOString().split('T')[0]);
    setIngReference('');
    setShowIngForm(false);
  };

  const addOrUpdateIngreso = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingAmount) return;

    let updatedIngresos: Ingreso[];

    if (editingIngresoId) {
      // Editing existing ingreso
      updatedIngresos = ingresos.map(ing => {
        if (ing.id === editingIngresoId) {
          return {
            ...ing,
            amount: parseFloat(ingAmount),
            date: ingDate,
            reference: ingReference.trim() || undefined
          };
        }
        return ing;
      });
    } else {
      // Creating a new ingreso
      const newIng: Ingreso = {
        id: safeUUID(),
        amount: parseFloat(ingAmount),
        date: ingDate,
        reference: ingReference.trim() || undefined
      };
      updatedIngresos = [...ingresos, newIng];
    }

    setIngresos(updatedIngresos);

    // Reset Form State
    setEditingIngresoId(null);
    setIngAmount('');
    setIngDate(new Date().toISOString().split('T')[0]);
    setIngReference('');
    setShowIngForm(false);

    if (isEditing && id) {
      await autoSaveBlock(comprobantes, updatedIngresos, signature);
    }
  };

  const removeIngreso = async (index: number) => {
    const updatedIngresos = ingresos.filter((_, i) => i !== index);
    setIngresos(updatedIngresos);

    if (isEditing && id) {
      await autoSaveBlock(comprobantes, updatedIngresos, signature);
    }
  };


  // --- SUBMIT FULL RENDICION BLOCK ---
  const handleSubmitBlock = async () => {
    if (!name) {
      alert('Por favor, ingresa un "Nombre del Bloque de Rendición" en la parte superior antes de guardar.');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    
    const sumIngresos = ingresos.reduce((sum, ing) => sum + ing.amount, 0);
    const primaryDate = ingresos.length > 0 ? ingresos[0].date : (new Date().toISOString().split('T')[0]);

    try {
      const payload: any = {
        name,
        rendicionType,
        advanceAmount: sumIngresos,
        advanceDate: primaryDate,
        comprobantes,
        ingresos,
        signature,
        status: 'Pendiente' as const
      };
      
      if (isEditing && id) {
        await updateRendicion(id, payload);
      } else {
        await addRendicion(payload.name, payload.advanceAmount, payload.comprobantes, payload.signature, payload.advanceDate, payload.ingresos, rendicionType);
      }
      setLoading(false);
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (error: any) {
      console.error(error);
      setLoading(false);
      setSaveStatus('error');
      setErrorMessage(error?.message || 'Error al guardar el bloque');
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

  if (isEditing && !isLoaded) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-white border border-gray-200 rounded-xl p-8 shadow-sm">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
        <p className="text-gray-500 text-sm font-medium">Cargando datos de la rendición...</p>
      </div>
    );
  }

  // Calculation of aggregates
  const totalGastado = comprobantes.reduce((sum, c) => sum + c.amount, 0);
  const totalIngresos = ingresos.reduce((sum, ing) => sum + ing.amount, 0);
  const balance = totalIngresos - totalGastado;
  
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
      {/* Header with Live Status Indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">{isEditing ? 'Editar Bloque de Rendición' : 'Crear Bloque de Rendición'}</h2>
          <p className="text-sm text-gray-500 mt-1">Sube tus comprobantes de gastos y registra múltiples desembolsos recibidos.</p>
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
              <span className="w-2 h-2 rounded-full bg-red-500 mr-2 shrink-0"></span>
              <span className="truncate max-w-[150px] sm:max-w-xs text-xs">{errorMessage || 'Error al guardar'}</span>
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

      {/* BLOCK NAME GENERAL INFO */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Nombre o Glosa de este Bloque</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleFieldBlur}
              placeholder="Ej. Viaje a Lima - Enero 2024"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base font-medium"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-2">Tipo de Rendición</label>
            <select
              value={rendicionType}
              onChange={(e) => handleTypeChange(e.target.value)}
              onBlur={handleFieldBlur}
              className="w-full px-4 py-2 border border-gray-300 bg-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-base font-medium"
            >
              <option value="Logístico">Logístico</option>
              <option value="Despacho pollo vivo pucallpa">Despacho pollo vivo Pucallpa</option>
              <option value="Despacho pollo vivo San Fernando">Despacho pollo vivo San Fernando</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
        </div>
      </div>


      {/* --- SECTION 1: INGRESOS (DISBURSEMENTS RECEIVED) --- */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center text-base">
              <DollarSign className="w-5 h-5 mr-2 text-indigo-600 animate-pulse" /> 
              Ingresos / Dinero Recibido (Desembolsos)
            </h3>
            <p className="text-xs text-gray-500 mt-1">Registra los depósitos o adelantos que te hizo la empresa para este bloque.</p>
          </div>
          <div className="text-sm font-bold text-indigo-900 bg-indigo-50 px-3 py-1.5 rounded-md border border-indigo-200">
            Total Recibido: S/ {totalIngresos.toFixed(2)}
          </div>
        </div>

        {/* Ingresos List Table */}
        {ingresos.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-5 py-3">Fecha de Recibo</th>
                  <th className="px-5 py-3">Glosa / Referencia</th>
                  <th className="px-5 py-3 text-right">Monto Recibido</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {ingresos.map((ing, i) => (
                  <tr key={ing.id || i} className="hover:bg-gray-50/70 transition-colors">
                    <td className="px-5 py-3 text-gray-700 font-medium">{format(new Date(ing.date + 'T00:00:00'), 'dd/MM/yyyy')}</td>
                    <td className="px-5 py-3 text-gray-600">{ing.reference || <span className="text-gray-400 italic">Sin referencia</span>}</td>
                    <td className="px-5 py-3 text-right font-semibold text-indigo-600">S/ {ing.amount.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <button 
                        type="button"
                        onClick={() => handleEditIngreso(ing)} 
                        className="text-blue-500 hover:text-blue-700 p-1.5 inline-flex hover:bg-blue-50 rounded"
                        title="Editar Ingreso"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => removeIngreso(i)} 
                        className="text-red-500 hover:text-red-700 p-1.5 inline-flex hover:bg-red-50 rounded"
                        title="Eliminar Ingreso"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400 italic">
            No has agregado ningún ingreso de dinero todavía.
          </div>
        )}

        {/* Ingresos Adding Form */}
        {showIngForm ? (
          <form onSubmit={addOrUpdateIngreso} className="p-6 border-t border-gray-100 bg-indigo-50/20 space-y-4">
            <h4 className="font-bold text-indigo-950 text-sm flex items-center">
              {editingIngresoId ? <Edit3 className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {editingIngresoId ? 'Editar Desembolso' : 'Agregar Nuevo Desembolso'}
            </h4>
            
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center">
                  <DollarSign className="w-3.5 h-3.5 mr-1" /> Monto Recibido (S/)
                </label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01"
                  value={ingAmount} 
                  onChange={(e) => setIngAmount(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="Ej. 1500.00"
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1" /> Fecha de Desembolso
                </label>
                <input 
                  type="date" 
                  value={ingDate} 
                  onChange={(e) => setIngDate(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex items-center">
                  <Tag className="w-3.5 h-3.5 mr-1" /> Referencia / Glosa
                </label>
                <input 
                  type="text" 
                  value={ingReference} 
                  onChange={(e) => setIngReference(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" 
                  placeholder="Ej. Transferencia BCP N° 1245" 
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-2">
              <button 
                type="button" 
                onClick={handleCancelEditIngreso} 
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Cancelar
              </button>
              <button 
                type="submit" 
                className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center"
              >
                {editingIngresoId ? 'Actualizar Ingreso' : 'Añadir Ingreso'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-center">
            <button 
              type="button" 
              onClick={() => setShowIngForm(true)} 
              className="px-4 py-2 text-sm font-semibold text-indigo-700 bg-white border border-indigo-200 hover:bg-indigo-50 rounded-lg transition-colors flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1" /> Registrar Ingreso / Desembolso
            </button>
          </div>
        )}
      </div>


      {/* --- SECTION 2: GASTOS / COMPROBANTES --- */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-4 md:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50/50">
          <div>
            <h3 className="font-bold text-gray-800 flex items-center text-base">
              <FileText className="w-5 h-5 mr-2 text-blue-600" /> 
              Comprobantes de Gastos ({comprobantes.length})
            </h3>
            <p className="text-xs text-gray-500 mt-1">Sube tus Facturas, Boletas y otros comprobantes de consumo.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 items-stretch sm:items-center w-full sm:w-auto">
            <div className="text-sm font-bold text-gray-900 bg-white px-3 py-1.5 rounded-md border border-gray-200 text-center">
              Total Gastado: S/ {totalGastado.toFixed(2)}
            </div>
            {totalIngresos > 0 && (
              <div className={`text-xs font-bold px-3 py-1.5 rounded-md border text-center ${balanceClass}`}>
                Saldo: S/ {Math.abs(balance).toFixed(2)} <span className="font-normal">({balanceText})</span>
              </div>
            )}
          </div>
        </div>

        {/* Comprobantes Table */}
        {comprobantes.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-5 py-3">Fecha</th>
                  <th className="px-5 py-3">Tipo Documento</th>
                  <th className="px-5 py-3">RUC</th>
                  <th className="px-5 py-3">Categoría / Obs.</th>
                  <th className="px-5 py-3 text-right">Monto</th>
                  <th className="px-5 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {comprobantes.map((c, i) => (
                  <tr key={c.id || i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 text-gray-700">{formatLocalDate(c.date)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{c.type} {c.documentNumber}</td>
                    <td className="px-5 py-3 text-gray-500">
                      <div className="font-semibold text-gray-700">{c.ruc}</div>
                      {c.razonSocial && <div className="text-xs text-slate-500 truncate max-w-[180px] font-medium" title={c.razonSocial}>{c.razonSocial}</div>}
                    </td>
                    <td className="px-5 py-3 text-gray-700">
                      <span className="font-semibold text-slate-800">{c.category || 'Otros'}</span>
                      {c.observation && <span className="block text-xs text-gray-400 mt-0.5 max-w-[200px] truncate" title={c.observation}>{c.observation}</span>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-gray-900">S/ {c.amount.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <button 
                        type="button"
                        onClick={() => handleEditComprobante(c)} 
                        className="text-blue-500 hover:text-blue-700 p-1.5 inline-flex hover:bg-blue-50 rounded"
                        title="Editar Documento"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button 
                        type="button"
                        onClick={() => removeDocument(i)} 
                        className="text-red-500 hover:text-red-700 p-1.5 inline-flex hover:bg-red-50 rounded"
                        title="Eliminar Documento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-sm text-gray-400 italic">
            No has añadido ningún comprobante de gasto a este bloque.
          </div>
        )}

        {/* Comprobantes Add/Edit Form */}
        {showDocForm ? (
          <form onSubmit={addOrUpdateDocument} className="p-6 border-t border-gray-100 bg-blue-50/30 space-y-4">
            <h4 className="font-bold text-blue-950 text-sm flex items-center">
              {editingComprobanteId ? <Edit3 className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              {editingComprobanteId ? 'Editar Comprobante' : 'Agregar Nuevo Comprobante'}
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tipo de Documento</label>
                <select 
                  value={type} 
                  onChange={(e) => setType(e.target.value as any)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  required
                >
                  <option value="Factura">Factura</option>
                  <option value="Boleta">Boleta</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Número de Documento</label>
                <input 
                  type="text" 
                  value={documentNumber} 
                  onChange={(e) => setDocumentNumber(e.target.value)} 
                  placeholder="Ej. F001-000452"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1 flex justify-between items-center">
                  <span>Documento del Emisor</span>
                  {loadingRuc && <span className="text-[10px] text-blue-600 animate-pulse font-medium">Buscando...</span>}
                  {rucError && <span className="text-[10px] text-red-500 font-medium">{rucError}</span>}
                </label>
                
                {/* Segmented Document Type Selector */}
                <div className="flex bg-gray-100 p-0.5 rounded-lg mb-2 border border-gray-200">
                  <button
                    type="button"
                    onClick={() => {
                      setEmisorDocType('RUC');
                      setRucError('');
                    }}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      emisorDocType === 'RUC'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    RUC (11 dígitos)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEmisorDocType('DNI');
                      if (ruc.length > 8) {
                        setRuc(ruc.slice(0, 8));
                      }
                      setRucError('');
                    }}
                    className={`flex-1 py-1 text-[11px] font-bold rounded-md transition-all cursor-pointer ${
                      emisorDocType === 'DNI'
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    DNI (8 dígitos)
                  </button>
                </div>

                <div className="relative">
                  <input 
                    type="text" 
                    maxLength={emisorDocType === 'RUC' ? 11 : 8} 
                    value={ruc} 
                    onChange={(e) => handleRucChange(e.target.value)} 
                    onBlur={() => {
                      const requiredLen = emisorDocType === 'RUC' ? 11 : 8;
                      if (ruc.length === requiredLen) {
                        fetchRucInfo(ruc);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const requiredLen = emisorDocType === 'RUC' ? 11 : 8;
                        if (ruc.length === requiredLen) {
                          fetchRucInfo(ruc);
                        }
                      }
                    }}
                    placeholder={emisorDocType === 'RUC' ? "Ej. 20131312955" : "Ej. 45678912"}
                    className="w-full pl-3 pr-16 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                    required 
                  />
                  <button
                    type="button"
                    onClick={() => fetchRucInfo(ruc)}
                    disabled={(ruc.length !== (emisorDocType === 'RUC' ? 11 : 8)) || loadingRuc}
                    className="absolute right-1.5 top-1.5 bottom-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-50 border border-slate-300 rounded text-[10px] font-bold transition-colors cursor-pointer"
                  >
                    Buscar
                  </button>
                </div>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Razón Social (Nombre de la Empresa)</label>
                <input 
                  type="text" 
                  value={razonSocial} 
                  onChange={(e) => setRazonSocial(e.target.value)} 
                  placeholder="Razón social autocompletada por SUNAT o ingresada manualmente"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Fecha de Comprobante</label>
                <input 
                  type="date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Monto de Gasto (S/)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0.01" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="Ej. 120.50"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  required 
                />
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Categoría / Tipo de Gasto</label>
                <select 
                  value={category} 
                  onChange={(e) => setCategory(e.target.value)} 
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white" 
                  required
                >
                  <option value="Transporte">Transporte</option>
                  <option value="Alimentación (Desayuno)">Alimentación (Desayuno)</option>
                  <option value="Alimentación (Almuerzo)">Alimentación (Almuerzo)</option>
                  <option value="Alimentación (Cena)">Alimentación (Cena)</option>
                  <option value="Bebidas">Bebidas</option>
                  <option value="Hospedaje">Hospedaje</option>
                  <option value="Gasolina">Gasolina</option>
                  <option value="Otros">Otros (especificar)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Observación {category === 'Otros' ? '(Especificar)' : '(Opcional)'} {category === 'Otros' && <span className="text-red-500 font-bold">*</span>}
                </label>
                <input 
                  type="text" 
                  value={observation} 
                  onChange={(e) => setObservation(e.target.value)} 
                  placeholder={category === 'Otros' ? "Especifique el gasto aquí" : "Detalle adicional opcional"}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" 
                  required={category === 'Otros'}
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] text-gray-500 self-center mr-1">Rápidos:</span>
                  {['Hospedaje', 'Taxi', 'Peaje', 'Almuerzo', 'Desayuno', 'Cena', 'Gasolina'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setObservation(sug);
                        if (sug === 'Hospedaje') {
                          setCategory('Hospedaje');
                        }
                      }}
                      className="px-2 py-0.5 text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded transition-colors cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Foto o PDF del Comprobante (Opcional)</label>
                <div className="flex items-center space-x-4">
                  <input type="file" id="file-upload" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                  <label htmlFor="file-upload" className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50">
                    <UploadCloud className="w-4 h-4 mr-2 text-gray-500" /> Adjuntar archivo
                  </label>
                  {receiptPhoto && <span className="text-xs text-green-600 font-bold">✓ Archivo adjunto listo</span>}
                </div>
              </div>
            </div>
            
            <div className="mt-5 flex justify-end space-x-2">
              {comprobantes.length > 0 && (
                <button 
                  type="button" 
                  onClick={handleCancelEditComprobante} 
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium"
                >
                  Cancelar
                </button>
              )}
              <button 
                type="submit" 
                className="px-4 py-2 text-sm font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors flex items-center"
              >
                {editingComprobanteId ? 'Actualizar Comprobante' : 'Añadir Comprobante'}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-center">
            <button 
              type="button" 
              onClick={() => setShowDocForm(true)} 
              className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 mr-1" /> Registrar Gasto (Factura / Boleta / Otro)
            </button>
          </div>
        )}
      </div>

      {/* --- SIGNATURE SECTION --- */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-gray-800 flex items-center text-sm">
            <PenTool className="w-5 h-5 mr-2 text-gray-500" />
            Firma del Empleado (Opcional)
          </h4>
          <p className="text-xs text-gray-500 mt-1">Sube una imagen de tu firma digital para formalizar esta rendición.</p>
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
                const base64 = await compressImageToBase64(file, 800, 800, 0.6); // Compress signature to be lightweight
                const sizeInBytes = base64.length * 0.75;
                if (sizeInBytes > 150 * 1024) {
                  alert('La imagen de firma es muy pesada. Intente con otra de menor resolución.');
                  return;
                }
                setSignature(base64);
                if (isEditing && id) {
                  await autoSaveBlock(comprobantes, ingresos, base64);
                }
              }
            }} 
          />
          <label htmlFor="signature-upload" className="cursor-pointer inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-semibold rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors">
            <UploadCloud className="w-4 h-4 mr-2 text-gray-500" /> Subir Firma
          </label>
          {signature && (
            <div className="mt-3">
              <span className="text-xs text-green-600 font-bold mb-1 block text-right">Firma cargada</span>
              <img src={signature} alt="Firma" className="h-12 w-auto object-contain border border-gray-200 rounded p-1 bg-white" />
            </div>
          )}
        </div>
      </div>
      
      {/* --- FORM ACTIONS --- */}
      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 w-full">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="w-full sm:w-auto px-6 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors order-2 sm:order-1 text-center shadow-sm"
        >
          Cancelar
        </button>
        <button
          onClick={(e) => {
            if (!name) {
              alert('Por favor, ingresa un "Nombre del Bloque de Rendición" en la parte superior antes de guardar.');
              return;
            }
            handleSubmitBlock();
          }}
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 text-sm font-bold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md order-1 sm:order-2 text-center"
        >
          {loading ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Enviar Bloque de Rendición')}
        </button>
      </div>
    </div>
  );
}
