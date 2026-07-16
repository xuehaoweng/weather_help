const STORAGE_KEY = "weather-pro:favorites";
const MAX_FAVORITES = 5;

export function loadFavorites(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(STORAGE_KEY));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeLocation).filter(Boolean).slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function addFavorite(storage = globalThis.localStorage, location) {
  const normalized = normalizeLocation(location);
  if (!normalized) throw new Error("地点信息无效");
  const current = loadFavorites(storage);
  if (current.some((item) => item.id === normalized.id)) return current;
  if (current.length >= MAX_FAVORITES) throw new Error("最多保存 5 个常用地点");
  const next = [...current, normalized];
  storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function removeFavorite(storage = globalThis.localStorage, locationId) {
  const next = loadFavorites(storage).filter((item) => item.id !== String(locationId));
  storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function normalizeLocation(location) {
  if (!location || !String(location.id || "").trim() || !String(location.name || "").trim()) return null;
  return {
    id: String(location.id),
    name: String(location.name),
    adm1: String(location.adm1 || ""),
    adm2: String(location.adm2 || ""),
    lon: String(location.lon || ""),
    lat: String(location.lat || "")
  };
}
