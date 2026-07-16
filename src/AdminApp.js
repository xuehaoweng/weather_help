import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  CloudRain,
  LogOut,
  MapPin,
  Users
} from "lucide-react";

const h = React.createElement;

export function AdminApp({
  initialStatus = "checking",
  initialOverview = null,
  initialHealth = null
} = {}) {
  const [status, setStatus] = useState(initialStatus);
  const [password, setPassword] = useState("");
  const [overview, setOverview] = useState(initialOverview);
  const [health, setHealth] = useState(initialHealth);
  const [range, setRange] = useState(initialOverview?.range || 7);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialStatus === "checking") checkSession();
  }, []);

  async function checkSession() {
    try {
      const response = await fetch("/api/admin/session");
      if (!response.ok) throw new Error("无法检查管理会话");
      const session = await response.json();
      if (!session.enabled) {
        setStatus("disabled");
        return;
      }
      if (!session.authenticated) {
        setStatus("unauthenticated");
        return;
      }
      await loadDashboard(range);
    } catch (sessionError) {
      setError(sessionError.message);
      setStatus("unauthenticated");
    }
  }

  async function loadDashboard(nextRange) {
    setError("");
    try {
      const [overviewResponse, healthResponse] = await Promise.all([
        fetch(`/api/admin/overview?range=${nextRange}`),
        fetch("/api/admin/health")
      ]);
      if (overviewResponse.status === 404) {
        setStatus("disabled");
        return;
      }
      if (overviewResponse.status === 401) {
        setStatus("unauthenticated");
        return;
      }
      if (!overviewResponse.ok || !healthResponse.ok) throw new Error("管理数据暂时无法加载");
      setOverview(await overviewResponse.json());
      setHealth(await healthResponse.json());
      setRange(nextRange);
      setStatus("authenticated");
    } catch (loadError) {
      setError(loadError.message);
      setStatus((current) => current === "authenticated" ? current : "unauthenticated");
    }
  }

  async function login(event) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });
    setPassword("");
    if (response.status === 404) {
      setStatus("disabled");
      return;
    }
    if (response.status === 429) {
      setError("登录尝试过多，请稍后再试。");
      return;
    }
    if (!response.ok) {
      setError("管理员密码不正确。");
      return;
    }
    await loadDashboard(range);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => {});
    setOverview(null);
    setHealth(null);
    setStatus("unauthenticated");
  }

  if (status === "checking") return h(AdminShell, null, h("p", { className: "admin-loading" }, "正在检查管理会话…"));
  if (status === "disabled") {
    return h(AdminShell, null,
      h("section", { className: "admin-login-card" },
        h("h2", null, "管理后台未启用"),
        h("p", null, "请在服务端配置 ADMIN_PASSWORD 后重新启动。")
      )
    );
  }
  if (status !== "authenticated") {
    return h(AdminShell, null,
      h("form", { className: "admin-login-card", onSubmit: login },
        h("h2", null, "管理员登录"),
        h("p", null, "密码只用于当前登录请求，不会保存在浏览器中。"),
        h("label", { htmlFor: "admin-password" }, "管理员密码"),
        h("input", {
          id: "admin-password",
          type: "password",
          value: password,
          onChange: (event) => setPassword(event.target.value),
          autoComplete: "current-password",
          required: true
        }),
        error && h("p", { className: "admin-error", role: "alert" }, error),
        h("button", { type: "submit" }, "进入后台")
      )
    );
  }

  return h("main", { className: "admin-shell" },
    h("header", { className: "admin-header" },
      h("div", { className: "admin-brand" },
        h("span", null, h(CloudRain, { size: 21, "aria-hidden": "true" })),
        h("div", null,
          h("strong", null, "Weather Pro 管理后台"),
          h("small", null, "匿名聚合指标与服务健康")
        )
      ),
      h("button", { type: "button", className: "admin-logout", onClick: logout },
        h(LogOut, { size: 16, "aria-hidden": "true" }),
        "退出"
      )
    ),
    h("section", { className: "admin-toolbar" },
      h("div", { className: "admin-range", "aria-label": "统计时间范围" },
        [7, 30].map((value) => h("button", {
          type: "button",
          key: value,
          "aria-pressed": range === value,
          onClick: () => loadDashboard(value)
        }, `最近 ${value} 天`))
      ),
      h("span", null, `运行模式：${health?.mode || "--"}`)
    ),
    error && h("p", { className: "admin-error", role: "alert" }, error),
    h(MetricGrid, { totals: overview?.totals }),
    h("section", { className: "admin-grid" },
      h(TrendCard, { days: overview?.days || [] }),
      h(SceneCard, { scenes: overview?.totals?.scenes || {} }),
      h(ReminderCard, { reminders: overview?.totals?.reminders || {} }),
      h(ErrorCard, { errors: overview?.totals?.errors || {} }),
      h(HealthCard, { health })
    ),
    h("footer", { className: "admin-privacy" },
      "仅保存每日聚合数据，不显示 IP、搜索词、精确位置或访客明细。当前存储适用于单实例部署。"
    )
  );
}

