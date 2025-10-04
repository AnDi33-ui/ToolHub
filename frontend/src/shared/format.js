/* Formatting helpers */

export function currencyFormat(value, currency='EUR', locale='it-IT'){
  if(value==null || isNaN(value)) value = 0;
  try { return new Intl.NumberFormat(locale,{ style:'currency', currency }).format(Number(value)); } catch(_){ return Number(value).toFixed(2)+' '+currency; }
}

export function numberFormat(value, locale='it-IT', options={ maximumFractionDigits:2 }){
  if(value==null || isNaN(value)) return '0';
  try { return new Intl.NumberFormat(locale, options).format(Number(value)); } catch(_){ return String(value); }
}

export function percentFormat(p, locale='it-IT'){
  if(p==null || isNaN(p)) return '0%';
  try { return new Intl.NumberFormat(locale,{ style:'percent', maximumFractionDigits:1 }).format(p/100); } catch(_){ return p+'%'; }
}

export function compactFormat(n, locale='it-IT'){
  if(n==null || isNaN(n)) return '0';
  try { return new Intl.NumberFormat(locale,{ notation:'compact', maximumFractionDigits:1 }).format(Number(n)); } catch(_){ return String(n); }
}
