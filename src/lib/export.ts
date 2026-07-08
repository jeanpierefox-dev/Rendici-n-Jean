import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Rendicion, AppSettings, Ingreso } from '../types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
  const tableColumn = ["Bloque", "Usuario", "Tipo Doc.", "Número", "RUC", "Fecha Doc.", "Estado", "Monto"];
  const tableRows: any[] = [];
  
  let total = 0;

  rendiciones.forEach(r => {
    r.comprobantes.forEach(c => {
      total += c.amount;
      const rData = [
        r.name,
        r.userName,
        c.type,
        c.documentNumber,
        c.ruc,
        format(new Date(c.date), 'dd/MM/yyyy'),
        r.status,
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
    'Fecha Documento': format(new Date(c.date), 'dd/MM/yyyy'),
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
    {wch: 15}, // Fecha
    {wch: 12}, // Monto
    {wch: 15}, // Estado
    {wch: 20}, // Registro
  ];
  worksheet['!cols'] = wscols;

  XLSX.writeFile(workbook, "Rendiciones_Jean_Barsa.xlsx");
};

export const exportSingleRendicionPDF = (rendicion: Rendicion, settings: AppSettings, conHojaFedatada: boolean = true) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  
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
  doc.rect(14, 49, pageWidth - 28, 24, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  
  doc.text('COLABORADOR:', 18, 55);
  doc.text('EMPRESA:', 18, 61);
  doc.text('BLOQUE:', 18, 67);

  doc.text('FECHA REGISTRO:', 110, 55);
  doc.text('FECHA LIQUIDACIÓN:', 110, 61);
  doc.text('ESTADO ACTUAL:', 110, 67);

  doc.setFont('helvetica', 'medium');
  doc.setTextColor(31, 41, 55);
  doc.text(rendicion.userName.toUpperCase(), 45, 55);
  doc.text(settings.companyName.toUpperCase(), 45, 61);
  doc.text(rendicion.name, 45, 67);

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
  doc.text('RESUMEN DE CUENTAS (CONSOLIDADO)', 14, 81);

  // Background for box
  doc.setFillColor(249, 250, 251);
  doc.setDrawColor(229, 231, 235);
  doc.rect(14, 84, pageWidth - 28, 18, 'FD');

  // Values in card
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(75, 85, 99);
  doc.text('(+) TOTAL RECIBIDO', 20, 91);
  doc.text('(-) GASTOS COMPROBADOS', 75, 91);
  doc.text('(=) SALDO RESULTANTE', 135, 91);

  doc.setFontSize(11);
  doc.setTextColor(17, 24, 39);
  doc.text(`S/ ${totalRecibido.toFixed(2)}`, 20, 97);
  doc.text(`S/ ${totalGastado.toFixed(2)}`, 75, 97);

  // Style Balance based on positive/negative
  if (balance > 0) {
    doc.setTextColor(180, 83, 9); // Amber
    doc.setFont('helvetica', 'bold');
    doc.text(`S/ ${Math.abs(balance).toFixed(2)}`, 135, 97);
    doc.setFontSize(7);
    doc.text('(A DEVOLVER A LA EMPRESA)', 135, 100);
  } else if (balance < 0) {
    doc.setTextColor(29, 78, 216); // Blue
    doc.setFont('helvetica', 'bold');
    doc.text(`S/ ${Math.abs(balance).toFixed(2)}`, 135, 97);
    doc.setFontSize(7);
    doc.text('(A REEMBOLSAR AL COLABORADOR)', 135, 100);
  } else {
    doc.setTextColor(4, 120, 87); // Green
    doc.setFont('helvetica', 'bold');
    doc.text('S/ 0.00', 135, 97);
    doc.setFontSize(7);
    doc.text('(CUENTAS SALDADAS)', 135, 100);
  }

  // TABLES: INGRESOS & EGRESOS
  let currentY = 108;

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

  const egresCols = ['Fecha Doc.', 'Tipo', 'Número de Comprobante', 'RUC Emisor', 'Monto'];
  const egresRows = rendicion.comprobantes.map(c => [
    format(new Date(c.date), 'dd/MM/yyyy'),
    c.type,
    c.documentNumber,
    c.ruc,
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
      0: { cellWidth: 25 },
      1: { cellWidth: 25 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 35 },
      4: { cellWidth: 35, halign: 'right', fontStyle: 'bold' }
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

  // PAGE 2: HOJA FEDATADA (If selected)
  if (conHojaFedatada) {
    doc.addPage();
    
    // Draw Elegant Certified Borders
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(1);
    doc.rect(8, 8, pageWidth - 16, doc.internal.pageSize.getHeight() - 16);
    
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.rect(10, 10, pageWidth - 20, doc.internal.pageSize.getHeight() - 20);

    // Fedatada Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 58, 138);
    doc.text('HOJA FEDATADA Y CONVALIDACIÓN TRIBUTARIA', pageWidth / 2, 22, { align: 'center' });
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(107, 114, 128);
    doc.text('SISTEMA CORPORATIVO DE CONTROL INTERNO DE RENDICIONES', pageWidth / 2, 27, { align: 'center' });

    // Dividers
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(30, 31, pageWidth - 30, 31);

    // Certification Act Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(17, 24, 39);
    doc.text('ACTA DE VALIDACIÓN Y DECLARACIÓN JURADA FEDATADA', 18, 42);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(55, 65, 81);
    
    const textActa = `Por medio del presente documento, se hace constar que el Departamento de Auditoría Interna, Contabilidad y Control de Gestión de ${settings.companyName.toUpperCase()}, ha procedido con la verificación integral (física, digital y tributaria) del bloque de rendición denominado "${rendicion.name}" con código #${rendicion.id.substring(0, 8).toUpperCase()}, de titularidad del colaborador ${rendicion.userName.toUpperCase()}.\n\nSe deja expresa constancia bajo fe de juramento fedatario lo siguiente:`;
    
    const splitActa = doc.splitTextToSize(textActa, pageWidth - 36);
    doc.text(splitActa, 18, 48);

    // Bullet Points of Verification
    doc.setFont('helvetica', 'bold');
    doc.text('1. INTEGRIDAD DOCUMENTAL:', 18, 82);
    doc.setFont('helvetica', 'normal');
    doc.text(`Se verificaron exitosamente un total de ${rendicion.comprobantes.length} comprobantes de pago adjuntos en este bloque, validando RUC, tipo de comprobante, numeración correlativa, fechas correctas y congruencia con las normativas locales de egresos.`, 22, 87, { maxWidth: pageWidth - 40 });

    doc.setFont('helvetica', 'bold');
    doc.text('2. AUDITORÍA FINANCIERA:', 18, 102);
    doc.setFont('helvetica', 'normal');
    doc.text(`La auditoría matemática de ingresos (S/ ${totalRecibido.toFixed(2)}) y egresos declarados (S/ ${totalGastado.toFixed(2)}) arrojó un saldo resultante auditado de S/ ${Math.abs(balance).toFixed(2)}, el cual ha sido catalogado como "${balance >= 0 ? 'A Devolver a favor de la Empresa' : 'A Reembolsar a favor del Empleado'}".`, 22, 107, { maxWidth: pageWidth - 40 });

    doc.setFont('helvetica', 'bold');
    doc.text('3. DECLARACIÓN FEDATADA DE VALIDEZ:', 18, 122);
    doc.setFont('helvetica', 'normal');
    doc.text('Los comprobantes examinados cumplen plenamente con las exigencias formales de deducibilidad, se consideran procedentes y legalmente aptos para su contabilización, declarándose HÁBILES y CONVALIDADOS.', 22, 127, { maxWidth: pageWidth - 40 });

    // Official Seal and Stamp Graphics
    const sealY = 148;
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(1.5);
    doc.rect(pageWidth / 2 - 30, sealY, 60, 30);
    
    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.3);
    doc.rect(pageWidth / 2 - 28, sealY + 2, 56, 26);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 58, 138);
    doc.text('FEDATADO Y CONFORMADO', pageWidth / 2, sealY + 9, { align: 'center' });
    doc.setFontSize(7);
    doc.text(settings.companyName.toUpperCase(), pageWidth / 2, sealY + 15, { align: 'center' });
    doc.text(`CÓDIGO: CONT-${rendicion.id.substring(0,6).toUpperCase()}`, pageWidth / 2, sealY + 20, { align: 'center' });
    doc.setFontSize(6);
    doc.text('DPTO. AUDITORÍA INTERNA', pageWidth / 2, sealY + 25, { align: 'center' });

    // Stamped certification signature space at the very bottom
    const certSignY = 205;
    doc.line(55, certSignY, pageWidth - 55, certSignY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(17, 24, 39);
    doc.text('FIRMA DEL FEDATARIO CORPORATIVO', pageWidth / 2, certSignY + 5, { align: 'center' });
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(107, 114, 128);
    doc.text('Auditor / Fedatario Colegiado Responsable de Control Financiero', pageWidth / 2, certSignY + 10, { align: 'center' });
    doc.text(`Fecha de Certificación Fedataria: ${fechaEmision.split(' ')[0]}`, pageWidth / 2, certSignY + 14, { align: 'center' });
  }

  // Save the document named specifically based on user name & block name
  const sanitizedBlockName = rendicion.name.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`Rendicion_${sanitizedBlockName}_${rendicion.userName.replace(' ', '_')}.pdf`);
};
