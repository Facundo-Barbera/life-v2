// InBody scans: the value fields, and the parsers for the result-sheet QR and
// the LookinBody CSV export. Ported from the old engine (body/fields.ts,
// inbody.ts, inbody-csv.ts); pure, runs in the browser, the server and RN.
// Dates without a zone are read in the person's timezone (`tz`).
import { DEFAULT_TZ, zonedInstant } from "./dates";

/** Every numeric scan value with its plausibility ceiling (catches lb/g mix-ups). */
export const FIELDS = {
  weight: 400,
  skeletalMuscleMass: 150,
  bodyFatMass: 300,
  percentBodyFat: 80,
  bmi: 100,
  visceralFatLevel: 30,
  bmr: 6000,
  totalBodyWater: 150,
  ecwRatio: 1,
  inbodyScore: 150,
  softLeanMass: 200,
  protein: 50,
  mineral: 20,
  boneMineralContent: 15,
  bodyCellMass: 150,
  intracellularWater: 100,
  extracellularWater: 100,
  smi: 30,
  waistHipRatio: 3,
  waistCircumference: 300,
  visceralFatArea: 500,
  phaseAngle: 20,
} as const;

export type ValueKey = keyof typeof FIELDS;
export const VALUE_KEYS = Object.keys(FIELDS) as ValueKey[];
export type ScanValues = Record<ValueKey, number | null>;

export const SEGMENTS = ["rightArm", "leftArm", "trunk", "rightLeg", "leftLeg"] as const;
export type SegmentKey = (typeof SEGMENTS)[number];
export type Segmental = Record<SegmentKey, number>;

export type ScanSource = "inbody" | "manual";

/** A scan before it is stored. `measuredAt` is epoch ms. */
export type ScanInput = ScanValues & {
  measuredAt: number;
  source: ScanSource;
  externalId: string | null;
  device: string | null;
  segmentalLean: Segmental | null;
  segmentalFat: Segmental | null;
  segmentalEcw: Segmental | null;
  raw: string | null;
};

export const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Same InBody test, same id: QR and CSV imports of one test land on one row. */
export const inbodyId = (measuredAt: number) => `inbody:${Math.floor(measuredAt / 60_000)}`;

export function blankScan(source: ScanSource, measuredAt: number): ScanInput {
  const values = Object.fromEntries(VALUE_KEYS.map((k) => [k, null])) as ScanValues;
  return { ...values, measuredAt, source, externalId: null, device: null, segmentalLean: null, segmentalFat: null, segmentalEcw: null, raw: null };
}

/** At least two of weight / muscle / fat kg / fat %, so random data is not taken for a scan. */
export function hasComposition(scan: ScanValues): boolean {
  return [scan.weight, scan.skeletalMuscleMass, scan.bodyFatMass, scan.percentBodyFat].filter((v) => v != null).length >= 2;
}

/** Fills in what the sheet implies but did not say (fat kg ↔ fat %). */
export function completeScan<T extends ScanValues>(s: T): T {
  const out = { ...s };
  if (out.bodyFatMass == null && out.weight != null && out.percentBodyFat != null) out.bodyFatMass = round((out.weight * out.percentBodyFat) / 100, 1);
  if (out.percentBodyFat == null && out.weight != null && out.bodyFatMass != null) out.percentBodyFat = round((out.bodyFatMass / out.weight) * 100, 1);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO, epoch ms/s, InBody's compact `YYYYMMDD[HHmm[ss]]`, or `DD/MM/YYYY [HH:mm]`. Local to `tz`. */
export function parseDate(v: unknown, tz = DEFAULT_TZ): number | null {
  const s = String(v ?? "").trim();
  const local = (y: number, mo: number, d: number, h = 0, mi = 0, sec = 0) => {
    const check = new Date(Date.UTC(y, mo - 1, d));
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) return null;
    return zonedInstant(`${y}-${pad(mo)}-${pad(d)}`, `${pad(h)}:${pad(mi)}`, tz).getTime() + sec * 1000;
  };
  const compact = /^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/.exec(s);
  if (compact && [8, 12, 14].includes(s.length)) return local(...(compact.slice(1).filter(Boolean).map(Number) as [number, number, number]));
  if (/^\d{13}$/.test(s)) return Number(s);
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (dmy) {
    const [d, mo, y, h, mi, sec] = dmy.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
    return local(y!, mo!, d!, h, mi, sec);
  }
  const ymd = /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (ymd) {
    const [y, mo, d, h, mi, sec] = ymd.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
    return local(y!, mo!, d!, h, mi, sec);
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

/** "72,4" or "72.4" → 72.4; "-", "" and junk → null. */
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Header/key to a comparable token: lowercase, no accents, no units in parentheses, alphanumerics only. */
export const normalizeKey = (key: string) =>
  key.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]/g, "");

