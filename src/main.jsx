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
  Crown,
  LocateFixed,
  MapPin,
  Search,
  ShieldAlert,
  Sparkles,
  Sun,
  Umbrella,
  Wind
} from "lucide-react";
import { WeatherEffects } from "./WeatherEffects.jsx";
import { resolveWeatherScene } from "./weather-effects.js";
import { createLatestWeatherLoader, mergeWeatherData } from "./weather-loader.js";
import "./styles.css";

const defaultLocation = {
  id: "101010100",
  name: "北京",
  adm1: "北京市",
  adm2: "北京",
  lon: "116.40529",
  lat: "39.90499"
};

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
  const weatherLoader = useRef(null);

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
      },
      onCoreError: (error) => {
        setWeatherError(error.message);
        setWeatherStatus("error");
      },
      onCoreSettled: () => setLoading(false),
      onDetailsSuccess: (data) => {
        setWeather((core) => mergeWeatherData(core, data));
        setDetailsStatus("success");
      },
      onDetailsError: (error) => {
        setDetailsError(error.message);
        setDetailsStatus("error");
      }
    });
    return () => weatherLoader.current.cancel();
  }, [location.id, location.lon, location.lat]);

  async function searchLocations(event) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) return;

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

  const now = weather?.now?.now;
  const weatherKind = useMemo(() => resolveWeatherScene(now, weatherStatus).kind, [now, weatherStatus]);
  const daily = weather?.daily?.daily || [];
  const hourly = weather?.hourly?.hourly || [];
  const minutely = weather?.minutely?.minutely || [];
  const warnings = weather?.warning?.warning || [];
  const indices = weather?.indices?.daily || [];

  const upcomingRain = useMemo(() => {
    const first = minutely.find((item) => Number(item.precip) > 0);
    if (!first) return null;
    return new Date(first.fxTime).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }, [minutely]);

  return (
    <>
      <WeatherEffects now={now} status={weatherStatus} />
      <main className="app-shell">
      <section className="topbar">
        <div className="brand">
          <span className="brand-mark"><CloudRain size={20} /></span>
          <span>出门天气助手</span>
        </div>
        <button className="ghost-button" type="button">
          <Bell size={17} />
          雨前提醒
        </button>
      </section>

      <section className="hero">
        <div className="hero-copy">
          <form className="search" onSubmit={searchLocations}>
            <Search size={18} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索城市、区县" />
            <button type="submit" disabled={searching}>{searching ? "搜索中" : "搜索"}</button>
          </form>

          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setLocation(item);
                    setSearchResults([]);
                    setQuery(item.name);
                    setSearchError("");
                  }}
                >
                  <MapPin size={15} />
                  <span>{item.name}</span>
                  <small>{item.adm1} {item.adm2}</small>
                </button>
              ))}
            </div>
          )}

          {searchError && <p className="search-error" role="alert">{searchError}</p>}

          <div className="location-line">
            <LocateFixed size={17} />
            {location.name} · {location.adm1}
          </div>

          <h1>{weather?.insight?.title || "正在生成出门建议"}</h1>
          <p className="hero-subtitle">
            把实时天气、分钟降雨、预警和生活指数合成一句能行动的建议。免费查天气，付费买多地点提醒和场景决策。
          </p>

          <div className="mode-tabs" aria-label="场景">
            {[
              ["commute", BriefcaseBusiness, "通勤"],
              ["outdoor", Bike, "户外"],
              ["family", Sun, "家庭"]
            ].map(([key, Icon, label]) => (
              <button key={key} className={mode === key ? "active" : ""} type="button" onClick={() => setMode(key)}>
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
        />
      </section>

      <section className="content-grid">
        <RainTimeline minutely={minutely} summary={weather?.insight?.rainSummary} status={detailsStatus} error={detailsError} />
        <Forecast daily={daily} hourly={hourly} loading={loading} />
        <Scenario mode={mode} now={now} daily={daily} indices={indices} loading={loading} detailsStatus={detailsStatus} detailsError={detailsError} />
        <Premium />
      </section>
      </main>
    </>
  );
}

function WeatherPanel({ loading, error, now, weatherKind, insight, upcomingRain, warnings, detailsStatus }) {
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
          <strong>{insight?.commuteScore?.value || "--"}</strong>
        </div>
        <span>{insight?.commuteScore?.label || "计算中"}</span>
      </div>

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

function Scenario({ mode, now, daily, indices, loading, detailsStatus, detailsError }) {
  const copy = {
    commute: ["通勤提醒", "雨前 20 分钟提醒、上班前风险卡片、晚高峰二次提醒。", BriefcaseBusiness],
    outdoor: ["户外窗口", "结合降雨、风速、紫外线和体感温度，推荐适合跑步/骑行/露营的时段。", Bike],
    family: ["家庭健康", "老人、小孩、过敏人群可关注空气、紫外线、感冒和穿衣指数。", Sun]
  }[mode];
  const Icon = copy[2];

  return (
    <section className="surface">
      <div className="section-heading">
        <div>
          <h2>{copy[0]}</h2>
          <p>{copy[1]}</p>
        </div>
        <Icon size={22} />
      </div>
      <div className="decision-list">
        {loading ? (
          [0, 1, 2].map((item) => <div className="decision loading-decision" key={item}><span /><div /></div>)
        ) : (
          <>
            <Decision ok label="现在出门" value={`${now?.text || "--"} · 体感 ${now?.feelsLike || "--"}°`} />
            <Decision ok={Number(daily[0]?.uvIndex || 0) < 8} label="防晒风险" value={`UV ${daily[0]?.uvIndex || "--"}`} />
            {detailsStatus === "loading" ? (
              <div className="decision loading-decision" aria-label="生活指数分析中"><span /><div /></div>
            ) : (
              <Decision
                ok={detailsStatus === "success" && indices.length > 0}
                label="指数数据"
                value={detailsStatus === "error" ? detailsError || "详情暂不可用" : indices[0]?.category || "暂未返回"}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Decision({ ok, label, value }) {
  return (
    <div className="decision">
      <span className={ok ? "ok" : "warn"}>{ok ? <Check size={15} /> : <ShieldAlert size={15} />}</span>
      <div>
        <strong>{label}</strong>
        <small>{value}</small>
      </div>
    </div>
  );
}

function Premium() {
  return (
    <section className="surface premium">
      <div className="section-heading">
        <div>
          <h2>可付费功能</h2>
          <p>适合做会员墙，不影响免费天气查询。</p>
        </div>
        <Crown size={22} />
      </div>
      <div className="price">¥39 <span>/ 年起</span></div>
      <ul>
        <li><Sparkles size={16} /> 10 个常用地点与家庭共享</li>
        <li><Sparkles size={16} /> 上班、放学、跑步、钓鱼提醒模板</li>
        <li><Sparkles size={16} /> 周末户外活动窗口和无广告体验</li>
      </ul>
      <button type="button">开通提醒会员</button>
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

createRoot(document.getElementById("root")).render(<App />);
