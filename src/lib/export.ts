import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Rendicion, AppSettings, Ingreso, Comprobante } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatLocalDate } from './utils';
import { doc as firestoreDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAppStore } from './store';

export const formatPhotoDataUrl = (rawPhoto: string): string => {
  if (!rawPhoto) return '';
  let trimmed = rawPhoto.trim();
  
  if (trimmed.startsWith('data:')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx !== -1) {
      const base64Data = trimmed.slice(commaIdx + 1).trim();
      if (base64Data.startsWith('JVBERi0')) {
        return 'data:application/pdf;base64,' + base64Data;
      }
      if (base64Data.startsWith('iVBORw0KGg')) {
        return 'data:image/png;base64,' + base64Data;
      }
      if (base64Data.startsWith('UklGR')) {
        return 'data:image/webp;base64,' + base64Data;
      }
      if (base64Data.startsWith('/9j/')) {
        return 'data:image/jpeg;base64,' + base64Data;
      }
    }
    return trimmed;
  }
  
  if (trimmed.startsWith('iVBORw0KGg')) {
    return 'data:image/png;base64,' + trimmed;
  }
  if (trimmed.startsWith('JVBERi0')) {
    return 'data:application/pdf;base64,' + trimmed;
  }
  if (trimmed.startsWith('UklGR')) {
    return 'data:image/webp;base64,' + trimmed;
  }
  return 'data:image/jpeg;base64,' + trimmed;
};

const photoCache = new Map<string, string>();

export const fetchPhotoForComprobante = async (c: any, rendicionId?: string): Promise<string | undefined> => {
  if (c.receiptPhoto) {
    const formatted = formatPhotoDataUrl(c.receiptPhoto);
    if (c.id) photoCache.set(c.id, formatted);
    return formatted;
  }

  const primaryKey = (c.id || c.documentNumber || '').trim().replace(/\//g, '_');
  const scopedKey = rendicionId && (c.id || c.documentNumber) ? `${rendicionId}_${c.id || c.documentNumber}`.trim().replace(/\//g, '_') : '';

  if (primaryKey && photoCache.has(primaryKey)) {
    return photoCache.get(primaryKey);
  }
  if (scopedKey && photoCache.has(scopedKey)) {
    return photoCache.get(scopedKey);
  }

  const keysToTry = Array.from(new Set([scopedKey, primaryKey].filter(Boolean)));

  for (const key of keysToTry) {
    try {
      const photoDoc = await getDoc(firestoreDoc(db, 'receipt_photos', key));
      if (photoDoc.exists() && photoDoc.data()?.photo) {
        const formatted = formatPhotoDataUrl(photoDoc.data().photo);
        if (primaryKey) photoCache.set(primaryKey, formatted);
        if (scopedKey) photoCache.set(scopedKey, formatted);
        return formatted;
      }
    } catch (err: any) {
      console.warn(`Could not fetch receipt photo for key ${key}:`, err?.message || err);
      // If Firestore quota is exhausted, log clearly and break loop to avoid sending more requests
      if (err?.code === 'resource-exhausted' || String(err).includes('quota')) {
        console.error("Firestore quota exceeded during receipt photo fetch.");
        break;
      }
    }
  }

  return undefined;
};

export const exportToPDF = async (rendiciones: Rendicion[], settings: AppSettings) => {
  if (!rendiciones || rendiciones.length === 0) {
    alert("No hay rendiciones para exportar.");
    return;
  }

  // Pre-load missing photos for all rendiciones
  const updatedRendiciones = await Promise.all(rendiciones.map(async (r) => {
    const updatedComprobantes = await Promise.all(r.comprobantes.map(async (c) => {
      const photo = await fetchPhotoForComprobante(c, r.id);
      return { ...c, receiptPhoto: photo, hasPhoto: !!photo || c.hasPhoto };
    }));
    return { ...r, comprobantes: updatedComprobantes };
  }));

  if (updatedRendiciones.length === 1) {
    await exportSingleRendicionPDF(updatedRendiciones[0], settings, false);
    return;
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Calculations for consolidated summary
  let totalGeneral = 0;
  let totalAdelanto = 0;
  let totalComprobantes = 0;

  updatedRendiciones.forEach(r => {
    totalAdelanto += (r.advanceAmount || 0);
    r.comprobantes.forEach(c => {
      totalGeneral += c.amount;
      totalComprobantes++;
    });
  });

  const saldoNeto = Math.abs(totalAdelanto - totalGeneral);
  const esDevolucion = totalAdelanto >= totalGeneral;

  // Header Logo
  if (settings.companyLogo) {
    try {
      doc.addImage(settings.companyLogo, 'PNG', 14, 10, 38, 18);
    } catch (e) {
      console.warn("Could not add logo to PDF");
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(30, 58, 138);
  doc.text('REPORTE CONSOLIDADO DE RENDICIONES Y GASTOS', 14, 34);
  
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(107, 114, 128);
  doc.text(`Empresa: ${(settings.companyName || 'Empresa').toUpperCase()}`, 14, 40);
  doc.text(`Fecha de emisión: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 45);

  // Executive Summary Card / Total Box
  doc.setFillColor(239, 246, 255); // Light blue tint
  doc.setDrawColor(191, 219, 254);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 49, pageWidth - 28, 26, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 58, 138);
  doc.text(`GASTO TOTAL CONSOLIDADO DEL MES / PERÍODO: S/ ${totalGeneral.toFixed(2)}`, 18, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 65, 81);
  doc.text(`Bloques de Rendición: ${updatedRendiciones.length}  |  Total Comprobantes: ${totalComprobantes}  |  Adelanto Total Recibido: S/ ${totalAdelanto.toFixed(2)}`, 18, 63);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(esDevolucion ? 22 : 180, esDevolucion ? 101 : 83, esDevolucion ? 52 : 9); // Emerald vs Amber
  doc.text(`Saldo Consolidado: S/ ${saldoNeto.toFixed(2)} (${esDevolucion ? 'Saldo a Devolver a la Empresa' : 'Saldo a Reembolsar al Colaborador'})`, 18, 70);

  let currentY = 82;

  // Render each block as a distinct framed box / card
  for (let bIdx = 0; bIdx < updatedRendiciones.length; bIdx++) {
    const r = updatedRendiciones[bIdx];
    const totalBloque = r.comprobantes.reduce((sum, c) => sum + c.amount, 0);

    // Check if enough vertical space exists on current page for block header + at least 3 table rows (~50mm)
    if (currentY + 50 > pageHeight - 15) {
      doc.addPage();
      currentY = 18;
    }

    // Block Card Header Bar (Dark Navy Fill)
    doc.setFillColor(30, 58, 138);
    doc.rect(14, currentY, pageWidth - 28, 7, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`BLOQUE N° ${bIdx + 1}: ${r.name.toUpperCase()}`, 18, currentY + 5);
    doc.text(`Colaborador: ${r.userName}`, pageWidth - 18, currentY + 5, { align: 'right' });

    currentY += 7;

    // Block Card Sub-Header Info Bar (Light Grey Fill)
    doc.setFillColor(243, 244, 246);
    doc.rect(14, currentY, pageWidth - 28, 6, 'F');
    doc.setDrawColor(229, 231, 235);
    doc.rect(14, currentY, pageWidth - 28, 6, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(55, 65, 81);
    doc.text(`Tipo / Centro: ${r.rendicionType || (r as any).costCenter || 'General'}  |  Estado: ${(r.status || 'Pendiente').toUpperCase()}  |  Adelanto: S/ ${(r.advanceAmount || 0).toFixed(2)}`, 18, currentY + 4.2);
    
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Bloque: S/ ${totalBloque.toFixed(2)}`, pageWidth - 18, currentY + 4.2, { align: 'right' });

    currentY += 6;

    // Comprobantes Table for this Block
    const tableColumn = ["Fecha", "Tipo Doc.", "N° Documento", "RUC / Razon Social", "Categoría", "Monto"];
    const tableRows = r.comprobantes.map(c => [
      formatLocalDate(c.date),
      c.type,
      c.documentNumber,
      `${c.ruc}${c.razonSocial ? ' - ' + c.razonSocial : ''}`,
      c.category || 'Otros',
      `S/ ${c.amount.toFixed(2)}`
    ]);

    if (tableRows.length === 0) {
      tableRows.push(["-", "Sin comprobantes registrados", "-", "-", "-", "S/ 0.00"]);
    }

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: currentY,
      margin: { left: 14, right: 14 },
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2, lineColor: [229, 231, 235] },
      headStyles: { fillColor: [75, 85, 99], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 26 },
        2: { cellWidth: 28 },
        3: { cellWidth: 58 },
        4: { cellWidth: 26 },
        5: { cellWidth: 22, halign: 'right', fontStyle: 'bold' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY || (currentY + 20);

    // Block Subtotal Footer Bar
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(209, 213, 219);
    doc.rect(14, currentY, pageWidth - 28, 6, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);
    doc.text(`SUBTOTAL BLOQUE "${r.name}": S/ ${totalBloque.toFixed(2)}`, pageWidth - 18, currentY + 4.2, { align: 'right' });

    const saldoBloque = Math.abs((r.advanceAmount || 0) - totalBloque);
    const esDevolucionBloque = (r.advanceAmount || 0) >= totalBloque;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(75, 85, 99);
    doc.text(`Saldo Bloque: S/ ${saldoBloque.toFixed(2)} (${esDevolucionBloque ? 'A devolver' : 'A reembolsar'})`, 18, currentY + 4.2);

    currentY += 12; // Spacing before next block
  }

  // Footer page numbers
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text(`Página ${i} de ${totalPages} - Reporte Consolidado de Gastos`, pageWidth / 2, pageHeight - 8, { align: 'center' });
  }

  doc.save(`Reporte_Resumen_Consolidado_Gastos.pdf`);
};

export const exportToExcel = (rendiciones: Rendicion[], settings: AppSettings) => {
  const data = rendiciones.flatMap(r => r.comprobantes.map(c => ({
    'ID Bloque': r.id.substring(0, 8),
    'Nombre Bloque': r.name,
    'Usuario': r.userName,
    'Tipo Documento': c.type,
    'Número Documento': c.documentNumber,
    'RUC': c.ruc,
    'Razón Social': c.razonSocial || '',
    'Categoría': c.category || 'Otros',
    'Observación': c.observation || '',
    'Fecha Documento': formatLocalDate(c.date),
    'Monto (S/)': c.amount,
    'Estado': r.status,
    'Fecha Registro': format(new Date(r.createdAt), 'dd/MM/yyyy HH:mm', { locale: es })
  })));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  
  XLSX.utils.book_append_sheet(workbook, worksheet, "Rendiciones");
  
  const wscols = [
    {wch: 10}, // ID Bloque
    {wch: 20}, // Nombre Bloque
    {wch: 20}, // Usuario
    {wch: 15}, // Tipo
    {wch: 20}, // Num
    {wch: 15}, // RUC
    {wch: 25}, // Razón Social
    {wch: 18}, // Categoría
    {wch: 25}, // Observación
    {wch: 15}, // Fecha
    {wch: 12}, // Monto
    {wch: 15}, // Estado
    {wch: 20}, // Registro
  ];
  worksheet['!cols'] = wscols;

  XLSX.writeFile(workbook, "Rendiciones_Jean_Barsa.xlsx");
};

const getImageDimensions = (base64Str: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve({ width: 0, height: 0 });
      return;
    }
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      resolve({ width: 0, height: 0 });
    };
    img.src = base64Str;
  });
};

