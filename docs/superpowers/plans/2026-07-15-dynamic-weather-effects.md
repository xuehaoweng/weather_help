# Dynamic Weather Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add data-driven, wind-aware ambient scenes for clear, cloudy, overcast, rain, snow, thunder, fog, haze, and dust weather without changing the existing product layout.

**Architecture:** A pure resolver converts QWeather `now` data into a bounded scene configuration. A single presentational React scene component composes celestial, cloud, precipitation, lightning, and atmosphere layers, while CSS owns animation and responsive/reduced-motion behavior. `App` owns request status and stale-response protection; Mock data supplies deterministic visual fixtures.

**Tech Stack:** React 19, Vite 6, CSS animations, Node built-in `node:test`, Express Mock API

---

## File Structure

- Create `src/weather-effects.js`: pure icon/text classification, numeric normalization, wind math, intensity and animation parameter calculations.
- Create `src/weather-effects.test.js`: resolver and boundary tests using `node:test`.
- Create `src/weather-loader.js`: latest-request-only weather loader with abort and stale-branch guards.
- Create `src/weather-loader.test.js`: controlled async tests for success, failure, abort, and stale completion.
- Create `src/WeatherEffects.jsx`: decorative scene-layer React components with deterministic particles.
- Modify `src/main.jsx`: independent weather request state, stale-response protection, and scene mounting.
- Modify `src/styles.css`: scene layering, weather visuals, animation keyframes, mobile caps, and reduced-motion rules.
- Modify `server/mock-data.js`: deterministic weather payloads per demo city and three new Mock locations.
- Modify `package.json`: add the built-in test command.

### Task 1: Pure Weather Scene Resolver

**Files:**
- Create: `src/weather-effects.js`
- Create: `src/weather-effects.test.js`
- Modify: `package.json`

- [ ] **Step 1: Write failing resolver tests**

Cover known icon precedence, text fallback order, day/night codes, mixed precipitation, all primary categories, invalid values, wind direction signs, cloud minimums, and parameter caps. Enumerate every official code in the approved sets—`100`–`104`, `150`–`153`, `300`–`318`, `350`–`351`, `399`, `400`–`410`, `456`–`457`, `499`–`515`, `900`, `901`, and `999`—and assert the expected category or documented fallback. Add table-driven exact formula tests at zero, representative midpoint, and above-cap inputs for rain count/duration/offset, every snow minimum including `407`–`410`, snow count/duration/offset, cloud factor/layer minimum/duration, atmosphere duration, dust count/duration/offset, and desktop/mobile caps. Representative assertions:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { resolveWeatherScene } from "./weather-effects.js";

test("known icon wins over text and precipitation", () => {
  const scene = resolveWeatherScene({ icon: "101", text: "雷阵雨", precip: "2", wind360: "90" }, "success");
  assert.equal(scene.kind, "cloudy");
});

test("east wind pushes effects left", () => {
  const scene = resolveWeatherScene({ icon: "306", wind360: "90", windSpeed: "25", precip: "2" }, "success");
  assert.ok(scene.windDirectionX < 0);
  assert.ok(scene.rainOffsetX < 0);
});

