import { Rendicion, AppSettings } from '../types';
import { format, parseISO } from 'date-fns';

/**
 * Generates a formal corporate text summary for a single Rendicion block for WhatsApp.
 */
export const generateSingleRendicionWhatsAppMessage = (
  rendicion: Rendicion,
  settings: AppSettings
): string => {
  const companyName = settings?.companyName || 'Empresa';
  const totalFondos = (rendicion.advanceAmount || 0) + (rendicion.ingresos?.reduce((acc, i) => acc + (i.amount || 0), 0) || 0) + (rendicion.previousBalance || 0);
  const totalGastado = rendicion.totalAmount || 0;
  const balance = totalGastado - totalFondos;

  const dateFormatted = rendicion.createdAt 
    ? format(parseISO(rendicion.createdAt), 'dd/MM/yyyy') 
    : format(new Date(), 'dd/MM/yyyy');

  let balanceText = '';
  if (balance > 0) {
    balanceText = `🔴 *Saldo A FAVOR del Trabajador:* S/ ${balance.toFixed(2)}`;
  } else if (balance < 0) {
    balanceText = `🟢 *Saldo A DEVOLVER a Empresa:* S/ ${Math.abs(balance).toFixed(2)}`;
  } else {
    balanceText = `🔵 *Saldo Equilibrado:* S/ 0.00`;
  }

  let statusEmoji = '⏳';
  if (rendicion.status === 'Aprobado') statusEmoji = '✅';
  if (rendicion.status === 'Rechazado') statusEmoji = '❌';

  let msg = `📊 *RESUMEN DE RENDICIÓN DE VIÁTICOS Y GASTOS*\n`;
  msg += `🏢 *${companyName.toUpperCase()}*\n`;
  msg += `──────────────────────────────\n`;
  msg += `📋 *Bloque:* ${rendicion.name}\n`;
  msg += `👤 *Responsable:* ${rendicion.userName}\n`;
  msg += `🏷️ *Tipo:* ${rendicion.rendicionType || 'Logístico'}\n`;
  msg += `📅 *Fecha:* ${dateFormatted}\n`;
  msg += `📌 *Estado:* ${statusEmoji} *${rendicion.status.toUpperCase()}*\n\n`;

  msg += `💰 *DESGLOSE FINANCIERO*\n`;
  msg += `• *Adelanto Recibido:* S/ ${(rendicion.advanceAmount || 0).toFixed(2)}\n`;
  if (rendicion.previousBalance && rendicion.previousBalance !== 0) {
    msg += `• *Saldo Anterior:* S/ ${rendicion.previousBalance.toFixed(2)}\n`;
  }
  if (rendicion.ingresos && rendicion.ingresos.length > 0) {
    const totalIngresos = rendicion.ingresos.reduce((acc, i) => acc + (i.amount || 0), 0);
    msg += `• *Ingresos Adicionales:* S/ ${totalIngresos.toFixed(2)}\n`;
  }
  msg += `• *TOTAL FONDOS:* S/ ${totalFondos.toFixed(2)}\n`;
  msg += `• *TOTAL RENDIDO / GASTADO:* S/ ${totalGastado.toFixed(2)} (${rendicion.comprobantes?.length || 0} docs)\n\n`;

  msg += `⚖️ *RESULTADO DE LIQUIDACIÓN*\n`;
  msg += `${balanceText}\n`;

  if (rendicion.comprobantes && rendicion.comprobantes.length > 0) {
    msg += `\n📑 *DETALLE DE COMPROBANTES:* \n`;
    rendicion.comprobantes.forEach((c, idx) => {
      const docType = c.type || 'Comprobante';
      const docNum = c.documentNumber ? `N° ${c.documentNumber}` : '';
      const supplier = c.razonSocial ? `- ${c.razonSocial}` : '';
      msg += `${idx + 1}. ${docType} ${docNum} ${supplier}: *S/ ${c.amount.toFixed(2)}* (${c.category || 'General'})\n`;
    });
  }

  msg += `\n──────────────────────────────\n`;
  msg += `_Reporte corporativo generado automáticamente._`;

  return msg;
};