const ALIASES: Record<ValueKey, string[]> = {
  weight: ["weight", "wt", "bodyweight", "peso"],
  skeletalMuscleMass: ["skeletalmusclemass", "smm", "masamuscularesqueletica", "mme"],
  bodyFatMass: ["bodyfatmass", "bfm", "masadegrasacorporal", "masagrasacorporal", "masagrasa"],
  percentBodyFat: ["percentbodyfat", "pbf", "porcentajedegrasacorporal", "porcentajegrasacorporal", "pgc"],
  bmi: ["bmi", "bodymassindex", "imc", "indicedemasacorporal"],
  visceralFatLevel: ["visceralfatlevel", "vfl", "niveldegrasavisceral", "nivelgrasavisceral"],
  bmr: ["basalmetabolicrate", "bmr", "tasametabolicabasal", "tmb", "metabolismobasal"],
  totalBodyWater: ["totalbodywater", "tbw", "aguacorporaltotal", "act"],
  ecwRatio: ["ecwratio", "ecwtbw", "ratioaec", "aecact"],
  inbodyScore: ["inbodyscore", "score", "puntuacioninbody", "puntajeinbody"],
  softLeanMass: ["softleanmass", "slm", "masamagrablanda"],
  protein: ["protein", "proteina", "proteinas"],
  mineral: ["mineral", "minerals", "minerales"],
  boneMineralContent: ["bonemineralcontent", "bmc", "contenidomineraloseo"],
  bodyCellMass: ["bodycellmass", "bcm", "masacelularcorporal", "masacelular"],
  intracellularWater: ["intracellularwater", "icw", "aguaintracelular"],
  extracellularWater: ["extracellularwater", "ecw", "aguaextracelular"],
  smi: ["smi", "skeletalmuscleindex", "indicedemasamuscularesqueletica"],
  waistHipRatio: ["waisthipratio", "whr", "indicecinturacadera", "ratiocinturacadera"],
  waistCircumference: ["waistcircumference", "circunferenciadecintura", "perimetrodecintura"],
  visceralFatArea: ["visceralfatarea", "vfa", "areadegrasavisceral"],
  phaseAngle: ["wholebodyphaseangle", "phaseangle", "angulodefase"],
};
const DATE_KEYS = ["date", "fecha", "datetime", "fechayhora", "testdate", "testdatetime", "measuredat"];
const DEVICE_KEYS = ["measurementdevice", "device", "equipo", "dispositivo", "model"];
const SEGMENT_NAMES: Record<SegmentKey, [string, string]> = {
  rightArm: ["rightarm", "brazoderecho"],
  leftArm: ["leftarm", "brazoizquierdo"],
  trunk: ["trunk", "tronco"],
  rightLeg: ["rightleg", "piernaderecha"],
  leftLeg: ["leftleg", "piernaizquierda"],
};
const SEGMENTAL_KEYS: Record<"segmentalLean" | "segmentalFat" | "segmentalEcw", (en: string, es: string) => string[]> = {
  segmentalLean: (en, es) => [`${en}leanmass`, `leanmass${en}`, `masamagra${es}`, `masamagrade${es}`],
  segmentalFat: (en, es) => [`${en}fatmass`, `fatmass${en}`, `masagrasa${es}`, `masagrasade${es}`],
  segmentalEcw: (en, es) => [`${en}ecwratio`, `ecwratio${en}`, `ratioaec${es}`],
};

/** A scan from named values (a CSV row, JSON, a QR query string). `measuredAt` null when no date was readable. */
export function readRecord(record: Record<string, unknown>, source: ScanSource, tz = DEFAULT_TZ): { scan: ScanInput; measuredAt: number | null } {
  const values = new Map(Object.entries(record).map(([k, v]) => [normalizeKey(k), v]));
  const pick = (keys: string[]) => keys.map((k) => values.get(k)).find((v) => v !== undefined && v !== null && v !== "");
  const dateValue = pick(DATE_KEYS);
  const measuredAt = dateValue === undefined ? null : parseDate(dateValue, tz);
  const scan = blankScan(source, measuredAt ?? Date.now());
  for (const k of VALUE_KEYS) {
    const n = toNumber(pick(ALIASES[k]));
    scan[k] = n !== null && n > 0 && n <= FIELDS[k] ? n : null;
  }
  for (const field of Object.keys(SEGMENTAL_KEYS) as (keyof typeof SEGMENTAL_KEYS)[]) {
    const keys = SEGMENTAL_KEYS[field];
    const parts = SEGMENTS.map((s) => toNumber(pick(keys(...SEGMENT_NAMES[s]))));
    scan[field] = parts.every((n) => n !== null) ? (Object.fromEntries(SEGMENTS.map((s, i) => [s, parts[i]])) as Segmental) : null;
  }
  const device = pick(DEVICE_KEYS);
  scan.device = device === undefined ? null : String(device).trim().slice(0, 32) || null;
  return { scan, measuredAt };
}