test("mixed precipitation is explicit", () => {
  const scene = resolveWeatherScene({ icon: "404", precip: "1" }, "success");
  assert.equal(scene.kind, "snow");
  assert.equal(scene.precipitationType, "mixed");
});
```

- [ ] **Step 2: Add and run the failing test command**

Add `"test": "node --test src/weather-effects.test.js"` to `package.json`.

Run: `npm test`

Expected: FAIL because `src/weather-effects.js` does not exist.

- [ ] **Step 3: Implement the resolver**

Implement and export `resolveWeatherScene(now, status)`, plus small pure helpers. Follow the exact icon sets, decision order, formulas, defaults, minimum cloud layers, and clamps in the approved spec. Return a complete config even for `kind: "none"`; never return `NaN`.

- [ ] **Step 4: Run resolver tests**

Run: `npm test`

Expected: all resolver tests PASS.

- [ ] **Step 5: Commit resolver work**

```bash
git add package.json src/weather-effects.js src/weather-effects.test.js
git commit -m "feat: add weather scene resolver"
```

### Task 2: Deterministic Mock Weather Scenarios

**Files:**
- Modify: `server/mock-data.js`
- Test: `src/weather-effects.test.js`

- [ ] **Step 1: Add failing fixture expectations**

Add resolver fixture cases for the nine approved Mock payloads and assert expected `kind`, wind sign, and precipitation type.

- [ ] **Step 2: Run tests and confirm fixture failures**

Run: `npm test`

Expected: FAIL until Mock payloads expose the required icon and weather fields.

- [ ] **Step 3: Implement location-specific Mock payloads**

Add 哈尔滨、重庆、石家庄、兰州 to `mockLocations`. Build a small location-to-current-weather map containing the exact `icon / wind360 / windSpeed / precip / cloud` values from the spec, and merge it into `now.now`. Make current weather, hourly weather, and minutely rain internally consistent for rain/snow/thunder fixtures.

- [ ] **Step 4: Run tests and inspect API payloads**

Run: `npm test`

Expected: PASS.

After starting the API, run:

```bash
curl -fsS "http://127.0.0.1:8787/api/weather?location=101020100"
```

Expected: Shanghai returns icon `306`, east wind, and precipitation `2.4`.

- [ ] **Step 5: Commit Mock work**

```bash
git add server/mock-data.js src/weather-effects.test.js
git commit -m "feat: add deterministic weather scene fixtures"
```

### Task 3: Weather Effects React Scene

**Files:**
- Create: `src/WeatherEffects.jsx`
- Create: `src/weather-loader.js`
- Create: `src/weather-loader.test.js`
- Modify: `src/main.jsx:31-118`

- [ ] **Step 1: Write failing latest-request tests**

Use deferred fake fetch promises and callback spies with Node `node:test`. Cover four separate paths:

1. Request A resolves successfully after request B: A cannot call success or settled callbacks.
2. Request A rejects after request B starts: A cannot call error or settled callbacks.
3. An `AbortError` from the current request never calls the error callback.
4. Only the latest request may call the loading, success/error, and settled callbacks that update React state.

Update `npm test` to run both `src/weather-effects.test.js` and `src/weather-loader.test.js`, then run it.

Expected: FAIL because `src/weather-loader.js` does not exist.

- [ ] **Step 2: Implement the latest-request loader**

Implement a small `createLatestWeatherLoader(fetchImpl)` controller that owns an incrementing id and active `AbortController`. Guard all callback writes in success, catch, and finally; stale or aborted requests perform no writes. Expose `load(target, callbacks)` and `cancel()` so `App` can clean up on unmount.

- [ ] **Step 3: Create the scene component structure**

Implement `WeatherEffects({ now, status })`, call `resolveWeatherScene`, and return a decorative fixed layer:

```jsx
export function WeatherEffects({ now, status }) {
  const scene = resolveWeatherScene(now, status);
  return (
    <div className={`weather-effects weather-effects--${scene.kind}`} aria-hidden="true" style={sceneCssVars(scene)}>
      <CelestialEffect scene={scene} />
      <CloudLayer scene={scene} />
      <RainLayer scene={scene} />
      <SnowLayer scene={scene} />
      <LightningLayer scene={scene} />
      <AtmosphereLayer scene={scene} />
    </div>
  );
}
```

Generate particle arrays with deterministic index hashing. Render only the bounded count from the resolver. Mixed precipitation renders snow plus no more than 25% of the rain count.

- [ ] **Step 4: Isolate weather request and search error state**

In `App`, replace the shared error path with `weatherError`, `searchError`, and `weatherStatus`, and use the tested latest-request loader. `WeatherPanel` receives only `weatherError`. Search submission clears `searchError`; search failure sets it; successful search and location selection clear it. Render `searchError` directly below the search results area as `<p className="search-error" role="alert">…</p>` so it remains visible without changing weather state.

- [ ] **Step 5: Mount the scene without affecting layout**

Render `<WeatherEffects now={now} status={weatherStatus} />` before `<main className="app-shell">`, wrapped in a fragment. Preserve all current page content and error presentation.

- [ ] **Step 6: Run tests and build**

Run: `npm test && npm run build`

Expected: tests PASS and Vite production build succeeds.

- [ ] **Step 7: Commit component integration**

```bash
git add src/WeatherEffects.jsx src/weather-loader.js src/weather-loader.test.js src/main.jsx package.json
git commit -m "feat: integrate dynamic weather scenes"
```

### Task 4: Visual Styling, Motion, and Accessibility

**Files:**
- Modify: `src/styles.css:14-36`
- Modify: `src/styles.css:726-864`

- [ ] **Step 1: Establish safe visual layers**

Add `.weather-effects` as a fixed, clipped, `pointer-events: none` layer above the body background. Give `.app-shell` a positioned foreground stacking context. Add per-kind background tint modifiers without changing existing content tokens.

- [ ] **Step 2: Implement the approved atmospheric visuals**

Add styles for the sun/moon and rays, white/dark clouds, rain lines, snow shapes, fixed-cycle lightning, fog/haze bands, and dust particles. Consume resolver CSS variables for duration and horizontal displacement. Animate only `transform` and `opacity`.

- [ ] **Step 3: Add responsive and reduced-motion rules**

At 640px and below, enforce the resolver's mobile particle caps and reduce visual opacity. Under `prefers-reduced-motion: reduce`, keep static celestial/cloud/tint elements but hide precipitation, dust, and lightning; disable every remaining animation and transition.

- [ ] **Step 4: Run automated checks**

Run: `npm test && npm run build`

Expected: all tests PASS and build succeeds without warnings caused by the new code.

- [ ] **Step 5: Commit styling**

```bash
git add src/styles.css
git commit -m "feat: style accessible weather animations"
```

### Task 5: Runtime and Browser Verification

**Files:**
- Modify only if a verified defect is found in files above.

- [ ] **Step 1: Start Mock development mode**

Run: `npm run dev:mock`

Expected: API listens on 8787 and Vite listens on 5177.

- [ ] **Step 2: Verify API health**

Run: `curl -fsS http://127.0.0.1:8787/api/health`

Expected: JSON includes `"ok":true` and `"mode":"mock"`.

- [ ] **Step 3: Verify all nine visual fixtures in a real browser**

Search 北京、海淀、杭州、上海、深圳、哈尔滨、重庆、石家庄、兰州. Confirm the expected scene, readable content, working controls, and correct wind direction. Request-race branches are proven by `weather-loader.test.js`; the browser pass checks only the visible loading transition and final city.

- [ ] **Step 4: Verify mobile and reduced motion**

Use a narrow viewport and emulate `prefers-reduced-motion: reduce`. Confirm particle caps, no overflow, no interaction blocking, and only static safe atmosphere under reduced motion.

- [ ] **Step 5: Final verification**

Run: `npm test && npm run build && git status --short`

Expected: tests and build PASS; working tree contains only intentional changes, if any.
