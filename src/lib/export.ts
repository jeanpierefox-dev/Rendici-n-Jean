import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { Rendicion, AppSettings } from '../types';
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
