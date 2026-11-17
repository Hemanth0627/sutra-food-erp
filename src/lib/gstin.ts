/** Indian GST state codes (first two digits of a GSTIN / place-of-supply code). */
export const INDIAN_STATES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
];

export function stateName(code: string): string {
  return INDIAN_STATES.find((s) => s.code === code)?.name ?? `State ${code}`;
}

/** "33-Tamil Nadu" */
export function placeOfSupplyLabel(code: string): string {
  return `${code}-${stateName(code)}`;
}

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GSTIN check character (mod-36 algorithm used by the GST network). */
export function gstinCheckChar(first14: string): string {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) throw new Error("Invalid GSTIN character");
    const product = value * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (total % 36)) % 36];
}

export type GstinCheck = { valid: true; stateCode: string } | { valid: false; reason: string };

export function validateGstin(raw: string): GstinCheck {
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(gstin)) return { valid: false, reason: "GSTIN must be 15 characters in the format 22AAAAA0000A1Z5" };
  const stateCode = gstin.slice(0, 2);
  if (!INDIAN_STATES.some((s) => s.code === stateCode)) return { valid: false, reason: `Unknown state code ${stateCode}` };
  if (gstinCheckChar(gstin.slice(0, 14)) !== gstin[14]) return { valid: false, reason: "GSTIN checksum does not match" };
  return { valid: true, stateCode };
}

/** Builds a syntactically valid (checksummed) GSTIN. Used only for fictional seed data. */
export function makeDemoGstin(stateCode: string, pan: string, entity = "1"): string {
  const first14 = `${stateCode}${pan}${entity}Z`;
  return first14 + gstinCheckChar(first14);
}
