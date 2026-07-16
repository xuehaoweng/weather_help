import React from "react";
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
  Wind
} from "lucide-react";

const h = React.createElement;

export function CurrentConditions({ now, weatherKind, stale = false, onRetry }) {
  if (!now || !hasWeatherValue(now.temp)) {
    return h("div", { className: "current-weather-unavailable", role: "status" },
      h("strong", null, "实时天气暂不可用"),
      h("p", null, "其他预报仍可查看，你可以重新加载实时天气。"),
      h("button", { type: "button", onClick: onRetry }, "重新加载")
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
  const feelsLike = hasWeatherValue(now.feelsLike) ? now.feelsLike : now.temp;
  const metrics = [
    hasWeatherValue(now.humidity) ? `湿度 ${now.humidity}%` : "",
    hasWeatherValue(now.vis) ? `能见度 ${now.vis}km` : ""
  ].filter(Boolean);

  return h(React.Fragment, null,
    h("div", { className: "panel-header" },
      h("div", null,
        h("span", null, "当前体感"),
        h("strong", null, `${feelsLike}°`)
      ),
      h("div", { className: "weather-icon" }, h(CurrentWeatherIcon, { size: 42 }))
    ),
    h("div", { className: "temp-row" },
      h("span", { className: "temp" }, `${now.temp}°`),
      h("div", null,
        h("h2", null, now.text || "实时天气"),
        h("p", null, metrics.length ? metrics.join(" · ") : "湿度和能见度暂不可用")
      )
    ),
    stale
      ? h("p", { className: "stale-weather", role: "status" }, "实时数据更新延迟，正在使用最近数据")
      : null
  );
}

export function hasWeatherValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== "";
}