/**
 * Generates a formal summary message of multiple Rendiciones for WhatsApp.
 */
export const generateGeneralSummaryWhatsAppMessage = (
  rendiciones: Rendicion[],
  settings: AppSettings,
  userName?: string
): string => {
  const companyName = settings?.companyName || 'Empresa';
  const totalFondos = rendiciones.reduce((acc, r) => {
    const ingresos = r.ingresos?.reduce((sum, i) => sum + (i.amount || 0), 0) || 0;
    return acc + (r.advanceAmount || 0) + ingresos + (r.previousBalance || 0);
  }, 0);

  const totalGastado = rendiciones.reduce((acc, r) => acc + (r.totalAmount || 0), 0);
  const totalDocs = rendiciones.reduce((acc, r) => acc + (r.comprobantes?.length || 0), 0);
  const netBalance = totalGastado - totalFondos;

  let balanceText = '';
  if (netBalance > 0) {
    balanceText = `🔴 *Saldo Global a Favor de Trabajadores:* S/ ${netBalance.toFixed(2)}`;
  } else if (netBalance < 0) {
    balanceText = `🟢 *Saldo Global a Favor de la Empresa:* S/ ${Math.abs(netBalance).toFixed(2)}`;
  } else {
    balanceText = `🔵 *Saldo General:* S/ 0.00`;
  }

  let msg = `📊 *RESUMEN GENERAL DE VIÁTICOS Y GASTOS*\n`;
  msg += `🏢 *${companyName.toUpperCase()}*\n`;
  if (userName) msg += `👤 *Usuario:* ${userName}\n`;
  msg += `📅 *Fecha de Emisión:* ${format(new Date(), 'dd/MM/yyyy hh:mm a')}\n`;
  msg += `──────────────────────────────\n\n`;

  msg += `📈 *RESUMEN GLOBAL (${rendiciones.length} Rendiciones / ${totalDocs} Comprobantes)*\n`;
  msg += `• *Total Fondos Entregados:* S/ ${totalFondos.toFixed(2)}\n`;
  msg += `• *Total Gastos Sustentados:* S/ ${totalGastado.toFixed(2)}\n`;
  msg += `${balanceText}\n\n`;

  msg += `📋 *DESGLOSE POR BLOQUE:*\n`;
  rendiciones.forEach((r, idx) => {
    const statusEmoji = r.status === 'Aprobado' ? '✅' : r.status === 'Rechazado' ? '❌' : '⏳';
    const rFondos = (r.advanceAmount || 0) + (r.ingresos?.reduce((a, b) => a + (b.amount || 0), 0) || 0) + (r.previousBalance || 0);
    const rBalance = r.totalAmount - rFondos;
    let rBalStr = '';
    if (rBalance > 0) rBalStr = `(Fav. Trab: +S/ ${rBalance.toFixed(2)})`;
    else if (rBalance < 0) rBalStr = `(Fav. Emp: -S/ ${Math.abs(rBalance).toFixed(2)})`;
    else rBalStr = `(S/ 0.00)`;

    msg += `${idx + 1}. *${r.name}* [${statusEmoji} ${r.status}]\n`;
    msg += `   • Gastado: S/ ${r.totalAmount.toFixed(2)} de S/ ${rFondos.toFixed(2)} ${rBalStr}\n`;
  });

  msg += `\n──────────────────────────────\n`;
  msg += `_Reporte consolidado generado automáticamente._`;

  return msg;
};

/**
 * Opens WhatsApp web or mobile API with pre-filled text message.
 */
export const shareToWhatsApp = (text: string) => {
  const encoded = encodeURIComponent(text);
  const url = `https://api.whatsapp.com/send?text=${encoded}`;
  window.open(url, '_blank');
};

/**
 * Copies text to system clipboard.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    }
  } catch (err) {
    console.error("Copy failed:", err);
    return false;
  }
};
