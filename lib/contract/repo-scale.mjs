/**
 * Owner-named repurchase scale from MAC Financial Projection Scenario 60.
 * Desk settings and per-contract terms override these defaults.
 * Customer-facing copy must not call this a loan or interest.
 */

export const SCENARIO_60 = {
  setupFee: 0.01,
  annualAdjustment: 0.185,
  monthlyAdjustment: 0.185 / 12,
  earlyRepurchaseAmount: 0.035,
  purchaseShare: 0.6,
  brokerFee: 0.035,
  tenors: {
    9: { minMonths: 3, earlyStart: 3, earlyUntil: 6 },
    10: { minMonths: 3, earlyStart: 3, earlyUntil: 7 },
    11: { minMonths: 3, earlyStart: 3, earlyUntil: 8 },
    12: { minMonths: 3, earlyStart: 4, earlyUntil: 8 },
  },
};

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function whole(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * @param {Record<string, unknown>} [source]
 * @param {number} [termMonths]
 */
export function resolveScale(source = {}, termMonths) {
  const term = whole(termMonths ?? source.termMonths, 12);
  const workbook = SCENARIO_60.tenors[term] ?? SCENARIO_60.tenors[12];
  const annualAdjustment = finite(
    source.annualAdjustment ?? source.startingRate ?? source.rate,
    SCENARIO_60.annualAdjustment,
  );
  return {
    termMonths: term,
    purchaseShare: finite(source.purchaseShare ?? source.maxLtv ?? source.ltv, SCENARIO_60.purchaseShare),
    setupFee: finite(source.setupFee, SCENARIO_60.setupFee),
    annualAdjustment,
    monthlyAdjustment: finite(source.monthlyAdjustment, annualAdjustment / 12),
    earlyRepurchaseAmount: finite(source.earlyRepurchaseAmount, SCENARIO_60.earlyRepurchaseAmount),
    brokerFee: finite(source.brokerFee, SCENARIO_60.brokerFee),
    minMonths: whole(source.minMonths, workbook.minMonths),
    earlyStart: whole(source.earlyStart ?? source.earlyStartMonth, workbook.earlyStart),
    earlyUntil: whole(source.earlyUntil ?? source.earlyUntilMonth, workbook.earlyUntil),
  };
}

/**
 * @param {Record<string, unknown>} [source]
 * @param {number} [termMonths]
 */
export function agreementScaleFromDesk(settings = {}, openShell, termMonths) {
  return settingsToTerms(
    {
      ...settings,
      ...openShell,
      ...(openShell
        ? {
            startingRate: openShell.rate,
            annualAdjustment: openShell.rate,
            maxLtv: openShell.ltv,
            purchaseShare: openShell.ltv,
          }
        : {}),
    },
    termMonths,
  );
}

export function purchaseShareForTerm(settings = {}, openShell, termMonths) {
  return openShell?.termMonths === termMonths
    ? finite(openShell.ltv, finite(settings.maxLtv, SCENARIO_60.purchaseShare))
    : finite(settings.maxLtv, SCENARIO_60.purchaseShare);
}

/**
 * Browser PDF mint uses the same Scenario 60 floors as live-book POST.
 * @param {Record<string, unknown>} [source]
 */
export function assertScenario60Floors(source = {}) {
  const share = Number(source.purchaseShare ?? SCENARIO_60.purchaseShare);
  if (!Number.isFinite(share) || share <= 0 || share > SCENARIO_60.purchaseShare) {
    return { ok: false, error: "AGREEMENT_SCALE_INVALID" };
  }
  const floors = {
    setupFee: SCENARIO_60.setupFee,
    annualAdjustment: SCENARIO_60.annualAdjustment,
    earlyRepurchaseAmount: SCENARIO_60.earlyRepurchaseAmount,
    brokerFee: SCENARIO_60.brokerFee,
  };
  for (const [key, minimum] of Object.entries(floors)) {
    const raw = Number(source[key] ?? minimum);
    if (!Number.isFinite(raw) || raw < minimum) {
      return { ok: false, error: "AGREEMENT_SCALE_INVALID" };
    }
  }
  return { ok: true, error: null };
}

export function settingsToTerms(source = {}, termMonths) {
  const scale = resolveScale(source, termMonths);
  return {
    purchaseShare: scale.purchaseShare,
    setupFee: scale.setupFee,
    annualAdjustment: scale.annualAdjustment,
    earlyRepurchaseAmount: scale.earlyRepurchaseAmount,
    brokerFee: scale.brokerFee,
    minMonths: scale.minMonths,
    earlyStartMonth: scale.earlyStart,
    earlyUntilMonth: scale.earlyUntil,
  };
}

/**
 * @param {number | Record<string, unknown>} scaleOrTerm
 */
function termsOf(scaleOrTerm) {
  if (typeof scaleOrTerm === "number") return resolveScale({}, scaleOrTerm);
  return resolveScale(scaleOrTerm, scaleOrTerm?.termMonths);
}

/**
 * @param {number} monthsHeld
 * @param {number | Record<string, unknown>} scaleOrTerm
 */
export function repurchaseMarkup(monthsHeld, scaleOrTerm) {
  const tenor = termsOf(scaleOrTerm);
  if (monthsHeld < 1 || monthsHeld > tenor.termMonths) return null;
  if (tenor.purchaseShare <= 0) return null;
  const charged = monthsHeld <= tenor.minMonths ? tenor.minMonths : monthsHeld;
  const early =
    monthsHeld >= tenor.earlyStart && monthsHeld < tenor.earlyUntil ? tenor.earlyRepurchaseAmount : 0;
  return tenor.monthlyAdjustment * charged + tenor.setupFee + early;
}

/**
 * @param {number} saleAmount
 * @param {number} monthsHeld
 * @param {number | Record<string, unknown>} scaleOrTerm
 */
export function repurchaseDollars(saleAmount, monthsHeld, scaleOrTerm) {
  const markup = repurchaseMarkup(monthsHeld, scaleOrTerm);
  if (markup == null || !Number.isFinite(saleAmount)) return null;
  return Math.round(saleAmount * (1 + markup) * 100) / 100;
}

/**
 * @param {number} saleAmount
 * @param {number | Record<string, unknown>} [scaleOrTerm]
 */
export function liquidationDollars(saleAmount, scaleOrTerm = 12) {
  const tenor = termsOf(scaleOrTerm);
  if (!Number.isFinite(saleAmount) || saleAmount <= 0 || tenor.purchaseShare <= 0) return null;
  return Math.round((saleAmount / tenor.purchaseShare) * 100) / 100;
}

/**
 * @param {number} saleAmount
 * @param {number | Record<string, unknown>} [scaleOrTerm]
 */
export function liquidationNetDollars(saleAmount, scaleOrTerm = 12) {
  const tenor = termsOf(scaleOrTerm);
  const liquidation = liquidationDollars(saleAmount, tenor);
  if (liquidation == null) return null;
  return Math.round(liquidation * (1 - tenor.brokerFee) * 100) / 100;
}

/**
 * @param {number} monthsHeld
 * @param {number | Record<string, unknown>} scaleOrTerm
 */
export function scheduleNote(monthsHeld, scaleOrTerm) {
  const tenor = termsOf(scaleOrTerm);
  const early = monthsHeld >= tenor.earlyStart && monthsHeld < tenor.earlyUntil;
  if (monthsHeld <= tenor.minMonths) {
    return early
      ? "Setup + minimum term add + early repurchase amount"
      : "Setup + minimum term add";
  }
  if (early) return "Setup + monthly add + early repurchase amount";
  return "Setup + monthly add";
}

/**
 * @param {string} isoDate
 * @param {number} months
 */
export function addCalendarMonths(isoDate, months) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate));
  if (!match) return null;
  const year0 = Number(match[1]);
  const month0 = Number(match[2]) - 1;
  const day0 = Number(match[3]);
  const total = month0 + months;
  const year = year0 + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(day0, lastDay);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * @param {{ saleAmount: number, termMonths?: number, startDate?: string } & Record<string, unknown>} input
 */
