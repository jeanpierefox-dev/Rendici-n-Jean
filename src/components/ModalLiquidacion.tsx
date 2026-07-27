import React, { useState, useEffect } from 'react';
import { Rendicion, LiquidacionInfo } from '../types';
import { useAppStore } from '../lib/store';
import { X, CheckCircle2, ArrowRightLeft, FileText, Upload, Download, Eye, AlertCircle, DollarSign, Calendar, Tag, ShieldCheck } from 'lucide-react';
import { formatLocalDate } from '../lib/utils';
import { fetchPhotoForComprobante, formatPhotoDataUrl } from '../lib/export';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface ModalLiquidacionProps {
  rendicion: Rendicion;
  onClose: () => void;
  onSaved?: () => void;
}

export const ModalLiquidacion: React.FC<ModalLiquidacionProps> = ({ rendicion, onClose, onSaved }) => {
  const { rendiciones, updateRendicion, addRendicion, currentUser } = useAppStore();

  // Financial calculations
  const totalIngresos = (rendicion.ingresos && rendicion.ingresos.length > 0)
    ? rendicion.ingresos.reduce((sum, i) => sum + i.amount, 0) + (rendicion.previousBalance || 0)
    : (rendicion.advanceAmount || 0) + (rendicion.previousBalance || 0);
  
  const totalGastos = rendicion.totalAmount || 0;
  const rawSaldo = totalIngresos - totalGastos; // > 0 favor empresa, < 0 favor trabajador

  const esFavorEmpresa = rawSaldo > 0;
  const esFavorTrabajador = rawSaldo < 0;

  // Active Tab: 'liquidar' | 'traspasar'
  const [activeTab, setActiveTab] = useState<'liquidar' | 'traspasar'>(
    rendicion.liquidacion?.status === 'Traspasado' ? 'traspasar' : 'liquidar'
  );

  // Form states for Liquidación (Uñero / Reembolso)
  const [monto, setMonto] = useState<number>(
    rendicion.liquidacion?.monto ?? Math.abs(rawSaldo)
  );
  const [fecha, setFecha] = useState<string>(
    rendicion.liquidacion?.fecha || new Date().toISOString().split('T')[0]
  );
  const [voucherObs, setVoucherObs] = useState<string>(
    rendicion.liquidacion?.voucherObs || ''
  );
  const [voucherPhoto, setVoucherPhoto] = useState<string>(
    rendicion.liquidacion?.voucherPhoto || ''
  );
  const [loadingPhoto, setLoadingPhoto] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [selectedPreviewImage, setSelectedPreviewImage] = useState<string | null>(null);

  // Form states for Traspaso
  const [traspasoTargetId, setTraspasoTargetId] = useState<string>('NEW'); // 'NEW' or specific rendicion.id
  const [newRendicionName, setNewRendicionName] = useState<string>(
    `Rendición Siguiente - ${rendicion.userName}`
  );

  // Pre-load voucher photo if existing
  useEffect(() => {
    if (!voucherPhoto && (rendicion.liquidacion?.hasVoucher || rendicion.liquidacion?.voucherPhoto)) {
      setLoadingPhoto(true);
      fetchPhotoForComprobante({ id: `liq_${rendicion.id}`, documentNumber: `liq_${rendicion.id}` }, rendicion.id)
        .then(p => {
          if (p) setVoucherPhoto(p);
        })
        .finally(() => setLoadingPhoto(false));
    }
  }, [rendicion]);

  // Other rendiciones for the same user (excluding this one)
  const userOtherRendiciones = rendiciones.filter(
    r => r.userId === rendicion.userId && r.id !== rendicion.id && r.status !== 'Rechazado'
  );

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 8 * 1024 * 1024) {
      alert("El archivo excede el límite máximo de 8MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (evt) => {
      const res = evt.target?.result as string;
      if (res) {
        setVoucherPhoto(res);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveLiquidacion = async () => {
    if (monto <= 0) {
      alert("El monto de liquidación debe ser mayor a 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Save voucher photo to Firestore 'receipt_photos' collection
      if (voucherPhoto) {
        const key = `liq_${rendicion.id}`.replace(/\//g, '_');
        await setDoc(doc(db, 'receipt_photos', key), { photo: voucherPhoto }).catch(err => {
          console.warn("Could not save liq voucher to firestore:", err);
        });
      }

      const liqData: LiquidacionInfo = {
        status: 'Liquidado',
        type: esFavorEmpresa ? 'Favor Empresa' : (esFavorTrabajador ? 'Favor Trabajador' : 'Equilibrado'),
        monto: monto,
        fecha: fecha,
        voucherObs: voucherObs,
        hasVoucher: !!voucherPhoto,
        voucherPhoto: voucherPhoto || undefined
      };

      await updateRendicion(rendicion.id, {
        liquidacion: liqData
      });

      alert(`¡Bloque de rendición liquidado exitosamente a S/ 0.00!`);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error("Error al liquidar rendición:", err);
      alert("Ocurrió un error al guardar la liquidación.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveTraspaso = async () => {
    setIsSubmitting(true);
    try {
      let targetId = traspasoTargetId;
      let targetName = '';

      if (targetId === 'NEW') {
        // Create new draft rendición with previous balance
        targetName = newRendicionName.trim() || `Rendición Siguiente (${new Date().toLocaleDateString()})`;
        targetId = await addRendicion(
          targetName,
          0,
          [],
          undefined,
          new Date().toISOString().split('T')[0],
          [],
          rendicion.rendicionType || 'Logístico'
        );

        // Set previous balance on the newly created rendición
        await updateRendicion(targetId, {
          previousBalance: rawSaldo,
          previousBalanceSourceId: rendicion.id,
          previousBalanceSourceName: rendicion.name
        });
      } else {
        const targetObj = rendiciones.find(r => r.id === targetId);
        targetName = targetObj ? targetObj.name : 'Rendición Destino';
        await updateRendicion(targetId, {
          previousBalance: (targetObj?.previousBalance || 0) + rawSaldo,
          previousBalanceSourceId: rendicion.id,
          previousBalanceSourceName: rendicion.name
        });
      }

      // Mark current rendición as 'Traspasado'
      const liqData: LiquidacionInfo = {
        status: 'Traspasado',
        type: esFavorEmpresa ? 'Favor Empresa' : 'Favor Trabajador',
        carriedOverAmount: rawSaldo,
        carriedOverToId: targetId,
        carriedOverToName: targetName,
        fecha: new Date().toISOString().split('T')[0]
      };

      await updateRendicion(rendicion.id, {
        liquidacion: liqData
      });

      alert(`¡Saldo de S/ ${Math.abs(rawSaldo).toFixed(2)} traspasado con éxito a la rendición "${targetName}"!`);
      if (onSaved) onSaved();
      onClose();
    } catch (err) {
      console.error("Error al traspasar saldo:", err);
      alert("Ocurrió un error al realizar el traspaso.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
        
        {/* Header */}
        <div className="p-4 bg-slate-900 text-white flex justify-between items-center border-b border-slate-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg tracking-tight leading-tight">
                Gestión de Liquidación y Saldo
              </h3>
              <p className="text-xs text-slate-400 font-medium">
                Bloque: <span className="text-white font-semibold">{rendicion.name}</span> | Colaborador: {rendicion.userName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-5 bg-slate-50">
          
          {/* Financial Calculation Summary Card */}
          <div className={`p-4 rounded-xl border shadow-2xs transition-all ${
            esFavorEmpresa 
              ? 'bg-amber-50/80 border-amber-200 text-amber-900' 
              : (esFavorTrabajador ? 'bg-blue-50/80 border-blue-200 text-blue-900' : 'bg-emerald-50/80 border-emerald-200 text-emerald-900')
          }`}>
            <div className="grid grid-cols-3 gap-2 text-center pb-3 mb-3 border-b border-black/10">
              <div>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Ingresos / Adelantos</span>
                <span className="text-sm sm:text-base font-bold text-slate-900">S/ {totalIngresos.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Total Gastado</span>
                <span className="text-sm sm:text-base font-bold text-slate-900">S/ {totalGastos.toFixed(2)}</span>
              </div>
              <div>
                <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Saldo del Bloque</span>
                <span className={`text-sm sm:text-base font-extrabold ${esFavorEmpresa ? 'text-amber-700' : (esFavorTrabajador ? 'text-blue-700' : 'text-emerald-700')}`}>
                  S/ {Math.abs(rawSaldo).toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle className={`w-5 h-5 ${esFavorEmpresa ? 'text-amber-600' : (esFavorTrabajador ? 'text-blue-600' : 'text-emerald-600')}`} />
                <div>
                  <span className="font-bold text-xs sm:text-sm">
                    {esFavorEmpresa 
                      ? 'SALDO A FAVOR DE LA EMPRESA (Uñero / A devolver)' 
                      : (esFavorTrabajador ? 'SALDO A FAVOR DEL TRABAJADOR (A reembolsar)' : 'BLOQUE EQUILIBRADO (Saldo S/ 0.00)')}
                  </span>
                  <p className="text-xs opacity-85">
                    {esFavorEmpresa 
                      ? 'El colaborador recibió más dinero del que gastó. Debe devolver el exceso o traspasarlo.'
                      : (esFavorTrabajador ? 'El colaborador gastó de su propio dinero. La empresa debe reembolsarle o traspasarlo.' : 'Los gastos coinciden exactamente con los ingresos acumulados.')}
                  </p>
                </div>
              </div>

              {rendicion.liquidacion?.status === 'Liquidado' && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-2xs">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Liquidado
                </span>
              )}
            </div>
          </div>

          {/* Action Tabs */}
          <div className="flex border-b border-slate-200 bg-white rounded-xl p-1 shadow-2xs">
            <button
              onClick={() => setActiveTab('liquidar')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'liquidar'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <DollarSign className="w-4 h-4" />
              <span>1. Liquidar y Cancelar (Dejar en S/ 0)</span>
            </button>
            <button
              onClick={() => setActiveTab('traspasar')}
              className={`flex-1 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                activeTab === 'traspasar'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>2. Traspasar a Siguiente Rendición</span>
            </button>
          </div>

          {/* TAB 1: LIQUIDAR / RECIBO / UÑERO / VOUCHER */}
          {activeTab === 'liquidar' && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="font-bold text-sm text-slate-800 flex items-center">
                  <FileText className="w-4 h-4 text-blue-600 mr-2" />
                  {esFavorEmpresa 
                    ? 'Registro de Uñero / Recibo de Devolución a la Empresa' 
                    : (esFavorTrabajador ? 'Registro de Voucher de Reembolso al Trabajador' : 'Confirmación de Liquidación en Cero')}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Adjunta la constancia de devolución/pago para que el saldo pendiente quede registrado en 0.00.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {esFavorEmpresa ? 'Monto Devuelto por Colaborador (S/)' : 'Monto Reembolsado al Trabajador (S/)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-slate-400 font-bold text-sm">S/</span>
                    <input
                      type="number"
                      step="0.01"
                      value={monto}
                      onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1" /> Fecha de Operación
                  </label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center">
                  <Tag className="w-3.5 h-3.5 text-slate-400 mr-1" /> N° Operación / Recibo de Caja / Observación
                </label>
                <input
                  type="text"
                  placeholder={esFavorEmpresa ? "Ej. Recibo de caja Uñero N° 0041 - Caja Chica" : "Ej. Transferencia BCP N° 093812"}
                  value={voucherObs}
                  onChange={(e) => setVoucherObs(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:bg-white focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Voucher Attachment Section */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  {esFavorEmpresa 
                    ? 'Adjuntar Foto / PDF del Recibo de Uñero / Devolución' 
                    : 'Adjuntar Foto / PDF del Voucher de Pago / Reembolso'}
                </label>

                {voucherPhoto ? (
                  <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-xl flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {voucherPhoto.startsWith('data:application/pdf') ? (
                        <div className="w-12 h-12 bg-red-100 text-red-700 rounded-lg flex items-center justify-center font-bold text-xs">
                          PDF
                        </div>
                      ) : (
                        <img 
                          src={voucherPhoto} 
                          alt="Voucher liquidación" 
                          className="w-12 h-12 object-cover rounded-lg border border-slate-200 shadow-2xs" 
                        />
                      )}
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {esFavorEmpresa ? 'Recibo de Devolución Adjunto' : 'Voucher de Pago Adjunto'}
                        </p>
                        <p className="text-[11px] text-slate-500">Documento verificado y vinculado</p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPreviewImage(voucherPhoto)}
                        className="p-1.5 bg-white border border-slate-200 text-slate-700 hover:text-blue-600 rounded-lg text-xs font-semibold flex items-center shadow-2xs"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> Ver
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoucherPhoto('')}
                        className="p-1.5 bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 rounded-lg text-xs font-semibold"
                      >
                        Cambiar
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/30 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-colors group">
                    <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-600 mb-1" />
                    <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">
                      Haga clic para subir el comprobante/voucher
                    </span>
                    <span className="text-[11px] text-slate-400">Soporta PNG, JPG o PDF (Máx 8MB)</span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveLiquidacion}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold flex items-center justify-center space-x-2 shadow-md transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isSubmitting ? 'Guardando...' : 'Confirmar Liquidación (Quedar en S/ 0)'}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: TRASPASAR SALDO A OTRA RENDICIÓN */}
          {activeTab === 'traspasar' && (
            <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h4 className="font-bold text-sm text-slate-800 flex items-center">
                  <ArrowRightLeft className="w-4 h-4 text-blue-600 mr-2" />
                  Traspasar Saldo Pendiente a la Siguiente Rendición
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  El saldo actual de <strong className="text-slate-800">S/ {Math.abs(rawSaldo).toFixed(2)}</strong> ({esFavorEmpresa ? 'Favor Empresa' : 'Favor Trabajador'}) se arrastrará como saldo inicial a la rendición que selecciones.
                </p>
              </div>

              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700">
                  Seleccionar Bloque de Rendición Destino:
                </label>

                <div className="space-y-2">
                  <label className="flex items-center space-x-3 p-3 bg-slate-50 border rounded-xl cursor-pointer hover:bg-blue-50/40 transition-colors">
                    <input
                      type="radio"
                      name="traspasoTarget"
                      value="NEW"
                      checked={traspasoTargetId === 'NEW'}
                      onChange={() => setTraspasoTargetId('NEW')}
                      className="w-4 h-4 text-blue-600"
                    />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-900 block">➕ Crear un Nuevo Bloque de Rendición</span>
                      <span className="text-[11px] text-slate-500">Abre un nuevo bloque de gastos con este saldo como saldo inicial</span>
                    </div>
                  </label>

                  {traspasoTargetId === 'NEW' && (
                    <div className="pl-7 pt-1">
                      <input
                        type="text"
                        value={newRendicionName}
                        onChange={(e) => setNewRendicionName(e.target.value)}
                        placeholder="Nombre de la nueva rendición"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {userOtherRendiciones.map(r => (
                    <label 
                      key={r.id} 
                      className={`flex items-center space-x-3 p-3 border rounded-xl cursor-pointer transition-colors ${
                        traspasoTargetId === r.id ? 'bg-blue-50 border-blue-300' : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="radio"
                        name="traspasoTarget"
                        value={r.id}
                        checked={traspasoTargetId === r.id}
                        onChange={() => setTraspasoTargetId(r.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <div className="flex-1">
                        <span className="text-xs font-bold text-slate-900 block">{r.name} ({r.status})</span>
                        <span className="text-[11px] text-slate-500">
                          Fecha: {formatLocalDate(r.createdAt)} | Gastado: S/ {r.totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveTraspaso}
                  disabled={isSubmitting}
                  className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold flex items-center justify-center space-x-2 shadow-md transition-colors cursor-pointer"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  <span>{isSubmitting ? 'Traspasando...' : 'Confirmar Traspaso de Saldo'}</span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-100 border-t border-slate-200 text-center text-xs text-slate-600 font-medium flex justify-between items-center px-5">
          <span>Jean-Barsa S.A.C. - Control de Liquidaciones</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>

      </div>

      {/* MODAL PARA PREVISUALIZAR VOUCHER DE LIQUIDACION */}
      {selectedPreviewImage && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200">
            <div className="p-4 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="font-bold text-sm sm:text-base">Vista Previa de Comprobante / Voucher</h3>
              <button
                onClick={() => setSelectedPreviewImage(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-auto flex-1 flex justify-center items-center bg-slate-950">
              {selectedPreviewImage.startsWith('data:application/pdf') ? (
                <iframe
                  src={selectedPreviewImage}
                  title="PDF Voucher"
                  className="w-full h-[60vh] rounded-lg bg-white"
                />
              ) : (
                <img
                  src={selectedPreviewImage}
                  alt="Voucher liquidacion"
                  className="max-w-full max-h-[65vh] object-contain rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