// ---------------------------------------------------------------------------
// QR
// ---------------------------------------------------------------------------

type ParseFailure = { ok: false; code: "unknown_inbody_format" | "unmapped_ibdata"; message: string };
export type ParseResult = { ok: true; scan: ScanInput } | ParseFailure;

/** One value inside an IBData segment: digits at [offset, offset+length), times `scale`. */
export type IBDataField = { part: number; offset: number; length: number; scale: number };
export type IBDataLayout = {
  name: string;
  matches: (parts: string[]) => boolean;
  fields: Partial<Record<ValueKey, IBDataField>>;
  segmentalLean?: Record<SegmentKey, IBDataField>;
  segmentalFat?: Record<SegmentKey, IBDataField>;
  /** `YYYYMMDDHHmmss` digits: the test time. */
  date?: { part: number; offset: number };
};

const at = (part: number, offset: number, scale: number, length = 4): IBDataField => ({ part, offset, length, scale });

/**
 * InBody 270 (39 segments), mapped from one real QR by cross-checks (BMI =
 * weight / height², BFM = weight × PBF, TBW + protein + mineral = FFM, …).
 * Not mapped: visceral fat level and InBody score. The 270 reports no ECW ratio.
 */
const INBODY_270: IBDataLayout = {
  name: "InBody 270",
  matches: (parts) => parts.length === 39 && /^270-/.test(parts[0] ?? "") && (parts[33]?.length ?? 0) >= 112 && (parts[38]?.length ?? 0) >= 109,
  date: { part: 33, offset: 9 },
  fields: {
    protein: at(33, 23, 0.1),
    mineral: at(33, 35, 0.01),
    bodyFatMass: at(33, 47, 0.1),
    totalBodyWater: at(33, 59, 0.1),
    weight: at(33, 75, 0.1),
    skeletalMuscleMass: at(33, 91, 0.1),
    bmi: at(33, 104, 0.1),
    percentBodyFat: at(33, 108, 0.1),
    bmr: at(34, 4, 1),
    waistHipRatio: at(34, 8, 0.01),
    smi: at(38, 105, 0.1),
  },
  segmentalLean: {
    rightArm: at(38, 20, 0.01),
    leftArm: at(38, 24, 0.01),
    trunk: at(38, 28, 0.1),
    rightLeg: at(38, 32, 0.01),
    leftLeg: at(38, 36, 0.01),
  },
  segmentalFat: {
    rightArm: at(38, 40, 0.1),
    leftArm: at(38, 44, 0.1),
    trunk: at(38, 48, 0.1),
    rightLeg: at(38, 52, 0.1),
    leftLeg: at(38, 56, 0.1),
  },
};

export const IBDATA_LAYOUTS: IBDataLayout[] = [INBODY_270];

/** Fixed-width ASCII digits to a number; null when the slice is not all digits. */
export function decodeDigits(slice: string, scale: number): number | null {
  return /^\d+$/.test(slice) ? Math.round(Number(slice) * scale * 1000) / 1000 : null;
}

/** A stable id for a payload without a readable date (FNV-1a, 2 × 32 bits; no crypto needed). */
function hashId(payload: string): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x811c9dc5) >>> 0;
  }
  return `inbody:${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`;
}