const ensureCanvasDataUrl = (base64Str: string): Promise<{ dataUrl: string; format: 'JPEG' | 'PNG'; width: number; height: number }> => {
  return new Promise((resolve) => {
    if (!base64Str) {
      resolve({ dataUrl: '', format: 'JPEG', width: 800, height: 1000 });
      return;
    }
    let src = formatPhotoDataUrl(base64Str);

    if (src.startsWith('data:application/pdf')) {
      resolve({ dataUrl: src, format: 'JPEG', width: 800, height: 1000 });
      return;
    }

    const img = new Image();
    if (src.startsWith('http://') || src.startsWith('https://')) {
      img.crossOrigin = 'Anonymous';
    }
    img.onload = () => {
      try {
        const w = img.naturalWidth || img.width || 800;
        const h = img.naturalHeight || img.height || 1000;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0);
          const converted = canvas.toDataURL('image/jpeg', 0.95);
          resolve({
            dataUrl: converted,
            format: 'JPEG',
            width: w,
            height: h
          });
          return;
        }
      } catch (err) {
        console.warn("Canvas conversion failed, using original src", err);
      }
      resolve({
        dataUrl: src,
        format: src.includes('png') || src.includes('PNG') ? 'PNG' : 'JPEG',
        width: img.naturalWidth || 800,
        height: img.naturalHeight || 1000
      });
    };
    img.onerror = () => {
      resolve({
        dataUrl: src,
        format: src.includes('png') || src.includes('PNG') ? 'PNG' : 'JPEG',
        width: 800,
        height: 1000
      });
    };
    img.src = src;
  });
};

