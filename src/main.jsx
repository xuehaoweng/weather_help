import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Bell,
  Bike,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  ShieldAlert,
  Sun,
  Umbrella,
  Wind
} from "lucide-react";
import { WeatherEffects } from "./WeatherEffects.jsx";
import { AdminApp } from "./AdminApp.js";
import { createAnalyticsClient } from "./analytics-client.js";
import { LocationPicker } from "./components/LocationPicker.js";
import { MobileSummary } from "./components/MobileSummary.js";
import { ReminderSettings } from "./components/ReminderSettings.js";
import { ScenarioPanel } from "./components/ScenarioPanel.js";
import { ScoreDetails } from "./components/ScoreDetails.js";
import { addFavorite, loadFavorites, removeFavorite } from "./favorite-locations.js";
import { checkAndNotify } from "./reminder-notifier.js";
import { loadReminder, saveReminder } from "./reminder-store.js";
import { resolveWeatherScene } from "./weather-effects.js";
import { createLatestWeatherLoader, mergeWeatherData } from "./weather-loader.js";
import "./styles.css";
import "./admin.css";

const defaultLocation = {
  id: "101010100",
  name: "北京",
  adm1: "北京市",
  adm2: "北京",
  lon: "116.40529",
  lat: "39.90499"
};
const analytics = createAnalyticsClient();

