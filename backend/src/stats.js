const math = require('mathjs');

// ===========================================================================
//  NUMERICAL HELPERS — p-value from t-distribution via incomplete beta
//  (Lanczos + Lentz continued fraction, Numerical Recipes approach)
// ===========================================================================

function lnGamma(z) {
    const g = 7;
    const coef = [
        0.99999999999980993, 676.5203681218851, -1259.1392167224028,
        771.32342877765313, -176.61502916214059, 12.507343278686905,
        -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
    ];
    if (z < 0.5) {
        return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
    }
    z -= 1;
    let x = coef[0];
    for (let i = 1; i < g + 2; i++) x += coef[i] / (z + i);
    const t = z + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a, b, x) {
    const MAXIT = 200;
    const EPS = 3e-12;
    const FPMIN = 1e-30;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;

    for (let m = 1; m <= MAXIT; m++) {
        const m2 = 2 * m;
        let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + aa / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        h *= d * c;

        aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
        d = 1 + aa * d;
        if (Math.abs(d) < FPMIN) d = FPMIN;
        c = 1 + aa / c;
        if (Math.abs(c) < FPMIN) c = FPMIN;
        d = 1 / d;
        const del = d * c;
        h *= del;
        if (Math.abs(del - 1) < EPS) break;
    }
    return h;
}

function ibeta(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
        lnGamma(a + b) - lnGamma(a) - lnGamma(b) +
        a * Math.log(x) + b * Math.log(1 - x),
    );
    if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
}

function tDistPValue(tStat, df) {
    const x = df / (df + tStat * tStat);
    return ibeta(x, df / 2, 0.5);
}

// ===========================================================================
//  1. ESTADÍSTICAS DESCRIPTIVAS
// ===========================================================================

const calculateBasicStats = (arr) => {
    if (!arr || arr.length === 0) return null;
    const n = arr.length;
    return {
        mean: math.mean(arr),
        median: math.median(arr),
        stdDev: n > 1 ? math.std(arr) : 0,
        variance: n > 1 ? math.variance(arr) : 0,
        min: math.min(arr),
        max: math.max(arr),
        n,
    };
};

const calculateBoxplotStats = (arr) => {
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const q1 = math.quantileSeq(sorted, 0.25, true);
    const median = math.median(sorted);
    const q3 = math.quantileSeq(sorted, 0.75, true);
    const iqr = q3 - q1;
    const whiskerLow = Math.max(sorted[0], q1 - 1.5 * iqr);
    const whiskerHigh = Math.min(sorted[sorted.length - 1], q3 + 1.5 * iqr);
    const outliers = sorted.filter((v) => v < whiskerLow || v > whiskerHigh);

    return {
        min: sorted[0],
        q1: math.round(q1, 4),
        median: math.round(median, 4),
        q3: math.round(q3, 4),
        max: sorted[sorted.length - 1],
        iqr: math.round(iqr, 4),
        whiskerLow: math.round(whiskerLow, 4),
        whiskerHigh: math.round(whiskerHigh, 4),
        outliers,
    };
};

// ===========================================================================
//  2. MÉTRICAS DE COMPARACIÓN (operan sobre vectores pareados)
// ===========================================================================

const rmse = (reference, measured) => {
    if (reference.length !== measured.length || reference.length === 0) return null;
    const n = reference.length;
    const s = reference.reduce((acc, v, i) => acc + Math.pow(v - measured[i], 2), 0);
    return Math.sqrt(s / n);
};

const mae = (reference, measured) => {
    if (reference.length !== measured.length || reference.length === 0) return null;
    const n = reference.length;
    return reference.reduce((acc, v, i) => acc + Math.abs(v - measured[i]), 0) / n;
};

const pearsonCorrelation = (x, y) => {
    if (x.length !== y.length || x.length < 2) return null;
    const n = x.length;
    const mx = math.mean(x);
    const my = math.mean(y);
    let num = 0, dx2 = 0, dy2 = 0;
    for (let i = 0; i < n; i++) {
        const dx = x[i] - mx;
        const dy = y[i] - my;
        num += dx * dy;
        dx2 += dx * dx;
        dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    return denom === 0 ? 0 : num / denom;
};

const residualAnalysis = (reference, measured) => {
    if (reference.length !== measured.length || reference.length === 0) return null;
    const residuals = measured.map((v, i) => v - reference[i]);
    const meanError = math.mean(residuals);
    const stdError = residuals.length > 1 ? math.std(residuals) : 0;
    return {
        meanError,
        stdError,
        upperLimit: meanError + 1.96 * stdError,
        lowerLimit: meanError - 1.96 * stdError,
    };
};

// ===========================================================================
//  3. PRUEBA T DE WELCH (muestras independientes, dos colas)
//     H₀: μ_comercial = μ_propia   →   p > 0.05 ⇒ no hay diferencia
// ===========================================================================

const welchTTest = (sample1, sample2) => {
    if (!sample1 || !sample2 || sample1.length < 2 || sample2.length < 2) return null;
    const n1 = sample1.length, n2 = sample2.length;
    const m1 = math.mean(sample1), m2 = math.mean(sample2);
    const v1 = math.variance(sample1), v2 = math.variance(sample2);
    const se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) return { tStatistic: 0, df: n1 + n2 - 2, pValue: 1, significant: false };

    const tStat = (m1 - m2) / se;

    const se1 = v1 / n1, se2 = v2 / n2;
    const df = Math.pow(se1 + se2, 2) / (Math.pow(se1, 2) / (n1 - 1) + Math.pow(se2, 2) / (n2 - 1));

    const pValue = tDistPValue(tStat, df);

    return {
        tStatistic: math.round(tStat, 4),
        df: math.round(df, 2),
        pValue: math.round(pValue, 6),
        significant: pValue < 0.05,
    };
};

