const SCORE_BASE = 92;

export function buildWeatherInsight(input = {}) {
  const now = input.now || {};
  const today = input.today || {};
  const warnings = Array.isArray(input.warnings) ? input.warnings : [];
  const minutely = Array.isArray(input.minutely) ? input.minutely : [];
  const indices = Array.isArray(input.indices) ? input.indices : [];
  const firstRain = minutely.find((item) => number(item?.precip) > 0);
  const firstRainAt = firstRain?.fxTime || null;
  const maxPrecip = minutely.reduce((max, item) => Math.max(max, number(item?.precip)), 0);
  const effectivePrecip = Math.max(number(now.precip), maxPrecip);
  const score = buildScore({
    precip: effectivePrecip,
    wind: number(now.windSpeed),
    uv: number(today.uvIndex),
    warningCount: warnings.length,
    temp: optionalNumber(now.temp)
  });
  const context = {
    now,
    today,
    warnings,
    minutely,
    indices,
    firstRainAt,
    maxPrecip,
    effectivePrecip,
    score
  };

  return {
    title: buildTitle(context),
    score,
    commuteScore: score,
    scenarios: {
      commute: buildCommuteAdvice(context),
      outdoor: buildOutdoorAdvice(context),
      family: buildFamilyAdvice(context)
    },
    rainSummary: buildRainSummary(context),
    firstRainAt,
    maxPrecip,
    updatedAt: input.updatedAt || new Date().toISOString(),
    source: input.source || "QWeather",
    isPartial: Boolean(input.isPartial)
  };
}

function buildScore({ precip, wind, uv, warningCount, temp }) {
  const factors = [];
  if (warningCount > 0) factors.push(factor("warning", "天气预警", -25));
  if (precip > 0.4) factors.push(factor("rain", precip >= 1 ? "中到大雨" : "明显降雨", -22));
  else if (precip > 0) factors.push(factor("rain", "短时降雨", -12));
  if (wind >= 25) factors.push(factor("wind", "风速较高", -10));
  if (Number.isFinite(temp) && (temp >= 34 || temp <= 0)) factors.push(factor("temperature", temp >= 34 ? "高温" : "低温", -12));
  if (uv >= 8) factors.push(factor("uv", "紫外线较强", -6));

  const raw = SCORE_BASE + factors.reduce((sum, item) => sum + item.impact, 0);
  const value = Math.max(35, Math.min(99, Math.round(raw)));
  return {
    value,
    label: value >= 85 ? "顺畅" : value >= 70 ? "可出门" : value >= 50 ? "需准备" : "谨慎",
    base: SCORE_BASE,
    factors
  };
}

function buildCommuteAdvice(context) {
  const { now, warnings, firstRainAt, effectivePrecip, score } = context;
  const rainTime = displayTime(firstRainAt);
  const departureTime = firstRainAt ? displayTime(new Date(new Date(firstRainAt).getTime() - 20 * 60 * 1000).toISOString()) : null;
  const hasRain = effectivePrecip > 0;
  const highWind = number(now.windSpeed) >= 25;
  const hasWarning = warnings.length > 0;

  return {
    mode: "commute",
    headline: hasWarning
      ? `${warningName(warnings)}预警，通勤前先确认路线`
      : firstRainAt
        ? `${rainTime} 起可能下雨，建议提前出发并带伞`
        : hasRain
          ? "当前有降雨，通勤请预留更多时间"
          : "通勤条件平稳，可按计划出发",
    summary: hasRain || firstRainAt
      ? `降雨${highWind ? "并伴随较强风力" : ""}会增加路上耗时。`
      : "未来短时降雨风险较低，仍建议出门前确认最新预警。",
    decisions: [
      decision(
        "departure",
        hasWarning ? "danger" : firstRainAt ? "warn" : "ok",
        "出发时间",
        departureTime ? `建议 ${departureTime} 前出发` : "可按计划出发",
        firstRainAt ? `${rainTime} 起可能出现降雨` : "当前未发现明确的短时降雨时间"
      ),
      decision(
        "umbrella",
        hasRain || firstRainAt ? "warn" : "ok",
        "雨具",
        hasRain || firstRainAt ? "建议随身带伞" : "暂不需要特意带伞",
        hasRain ? `当前降水量 ${formatNumber(effectivePrecip)} mm` : firstRainAt ? `${rainTime} 起可能下雨` : "分钟降雨未显示明显降水"
      ),
      decision(
        "commute-risk",
        hasWarning ? "danger" : highWind || hasRain ? "warn" : "ok",
        "路上风险",
        hasWarning ? `${warningName(warnings)}预警生效` : highWind ? "注意大风和骑行安全" : score.label,
        hasWarning ? "预警条件优先于普通天气评分" : `当前风速 ${now.windSpeed || "--"} km/h`
      )
    ]
  };
}

