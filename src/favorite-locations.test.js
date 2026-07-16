import test from "node:test";
import assert from "node:assert/strict";
import {
  addFavorite,
  loadFavorites,
  removeFavorite
} from "./favorite-locations.js";

test("adds, deduplicates, and removes favorite locations", () => {
  const storage = memoryStorage();
  const shanghai = location("101020100", "上海");

  assert.deepEqual(addFavorite(storage, shanghai), [shanghai]);
  assert.deepEqual(addFavorite(storage, shanghai), [shanghai]);
  assert.deepEqual(removeFavorite(storage, shanghai.id), []);
});

test("keeps at most five favorite locations", () => {
  const storage = memoryStorage();
  for (let index = 1; index <= 5; index += 1) addFavorite(storage, location(String(index), `城市${index}`));

  assert.throws(() => addFavorite(storage, location("6", "城市6")), /最多保存 5 个/);
  assert.equal(loadFavorites(storage).length, 5);
});

test("ignores corrupt favorites and rejects invalid locations", () => {
  const storage = memoryStorage({ "weather-pro:favorites": "broken" });
  assert.deepEqual(loadFavorites(storage), []);
  assert.throws(() => addFavorite(storage, { id: "", name: "" }), /地点信息无效/);
});

function location(id, name) {
  return { id, name, adm1: `${name}市`, adm2: name, lon: "120", lat: "30" };
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key)
  };
}