export const exportSingleRendicionPDF = async (storeRendicion: Rendicion, settings: AppSettings, conHojaFedatada: boolean = false) => {
  // Pre-load any missing receipt photos from Firestore 'receipt_photos' collection in parallel
  const updatedComprobantes = await Promise.all(storeRendicion.comprobantes.map(async (c) => {
    const photo = await fetchPhotoForComprobante(c, storeRendicion.id);
    return { ...c, receiptPhoto: photo, hasPhoto: !!photo || c.hasPhoto };
  }));

  // Update store ONCE in one single batch!
  const hasNewPhotos = updatedComprobantes.some((c, i) => c.receiptPhoto !== storeRendicion.comprobantes[i].receiptPhoto);
  if (hasNewPhotos) {
    useAppStore.setState(state => ({
      rendiciones: state.rendiciones.map(r => r.id === storeRendicion.id ? {
        ...r,
        comprobantes: updatedComprobantes
      } : r)
    }));
  }

  // Pre-process all photos via Canvas to guarantee valid JPEG data URLs and exact dimensions
  const processedComprobantes = await Promise.all(updatedComprobantes.map(async (c) => {
    if (c.receiptPhoto) {
      const processed = await ensureCanvasDataUrl(c.receiptPhoto);
      return {
        ...c,
        processedPhoto: processed.dataUrl,
        photoFormat: processed.format,
        photoWidth: processed.width,
        photoHeight: processed.height
      };
    }
    return c;
  }));

  // Create a safe copy of the rendicion object to avoid mutating frozen store objects
  const rendicion: Rendicion = {
    ...storeRendicion,
    comprobantes: processedComprobantes
  };

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Pre-load all attached image dimensions asynchronously
  const imageDimensions: { [key: string]: { width: number; height: number } } = {};
  for (const c of rendicion.comprobantes) {
    if (c.receiptPhoto) {
      try {
        const key = c.id || c.documentNumber;
        const dims = await getImageDimensions(c.receiptPhoto);
        imageDimensions[key] = dims;
      } catch (err) {
        console.error("Could not load image dimensions", err);
      }
    }
  }
  
  // Helpers
  const totalGastado = rendicion.comprobantes.reduce((sum, c) => sum + c.amount, 0);
  
  // Backward compatibility check for ingresos
  const baseIngresosList: Ingreso[] = rendicion.ingresos && rendicion.ingresos.length > 0 
    ? rendicion.ingresos 
    : (rendicion.advanceAmount > 0 
      ? [{
          id: 'initial',
          amount: rendicion.advanceAmount,
          date: rendicion.advanceDate || rendicion.createdAt.split('T')[0],
          reference: 'Monto Inicial Desembolsado'
        }] 
      : []);

  const prevBal = rendicion.previousBalance || 0;
  const ingresosList = [...baseIngresosList];
  if (prevBal !== 0) {
    ingresosList.unshift({
      id: 'prev_balance',
      amount: prevBal,
      date: rendicion.createdAt.split('T')[0],
      reference: `Saldo Arrastrado Anterior ${rendicion.previousBalanceSourceName ? `(${rendicion.previousBalanceSourceName})` : ''}`
    });
  }
      
  const totalRecibido = ingresosList.reduce((sum, ing) => sum + ing.amount, 0);
  const balance = totalRecibido - totalGastado;
  const fechaEmision = format(new Date(), 'dd/MM/yyyy HH:mm');
  const fechaRendicion = format(new Date(rendicion.createdAt), 'dd/MM/yyyy');

  // Colors
  const primaryColor = [30, 58, 138]; // #1e3a8a
  const secondaryColor = [79, 70, 229]; // #4f46e5
  const textColor = [31, 41, 55]; // #1f2937
  const grayColor = [107, 114, 128]; // #6b7280

  // PAGE 1: LIQUIDACIÓN DE GASTOS
  // Draw header background strip
  doc.setFillColor(243, 244, 246);
  doc.rect(14, 10, pageWidth - 28, 25, 'F');

  // Add Logo or Text Logo
  let logoOffset = 18;
  if (settings.companyLogo) {
    try {
      doc.addImage(settings.companyLogo, 'PNG', 18, 12, 35, 20);
      logoOffset = 58;
    } catch (e) {
      console.warn("Could not add logo to PDF, fallback to text logo");
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.setTextColor(30, 58, 138);
      doc.text(settings.companyName.toUpperCase(), 18, 23);
      logoOffset = 18 + doc.getTextWidth(settings.companyName) + 10;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text(settings.companyName.toUpperCase() || 'EMPRESA CORPORATIVA', 18, 25);
    logoOffset = 75;
  }

  // Right side of Header Banner
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(31, 41, 55);
  doc.text('REPORTE DE LIQUIDACIÓN Y RENDICIÓN', pageWidth - 18, 20, { align: 'right' });
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`ID Bloque: #${rendicion.id.substring(0, 8).toUpperCase()}`, pageWidth - 18, 25, { align: 'right' });
  
  // Render Status Badge
  const statusStr = rendicion.status.toUpperCase();
  let badgeColor = [245, 158, 11]; // amber
  let badgeText = [146, 64, 14];
  if (statusStr === 'APROBADO') {
    badgeColor = [16, 185, 129]; // green
    badgeText = [6, 95, 70];
  } else if (statusStr === 'RECHAZADO') {
    badgeColor = [239, 68, 68]; // red
    badgeText = [153, 27, 27];
  }
  
  doc.setFillColor(badgeColor[0], badgeColor[1], badgeColor[2]);
  doc.rect(pageWidth - 45, 28, 27, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(statusStr, pageWidth - 31.5, 31.5, { align: 'center' });

  // Draw separator line
  doc.setDrawColor(209, 213, 219);
  doc.setLineWidth(0.5);
  doc.line(14, 40, pageWidth - 14, 40);

  // SECTION: GENERAL INFORMATION GRID
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('INFORMACIÓN DE LA LIQUIDACIÓN', 14, 46);

  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(255, 255, 255);
  doc.rect(14, 49, pageWidth - 28, 30, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  
  doc.text('COLABORADOR:', 18, 55);
  doc.text('EMPRESA:', 18, 61);
  doc.text('BLOQUE:', 18, 67);
  doc.text('TIPO RENDICIÓN:', 18, 73);

  doc.text('FECHA REGISTRO:', 110, 55);
  doc.text('FECHA LIQUIDACIÓN:', 110, 61);
  doc.text('ESTADO ACTUAL:', 110, 67);

  doc.setFont('helvetica', 'medium');
  doc.setTextColor(31, 41, 55);
  doc.text(rendicion.userName.toUpperCase(), 48, 55);
  doc.text(settings.companyName.toUpperCase(), 48, 61);
  doc.text(rendicion.name, 48, 67);
  doc.text((rendicion.rendicionType || 'Logístico').toUpperCase(), 48, 73);

  doc.text(fechaRendicion, 145, 55);
  doc.text(fechaEmision, 145, 61);
  doc.setFont('helvetica', 'bold');
  if (statusStr === 'APROBADO') doc.setTextColor(6, 95, 70);
  else if (statusStr === 'RECHAZADO') doc.setTextColor(153, 27, 27);
  else doc.setTextColor(146, 64, 14);
  doc.text(statusStr, 145, 67);

  // SECTION: FINANCIAL SUMMARY CARD
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('RESUMEN DE CUENTAS (CONSOLIDADO)', 14, 87);

  // Background for box
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.rect(14, 90, pageWidth - 28, 18, 'FD');

  // Values in card
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text('(+) TOTAL RECIBIDO', 20, 97);
  doc.text('(-) GASTOS COMPROBADOS', 75, 97);
  doc.text('(=) SALDO RESULTANTE', 135, 97);

  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(`S/ ${totalRecibido.toFixed(2)}`, 20, 103);
  doc.text(`S/ ${totalGastado.toFixed(2)}`, 75, 103);

  // Style Balance based on positive/negative
  if (balance > 0) {
    doc.setTextColor(180, 83, 9); // Amber
    doc.setFont('helvetica', 'bold');
    doc.text(`S/ ${Math.abs(balance).toFixed(2)}`, 135, 103);
    doc.setFontSize(7);
    doc.text('(A DEVOLVER A LA EMPRESA)', 135, 106);
  } else if (balance < 0) {
    doc.setTextColor(29, 78, 216); // Blue
    doc.setFont('helvetica', 'bold');
    doc.text(`S/ ${Math.abs(balance).toFixed(2)}`, 135, 103);
    doc.setFontSize(7);
    doc.text('(A REEMBOLSAR AL COLABORADOR)', 135, 106);
  } else {
    doc.setTextColor(4, 120, 87); // Green
    doc.setFont('helvetica', 'bold');
    doc.text('S/ 0.00', 135, 103);
    doc.setFontSize(7);
    doc.text('(CUENTAS SALDADAS)', 135, 106);
  }

  // TABLES: INGRESOS & EGRESOS
  let currentY = 114;

  // Render Ingresos Table if any exist
  if (ingresosList.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text('DETALLE DE INGRESOS (DESEMBOLSOS RECIBIDOS)', 14, currentY);
    
    const ingCols = ['Fecha', 'Concepto / Referencia de Desembolso', 'Monto'];
    const ingRows = ingresosList.map(ing => [
      format(new Date(ing.date + 'T00:00:00'), 'dd/MM/yyyy'),
      ing.reference || 'Monto de adelanto general',
      `S/ ${ing.amount.toFixed(2)}`
    ]);

    autoTable(doc, {
      head: [ingCols],
      body: ingRows,
      startY: currentY + 3,
      theme: 'striped',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [49, 46, 129], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Render Comprobantes Gastos Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 58, 138);
  doc.text('DETALLE DE EGRESOS (COMPROBANTES REPORTADOS)', 14, currentY);

  const egresCols = ['Fecha Doc.', 'Tipo', 'N° Comprobante', 'RUC Emisor', 'Categoría / Obs.', 'Monto'];
  const egresRows = rendicion.comprobantes.map(c => [
    formatLocalDate(c.date),
    c.type,
    c.documentNumber,
    c.razonSocial ? `${c.ruc}\n${c.razonSocial}` : c.ruc,
    c.observation ? `${c.category || 'Otros'} (${c.observation})` : (c.category || 'Otros'),
    `S/ ${c.amount.toFixed(2)}`
  ]);

  autoTable(doc, {
    head: [egresCols],
    body: egresRows,
    startY: currentY + 3,
    theme: 'striped',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 15 },
      2: { cellWidth: 25 },
      3: { cellWidth: 35 },
      4: { cellWidth: 'auto' },
      5: { cellWidth: 20, halign: 'right', fontStyle: 'bold' }
    }
  });

  let finalY = (doc as any).lastAutoTable.finalY + 8;

  // LIQUIDATION / CONCILIATION DETAILS BOX
  if (rendicion.liquidacion) {
    if (finalY > 210) {
      doc.addPage();
      finalY = 20;
    }

    const liq = rendicion.liquidacion;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 58, 138);
    doc.text('ESTADO DE LIQUIDACIÓN Y CONCILIACIÓN FINAL', 14, finalY);

    doc.setFillColor(243, 244, 246);
    doc.setDrawColor(209, 213, 219);
    doc.rect(14, finalY + 3, pageWidth - 28, 22, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(31, 41, 55);

    const liqStatusStr = liq.status === 'Liquidado' ? 'LIQUIDADO A S/ 0.00' : 'TRASPASADO A OTRA RENDICIÓN';
    const liqTypeStr = liq.type === 'Favor Empresa' 
      ? 'Devolución de excedente a Empresa (Uñero)' 
      : 'Reembolso pagado al Trabajador (Voucher)';

    doc.text(`Estado Final: ${liqStatusStr}`, 18, finalY + 8);
    doc.text(`Modalidad: ${liqTypeStr}`, 18, finalY + 13);
    doc.text(`N° Ref / Obs: ${liq.voucherObs || 'N/A'}`, 18, finalY + 18);

    doc.text(`Monto Conciliado: S/ ${(liq.monto || 0).toFixed(2)}`, 110, finalY + 8);
    doc.text(`Fecha Liquidación: ${liq.fecha ? format(new Date(liq.fecha + 'T00:00:00'), 'dd/MM/yyyy') : 'N/A'}`, 110, finalY + 13);
    if (liq.carriedOverToName) {
      doc.text(`Destino Traspaso: ${liq.carriedOverToName}`, 110, finalY + 18);
    }

    finalY += 30;
  }

  // Prevent overlap if signature goes off page
  if (finalY > 230) {
    doc.addPage();
    finalY = 20;
  }

  // SIGNATURES AREA AT THE BOTTOM
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);

  // Employee signature block (Left)
  const lineY = finalY + 28;
  doc.line(20, lineY, 85, lineY);
  doc.text('FIRMA DEL COLABORADOR', 20, lineY + 4);
  doc.setFont('helvetica', 'normal');
  doc.text(`Nombre: ${rendicion.userName}`, 20, lineY + 8);
  doc.text(`Área: Operaciones`, 20, lineY + 12);

  // Embed the actual base64 signature if uploaded
  if (rendicion.signature) {
    try {
      doc.addImage(rendicion.signature, 'PNG', 32, finalY, 40, 25);
    } catch (err) {
      console.warn("Could not draw signature image in PDF", err);
    }
  }

  // Admin signature block (Right)
  doc.setFont('helvetica', 'bold');
  doc.line(pageWidth - 85, lineY, pageWidth - 20, lineY);
  doc.text('FIRMA / APROBACIÓN DE CONTABILIDAD', pageWidth - 85, lineY + 4);
  doc.setFont('helvetica', 'normal');
  doc.text('Área: Administración y Finanzas', pageWidth - 85, lineY + 8);
  doc.text(`Fecha de Control: ${fechaEmision.split(' ')[0]}`, pageWidth - 85, lineY + 12);

  // PAGE 2+: ATTACHED RECEIPT IMAGES (ANNEXES)
  const comprobantesAnexos = rendicion.comprobantes;
  
  if (conHojaFedatada && comprobantesAnexos.length > 0) {
    for (let idx = 0; idx < comprobantesAnexos.length; idx++) {
      const c = comprobantesAnexos[idx];
      doc.addPage();
      
      // Page elegant frame
      doc.setDrawColor(30, 58, 138);
      doc.setLineWidth(0.5);
      doc.rect(8, 8, pageWidth - 16, doc.internal.pageSize.getHeight() - 16);
      
      doc.setDrawColor(229, 231, 235);
      doc.setLineWidth(0.3);
      doc.rect(10, 10, pageWidth - 20, doc.internal.pageSize.getHeight() - 20);
      
      // Header for Annex
      doc.setFillColor(243, 244, 246);
      doc.rect(12, 12, pageWidth - 24, 22, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 58, 138);
      doc.text(`HOJA FEDATADA - ANEXO N° ${idx + 1}`, 16, 20);
      
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      doc.text(`Bloque: ${rendicion.name} | Colaborador: ${rendicion.userName}`, 16, 26);
      
      // Invoice summary on the right of the header
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(31, 41, 55);
      doc.text(`${c.type} N° ${c.documentNumber}`, pageWidth - 16, 19, { align: 'right' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(75, 85, 99);
      doc.text(`RUC: ${c.ruc}  |  Fecha: ${formatLocalDate(c.date)}  |  Monto: S/ ${c.amount.toFixed(2)}`, pageWidth - 16, 25, { align: 'right' });
      
      // Draw a line separator
      doc.setDrawColor(209, 213, 219);
      doc.line(12, 34, pageWidth - 12, 34);

      // --- LEFT SIDE: PHYSICAL RECEIPT PASTING BOX ---
      // Width for pasting: 76 mm, Height: 240 mm
      const boxX = 12;
      const boxY = 38;
      const boxW = 74;
      const boxH = 242;

      doc.setDrawColor(156, 163, 175); // light gray border
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([2, 2], 0); // dashed line
      doc.setFillColor(253, 253, 253); // extremely light gray background for pasting
      doc.rect(boxX, boxY, boxW, boxH, 'FD');
      doc.setLineDashPattern([], 0); // reset to solid lines

      const boxCenterX = boxX + (boxW / 2);
      const boxCenterY = boxY + (boxH / 2);

      // Paste text labels inside the box
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(156, 163, 175); // gray-400
      doc.text('PEGAR COMPROBANTE', boxCenterX, boxCenterY - 15, { align: 'center' });
      doc.text('ORIGINAL AQUÍ', boxCenterX, boxCenterY - 9, { align: 'center' });

      // Visual helper (dotted icon shape of a typical receipt)
      doc.setLineWidth(0.3);
      doc.setDrawColor(209, 213, 219);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(boxCenterX - 16, boxCenterY + 4, 32, 22);
      doc.setLineDashPattern([], 0);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(156, 163, 175);
      doc.text('Original Físico', boxCenterX, boxCenterY + 16, { align: 'center' });

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(156, 163, 175);
      doc.text('(Sujete firmemente con cinta o goma)', boxCenterX, boxCenterY + 40, { align: 'center' });
      doc.text('Ancho máx: 70 mm', boxCenterX, boxCenterY + 45, { align: 'center' });

      // --- RIGHT SIDE: COMPLETE ATTACHED DIGITAL IMAGE ---
      // Expanded width for image: 108 mm, Height: 242 mm for optimal legibility
      const imgMaxW = 108;
      const imgMaxH = 242;
      const imgColX = 90;
      const imgColY = 38;

      // Add receipt photo image centered in the space
      let photoSrc = (c as any).processedPhoto || c.receiptPhoto;
      if (photoSrc && !photoSrc.startsWith('data:')) {
        photoSrc = 'data:image/jpeg;base64,' + photoSrc;
      }

      if (photoSrc) {
        if (photoSrc.startsWith('data:application/pdf')) {
          doc.setFillColor(243, 244, 246);
          doc.rect(imgColX, imgColY, imgMaxW, 100, 'F');
          doc.setDrawColor(209, 213, 219);
          doc.rect(imgColX, imgColY, imgMaxW, 100);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(30, 58, 138);
          doc.text("DOCUMENTO ADJUNTO EN PDF", imgColX + (imgMaxW / 2), imgColY + 30, { align: 'center' });

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(75, 85, 99);
          doc.text(`Documento: ${c.type} N° ${c.documentNumber}`, imgColX + (imgMaxW / 2), imgColY + 45, { align: 'center' });
          doc.text(`RUC: ${c.ruc}`, imgColX + (imgMaxW / 2), imgColY + 53, { align: 'center' });
          doc.text(`Monto: S/ ${c.amount.toFixed(2)}`, imgColX + (imgMaxW / 2), imgColY + 61, { align: 'center' });

          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          doc.setTextColor(107, 114, 128);
          doc.text("El archivo PDF original se encuentra", imgColX + (imgMaxW / 2), imgColY + 75, { align: 'center' });
          doc.text("adjunto y guardado en la plataforma.", imgColX + (imgMaxW / 2), imgColY + 81, { align: 'center' });
        } else {
          try {
            let origW = (c as any).photoWidth || 0;
            let origH = (c as any).photoHeight || 0;

            if (!origW || !origH) {
              const key = c.id || c.documentNumber;
              const dims = imageDimensions[key];
              if (dims && dims.width > 0 && dims.height > 0) {
                origW = dims.width;
                origH = dims.height;
              }
            }

            // Safe fallback aspect ratio (800x1000 = 0.8) to prevent stretching if unmeasured
            if (!origW || !origH) {
              origW = 800;
              origH = 1000;
            }

            let finalW = imgMaxW;
            let finalH = imgMaxH;

            const ratio = origW / origH;
            const containerRatio = imgMaxW / imgMaxH;
            
            if (ratio > containerRatio) {
              finalW = imgMaxW;
              finalH = imgMaxW / ratio;
            } else {
              finalH = imgMaxH;
              finalW = imgMaxH * ratio;
            }

            const imgX = imgColX + (imgMaxW - finalW) / 2;
            // Position near the top of column with slight padding so receipt is prominent
            const imgY = imgColY + Math.min(8, Math.max(0, (imgMaxH - finalH) / 2));
            
            let pSrc = (c as any).processedPhoto || photoSrc;
            pSrc = formatPhotoDataUrl(pSrc);

            let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG';
            if (pSrc.startsWith('data:image/png')) {
              fmt = 'PNG';
            } else if (pSrc.startsWith('data:image/webp')) {
              fmt = 'WEBP';
            }

            doc.addImage(pSrc, fmt, imgX, imgY, finalW, finalH, undefined, 'FAST');

            doc.setDrawColor(209, 213, 219);
            doc.setLineWidth(0.3);
            doc.rect(imgX, imgY, finalW, finalH);
          } catch (imgError) {
            console.error("Could not render receipt image in PDF", imgError);
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(220, 38, 38);
            doc.text("No se pudo renderizar la copia digital.", imgColX + (imgMaxW / 2), 120, { align: 'center' });
            doc.text("La imagen original se conserva en el sistema.", imgColX + (imgMaxW / 2), 125, { align: 'center' });
          }
        }
      } else {
        doc.setFillColor(249, 250, 251);
        doc.rect(imgColX, imgColY, imgMaxW, 100, 'F');
        doc.setDrawColor(229, 231, 235);
        doc.rect(imgColX, imgColY, imgMaxW, 100);

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.5);
        doc.setTextColor(156, 163, 175);
        doc.text("Sin copia digital adjunta", imgColX + (imgMaxW / 2), imgColY + 48, { align: 'center' });
        doc.text("(Utilice el recuadro izquierdo para pegar el físico)", imgColX + (imgMaxW / 2), imgColY + 54, { align: 'center' });
      }
    }
  }

  // Save the document named specifically based on user name & block name
  const sanitizedBlockName = rendicion.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Rendicion_${sanitizedBlockName}_${rendicion.userName.replace(' ', '_')}.pdf`);
};

export const exportRendicionReceiptsPDF = async (storeRendicion: Rendicion | Rendicion[], settings: AppSettings) => {
  const rendicionesList = Array.isArray(storeRendicion) ? storeRendicion : [storeRendicion];

  if (rendicionesList.length === 0) {
    throw new Error("No hay rendiciones para exportar recibos.");
  }

  // Pre-load any missing receipt photos from Firestore 'receipt_photos' collection in parallel
  const updatedRendiciones = await Promise.all(rendicionesList.map(async (r) => {
    const updatedComprobantes = await Promise.all(r.comprobantes.map(async (c) => {
      const photo = await fetchPhotoForComprobante(c, r.id);
      return { ...c, receiptPhoto: photo, hasPhoto: !!photo || c.hasPhoto };
    }));
    return { ...r, comprobantes: updatedComprobantes };
  }));

  // Update store ONCE in one single batch!
  useAppStore.setState(state => ({
    rendiciones: state.rendiciones.map(r => {
      const updated = updatedRendiciones.find(ur => ur.id === r.id);
      return updated ? updated : r;
    })
  }));

  // Collect all processed items with parent rendicion context
  const itemsToRender: { rendicion: Rendicion; c: Comprobante }[] = [];

  for (const r of updatedRendiciones) {
    const processedComprobantes = await Promise.all(r.comprobantes.map(async (c) => {
      if (c.receiptPhoto) {
        const processed = await ensureCanvasDataUrl(c.receiptPhoto);
        return {
          ...c,
          processedPhoto: processed.dataUrl,
          photoFormat: processed.format,
          photoWidth: processed.width,
          photoHeight: processed.height
        };
      }
      return c;
    }));

    for (const c of processedComprobantes) {
      itemsToRender.push({ rendicion: r, c });
    }
  }

  if (itemsToRender.length === 0) {
    throw new Error("No hay comprobantes registrados en la(s) rendición(es) seleccionada(s).");
  }

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();

  // Draw receipts as Hoja Fedatada
  for (let idx = 0; idx < itemsToRender.length; idx++) {
    const { rendicion, c } = itemsToRender[idx];
    if (idx > 0) {
      doc.addPage();
    }
    
    // Page elegant frame
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.rect(8, 8, pageWidth - 16, doc.internal.pageSize.getHeight() - 16);
    
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.rect(10, 10, pageWidth - 20, doc.internal.pageSize.getHeight() - 20);
    
    // Header for Annex
    doc.setFillColor(243, 244, 246);
    doc.rect(12, 12, pageWidth - 24, 22, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text(`HOJA FEDATADA - ANEXO N° ${idx + 1}`, 16, 20);
    
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text(`Bloque: ${rendicion.name} | Colaborador: ${rendicion.userName}`, 16, 26);
    
    // Invoice summary on the right of the header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(31, 41, 55);
    doc.text(`${c.type} N° ${c.documentNumber}`, pageWidth - 16, 19, { align: 'right' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(75, 85, 99);
    doc.text(`RUC: ${c.ruc}  |  Fecha: ${formatLocalDate(c.date)}  |  Monto: S/ ${c.amount.toFixed(2)}`, pageWidth - 16, 25, { align: 'right' });
    
    // Draw a line separator
    doc.setDrawColor(209, 213, 219);
    doc.line(12, 34, pageWidth - 12, 34);

    // --- LEFT SIDE: PHYSICAL RECEIPT PASTING BOX ---
    const boxX = 12;
    const boxY = 38;
    const boxW = 74;
    const boxH = 242;

    doc.setDrawColor(156, 163, 175); // light gray border
    doc.setLineWidth(0.3);
    doc.setLineDashPattern([2, 2], 0); // dashed line
    doc.setFillColor(253, 253, 253); // extremely light gray background for pasting
    doc.rect(boxX, boxY, boxW, boxH, 'FD');
    doc.setLineDashPattern([], 0); // reset to solid lines

    const boxCenterX = boxX + (boxW / 2);
    const boxCenterY = boxY + (boxH / 2);

    // Paste text labels inside the box
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text('PEGAR COMPROBANTE', boxCenterX, boxCenterY - 15, { align: 'center' });
    doc.text('ORIGINAL AQUÍ', boxCenterX, boxCenterY - 9, { align: 'center' });

    // Visual helper
    doc.setLineWidth(0.3);
    doc.setDrawColor(209, 213, 219);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(boxCenterX - 16, boxCenterY + 4, 32, 22);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Original Físico', boxCenterX, boxCenterY + 16, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text('(Sujete firmemente con cinta o goma)', boxCenterX, boxCenterY + 40, { align: 'center' });
    doc.text('Ancho máx: 70 mm', boxCenterX, boxCenterY + 45, { align: 'center' });

    // --- RIGHT SIDE: COMPLETE ATTACHED DIGITAL IMAGE OR PDF ---
    const imgMaxW = 108;
    const imgMaxH = 242;
    const imgColX = 90;
    const imgColY = 38;

    let photoSrc = (c as any).processedPhoto || c.receiptPhoto;
    if (photoSrc && !photoSrc.startsWith('data:')) {
      photoSrc = 'data:image/jpeg;base64,' + photoSrc;
    }

    if (photoSrc) {
      if (photoSrc.startsWith('data:application/pdf')) {
        // PDF attachment box rendering
        doc.setFillColor(243, 244, 246);
        doc.rect(imgColX, imgColY, imgMaxW, 100, 'F');
        doc.setDrawColor(209, 213, 219);
        doc.rect(imgColX, imgColY, imgMaxW, 100);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(30, 58, 138);
        doc.text("DOCUMENTO ADJUNTO EN PDF", imgColX + (imgMaxW / 2), imgColY + 30, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(75, 85, 99);
        doc.text(`Documento: ${c.type} N° ${c.documentNumber}`, imgColX + (imgMaxW / 2), imgColY + 45, { align: 'center' });
        doc.text(`RUC: ${c.ruc}`, imgColX + (imgMaxW / 2), imgColY + 53, { align: 'center' });
        doc.text(`Monto: S/ ${c.amount.toFixed(2)}`, imgColX + (imgMaxW / 2), imgColY + 61, { align: 'center' });

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(107, 114, 128);
        doc.text("El archivo PDF original se encuentra", imgColX + (imgMaxW / 2), imgColY + 75, { align: 'center' });
        doc.text("adjunto y guardado en la plataforma.", imgColX + (imgMaxW / 2), imgColY + 81, { align: 'center' });
      } else {
        try {
          let origW = (c as any).photoWidth || 0;
          let origH = (c as any).photoHeight || 0;

          if (!origW || !origH) {
            origW = 800;
            origH = 1000;
          }

          let finalW = imgMaxW;
          let finalH = imgMaxH;

          const ratio = origW / origH;
          const containerRatio = imgMaxW / imgMaxH;
          
          if (ratio > containerRatio) {
            finalW = imgMaxW;
            finalH = imgMaxW / ratio;
          } else {
            finalH = imgMaxH;
            finalW = imgMaxH * ratio;
          }

          const imgX = imgColX + (imgMaxW - finalW) / 2;
          const imgY = imgColY + Math.min(8, Math.max(0, (imgMaxH - finalH) / 2));
          
          let pSrc = (c as any).processedPhoto || photoSrc;
          pSrc = formatPhotoDataUrl(pSrc);

          let fmt: 'JPEG' | 'PNG' | 'WEBP' = 'JPEG';
          if (pSrc.startsWith('data:image/png')) {
            fmt = 'PNG';
          } else if (pSrc.startsWith('data:image/webp')) {
            fmt = 'WEBP';
          }

          doc.addImage(pSrc, fmt, imgX, imgY, finalW, finalH, undefined, 'FAST');

          doc.setDrawColor(209, 213, 219);
          doc.setLineWidth(0.3);
          doc.rect(imgX, imgY, finalW, finalH);
        } catch (imgError) {
          console.error("Could not render receipt image in PDF", imgError);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(220, 38, 38);
          doc.text("No se pudo renderizar la copia digital.", imgColX + (imgMaxW / 2), 120, { align: 'center' });
        }
      }
    } else {
      // Document is flagged with photo but image couldn't be loaded
      doc.setFillColor(249, 250, 251);
      doc.rect(imgColX, imgColY, imgMaxW, 80, 'F');
      doc.setDrawColor(229, 231, 235);
      doc.rect(imgColX, imgColY, imgMaxW, 80);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(107, 114, 128);
      doc.text("COMPROBANTE ADJUNTO REGISTRADO", imgColX + (imgMaxW / 2), imgColY + 35, { align: 'center' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text("Consulte el sistema para descargar la copia.", imgColX + (imgMaxW / 2), imgColY + 45, { align: 'center' });
    }
  }

  if (Array.isArray(storeRendicion) && storeRendicion.length > 1) {
    doc.save(`Reporte_Consolidado_Recibos.pdf`);
  } else {
    const singleR = Array.isArray(storeRendicion) ? storeRendicion[0] : storeRendicion;
    const sanitizedBlockName = singleR.name.replace(/[^a-zA-Z0-9]/g, '_');
    doc.save(`Recibos_${sanitizedBlockName}_${singleR.userName.replace(/\s+/g, '_')}.pdf`);
  }
};

/**
 * Generates a beautiful 1-page corporate Ticket PDF with financial balance boxes, receipts table, and digital signatures.
 */
export const exportTicketPDF = async (rendicion: Rendicion, settings: AppSettings) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const companyName = settings?.companyName || 'EMPRESA CORPORATIVA';
  
  // Calculate total funds without double-counting
  const previousBalance = rendicion.previousBalance || 0;
  let initialAdvance = 0;
  let additionalIngresos = 0;

  if (rendicion.ingresos && rendicion.ingresos.length > 0) {
    initialAdvance = rendicion.ingresos[0]?.amount || 0;
    if (rendicion.ingresos.length > 1) {
      additionalIngresos = rendicion.ingresos.slice(1).reduce((acc, i) => acc + (i.amount || 0), 0);
    }
  } else {
    initialAdvance = rendicion.advanceAmount || 0;
  }

  const totalFondos = initialAdvance + additionalIngresos + previousBalance;
  const totalGastado = rendicion.totalAmount || 0;
  const balance = totalGastado - totalFondos; // > 0 favor trabajador, < 0 favor empresa

  const fechaEmision = format(new Date(), 'dd/MM/yyyy HH:mm');
  const fechaRendicion = rendicion.createdAt 
    ? format(new Date(rendicion.createdAt), 'dd/MM/yyyy')
    : format(new Date(), 'dd/MM/yyyy');

  // Page Outer Frame / Border
  doc.setDrawColor(15, 23, 42); // slate-900
  doc.setLineWidth(0.8);
  doc.rect(8, 8, pageWidth - 16, doc.internal.pageSize.getHeight() - 16);

  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.3);
  doc.rect(10, 10, pageWidth - 20, doc.internal.pageSize.getHeight() - 20);

  // Corporate Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(12, 12, pageWidth - 24, 26, 'F');

  // Company Logo / Name
  if (settings.companyLogo) {
    try {
      doc.addImage(settings.companyLogo, 'PNG', 16, 14, 32, 22);
    } catch (e) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text(companyName.toUpperCase(), 16, 26);
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.text(companyName.toUpperCase(), 16, 26);
  }

  // Header Right Side: Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(52, 211, 153); // Emerald 400
  doc.text('TICKET CORPORATIVO DE VIÁTICOS', pageWidth - 16, 21, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(`N° REF: TCK-${rendicion.id.slice(0, 8).toUpperCase()} | ${fechaEmision}`, pageWidth - 16, 28, { align: 'right' });

  // Metadata Card Block (Gray background box)
  let y = 42;
  doc.setFillColor(248, 250, 252); // Slate 50
  doc.setDrawColor(226, 232, 240);
  doc.rect(12, y, pageWidth - 24, 28, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139); // Slate 500
  doc.text('RESPONSABLE:', 16, y + 7);
  doc.text('BLOQUE / OBRA:', 16, y + 14);
  doc.text('TIPO RENDICIÓN:', 16, y + 21);

  doc.text('FECHA REGISTRO:', 115, y + 7);
  doc.text('ESTADO OFICIAL:', 115, y + 14);
  doc.text('TOTAL COMPROBANTES:', 115, y + 21);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42); // Slate 900
  doc.text(rendicion.userName.toUpperCase(), 45, y + 7);
  doc.text(rendicion.name, 45, y + 14);
  doc.text(rendicion.rendicionType || 'Logístico', 45, y + 21);

  doc.text(fechaRendicion, 155, y + 7);

  // Status Badge with Color
  if (rendicion.status === 'Aprobado') {
    doc.setTextColor(16, 185, 129); // Emerald
    doc.text('✅ APROBADO', 155, y + 14);
  } else if (rendicion.status === 'Rechazado') {
    doc.setTextColor(239, 68, 68); // Red
    doc.text('❌ RECHAZADO', 155, y + 14);
  } else {
    doc.setTextColor(217, 119, 6); // Amber
    doc.text('⏳ PENDIENTE', 155, y + 14);
  }

  doc.setTextColor(15, 23, 42);
  doc.text(`${rendicion.comprobantes?.length || 0} Documentos`, 155, y + 21);

  // FINANCIAL BALANCE BOXES (3 Columns)
  y += 33;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('BALANCE Y RESUMEN FINANCIERO', 12, y);

  y += 3;
  const boxW = (pageWidth - 28) / 3;
  const boxH = 22;

  // Box 1: Fondos Entregados
  doc.setFillColor(241, 245, 249); // Slate 100
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, y, boxW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('1. TOTAL FONDOS RECIBIDOS', 15, y + 6);

  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`S/ ${totalFondos.toFixed(2)}`, 15, y + 14);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Inicial: S/ ${initialAdvance.toFixed(2)}${previousBalance !== 0 ? ` | Ant: S/ ${previousBalance.toFixed(2)}` : ''}`, 15, y + 19);

  // Box 2: Total Gastado
  const box2X = 14 + boxW;
  doc.setFillColor(254, 243, 199); // Amber 100
  doc.setDrawColor(252, 211, 77);
  doc.rect(box2X, y, boxW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(146, 64, 14); // Amber 800
  doc.text('2. GASTOS SUSTENTADOS', box2X + 3, y + 6);

  doc.setFontSize(12);
  doc.setTextColor(120, 53, 15);
  doc.text(`S/ ${totalGastado.toFixed(2)}`, box2X + 3, y + 14);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`${rendicion.comprobantes?.length || 0} comprobantes reportados`, box2X + 3, y + 19);

  // Box 3: Liquidación Resultante
  const box3X = 16 + (boxW * 2);
  let box3Bg = [239, 246, 255]; // Blue 50
  let box3Border = [191, 219, 254];
  let box3Text = [29, 78, 216];
  let resultLabel = '🔵 SALDO EQUILIBRADO';

  if (balance > 0) {
    box3Bg = [254, 242, 242]; // Rose 50
    box3Border = [254, 202, 202];
    box3Text = [190, 18, 60]; // Rose 700
    resultLabel = '🔴 A FAVOR TRABAJADOR';
  } else if (balance < 0) {
    box3Bg = [236, 253, 245]; // Emerald 50
    box3Border = [167, 243, 208];
    box3Text = [4, 120, 87]; // Emerald 700
    resultLabel = '🟢 A DEVOLVER A EMPRESA';
  }

  doc.setFillColor(box3Bg[0], box3Bg[1], box3Bg[2]);
  doc.setDrawColor(box3Border[0], box3Border[1], box3Border[2]);
  doc.rect(box3X, y, boxW, boxH, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(box3Text[0], box3Text[1], box3Text[2]);
  doc.text('3. RESULTADO LIQUIDACIÓN', box3X + 3, y + 6);

  doc.setFontSize(12);
  doc.text(`S/ ${Math.abs(balance).toFixed(2)}`, box3X + 3, y + 14);

  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'bold');
  doc.text(resultLabel, box3X + 3, y + 19);

  // DETALLE DE COMPROBANTES TABLE
  y += boxH + 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`DETALLE DE COMPROBANTES Y FACTURACIÓN (${rendicion.comprobantes?.length || 0})`, 12, y);

  const tableHead = [['N°', 'Tipo Doc.', 'Número', 'Razón Social / Proveedor', 'Categoría', 'Monto']];
  const tableBody = (rendicion.comprobantes || []).map((c, idx) => [
    (idx + 1).toString(),
    c.type || 'Doc',
    c.documentNumber || '-',
    c.razonSocial || c.ruc || '-',
    c.category || 'General',
    `S/ ${c.amount.toFixed(2)}`
  ]);

  autoTable(doc, {
    head: tableHead,
    body: tableBody,
    startY: y + 3,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 2 },
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: 'bold', halign: 'left' },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 22 },
      2: { cellWidth: 28 },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 30 },
      5: { cellWidth: 25, halign: 'right', fontStyle: 'bold' }
    }
  });

  let finalY = (doc as any).lastAutoTable.finalY + 12;

  // SIGNATURES SECTION
  if (finalY > 230) {
    doc.addPage();
    finalY = 25;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('CONFORMIDAD Y FIRMAS CORPORATIVAS', 12, finalY);

  finalY += 4;
  const sigBoxW = (pageWidth - 28) / 2;
  const sigBoxH = 32;

  // Employee Signature Box (Left)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.rect(12, finalY, sigBoxW, sigBoxH);

  if (rendicion.signature) {
    try {
      doc.addImage(rendicion.signature, 'PNG', 16, finalY + 2, 40, 18);
    } catch (e) {
      console.warn("Could not render signature in Ticket PDF", e);
    }
  }

  const sigLineY = finalY + 22;
  doc.setDrawColor(148, 163, 184);
  doc.line(16, sigLineY, 12 + sigBoxW - 8, sigLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('FIRMA DEL COLABORADOR', 16, sigLineY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Nombre: ${rendicion.userName}`, 16, sigLineY + 8);

  // Admin Signature Box (Right)
  const sig2X = 16 + sigBoxW;
  doc.rect(sig2X, finalY, sigBoxW, sigBoxH);

  doc.line(sig2X + 8, sigLineY, sig2X + sigBoxW - 8, sigLineY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text('V°B° CONTABILIDAD / ADMINISTRACIÓN', sig2X + 8, sigLineY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(`Aprobado: ${companyName}`, sig2X + 8, sigLineY + 8);

  // FOOTER
  const footerY = doc.internal.pageSize.getHeight() - 12;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text(`Ticket de Rendición Oficial de Gastos - ${companyName} | Documento verificado digitalmente`, pageWidth / 2, footerY, { align: 'center' });

  const sanitizedName = rendicion.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Ticket_Rendicion_${sanitizedName}_${rendicion.userName.replace(/\s+/g, '_')}.pdf`);
};