function fromIBData(ibdata: string, payload: string, now: number, layouts: IBDataLayout[], tz: string): ParseResult {
  const parts = ibdata.split("!");
  const layout = layouts.find((l) => l.matches(parts));
  if (!layout) {
    const model = /^(\w+)-/.exec(parts[0] ?? "")?.[1];
    return {
      ok: false,
      code: "unmapped_ibdata",
      message: `Es un QR de InBody${model ? ` ${model}` : ""}, pero todavía no sé leer ese modelo. Carga los valores a mano.`,
    };
  }
  // All-zero digits mean "not measured" on these sheets.
  const read = (f: IBDataField) => decodeDigits(parts[f.part]?.slice(f.offset, f.offset + f.length) ?? "", f.scale) || null;
  const measuredAt = layout.date ? parseDate(parts[layout.date.part]?.slice(layout.date.offset, layout.date.offset + 14), tz) : null;
  const scan = blankScan("inbody", measuredAt ?? now);
  scan.externalId = measuredAt ? inbodyId(measuredAt) : hashId(payload);
  scan.device = /^(\w+)-/.exec(parts[0] ?? "")?.[1] ?? null;
  scan.raw = payload;
  for (const [key, f] of Object.entries(layout.fields) as [ValueKey, IBDataField][]) scan[key] = read(f);
  for (const key of ["segmentalLean", "segmentalFat"] as const) {
    const fields = layout[key];
    const values = fields && SEGMENTS.map((s) => read(fields[s]));
    scan[key] = values?.every((v) => v !== null) ? (Object.fromEntries(SEGMENTS.map((s, i) => [s, values[i]])) as Segmental) : null;
  }
  return hasComposition(scan)
    ? { ok: true, scan }
    : { ok: false, code: "unmapped_ibdata", message: `El QR del ${layout.name} no trajo los valores esperados.` };
}

const unknown = (): ParseFailure => ({
  ok: false,
  code: "unknown_inbody_format",
  message: "No reconozco esto como un resultado de InBody. Puedes cargar los valores a mano.",
});

function fromNamedValues(record: Record<string, unknown>, payload: string, now: number, tz: string): ParseResult {
  const { scan, measuredAt } = readRecord(record, "inbody", tz);
  if (!hasComposition(scan)) return unknown();
  scan.measuredAt = measuredAt ?? now;
  scan.externalId = measuredAt ? inbodyId(measuredAt) : hashId(payload);
  scan.raw = payload;
  return { ok: true, scan };
}

/** The text of an InBody QR (URL with `IBData=`, a query string, or JSON). */
export function parseInBody(text: string, options: { now?: number; layouts?: IBDataLayout[]; tz?: string } = {}): ParseResult {
  const payload = text.trim();
  const now = options.now ?? Date.now();
  const layouts = options.layouts ?? IBDATA_LAYOUTS;
  const tz = options.tz ?? DEFAULT_TZ;
  if (!payload) return unknown();
  if (payload.startsWith("{")) {
    try {
      return fromNamedValues(JSON.parse(payload) as Record<string, unknown>, payload, now, tz);
    } catch {
      return unknown();
    }
  }
  // URLSearchParams also undoes `%21` (an encoded `!`), which would shift every offset.
  const query = /^[a-z][a-z0-9+.-]*:\/\//i.test(payload) ? payload.slice(payload.indexOf("?") + 1 || payload.length) : payload;
  const params = new URLSearchParams(query.split("#")[0]!);
  for (const [key, value] of params) {
    if (key.toLowerCase() === "ibdata") return fromIBData(value, payload, now, layouts, tz);
  }
  return fromNamedValues(Object.fromEntries(params), payload, now, tz);
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** RFC 4180-ish: quoted fields may hold the separator, newlines and doubled quotes. */
export function parseCsv(text: string, separator: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') field += text[++i];
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === separator) endField();
    else if (c === "\n") endRow();
    else if (c !== "\r") field += c;
  }
  if (field || row.length) endRow();
  return rows.filter((r) => r.some((f) => f.trim()));
}

const detectSeparator = (headerLine: string) =>
  [",", ";", "\t"].map((s) => [s, headerLine.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];

export type CsvSkip = { line: number; reason: string };

/** InBody / LookinBody CSV export → scans (one row per test). */
export function parseInBodyCsv(text: string, tz = DEFAULT_TZ): { scans: ScanInput[]; skipped: CsvSkip[] } {
  const clean = text.replace(/^﻿/, "");
  const [header, ...rows] = parseCsv(clean, detectSeparator(clean.split(/\r?\n/, 1)[0] ?? ""));
  const scans: ScanInput[] = [];
  const skipped: CsvSkip[] = [];
  if (!header) return { scans, skipped: [{ line: 1, reason: "El archivo está vacío." }] };
  rows.forEach((cells, i) => {
    const line = i + 2;
    const record = Object.fromEntries(header.map((name, c) => [name.trim(), (cells[c] ?? "").trim()]));
    const { scan, measuredAt } = readRecord(record, "inbody", tz);
    if (measuredAt === null) skipped.push({ line, reason: "Sin fecha legible." });
    else if (scan.weight === null && !hasComposition(scan)) skipped.push({ line, reason: "Sin peso ni composición." });
    else scans.push({ ...scan, measuredAt, externalId: inbodyId(measuredAt), raw: JSON.stringify(record) });
  });
  return { scans, skipped };
}
