import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminApp } from "../AdminApp.js";

const h = React.createElement;

test("admin app renders username and password login without persisting credentials", () => {
  const html = renderToStaticMarkup(h(AdminApp, { initialStatus: "unauthenticated" }));

  assert.match(html, /Weather Pro 管理后台/);
  assert.match(html, /name="username"/);
  assert.match(html, /管理员账号/);
  assert.match(html, /type="password"/);
  assert.match(html, /管理员密码/);
  assert.doesNotMatch(html, /记住密码/);
});

test("admin dashboard renders aggregate metrics without visitor details", () => {
  const html = renderToStaticMarkup(h(AdminApp, {
    initialStatus: "authenticated",
    initialOverview: {
      range: 7,
      totals: {
        pageViews: 12,
        activeVisitors: 4,
        citySelections: 3,
        scenes: { commute: 5, outdoor: 2, family: 1 },
        reminders: { enabled: 2, disabled: 1, sent: 1 },
        errors: { weather_details: 2 }
      },
      days: [{ date: "2026-07-16", pageViews: 12, activeVisitors: 4 }]
    },
    initialHealth: {
      mode: "mock",
      startedAt: "2026-07-16T00:00:00.000Z",
      analytics: { persistence: "disk", retainedDays: 1 }
    }
  }));

  assert.match(html, /访问量/);
  assert.match(html, />12</);
  assert.match(html, /匿名日活/);
  assert.match(html, /通勤/);
  assert.match(html, /存储状态/);
  assert.doesNotMatch(html, /visitorHashes|install-a|127\.0\.0\.1/);
});