export function repurchaseSchedule(input) {
  const tenor = resolveScale(input, input.termMonths);
  if (!Number.isFinite(input.saleAmount) || input.saleAmount <= 0) {
    return { ok: false, errors: ["SALE_AMOUNT_REQUIRED"], rows: [], scale: tenor };
  }
  if (tenor.termMonths < 1 || tenor.termMonths > 36 || tenor.purchaseShare <= 0) {
    return { ok: false, errors: ["SCALE_TERMS_INVALID"], rows: [], scale: tenor };
  }
  const startIso = input.startDate
    ? String(input.startDate).slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  if (!addCalendarMonths(startIso, 0)) {
    return { ok: false, errors: ["START_DATE_INVALID"], rows: [], scale: tenor };
  }
  const rows = [];
  for (let month = 1; month <= tenor.termMonths; month += 1) {
    rows.push({
      month,
      date: addCalendarMonths(startIso, month),
      price: repurchaseDollars(input.saleAmount, month, tenor),
      note: scheduleNote(month, tenor),
    });
  }
  return {
    ok: true,
    errors: [],
    scale: tenor,
    rows,
    liquidation: liquidationDollars(input.saleAmount, tenor),
    liquidationNet: liquidationNetDollars(input.saleAmount, tenor),
  };
}
