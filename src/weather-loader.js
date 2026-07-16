import { buildWeatherInsight } from "../shared/advice-engine.js";

export function createLatestWeatherLoader(fetchImpl = fetch) {
  let currentGeneration = 0;
  let activeController = null;

  async function load(target, callbacks = {}) {
    const generation = ++currentGeneration;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const locationKey = buildLocationKey(target);
    let coreStatus = "pending";
    let detailsOutcome = null;
    let detailsDelivered = false;

    const isCurrent = () => generation === currentGeneration && locationKey === buildLocationKey(target);
    callbacks.onLoading?.();

    const params = new URLSearchParams({
      location: target.id,
      lon: target.lon,
      lat: target.lat
    });

    function deliverDetails() {
      if (!isCurrent() || coreStatus !== "success" || !detailsOutcome || detailsDelivered) return;
      detailsDelivered = true;
      if (detailsOutcome.ok) callbacks.onDetailsSuccess?.(detailsOutcome.data);
      else callbacks.onDetailsError?.(detailsOutcome.error);
      callbacks.onDetailsSettled?.();
    }

    const coreTask = requestJson(`/api/weather?${params}`, controller.signal)
      .then((data) => {
        if (!isCurrent()) return;
        coreStatus = "success";
        callbacks.onCoreSuccess?.(data);
        callbacks.onCoreSettled?.();
        deliverDetails();
      })
      .catch((error) => {
        if (!isCurrent() || error?.name === "AbortError") return;
        coreStatus = "error";
        callbacks.onCoreError?.(error);
        callbacks.onCoreSettled?.();
      });

    const detailsTask = requestJson(`/api/weather/details?${params}`, controller.signal)
      .then((data) => {
        if (!isCurrent()) return;
        detailsOutcome = { ok: true, data };
        deliverDetails();
      })
      .catch((error) => {
        if (!isCurrent() || error?.name === "AbortError") return;
        detailsOutcome = { ok: false, error };
        deliverDetails();
      });

    await Promise.allSettled([coreTask, detailsTask]);
  }

  async function requestJson(url, signal) {
    const response = await fetchImpl(url, { signal });
    const data = await response.json();
    if (!response.ok) throw new Error(readErrorMessage(data));
    return data;
  }

  function cancel() {
    currentGeneration += 1;
    activeController?.abort();
    activeController = null;
  }

  return { load, cancel };
}

export function mergeWeatherData(core, details) {
  const merged = {
    ...core,
    minutely: details.minutely,
    indices: details.indices,
    errors: [...(core?.errors || []), ...(details?.errors || [])]
  };
  return {
    ...merged,
    insight: buildWeatherInsight({
      now: merged.now?.now,
      today: merged.daily?.daily?.[0],
      hourly: merged.hourly?.hourly || [],
      warnings: merged.warning?.warning || [],
      minutely: merged.minutely?.minutely || [],
      indices: merged.indices?.daily || [],
      updatedAt: core?.insight?.updatedAt || details?.insight?.updatedAt,
      source: core?.insight?.source || details?.insight?.source,
      isPartial: merged.errors.length > 0
    })
  };
}

function buildLocationKey(target) {
  return `${String(target.id)}|${String(target.lon)}|${String(target.lat)}`;
}

function readErrorMessage(data) {
  if (typeof data?.error === "string") return data.error;
  return data?.error?.message || "天气数据加载失败";
}
