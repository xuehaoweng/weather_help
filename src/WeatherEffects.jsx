import React, { useEffect, useMemo, useState } from "react";
import { resolveWeatherScene } from "./weather-effects.js";

export function WeatherEffects({ now, status }) {
  const compact = useCompactViewport();
  const scene = useMemo(() => resolveWeatherScene(now, status, { compact }), [now, status, compact]);
  const style = {
    "--cloud-duration": `${scene.cloudDuration}s`,
    "--rain-duration": `${scene.rainDuration}s`,
    "--rain-offset-x": `${scene.rainOffsetX}px`,
    "--snow-duration": `${scene.snowDuration}s`,
    "--snow-offset-x": `${scene.snowOffsetX}px`,
    "--atmosphere-duration": `${scene.atmosphereDuration}s`,
    "--dust-duration": `${scene.dustDuration}s`,
    "--dust-offset-x": `${scene.dustOffsetX}px`,
    "--weather-intensity": scene.intensity,
    "--cloud-factor": scene.cloudFactor,
    "--wind-direction": scene.windDirectionX >= 0 ? 1 : -1
  };

  return (
    <div
      className={`weather-effects weather-effects--${scene.kind}${scene.isNight ? " is-night" : ""}${scene.hasHorizontalWind ? " is-windy" : ""}`}
      data-weather-kind={scene.kind}
      aria-hidden="true"
      style={style}
    >
      <CelestialEffect scene={scene} />
      <CloudLayer scene={scene} />
      <RainLayer scene={scene} />
      <SnowLayer scene={scene} />
      <LightningLayer scene={scene} />
      <AtmosphereLayer scene={scene} />
    </div>
  );
}

function CelestialEffect({ scene }) {
  if (scene.kind !== "clear" && scene.kind !== "cloudy") return null;
  return (
    <div className={`celestial ${scene.isNight ? "celestial--moon" : "celestial--sun"}`}>
      {!scene.isNight && (
        <div className="sun-rays">
          {Array.from({ length: 12 }, (_, index) => <span key={index} style={{ "--ray-index": index }} />)}
        </div>
      )}
      <span className="celestial-core" />
    </div>
  );
}

function CloudLayer({ scene }) {
  if (!scene.cloudLayers) return null;
  const dark = ["overcast", "rain", "snow", "thunder"].includes(scene.kind);
  return (
    <div className={`cloud-layer${dark ? " cloud-layer--dark" : ""}`}>
      {Array.from({ length: scene.cloudLayers }, (_, index) => {
        const top = 7 + seeded(index, 5) * 34;
        const scale = 0.72 + seeded(index, 11) * 0.55;
        return (
          <div
            className="ambient-cloud"
            key={index}
            style={{
              "--cloud-top": `${top}%`,
              "--cloud-scale": scale,
              "--cloud-delay": `${-seeded(index, 23) * scene.cloudDuration}s`,
              "--cloud-opacity": 0.34 + scene.cloudFactor * 0.3 - index * 0.04
            }}
          >
            <i /><i /><i />
          </div>
        );
      })}
    </div>
  );
}

function RainLayer({ scene }) {
  if (!scene.rainCount) return null;
  return (
    <div className="rain-layer">
      {Array.from({ length: scene.rainCount }, (_, index) => (
        <i
          className="raindrop"
          key={index}
          style={{
            "--particle-left": `${seeded(index, 17) * 112 - 6}%`,
            "--particle-delay": `${-seeded(index, 29) * scene.rainDuration}s`,
            "--particle-speed": 0.85 + seeded(index, 41) * 0.3,
            "--drop-length": `${18 + seeded(index, 47) * 16}px`,
            "--drop-opacity": 0.18 + scene.intensity * 0.24
          }}
        />
      ))}
    </div>
  );
}

function SnowLayer({ scene }) {
  if (!scene.snowCount) return null;
  return (
    <div className="snow-layer">
      {Array.from({ length: scene.snowCount }, (_, index) => (
        <i
          className={`snowflake${index % 5 === 0 ? " snowflake--crystal" : ""}`}
          key={index}
          style={{
            "--particle-left": `${seeded(index, 13) * 108 - 4}%`,
            "--particle-delay": `${-seeded(index, 31) * scene.snowDuration}s`,
            "--particle-speed": 0.85 + seeded(index, 37) * 0.3,
            "--flake-size": `${4 + seeded(index, 43) * 7}px`,
            "--flake-sway": `${18 + seeded(index, 53) * 26}px`
          }}
        />
      ))}
    </div>
  );
}

function LightningLayer({ scene }) {
  if (scene.kind !== "thunder") return null;
  return <div className="lightning-layer" />;
}

function AtmosphereLayer({ scene }) {
  const bands = scene.kind === "fog" || scene.kind === "haze";
  const dust = scene.kind === "dust";
  if (!bands && !dust) return null;
  return (
    <div className={`atmosphere-layer atmosphere-layer--${scene.kind}`}>
      {bands && Array.from({ length: 3 }, (_, index) => (
        <i className="atmosphere-band" key={index} style={{ "--band-index": index }} />
      ))}
      {dust && Array.from({ length: scene.dustCount }, (_, index) => (
        <i
          className="dust-particle"
          key={index}
          style={{
            "--particle-left": `${seeded(index, 61) * 100}%`,
            "--particle-top": `${12 + seeded(index, 67) * 78}%`,
            "--particle-delay": `${-seeded(index, 71) * scene.dustDuration}s`,
            "--dust-size": `${2 + seeded(index, 73) * 5}px`
          }}
        />
      ))}
    </div>
  );
}

function useCompactViewport() {
  const query = "(max-width: 640px)";
  const [compact, setCompact] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (event) => setCompact(event.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return compact;
}

function seeded(index, salt) {
  const value = Math.sin((index + 1) * (salt + 17) * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}