function App() {
  const [location, setLocation] = useState(defaultLocation);
  const [query, setQuery] = useState("北京");
  const [searchResults, setSearchResults] = useState([]);
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [weatherStatus, setWeatherStatus] = useState("loading");
  const [weatherError, setWeatherError] = useState("");
  const [detailsStatus, setDetailsStatus] = useState("loading");
  const [detailsError, setDetailsError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [mode, setMode] = useState("commute");
  const [favorites, setFavorites] = useState(() => loadFavorites());
  const [favoriteError, setFavoriteError] = useState("");
  const [locating, setLocating] = useState(false);
  const [reminder, setReminder] = useState(() => loadReminder());
  const [reminderDraft, setReminderDraft] = useState(() => loadReminder());
  const [reminderOpen, setReminderOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(() => globalThis.Notification?.permission || "unsupported");
  const [inPageAlert, setInPageAlert] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const weatherLoader = useRef(null);
  const pageTracked = useRef(false);

  if (!weatherLoader.current) weatherLoader.current = createLatestWeatherLoader();

  useEffect(() => {
    weatherLoader.current.load(location, {
      onLoading: () => {
        setLoading(true);
        setWeather(null);
        setWeatherStatus("loading");
        setWeatherError("");
        setDetailsStatus("loading");
        setDetailsError("");
      },
      onCoreSuccess: (data) => {
        setWeather(data);
        setWeatherStatus("success");
        if (!pageTracked.current) {
          pageTracked.current = true;
          analytics.track("page_view");
        }
      },
      onCoreError: (error) => {
        setWeatherError(error.message);
        setWeatherStatus("error");
        analytics.track("client_error", { category: "weather_core" });
      },
      onCoreSettled: () => setLoading(false),
      onDetailsSuccess: (data) => {
        setWeather((core) => mergeWeatherData(core, data));
        setDetailsStatus("success");
      },
      onDetailsError: (error) => {
        setDetailsError(error.message);
        setDetailsStatus("error");
        analytics.track("client_error", { category: "weather_details" });
        setWeather((current) => current ? {
          ...current,
          insight: { ...current.insight, isPartial: true }
        } : current);
      }
    });
    return () => weatherLoader.current.cancel();
  }, [location.id, location.lon, location.lat, reloadKey]);

  async function searchLocations(event) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;
    await findLocations(keyword);
  }

  async function findLocations(keyword) {
    setSearching(true);
    setSearchError("");
    try {
      const response = await fetch(`/api/locations?q=${encodeURIComponent(keyword)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || data.error || "城市搜索失败");
      setSearchResults(data.locations || []);
      setSearchError("");
    } catch (err) {
      setSearchError(err.message);
    } finally {
      setSearching(false);
    }
  }

  function selectLocation(item) {
    setLocation(item);
    setSearchResults([]);
    setQuery(item.name);
    setSearchError("");
    setFavoriteError("");
    analytics.track("city_selected");
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setSearchError("当前浏览器不支持定位，请手动搜索城市。");
      return;
    }
    setLocating(true);
    setSearchError("");
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 8000,
          maximumAge: 10 * 60 * 1000
        });
      });
      const keyword = `${position.coords.longitude},${position.coords.latitude}`;
      const response = await fetch(`/api/locations?q=${encodeURIComponent(keyword)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "当前位置查询失败");
      if (!data.locations?.[0]) throw new Error("没有找到当前位置附近的天气城市");
      selectLocation(data.locations[0]);
    } catch (error) {
      const denied = error?.code === 1;
      setSearchError(denied ? "定位权限已拒绝，你仍可以手动搜索城市。" : error.message || "定位失败，请稍后重试。");
      analytics.track("client_error", { category: "location" });
    } finally {
      setLocating(false);
    }
  }

  function addCurrentFavorite() {
    try {
      setFavorites(addFavorite(globalThis.localStorage, location));
      setFavoriteError("");
    } catch (error) {
      setFavoriteError(error.message);
    }
  }

  function removeCurrentFavorite(locationId) {
    setFavorites(removeFavorite(globalThis.localStorage, locationId));
    setFavoriteError("");
  }

  function openReminderSettings() {
    setReminderDraft({
      ...reminder,
      location: reminder.location || location
    });
    setReminderOpen(true);
  }

  async function requestNotificationPermission() {
    if (!globalThis.Notification) {
      setNotificationPermission("unsupported");
      return;
    }
    const permission = await globalThis.Notification.requestPermission();
    setNotificationPermission(permission);
  }

  function saveReminderSettings() {
    const saved = saveReminder(globalThis.localStorage, {
      ...reminderDraft,
      enabled: true,
      location: reminderDraft.location || location
    });
    setReminder(saved);
    setReminderDraft(saved);
    setReminderOpen(false);
    analytics.track("reminder_enabled");
    setInPageAlert(notificationPermission === "granted"
      ? `已开启 ${saved.location.name} 的本机雨前提醒。`
      : "已开启页面内雨前提示；浏览器通知未授权。");
  }

  function disableReminder() {
    const saved = saveReminder(globalThis.localStorage, { ...reminder, enabled: false });
    setReminder(saved);
    setReminderDraft(saved);
    setReminderOpen(false);
    setInPageAlert("雨前提醒已关闭。");
    analytics.track("reminder_disabled");
  }

  const now = weather?.now?.now;
  const weatherKind = useMemo(() => resolveWeatherScene(now, weatherStatus).kind, [now, weatherStatus]);
  const daily = weather?.daily?.daily || [];
  const hourly = weather?.hourly?.hourly || [];
  const minutely = weather?.minutely?.minutely || [];
  const warnings = weather?.warning?.warning || [];
  const upcomingRain = useMemo(() => {
    const value = weather?.insight?.firstRainAt;
    return value ? timeLabel(value) : null;
  }, [weather?.insight?.firstRainAt]);
  const rainText = detailsStatus === "loading"
    ? "分析中"
    : detailsStatus === "error"
      ? "暂不可用"
      : upcomingRain
        ? `${upcomingRain} 起`
        : "两小时内暂无";
  const activeScenario = weather?.insight?.scenarios?.[mode];

  useEffect(() => {
    if (!reminder.enabled || !reminder.location) return undefined;
    const run = async () => {
      let reminderWeather = reminder.location.id === location.id ? weather : null;
      if (!reminderWeather?.minutely) {
        try {
          const params = new URLSearchParams({
            full: "true",
            location: reminder.location.id,
            lon: reminder.location.lon,
            lat: reminder.location.lat
          });
          const response = await fetch(`/api/weather?${params}`);
          if (response.ok) reminderWeather = await response.json();
        } catch {
          return;
        }
      }
      if (!reminderWeather?.insight) return;
      const result = checkAndNotify({
        config: reminder,
        insight: reminderWeather.insight,
        location: reminder.location,
        weatherText: reminderWeather.now?.now?.text,
        NotificationImpl: globalThis.Notification
      });
      if (!result.shouldNotify) return;
      if (result.inPage) setInPageAlert(result.message);
      if (result.sent) analytics.track("notification_sent");
      const next = saveReminder(globalThis.localStorage, {
        ...reminder,
        lastNotificationKey: result.notificationKey
      });
      setReminder(next);
    };
    run();
    const timer = window.setInterval(run, 5 * 60 * 1000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [reminder, weather, location.id]);

  return (
    <>
      <WeatherEffects now={now} status={weatherStatus} />
      <main className="app-shell">
      <section className="topbar">
        <div className="brand">
          <span className="brand-mark"><CloudRain size={20} /></span>
          <span>出门天气助手</span>
        </div>
        <button className={`ghost-button ${reminder.enabled ? "active" : ""}`} type="button" onClick={openReminderSettings}>
          <Bell size={17} />
          {reminder.enabled ? "提醒已开启" : "雨前提醒"}
        </button>
      </section>

      {inPageAlert && (
        <div className="notice-banner" role="status">
          <span>{inPageAlert}</span>
          <button type="button" onClick={() => setInPageAlert("")}>知道了</button>
        </div>
      )}

      <section className="hero">
        <div className="hero-copy">
          <LocationPicker
            query={query}
            results={searchResults}
            searching={searching}
            locating={locating}
            error={searchError || favoriteError}
            location={location}
            favorites={favorites}
            onQueryChange={setQuery}
            onSearch={searchLocations}
            onSelect={selectLocation}
            onUseCurrentLocation={useCurrentLocation}
            onAddFavorite={addCurrentFavorite}
            onRemoveFavorite={removeCurrentFavorite}
          />

          <h1>{activeScenario?.headline || weather?.insight?.title || "正在生成出门建议"}</h1>
          <p className="hero-subtitle">
            {activeScenario?.summary || "把实时天气、分钟降雨、预警和生活指数合成一句能行动的建议。"}
          </p>

          <MobileSummary
            now={now}
            insight={weather?.insight ? { ...weather.insight, title: activeScenario?.headline || weather.insight.title } : null}
            rainText={rainText}
          />

          <div className="mode-tabs" aria-label="场景">
            {[
              ["commute", BriefcaseBusiness, "通勤"],
              ["outdoor", Bike, "户外"],
              ["family", Sun, "家庭"]
            ].map(([key, Icon, label]) => (
              <button
                key={key}
                className={mode === key ? "active" : ""}
                type="button"
                aria-pressed={mode === key}
                onClick={() => {
                  setMode(key);
                  analytics.track("scene_changed", { mode: key });
                }}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
        </div>

        <WeatherPanel
          loading={loading}
          error={weatherError}
          now={now}
          weatherKind={weatherKind}
          insight={weather?.insight}
          upcomingRain={upcomingRain}
          warnings={warnings}
          detailsStatus={detailsStatus}
          onRetry={() => setReloadKey((value) => value + 1)}
        />
      </section>

      <section className="content-grid">
        <RainTimeline minutely={minutely} summary={weather?.insight?.rainSummary} status={detailsStatus} error={detailsError} />
        <Forecast daily={daily} hourly={hourly} loading={loading} />
        <ScenarioPanel scenario={activeScenario} loading={loading} />
      </section>
      </main>
      <ReminderSettings
        open={reminderOpen}
        config={reminderDraft}
        permission={notificationPermission}
        onChange={setReminderDraft}
        onRequestPermission={requestNotificationPermission}
        onSave={saveReminderSettings}
        onDisable={disableReminder}
        onClose={() => setReminderOpen(false)}
      />
    </>
  );
}

function WeatherPanel({ loading, error, now, weatherKind, insight, upcomingRain, warnings, detailsStatus, onRetry }) {
  if (loading) {
    return (
      <aside className="weather-panel loading-panel" aria-busy="true" aria-live="polite">
        <div className="loading-orbit">
          <CloudRain size={28} />
        </div>
        <div className="loading-copy">
          <strong>正在同步和风天气</strong>
          <span>实时天气、预报和出门评分加载中</span>
        </div>
        <div className="panel-header">
          <div>
            <span className="skeleton-line short" />
            <strong className="skeleton-line temp-skeleton" />
          </div>
          <div className="weather-icon skeleton-icon" />
        </div>
        <div className="temp-row loading-temp">
          <span className="skeleton-line giant" />
          <div>
            <span className="skeleton-line medium" />
            <span className="skeleton-line long" />
          </div>
        </div>
        <div className="score-card loading-score">
          <div>
            <small className="skeleton-line short" />
            <strong className="skeleton-line score-skeleton" />
          </div>
          <span className="skeleton-pill" />
        </div>
        <div className="quick-facts">
          {[0, 1, 2].map((item) => (
            <div className="fact loading-fact" key={item}>
              <span className="skeleton-dot" />
              <span className="skeleton-line medium" />
              <strong className="skeleton-line short" />
            </div>
          ))}
        </div>
      </aside>
    );
  }

  if (error) {
    return (
      <aside className="weather-panel error">
        <ShieldAlert size={30} />
        <h2>数据暂不可用</h2>
        <p>{error}</p>
        <button type="button" onClick={onRetry}>重新加载</button>
      </aside>
    );
  }

  const CurrentWeatherIcon = {
    clear: Sun,
    cloudy: CloudSun,
    overcast: Cloud,
    rain: CloudRain,
    snow: CloudSnow,
    thunder: CloudLightning,
    fog: CloudFog,
    haze: CloudFog,
    dust: Wind
  }[weatherKind] || Cloud;

  return (
    <aside className="weather-panel">
      <div className="panel-header">
        <div>
          <span>当前体感</span>
          <strong>{now?.feelsLike || now?.temp}°</strong>
        </div>
        <div className="weather-icon"><CurrentWeatherIcon size={42} /></div>
      </div>

      <div className="temp-row">
        <span className="temp">{now?.temp}°</span>
        <div>
          <h2>{now?.text}</h2>
          <p>湿度 {now?.humidity}% · 能见度 {now?.vis}km</p>
        </div>
      </div>

      <div className="score-card">
        <div>
          <small>出门评分</small>
          <strong>{insight?.score?.value || insight?.commuteScore?.value || "--"}</strong>
        </div>
        <span>{insight?.score?.label || insight?.commuteScore?.label || "计算中"}</span>
      </div>
      <ScoreDetails
        score={insight?.score || insight?.commuteScore}
        source={insight?.source}
        updatedAt={insight?.updatedAt}
        isPartial={insight?.isPartial}
      />

      <div className="quick-facts">
        <Fact
          icon={Umbrella}
          label="降雨"
          value={detailsStatus === "loading" ? "分析中" : detailsStatus === "error" ? "暂不可用" : upcomingRain ? `${upcomingRain} 起` : "两小时内暂无"}
        />
        <Fact icon={Wind} label="风速" value={`${now?.windSpeed || "--"} km/h`} />
        <Fact icon={ShieldAlert} label="预警" value={warnings.length ? `${warnings.length} 条` : "暂无"} />
      </div>
    </aside>
  );
}

function Fact({ icon: Icon, label, value }) {
  return (
    <div className="fact">
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RainTimeline({ minutely, summary, status, error }) {
  const loading = status === "loading";
  const bars = minutely.slice(0, 24);
  const max = Math.max(0.1, ...bars.map((item) => Number(item.precip || 0)));
  const hasData = bars.length > 0;
  const hasRain = bars.some((item) => Number(item.precip || 0) > 0);
  const startTime = hasData ? timeLabel(bars[0].fxTime) : "--";
  const endTime = hasData ? timeLabel(bars[bars.length - 1].fxTime) : "--";

  return (
    <section className="surface wide">
      <div className="section-heading">
        <div>
          <h2>未来 2 小时降雨</h2>
          <p>{summary || "分钟级降水需要经纬度，当前城市会自动使用中心坐标。"}</p>
        </div>
        <CloudRain size={22} />
      </div>
      {loading ? (
        <div className="rain-loading" aria-hidden="true">
          {Array.from({ length: 24 }).map((_, index) => (
            <span key={index} style={{ height: `${22 + (index % 5) * 12}px` }} />
          ))}
        </div>
      ) : null}
      {status === "error" ? (
        <div className="detail-status" role="status">
          <ShieldAlert size={22} />
          <strong>分钟降雨暂不可用</strong>
          <span>{error || "请稍后重试"}</span>
        </div>
      ) : null}
      {status === "success" && hasRain ? (
        <div className="rain-bars">
          {bars.map((item, index) => (
            <div className="rain-slot" key={`${item.fxTime}-${index}`}>
              <span style={{ height: `${Math.max(8, (Number(item.precip || 0) / max) * 90)}%` }} />
              <small>{index % 4 === 0 ? timeLabel(item.fxTime) : ""}</small>
            </div>
          ))}
        </div>
      ) : null}
      {status === "success" && !hasRain ? (
        <div className="rain-clear-state">
          <div className="clear-badge">
            <Check size={22} />
          </div>
          <div>
            <strong>{hasData ? "未来两小时无明显降水" : "分钟级降水暂未返回"}</strong>
            <p>{hasData ? "适合通勤、遛狗或短途外出；仍建议关注高温、紫外线和风速。" : "请确认当前位置经纬度，或稍后刷新重试。"}</p>
          </div>
          <div className="clear-timeline" aria-label="未来两小时时间范围">
            <span>{startTime}</span>
            <div />
            <span>{endTime}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Forecast({ daily, hourly, loading }) {
  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>今天到本周</h2>
          <p>用来判断通勤、周末活动和提醒频率。</p>
        </div>
        <CalendarClock size={22} />
      </div>
      {loading ? (
        <div className="forecast-loading" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      ) : null}
      {!loading && <div className="daily-list">
        {daily.slice(0, 5).map((day) => (
          <div className="daily-row" key={day.fxDate}>
            <span>{shortDate(day.fxDate)}</span>
            <strong>{day.textDay}</strong>
            <small>{day.tempMin}° / {day.tempMax}°</small>
          </div>
        ))}
      </div>}
      {!loading && <div className="hour-strip">
        {hourly.slice(0, 6).map((hour) => (
          <div key={hour.fxTime}>
            <span>{timeLabel(hour.fxTime)}</span>
            <strong>{hour.temp}°</strong>
            <small>{hour.text}</small>
          </div>
        ))}
      </div>}
    </section>
  );
}

function timeLabel(value) {
  if (!value) return "--";
  return new Date(value).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function shortDate(value) {
  if (!value) return "--";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("zh-CN", { weekday: "short", month: "numeric", day: "numeric" });
}

const RootApp = window.location.pathname.startsWith("/admin") ? AdminApp : App;
createRoot(document.getElementById("root")).render(<RootApp />);
