import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CurrentConditions } from "./CurrentConditions.js";
import { LocationPicker } from "./LocationPicker.js";
import { MobileSummary } from "./MobileSummary.js";
import { ReminderSettings } from "./ReminderSettings.js";
import { ScenarioPanel } from "./ScenarioPanel.js";
import { ScoreDetails } from "./ScoreDetails.js";

const h = React.createElement;

test("scenario panel renders actionable reasons instead of generic cards", () => {
  const html = renderToStaticMarkup(
    h(ScenarioPanel, {
      scenario: {
        mode: "outdoor",
        headline: "中雨和大风，不适合长时间户外运动",
        summary: "结合降雨与风速判断",
        decisions: [{
          key: "activity-window",
          status: "warn",
          label: "活动窗口",
          value: "10:55 前结束",
          reason: "10:55 起可能下雨"
        }]
      }
    })
  );

  assert.match(html, /户外窗口/);
  assert.match(html, /10:55 前结束/);
  assert.match(html, /10:55 起可能下雨/);
});

test("score details exposes factors, source, and partial status", () => {
  const html = renderToStaticMarkup(
    h(ScoreDetails, {
      score: { base: 92, value: 64, label: "需准备", factors: [{ key: "rain", label: "中雨", impact: -22 }] },
      source: "QWeather",
      updatedAt: "2026-07-16T02:35:00.000Z",
      isPartial: true
    })
  );

  assert.match(html, /基础分 92/);
  assert.match(html, /中雨/);
  assert.match(html, /-22/);
  assert.match(html, /QWeather/);
  assert.match(html, /部分详情暂不可用/);
});

test("location picker labels search and current-location controls", () => {
  const html = renderToStaticMarkup(
    h(LocationPicker, {
      query: "北京",
      results: [],
      location: { id: "1", name: "北京", adm1: "北京市" },
      favorites: [],
      onQueryChange: () => {},
      onSearch: () => {},
      onSelect: () => {},
      onUseCurrentLocation: () => {},
      onAddFavorite: () => {},
      onRemoveFavorite: () => {}
    })
  );

  assert.match(html, /for="location-search"/);
  assert.match(html, /使用当前位置/);
  assert.match(html, /收藏当前地点/);
});

test("reminder settings explains local-only behavior before permission", () => {
  const html = renderToStaticMarkup(
    h(ReminderSettings, {
      open: true,
      config: {
        enabled: false,
        location: { id: "1", name: "北京" },
        leadMinutes: 20,
        activeStart: "07:00",
        activeEnd: "22:00"
      },
      permission: "default",
      onChange: () => {},
      onRequestPermission: () => {},
      onSave: () => {},
      onClose: () => {}
    })
  );

  assert.match(html, /role="dialog"/);
  assert.match(html, /关闭浏览器后无法保证提醒/);
  assert.match(html, /允许通知/);
});

test("mobile summary contains the core first-screen facts", () => {
  const html = renderToStaticMarkup(
    h(MobileSummary, {
      now: { temp: "27", text: "中雨" },
      insight: { title: "10:55 起可能下雨", score: { value: 64, label: "需准备" } },
      rainText: "10:55 起"
    })
  );

  assert.match(html, /27°/);
  assert.match(html, /10:55 起/);
  assert.match(html, /64/);
});

test("current conditions shows a usable empty state without fake metrics", () => {
  const html = renderToStaticMarkup(
    h(CurrentConditions, {
      now: null,
      weatherKind: "cloudy",
      onRetry: () => {}
    })
  );

  assert.match(html, /实时天气暂不可用/);
  assert.match(html, /重新加载/);
  assert.doesNotMatch(html, /0°|>°<|湿度 %|能见度 km|--°/);
});

test("current conditions marks stale data and preserves a real zero temperature", () => {
  const html = renderToStaticMarkup(
    h(CurrentConditions, {
      now: { temp: "0", feelsLike: "0", text: "晴", humidity: "45", vis: "10" },
      weatherKind: "clear",
      stale: true,
      onRetry: () => {}
    })
  );

  assert.match(html, /实时数据更新延迟，正在使用最近数据/);
  assert.match(html, /0°/);
  assert.match(html, /湿度 45% · 能见度 10km/);
});

test("mobile summary omits the degree unit when realtime weather is missing", () => {
  const html = renderToStaticMarkup(
    h(MobileSummary, {
      now: null,
      insight: { title: "预报仍可查看", score: { value: 92, label: "顺畅" } },
      rainText: "分析中"
    })
  );

  assert.match(html, /暂不可用/);
  assert.doesNotMatch(html, /--°|>°</);
});
