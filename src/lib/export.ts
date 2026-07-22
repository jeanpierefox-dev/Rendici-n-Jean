import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Rendicion, AppSettings, Ingreso } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { formatLocalDate } from './utils';
import { doc as firestoreDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useAppStore } from './store';

export const exportToPDF = (rendiciones: Rendicion[], settings: AppSettings) => {
  const doc = new jsPDF();
  
  // Header
  if (settings.companyLogo) {
    try {
      doc.addImage(settings.companyLogo, 'PNG', 14, 10, 40, 20);
    } catch (e) {
      console.warn("Could not add logo to PDF");
    }
  }

  doc.setFontSize(20);
  doc.setTextColor(33, 37, 41);
  doc.text('Reporte de Rendiciones', 14, 40);
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Empresa: ${settings.companyName}`, 14, 48);
  doc.text(`Fecha de emisión: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 54);

  // Table
  const tableColumn = ["Bloque", "Usuario", "Categoría / Obs.", "Tipo Doc.", "Número", "Fecha Doc.", "Monto"];
  const tableRows: any[] = [];
  
  let total = 0;

  rendiciones.forEach(r => {
    r.comprobantes.forEach(c => {
      total += c.amount;
      const rData = [
        r.name,
        r.userName,
        c.observation ? `${c.category || 'Otros'} (${c.observation})` : (c.category || 'Otros'),
        c.type,
        c.documentNumber,
        formatLocalDate(c.date),
        `S/ ${c.amount.toFixed(2)}`
      ];
      tableRows.push(rData);
    });
  });

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 65,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9 },
    headStyles: { fillColor: [41, 128, 185], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // Footer/Total
  const finalY = (doc as any).lastAutoTable.finalY || 65;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(33, 37, 41);
  doc.text(`Total General: S/ ${total.toFixed(2)}`, 14, finalY + 10);

  // Signatures
  doc.setFont('helvetica', 'normal');
  doc.line(20, finalY + 40, 80, finalY + 40);
  doc.text('Preparado por', 35, finalY + 45);
  
  doc.line(120, finalY + 40, 180, finalY + 40);
  doc.text('Aprobado por', 135, finalY + 45);

  doc.save('Rendiciones_Jean_Barsa.pdf');
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

export const exportSingleRendicionPDF = async (storeRendicion: Rendicion, settings: AppSettings, conHojaFedatada: boolean = true) => {
  // Pre-load any missing receipt photos from Firestore 'receipt_photos' collection in parallel
  const updatedComprobantes = await Promise.all(storeRendicion.comprobantes.map(async (c) => {
    let photo = c.receiptPhoto;
    if (!photo) {
      const compId = c.id || c.documentNumber;
      if (compId) {
        try {
          const photoDoc = await getDoc(firestoreDoc(db, 'receipt_photos', compId));
          const data = photoDoc.data() as any;
          if (photoDoc.exists() && data?.photo) {
            photo = data.photo;
          }
        } catch (err) {
          console.error("Could not fetch missing receipt photo for PDF:", err);
        }
      }
    }
    if (photo && !photo.startsWith('data:')) {
      photo = 'data:image/jpeg;base64,' + photo;
    }
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

  // Create a safe, copy of the rendicion object to avoid mutating frozen store objects
  const rendicion: Rendicion = {
    ...storeRendicion,
    comprobantes: updatedComprobantes
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
  const ingresosList: Ingreso[] = rendicion.ingresos && rendicion.ingresos.length > 0 
    ? rendicion.ingresos 
    : (rendicion.advanceAmount > 0 
      ? [{
          id: 'initial',
          amount: rendicion.advanceAmount,
          date: rendicion.advanceDate || rendicion.createdAt.split('T')[0],
          reference: 'Monto Inicial Desembolsado'
        }] 
      : []);
      
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

  let finalY = (doc as any).lastAutoTable.finalY + 10;

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
      // Width for pasting: approx 86 mm, Height: approx 236 mm
      const boxX = 14;
      const boxY = 40;
      const boxW = 86;
      const boxH = 236;

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
      doc.setFontSize(9);
      doc.setTextColor(156, 163, 175); // gray-400
      doc.text('PEGAR COMPROBANTE', boxCenterX, boxCenterY - 15, { align: 'center' });
      doc.text('ORIGINAL AQUÍ', boxCenterX, boxCenterY - 9, { align: 'center' });

      // Visual helper (dotted icon shape of a typical receipt)
      doc.setLineWidth(0.3);
      doc.setDrawColor(209, 213, 219);
      doc.setLineDashPattern([1, 1], 0);
      doc.rect(boxCenterX - 18, boxCenterY + 4, 36, 24);
      doc.setLineDashPattern([], 0);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(156, 163, 175);
      doc.text('Original Físico', boxCenterX, boxCenterY + 16, { align: 'center' });

      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7);
      doc.setTextColor(156, 163, 175);
      doc.text('(Sujete firmemente con cinta o goma)', boxCenterX, boxCenterY + 40, { align: 'center' });
      doc.text('Ancho máx: 82 mm', boxCenterX, boxCenterY + 45, { align: 'center' });

      // --- RIGHT SIDE: COMPLETE ATTACHED DIGITAL IMAGE ---
      // Width for image: approx 92 mm, Height: approx 236 mm
      const imgMaxW = 92;
      const imgMaxH = 236;
      const imgColX = 104;
      const imgColY = 40;

      // Add receipt photo image centered in the space
      let photoSrc = c.receiptPhoto;
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
            let formatType = 'JPEG';
            if (photoSrc.startsWith('data:image/png')) {
              formatType = 'PNG';
            } else if (photoSrc.startsWith('data:image/gif')) {
              formatType = 'GIF';
            }
            
            const key = c.id || c.documentNumber;
            const dims = imageDimensions[key];
            let origW = 0;
            let origH = 0;
            if (dims) {
              origW = dims.width;
              origH = dims.height;
            }

            let finalW = imgMaxW;
            let finalH = imgMaxH;

            if (origW > 0 && origH > 0) {
              const ratio = origW / origH;
              const containerRatio = imgMaxW / imgMaxH;
              
              if (ratio > containerRatio) {
                finalW = imgMaxW;
                finalH = imgMaxW / ratio;
              } else {
                finalH = imgMaxH;
                finalW = imgMaxH * ratio;
              }
            }

            const imgX = imgColX + (imgMaxW - finalW) / 2;
            const imgY = imgColY + (imgMaxH - finalH) / 2;
            
            doc.addImage(photoSrc, formatType, imgX, imgY, finalW, finalH, undefined, 'FAST');

            doc.setDrawColor(229, 231, 235);
            doc.setLineWidth(0.2);
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
      }
    }
  }

  // Save the document named specifically based on user name & block name
  const sanitizedBlockName = rendicion.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Rendicion_${sanitizedBlockName}_${rendicion.userName.replace(' ', '_')}.pdf`);
};

export const exportRendicionReceiptsPDF = async (storeRendicion: Rendicion, settings: AppSettings) => {
  // Pre-load any missing receipt photos from Firestore 'receipt_photos' collection in parallel
  const updatedComprobantes = await Promise.all(storeRendicion.comprobantes.map(async (c) => {
    let photo = c.receiptPhoto;
    if (!photo && c.id) {
      try {
        const photoDoc = await getDoc(firestoreDoc(db, 'receipt_photos', c.id));
        const data = photoDoc.data() as any;
        if (photoDoc.exists() && data?.photo) {
          photo = data.photo;
        }
      } catch (err) {
        console.error("Could not fetch missing receipt photo for PDF:", err);
      }
    }
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

  // Create a safe, copy of the rendicion object to avoid mutating frozen store objects
  const rendicion: Rendicion = {
    ...storeRendicion,
    comprobantes: updatedComprobantes
  };

  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Pre-load all attached image dimensions asynchronously
  const imageDimensions: { [key: string]: { width: number; height: number } } = {};
  for (const c of rendicion.comprobantes) {
    if (c.receiptPhoto && c.receiptPhoto.startsWith('data:image/')) {
      try {
        const key = c.id || c.documentNumber;
        const dims = await getImageDimensions(c.receiptPhoto);
        imageDimensions[key] = dims;
      } catch (err) {
        console.error("Could not load image dimensions", err);
      }
    }
  }

  const comprobantesConFoto = rendicion.comprobantes.filter(c => c.receiptPhoto || c.hasPhoto);
  
  if (comprobantesConFoto.length === 0) {
    throw new Error("No hay recibos adjuntos (con foto o documento) en esta rendición.");
  }

  // Draw receipts as Hoja Fedatada
  for (let idx = 0; idx < comprobantesConFoto.length; idx++) {
    const c = comprobantesConFoto[idx];
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
    const boxX = 14;
    const boxY = 40;
    const boxW = 86;
    const boxH = 236;

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
    doc.setFontSize(9);
    doc.setTextColor(156, 163, 175); // gray-400
    doc.text('PEGAR COMPROBANTE', boxCenterX, boxCenterY - 15, { align: 'center' });
    doc.text('ORIGINAL AQUÍ', boxCenterX, boxCenterY - 9, { align: 'center' });

    // Visual helper
    doc.setLineWidth(0.3);
    doc.setDrawColor(209, 213, 219);
    doc.setLineDashPattern([1, 1], 0);
    doc.rect(boxCenterX - 18, boxCenterY + 4, 36, 24);
    doc.setLineDashPattern([], 0);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(156, 163, 175);
    doc.text('Original Físico', boxCenterX, boxCenterY + 16, { align: 'center' });

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(156, 163, 175);
    doc.text('(Sujete firmemente con cinta o goma)', boxCenterX, boxCenterY + 40, { align: 'center' });
    doc.text('Ancho máx: 82 mm', boxCenterX, boxCenterY + 45, { align: 'center' });

    // --- RIGHT SIDE: COMPLETE ATTACHED DIGITAL IMAGE OR PDF ---
    const imgMaxW = 92;
    const imgMaxH = 236;
    const imgColX = 104;
    const imgColY = 40;

    let photoSrc = c.receiptPhoto;
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
          let formatType = 'JPEG';
          if (photoSrc.startsWith('data:image/png')) {
            formatType = 'PNG';
          } else if (photoSrc.startsWith('data:image/gif')) {
            formatType = 'GIF';
          }
          
          const key = c.id || c.documentNumber;
          const dims = imageDimensions[key];
          let origW = 0;
          let origH = 0;
          if (dims) {
            origW = dims.width;
            origH = dims.height;
          }

          let finalW = imgMaxW;
          let finalH = imgMaxH;

          if (origW > 0 && origH > 0) {
            const ratio = origW / origH;
            const containerRatio = imgMaxW / imgMaxH;
            
            if (ratio > containerRatio) {
              finalW = imgMaxW;
              finalH = imgMaxW / ratio;
            } else {
              finalH = imgMaxH;
              finalW = imgMaxH * ratio;
            }
          }

          const imgX = imgColX + (imgMaxW - finalW) / 2;
          const imgY = imgColY + (imgMaxH - finalH) / 2;
          
          doc.addImage(photoSrc, formatType, imgX, imgY, finalW, finalH, undefined, 'FAST');

          doc.setDrawColor(229, 231, 235);
          doc.setLineWidth(0.2);
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

  const sanitizedBlockName = rendicion.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Recibos_${sanitizedBlockName}_${rendicion.userName.replace(' ', '_')}.pdf`);
};
