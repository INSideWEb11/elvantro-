/**
 * Currency Formatting Utility for Elentory ERP
 * Standard default: Indian Rupee (₹ / INR)
 * Supports Indian numbering format (e.g. ₹1,50,000.00, ₹2,655.00, ₹0.0200)
 */

export type CurrencyCode = 'INR' | 'USD' | 'EUR';

export const DEFAULT_CURRENCY_CODE: CurrencyCode = 'INR';
export const DEFAULT_CURRENCY_SYMBOL = '₹';

// Key for persisting user currency preference
const CURRENCY_STORAGE_KEY = 'elentory_preferred_currency';

export function getActiveCurrency(): CurrencyCode {
  if (typeof window === 'undefined') return DEFAULT_CURRENCY_CODE;
  try {
    const saved = localStorage.getItem(CURRENCY_STORAGE_KEY) as CurrencyCode;
    if (saved && (saved === 'INR' || saved === 'USD' || saved === 'EUR')) {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_CURRENCY_CODE;
}

export function setActiveCurrency(code: CurrencyCode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, code);
    window.dispatchEvent(new CustomEvent('currency_change', { detail: { currency: code } }));
  } catch {
    // Ignore storage errors
  }
}

export function getCurrencySymbol(code: CurrencyCode = DEFAULT_CURRENCY_CODE): string {
  switch (code) {
    case 'INR':
      return '₹';
    case 'USD':
      return '$';
    case 'EUR':
      return '€';
    default:
      return '₹';
  }
}

/**
 * Formats a number in Indian Rupee format (Lakhs & Crores if >= 100,000)
 * Example: 2655 -> ₹2,655.00
 * Example: 150000 -> ₹1,50,000.00
 * Fractional component prices: 0.014 -> ₹0.0140
 */
export function formatINR(amount: number, forceDecimals?: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return '₹0.00';
  }

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  // If fractional unit price (less than 1 Rupee but greater than 0)
  let decimals = forceDecimals !== undefined ? forceDecimals : 2;
  if (forceDecimals === undefined && absAmount > 0 && absAmount < 1) {
    decimals = 4;
  }

  const formattedNumber = absAmount.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return `${isNegative ? '-' : ''}₹${formattedNumber}`;
}

/**
 * Universal currency formatter for the ERP
 */
export function formatCurrency(
  amount: number,
  currency: CurrencyCode = 'INR',
  decimals?: number
): string {
  if (isNaN(amount) || amount === null || amount === undefined) {
    return `${getCurrencySymbol(currency)}0.00`;
  }

  if (currency === 'INR') {
    return formatINR(amount, decimals);
  }

  const symbol = getCurrencySymbol(currency);
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);

  let dec = decimals !== undefined ? decimals : 2;
  if (decimals === undefined && absAmount > 0 && absAmount < 1) {
    dec = 4;
  }

  const formatted = absAmount.toLocaleString('en-US', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

  return `${isNegative ? '-' : ''}${symbol}${formatted}`;
}
