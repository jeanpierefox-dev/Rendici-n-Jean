import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { fileToBase64 } from '../lib/utils';
import { Upload, Building2, Save } from 'lucide-react';

export function Settings() {
  const { settings, updateSettings } = useAppStore();
  
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [companyLogo, setCompanyLogo] = useState(settings.companyLogo);
  const [saved, setSaved] = useState(false);

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const base64 = await fileToBase64(file);
        setCompanyLogo(base64);
      } catch (err) {
        console.error('Error reading logo file', err);
      }
    }
  };

  const handleSave = () => {
    updateSettings({ companyName, companyLogo });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-800">Configuración de la Empresa</h2>
        <p className="text-sm text-gray-500 mt-1">Personaliza la identidad corporativa para los reportes.</p>
      </div>

      <div className="bg-white border border-gray-200 shadow-sm rounded-xl overflow-hidden">
        <div className="p-8 space-y-8">
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la Empresa</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Building2 className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="pl-10 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Ej. Mi Empresa S.A.C."
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Logo Corporativo (Reportes y Menú)</label>
            <div className="flex items-start space-x-6">
              <div className="flex-shrink-0">
                {companyLogo ? (
                  <div className="w-32 h-32 rounded-lg border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center p-2">
                    <img src={companyLogo} alt="Logo" className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex items-center justify-center">
                    <Building2 className="w-10 h-10 text-gray-300" />
                  </div>
                )}
              </div>
              
              <div className="flex-1">
                <div className="flex flex-col">
                  <label htmlFor="logo-upload" className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                    <Upload className="w-4 h-4 mr-2" />
                    Cambiar Logo
                  </label>
                  <input
                    id="logo-upload"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={handleLogoChange}
                  />
                  <p className="mt-2 text-xs text-gray-500">
                    Recomendado: Imagen horizontal, fondo transparente (PNG), max 2MB.
                  </p>
                  
                  {companyLogo && (
                    <button 
                      onClick={() => setCompanyLogo(undefined)}
                      className="mt-3 text-sm text-red-600 font-medium text-left hover:underline w-fit"
                    >
                      Remover logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
          
        </div>
        
        <div className="px-8 py-5 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
          <div>
            {saved && (
              <span className="text-sm text-green-600 font-medium flex items-center">
                <Save className="w-4 h-4 mr-1.5" /> Cambios guardados
              </span>
            )}
          </div>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-sm"
          >
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  );
}