function buildOutdoorAdvice(context) {
  const { now, today, warnings, effectivePrecip, firstRainAt, indices } = context;
  const hasWarning = warnings.length > 0;
  const highWind = number(now.windSpeed) >= 25;
  const highUv = number(today.uvIndex) >= 8;
  const hasRain = effectivePrecip > 0 || Boolean(firstRainAt);
  const activityIndex = indices.find((item) => String(item?.type) === "1") || indices[0];
  const unsafe = hasWarning || hasRain || highWind;

  return {
    mode: "outdoor",
    headline: hasWarning
      ? `${warningName(warnings)}预警，暂停户外活动`
      : unsafe
        ? `${now.text || "当前天气"}和${highWind ? "大风" : "降雨"}，不适合长时间户外运动`
        : highUv
          ? "天气适合户外活动，但需要加强防晒"
          : "当前适合短时跑步、骑行或散步",
    summary: "结合降雨、风速、紫外线和生活指数判断户外窗口。",
    decisions: [
      decision(
        "outdoor-safety",
        hasWarning ? "danger" : unsafe ? "warn" : "ok",
        "活动安全",
        hasWarning ? "建议取消户外安排" : unsafe ? "建议缩短或改期" : "可正常安排",
        hasWarning ? `${warningName(warnings)}预警生效` : `天气 ${now.text || "--"}，风速 ${now.windSpeed || "--"} km/h`
      ),
      decision(
        "activity-window",
        hasRain ? "warn" : "ok",
        "活动窗口",
        firstRainAt ? `${displayTime(firstRainAt)} 前结束` : hasRain ? "等待降雨减弱" : "未来短时可安排",
        firstRainAt ? `${displayTime(firstRainAt)} 起可能下雨` : hasRain ? "当前存在降水" : "未发现明确短时降雨"
      ),
      decision(
        "activity-index",
        activityIndex ? (String(activityIndex.category || "").includes("不宜") ? "warn" : "ok") : "unknown",
        "运动指数",
        activityIndex?.category || "暂未返回",
        activityIndex ? "来自生活指数数据" : "生活指数尚未加载，先依据天气与风雨判断"
      )
    ]
  };
}

function buildFamilyAdvice(context) {
  const { now, today, warnings, effectivePrecip, firstRainAt, indices } = context;
  const hasWarning = warnings.length > 0;
  const hasRain = effectivePrecip > 0 || Boolean(firstRainAt);
  const highUv = number(today.uvIndex) >= 8;
  const clothing = indices.find((item) => String(item?.type) === "3" || String(item?.name || "").includes("穿衣"));
  const feelsLike = now.feelsLike || now.temp || "--";

  return {
    mode: "family",
    headline: hasWarning
      ? `${warningName(warnings)}预警，儿童和老人尽量减少外出`
      : hasRain
        ? `${now.text || "降雨"}天气，家人出门请带伞并注意儿童和老人`
        : highUv
          ? "适合家庭外出，但儿童和老人要注意防晒补水"
          : "家庭外出条件平稳，按体感温度准备衣物",
    summary: "家庭建议只依据天气和生活指数，不替代医疗或灾害应急信息。",
    decisions: [
      decision(
        "family-safety",
        hasWarning ? "danger" : hasRain ? "warn" : "ok",
        "外出安排",
        hasWarning ? "建议推迟非必要外出" : hasRain ? "缩短户外停留" : "可正常安排",
        hasWarning ? `${warningName(warnings)}预警生效` : hasRain ? "降雨会增加老人和儿童出行不便" : "当前无明确高风险天气"
      ),
      decision(
        "sun-protection",
        highUv ? "warn" : "ok",
        "防晒补水",
        highUv ? `UV ${today.uvIndex}，加强防晒` : "常规防晒即可",
        `当前体感 ${feelsLike}°`
      ),
      decision(
        "clothing",
        clothing ? "ok" : "unknown",
        "穿衣参考",
        clothing?.category || `按体感 ${feelsLike}° 调整`,
        clothing ? "来自穿衣生活指数" : "穿衣指数尚未加载，仅提供体感温度参考"
      )
    ]
  };
}

function buildTitle({ now, warnings, firstRainAt }) {
  if (warnings.length > 0) return `${warningName(warnings)}预警，出门前先看风险`;
  if (firstRainAt) return `${displayTime(firstRainAt)} 起可能下雨，提前安排出门`;
  if (String(now.text || "").includes("晴")) return "天气适合出门，注意防晒和补水";
  return `${now.text || "天气已更新"}，出门前查看场景建议`;
}

function buildRainSummary({ minutely, firstRainAt, maxPrecip, effectivePrecip }) {
  if (firstRainAt) return `${displayTime(firstRainAt)} 起可能降雨，峰值约 ${formatNumber(maxPrecip)} mm`;
  if (effectivePrecip > 0) return `当前存在降雨，降水量约 ${formatNumber(effectivePrecip)} mm`;
  if (minutely.length === 0) return "分钟降雨数据暂未返回";
  return "未来两小时暂无明显降雨";
}

function warningName(warnings) {
  return warnings[0]?.typeName || warnings[0]?.title || "天气";
}

function factor(key, label, impact) {
  return { key, label, impact };
}

function decision(key, status, label, value, reason) {
  return { key, status, label, value, reason };
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === "") return Number.NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatNumber(value) {
  return number(value).toFixed(1).replace(/\.0$/, "");
}

function displayTime(value) {
  if (!value) return "--:--";
  const match = String(value).match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Shanghai"
  }).format(new Date(value));
}
