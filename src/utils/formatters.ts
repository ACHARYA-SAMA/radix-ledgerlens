/* Repository touch marker. */
/**
 * Indian Rupee and Financial Utilities for Indian SME Accounting
 */

export function formatINR(amount: number, compact: boolean = false): string {
  if (isNaN(amount)) return '₹0';
  
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';

  if (compact) {
    if (absAmount >= 10000000) {
      // Crores (1 Cr = 1,00,00,000)
      const cr = absAmount / 10000000;
      return `${sign}₹${cr.toFixed(2)} Cr`;
    }
    if (absAmount >= 100000) {
      // Lakhs (1 Lakh = 1,00,000)
      const lk = absAmount / 100000;
      return `${sign}₹${lk.toFixed(2)} L`;
    }
    if (absAmount >= 1000) {
      return `${sign}₹${(absAmount / 1000).toFixed(1)}k`;
    }
  }

  // Standard Indian comma separator format: 12,34,567.00
  const parts = absAmount.toFixed(2).split('.');
  let integerPart = parts[0];
  const decimalPart = parts[1];

  let lastThree = integerPart.substring(integerPart.length - 3);
  const otherNumbers = integerPart.substring(0, integerPart.length - 3);
  if (otherNumbers !== '') {
    lastThree = ',' + lastThree;
  }
  const formattedInteger = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + lastThree;

  // Don't show .00 if whole rupee unless specified
  const finalFraction = decimalPart === '00' ? '' : `.${decimalPart}`;
  return `${sign}₹${formattedInteger}${finalFraction}`;
}

export function formatDateIndian(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

export function validateGSTIN(gstin: string): boolean {
  // Standard Indian 15-char GSTIN format: 2 digits state code, 10 chars PAN, 1 digit entity number, 1 char Z, 1 check digit
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstinRegex.test(gstin);
}

export function getRailColor(rail: string): string {
  switch (rail) {
    case 'RTGS':
      return 'text-amber-800 bg-amber-50 border-amber-200';
    case 'NEFT':
      return 'text-blue-800 bg-blue-50 border-blue-200';
    case 'UPI':
      return 'text-slate-100 bg-zinc-800/90 border-white/20';
    case 'IMPS':
      return 'text-purple-800 bg-purple-50 border-purple-200';
    case 'NACH':
      return 'text-indigo-800 bg-indigo-50 border-indigo-200';
    default:
      return 'text-slate-700 bg-slate-100 border-slate-200';
  }
}