// ===========================================================================
//  4. PASO 1 — ANÁLISIS POR FASE (aislamiento / estabilidad eléctrica)
//     Agrupa lecturas por test_condition y calcula stats + t-test por fase.
// ===========================================================================

const calculatePhaseAnalysis = (readings, field) => {
    const phases = new Map();

    for (const r of readings) {
        const cond = r.test_condition;
        if (!cond) continue;
        const val = parseFloat(r[field]);
        if (isNaN(val)) continue;
        if (!phases.has(cond)) phases.set(cond, { commercial: [], custom: [] });
        const bucket = phases.get(cond);
        if (r.type === 'commercial') bucket.commercial.push(val);
        else if (r.type === 'custom_probe') bucket.custom.push(val);
    }

    const result = {};

    for (const [condition, { commercial, custom }] of phases) {
        const commStats = calculateBasicStats(commercial);
        const custStats = calculateBasicStats(custom);
        const tTest = welchTTest(commercial, custom);
        const phaseMAE = (commStats && custStats)
            ? math.round(Math.abs(commStats.mean - custStats.mean), 4)
            : null;

        result[condition] = {
            commercial: commStats,
            custom: custStats,
            tTest,
            mae: phaseMAE,
            boxplot: {
                commercial: calculateBoxplotStats(commercial),
                custom: calculateBoxplotStats(custom),
            },
        };
    }

    return result;
};

// ===========================================================================
//  5. PASO 2 — VALIDACIÓN CRUZADA ENTRE FASES
//     Toma las medias de cada fase y calcula Pearson, RMSE, Bias sobre ellas.
//     ¿La sonda reacciona proporcionalmente a los cambios de condición?
// ===========================================================================

const calculateCrossPhaseValidation = (phaseResults) => {
    const phaseNames = Object.keys(phaseResults);
    const commMeans = [];
    const custMeans = [];
    const labels = [];

    for (const phase of phaseNames) {
        const p = phaseResults[phase];
        if (p.commercial && p.custom) {
            commMeans.push(p.commercial.mean);
            custMeans.push(p.custom.mean);
            labels.push(phase);
        }
    }

    const scatter = labels.map((l, i) => ({
        phase: l,
        commercial: math.round(commMeans[i], 4),
        custom: math.round(custMeans[i], 4),
    }));

    if (commMeans.length < 2) {
        return { n: commMeans.length, pearson: null, rmse: null, mae: null, bias: null, scatter, blandAltman: [] };
    }

    const r = pearsonCorrelation(commMeans, custMeans);
    const rmsVal = rmse(commMeans, custMeans);
    const maeVal = mae(commMeans, custMeans);
    const bias = residualAnalysis(commMeans, custMeans);

    const blandAltman = labels.map((l, i) => ({
        phase: l,
        average: math.round((commMeans[i] + custMeans[i]) / 2, 4),
        difference: math.round(custMeans[i] - commMeans[i], 4),
    }));

    return {
        n: commMeans.length,
        pearson: r !== null ? math.round(r, 4) : null,
        rmse: rmsVal !== null ? math.round(rmsVal, 4) : null,
        mae: maeVal !== null ? math.round(maeVal, 4) : null,
        bias: bias ? {
            meanError: math.round(bias.meanError, 4),
            stdError: math.round(bias.stdError, 4),
            upperLimit: math.round(bias.upperLimit, 4),
            lowerLimit: math.round(bias.lowerLimit, 4),
        } : null,
        scatter,
        blandAltman,
    };
};

// ===========================================================================
//  6. ORQUESTADOR PRINCIPAL — calcula todo para los 3 campos
// ===========================================================================

const calculateFullValidation = (readings) => {
    const fields = ['temperature', 'humidity', 'ph', 'ec', 'n', 'p', 'k'];
    const result = {};

    for (const field of fields) {
        const phases = calculatePhaseAnalysis(readings, field);
        const crossPhase = calculateCrossPhaseValidation(phases);
        result[field] = { phases, crossPhase };
    }

    return result;
};

module.exports = {
    calculateBasicStats,
    calculateBoxplotStats,
    welchTTest,
    pearsonCorrelation,
    rmse,
    mae,
    residualAnalysis,
    calculatePhaseAnalysis,
    calculateCrossPhaseValidation,
    calculateFullValidation,
};