function AdminShell({ children }) {
  return h("main", { className: "admin-shell admin-centered" },
    h("div", { className: "admin-brand admin-brand-centered" },
      h("span", null, h(CloudRain, { size: 21, "aria-hidden": "true" })),
      h("div", null,
        h("strong", null, "Weather Pro 管理后台"),
        h("small", null, "轻量、匿名、自托管")
      )
    ),
    children
  );
}

function MetricGrid({ totals = {} }) {
  const metrics = [
    ["访问量", totals.pageViews || 0, Activity],
    ["匿名日活", totals.activeVisitors || 0, Users],
    ["城市选择", totals.citySelections || 0, MapPin],
    ["提醒开启", totals.reminders?.enabled || 0, Bell]
  ];
  return h("section", { className: "metric-grid" },
    metrics.map(([label, value, Icon]) => h("article", { className: "metric-card", key: label },
      h(Icon, { size: 20, "aria-hidden": "true" }),
      h("span", null, label),
      h("strong", null, value)
    ))
  );
}

function TrendCard({ days }) {
  const max = Math.max(1, ...days.map((day) => day.pageViews || 0));
  return h("article", { className: "admin-card admin-card-wide" },
    h("h2", null, "每日趋势"),
    days.length === 0
      ? h(EmptyState)
      : h("div", { className: "trend-chart", "aria-label": "每日访问量趋势" },
          days.map((day) => h("div", { key: day.date },
            h("span", { style: { height: `${Math.max(8, (day.pageViews / max) * 100)}%` } }),
            h("small", null, day.date.slice(5)),
            h("strong", null, day.pageViews)
          ))
        )
  );
}

function SceneCard({ scenes }) {
  return h("article", { className: "admin-card" },
    h("h2", null, "场景使用"),
    h(KeyValueList, { values: { "通勤": scenes.commute || 0, "户外": scenes.outdoor || 0, "家庭": scenes.family || 0 } })
  );
}

function ReminderCard({ reminders }) {
  return h("article", { className: "admin-card" },
    h("h2", null, "提醒漏斗"),
    h(KeyValueList, { values: {
      "开启": reminders.enabled || 0,
      "关闭": reminders.disabled || 0,
      "已发送": reminders.sent || 0
    } })
  );
}

function ErrorCard({ errors }) {
  const entries = Object.entries(errors);
  return h("article", { className: "admin-card" },
    h("h2", null, "客户端错误"),
    entries.length === 0
      ? h(EmptyState, { label: "当前范围内没有错误记录" })
      : h(KeyValueList, { values: Object.fromEntries(entries) })
  );
}

function HealthCard({ health }) {
  return h("article", { className: "admin-card" },
    h("h2", null, "服务健康"),
    h(KeyValueList, { values: {
      "运行模式": health?.mode || "--",
      "存储状态": health?.analytics?.persistence || "disabled",
      "保留天数": health?.analytics?.retainedDays || 0,
      "启动时间": formatDate(health?.startedAt)
    } })
  );
}

function KeyValueList({ values }) {
  return h("dl", { className: "admin-list" },
    Object.entries(values).flatMap(([label, value]) => [
      h("dt", { key: `${label}-label` }, label),
      h("dd", { key: `${label}-value` }, value)
    ])
  );
}

function EmptyState({ label = "当前范围内暂无统计数据" }) {
  return h("div", { className: "admin-empty" },
    h(AlertTriangle, { size: 20, "aria-hidden": "true" }),
    h("span", null, label)
  );
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Shanghai"
  }).format(date);
}
