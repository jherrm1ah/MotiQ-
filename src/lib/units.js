// Countries Motiq knows about, with the currency and distance unit people there use. Anyone can
// change their currency and unit in Settings; this only picks good defaults.
export const COUNTRIES = [
  ["NG", "Nigeria", "NGN", "km"], ["GH", "Ghana", "GHS", "km"], ["KE", "Kenya", "KES", "km"], ["ZA", "South Africa", "ZAR", "km"],
  ["EG", "Egypt", "EGP", "km"], ["MA", "Morocco", "MAD", "km"], ["CI", "Côte d'Ivoire", "XOF", "km"], ["SN", "Senegal", "XOF", "km"],
  ["CM", "Cameroon", "XAF", "km"], ["UG", "Uganda", "UGX", "km"], ["TZ", "Tanzania", "TZS", "km"], ["RW", "Rwanda", "RWF", "km"],
  ["ET", "Ethiopia", "ETB", "km"], ["US", "United States", "USD", "mi"], ["CA", "Canada", "CAD", "km"], ["MX", "Mexico", "MXN", "km"],
  ["BR", "Brazil", "BRL", "km"], ["AR", "Argentina", "ARS", "km"], ["CO", "Colombia", "COP", "km"], ["CL", "Chile", "CLP", "km"],
  ["GB", "United Kingdom", "GBP", "mi"], ["IE", "Ireland", "EUR", "km"], ["FR", "France", "EUR", "km"], ["DE", "Germany", "EUR", "km"],
  ["ES", "Spain", "EUR", "km"], ["IT", "Italy", "EUR", "km"], ["NL", "Netherlands", "EUR", "km"], ["PT", "Portugal", "EUR", "km"],
  ["PL", "Poland", "PLN", "km"], ["SE", "Sweden", "SEK", "km"], ["NO", "Norway", "NOK", "km"], ["CH", "Switzerland", "CHF", "km"],
  ["TR", "Turkey", "TRY", "km"], ["AE", "United Arab Emirates", "AED", "km"], ["SA", "Saudi Arabia", "SAR", "km"], ["QA", "Qatar", "QAR", "km"],
  ["IN", "India", "INR", "km"], ["PK", "Pakistan", "PKR", "km"], ["BD", "Bangladesh", "BDT", "km"], ["ID", "Indonesia", "IDR", "km"],
  ["MY", "Malaysia", "MYR", "km"], ["PH", "Philippines", "PHP", "km"], ["SG", "Singapore", "SGD", "km"], ["TH", "Thailand", "THB", "km"],
  ["VN", "Vietnam", "VND", "km"], ["CN", "China", "CNY", "km"], ["JP", "Japan", "JPY", "km"], ["KR", "South Korea", "KRW", "km"],
  ["AU", "Australia", "AUD", "km"], ["NZ", "New Zealand", "NZD", "km"],
];
export const CURRENCIES = [...new Set(COUNTRIES.map((c) => c[2]).concat(["USD", "EUR", "GBP"]))].sort();
export const countryName = (code) => (COUNTRIES.find((c) => c[0] === code) || [null, code])[1];
export function defaultsFor(code) {
  const c = COUNTRIES.find((x) => x[0] === code);
  return c ? { currency: c[2], distance_unit: c[3] } : { currency: "USD", distance_unit: "km" };
}
// The phone's own country, from its language setting (e.g. "en-NG" → NG), as a first guess.
export function guessCountry() {
  try {
    const tag = (navigator.languages && navigator.languages[0]) || navigator.language || "";
    const region = (new Intl.Locale(tag).maximize().region || "").toUpperCase();
    return COUNTRIES.some((c) => c[0] === region) ? region : "";
  } catch (e) { return ""; }
}

export function money(amount, currency = "USD") {
  if (amount == null || amount === "") return "";
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: Number(amount) % 1 ? 2 : 0 }).format(Number(amount)); }
  catch (e) { return `${currency} ${Number(amount).toLocaleString()}`; }
}
export function distance(n, unit = "km") {
  if (n == null || n === "") return "";
  return `${Math.round(Number(n)).toLocaleString()} ${unit}`;
}
export function dateLabel(d) {
  if (!d) return "";
  const date = new Date(d.length === 10 ? `${d}T12:00:00` : d);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: date.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}
export function daysUntil(d) {
  const t = new Date(`${d}T12:00:00`).getTime();
  const now = new Date(); now.setHours(12, 0, 0, 0);
  return Math.round((t - now.getTime()) / 86400000);
}
export const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
