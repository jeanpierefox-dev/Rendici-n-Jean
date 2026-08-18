import { Rendicion, AppSettings } from '../types';
import { format, parseISO } from 'date-fns';

/**
 * Calculates total funds correctly without double-counting initial advance and ingresos.
 */
export const getRendicionTotalFondos = (rendicion: Rendicion): {
  totalFondos: number;
  initialAdvance: number;
  additionalIngresos: number;
  previousBalance: number;
} => {
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

  return {
    totalFondos,
    initialAdvance,
    additionalIngresos,
    previousBalance
  };
};

/**
 * Generates a formal corporate text ticket for a single Rendicion block formatted for WhatsApp.
 */
export const generateSingleRendicionWhatsAppMessage = (
  rendicion: Rendicion,
  settings: AppSettings
): string => {
  const companyName = settings?.companyName || 'Empresa';
  const { totalFondos, initialAdvance, additionalIngresos, previousBalance } = getRendicionTotalFondos(rendicion);
  const totalGastado = rendicion.totalAmount || 0;
  const rawBalance = totalGastado - totalFondos; // > 0 favor trabajador, < 0 favor empresa
  const isLiquidado = rendicion.liquidacion?.status === 'Liquidado';

  const dateFormatted = rendicion.createdAt 
    ? format(parseISO(rendicion.createdAt), 'dd/MM/yyyy') 
    : format(new Date(), 'dd/MM/yyyy');

  let balanceHeadline = '';
  if (isLiquidado) {
    const liq = rendicion.liquidacion!;
    const liqMonto = liq.monto || Math.abs(rawBalance);
    const liqTypeStr = liq.type === 'Favor Empresa' ? 'Devuelto a Empresa (Uñero / Recibo)' : 'Reembolsado al Trabajador (Voucher / Abono)';
    balanceHeadline = `✅ *LIQUIDACIÓN: SALDO EN S/ 0.00 (BLOQUE SALDADO)*\n`;
    balanceHeadline += `▫️ *Monto Conciliado:* S/ ${liqMonto.toFixed(2)} (${liqTypeStr})\n`;
    balanceHeadline += `▫️ *N° Operación / Ref:* ${liq.voucherObs || 'N/A'}\n`;
    balanceHeadline += `▫️ *Fecha Liquidación:* ${liq.fecha ? format(parseISO(liq.fecha), 'dd/MM/yyyy') : dateFormatted}\n`;
    balanceHeadline += `▫️ *Saldo Pendiente Final:* *S/ 0.00*`;
  } else if (rawBalance > 0) {
    balanceHeadline = `🔴 *LIQUIDACIÓN PENDIENTE:* *S/ ${rawBalance.toFixed(2)} A FAVOR DEL TRABAJADOR* (Reembolso)`;
  } else if (rawBalance < 0) {
    balanceHeadline = `🟢 *LIQUIDACIÓN PENDIENTE:* *S/ ${Math.abs(rawBalance).toFixed(2)} A DEVOLVER A EMPRESA*`;
  } else {
    balanceHeadline = `🔵 *LIQUIDACIÓN:* *S/ 0.00 (Saldo Equilibrado)*`;
  }

  let statusEmoji = isLiquidado ? '✅' : '⏳';
  if (rendicion.status === 'Aprobado') statusEmoji = '✅';
  if (rendicion.status === 'Rechazado') statusEmoji = '❌';

  let msg = `🏢 *${companyName.toUpperCase()}* - *TICKET DE RENDICIÓN*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📍 *Obra / Bloque:* ${rendicion.name}\n`;
  msg += `👤 *Responsable:* ${rendicion.userName}\n`;
  msg += `🏷️ *Tipo Rendición:* ${rendicion.rendicionType || 'Logístico'}\n`;
  msg += `📅 *Fecha Registro:* ${dateFormatted}\n`;
  msg += `📌 *Estado:* ${statusEmoji} *${isLiquidado ? 'LIQUIDADO A S/ 0.00' : rendicion.status.toUpperCase()}*\n\n`;

  msg += `💰 *RESUMEN FINANCIERO*\n`;
  msg += `──────────────────────────\n`;
  msg += `▫️ Desembolso Inicial: *S/ ${initialAdvance.toFixed(2)}*\n`;

  if (previousBalance !== 0) {
    msg += `▫️ Saldo Arrastrado: *S/ ${previousBalance.toFixed(2)}*\n`;
  }
  if (additionalIngresos > 0) {
    msg += `▫️ Ingresos Adicionales: *S/ ${additionalIngresos.toFixed(2)}*\n`;
  }

  msg += `🔹 *TOTAL FONDOS:* *S/ ${totalFondos.toFixed(2)}*\n`;
  msg += `🔸 *TOTAL GASTADO:* *S/ ${totalGastado.toFixed(2)}* (${rendicion.comprobantes?.length || 0} docs)\n`;
  msg += `──────────────────────────\n`;
  msg += `${balanceHeadline}\n\n`;

  if (rendicion.comprobantes && rendicion.comprobantes.length > 0) {
    msg += `🧾 *DETALLE DE COMPROBANTES (${rendicion.comprobantes.length})*\n`;
    msg += `──────────────────────────\n`;
    rendicion.comprobantes.forEach((c, idx) => {
      const docType = c.type || 'Doc';
      const docNum = c.documentNumber ? `N° ${c.documentNumber}` : '';
      const supplier = c.razonSocial ? `(${c.razonSocial})` : '';
      msg += `${idx + 1}. *${docType} ${docNum}* ${supplier}\n`;
      msg += `   💵 Monto: *S/ ${c.amount.toFixed(2)}* | 🏷️ _${c.category || 'General'}_\n`;
    });
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ _Ticket de gastos y liquidación verificado digitalmente._`;

  return msg;
};

/**
 * Generates a formal summary message of multiple Rendiciones (or monthly summary) for WhatsApp.
 */
export const generateGeneralSummaryWhatsAppMessage = (
  rendiciones: Rendicion[],
  settings: AppSettings,
  userName?: string,
  monthTitle?: string
): string => {
  const companyName = settings?.companyName || 'Empresa';
  let totalFondos = 0;
  let totalGastado = 0;
  let totalDocs = 0;
  let totalDevuelto = 0;
  let totalReembolsado = 0;
  let saldoPendienteActivo = 0;

  rendiciones.forEach(r => {
    const { totalFondos: rFondos } = getRendicionTotalFondos(r);
    const rGastado = r.totalAmount || 0;
    totalFondos += rFondos;
    totalGastado += rGastado;
    totalDocs += (r.comprobantes?.length || 0);

    if (r.liquidacion?.status === 'Liquidado') {
      const liqMonto = r.liquidacion.monto || Math.abs(rGastado - rFondos);
      if (r.liquidacion.type === 'Favor Empresa') totalDevuelto += liqMonto;
      if (r.liquidacion.type === 'Favor Trabajador') totalReembolsado += liqMonto;
    } else {
      saldoPendienteActivo += (rGastado - rFondos);
    }
  });

  const netBalance = saldoPendienteActivo;

  let balanceHeadline = '';
  if (totalDevuelto > 0 || totalReembolsado > 0) {
    balanceHeadline += `▫️ Liquidado Devoluciones (Empresa): *S/ ${totalDevuelto.toFixed(2)}*\n`;
    balanceHeadline += `▫️ Liquidado Reembolsos (Colaborador): *S/ ${totalReembolsado.toFixed(2)}*\n`;
  }

  if (Math.abs(netBalance) < 0.01) {
    balanceHeadline += `✅ *SALDO GLOBAL PENDIENTE:* *S/ 0.00 (TODOS LOS BLOQUES LIQUIDADOS)*`;
  } else if (netBalance > 0) {
    balanceHeadline += `🔴 *SALDO PENDIENTE:* *S/ ${netBalance.toFixed(2)} A FAVOR DEL TRABAJADOR*`;
  } else {
    balanceHeadline += `🟢 *SALDO PENDIENTE:* *S/ ${Math.abs(netBalance).toFixed(2)} A DEVOLVER A EMPRESA*`;
  }

  const headerTitle = monthTitle 
    ? `RESUMEN MENSUAL: ${monthTitle.toUpperCase()}`
    : `RESUMEN GENERAL DE VIÁTICOS Y GASTOS`;

  let msg = `📊 *${companyName.toUpperCase()}*\n`;
  msg += `*${headerTitle}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (userName) msg += `👤 *Usuario:* ${userName}\n`;
  if (monthTitle) msg += `🗓️ *Período:* ${monthTitle}\n`;
  msg += `📅 *Fecha Emisión:* ${format(new Date(), 'dd/MM/yyyy hh:mm a')}\n\n`;

  msg += `📈 *CONSOLIDADO FINANCIERO* (${rendiciones.length} Bloques / ${totalDocs} Docs)\n`;
  msg += `──────────────────────────\n`;
  msg += `▫️ Total Fondos Recibidos: *S/ ${totalFondos.toFixed(2)}*\n`;
  msg += `▫️ Total Gastos Sustentados: *S/ ${totalGastado.toFixed(2)}*\n`;
  msg += `──────────────────────────\n`;
  msg += `${balanceHeadline}\n\n`;

  msg += `📋 *DESGLOSE DE BLOQUES DE RENDICIÓN*\n`;
  msg += `──────────────────────────\n`;

  rendiciones.forEach((r, idx) => {
    const isLiquidado = r.liquidacion?.status === 'Liquidado';
    const statusEmoji = isLiquidado ? '✅' : r.status === 'Aprobado' ? '✅' : r.status === 'Rechazado' ? '❌' : '⏳';
    const { totalFondos: rFondos } = getRendicionTotalFondos(r);
    const rGastado = r.totalAmount || 0;
    const rBalance = rGastado - rFondos;
    
    let rBalStr = '';
    if (isLiquidado) {
      const liqMonto = r.liquidacion?.monto || Math.abs(rBalance);
      const liqType = r.liquidacion?.type === 'Favor Empresa' ? 'Devuelto' : 'Reembolsado';
      rBalStr = `(✅ Saldado S/ 0.00 | Liq: S/ ${liqMonto.toFixed(2)} ${liqType})`;
    } else if (rBalance > 0) {
      rBalStr = `(🔴 +S/ ${rBalance.toFixed(2)} Fav. Trab)`;
    } else if (rBalance < 0) {
      rBalStr = `(🟢 -S/ ${Math.abs(rBalance).toFixed(2)} Dev. Emp)`;
    } else {
      rBalStr = `(🔵 S/ 0.00)`;
    }

    msg += `${idx + 1}. *${r.name}* [${statusEmoji} ${isLiquidado ? 'LIQUIDADO' : r.status.toUpperCase()}]\n`;
    msg += `   • Gastado: *S/ ${rGastado.toFixed(2)}* de *S/ ${rFondos.toFixed(2)}* ${rBalStr}\n`;
  });

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✅ _Reporte oficial de liquidación generado por Jean-Barsa Rendiciones._`;

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
