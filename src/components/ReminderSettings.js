import React from "react";
import { Bell, X } from "lucide-react";

const h = React.createElement;

export function ReminderSettings({
  open,
  config,
  permission = "default",
  onChange,
  onRequestPermission,
  onSave,
  onDisable,
  onClose
}) {
  if (!open) return null;
  const update = (field) => (event) => onChange?.({ ...config, [field]: event.target.value });
  return h("div", { className: "dialog-backdrop", onMouseDown: (event) => event.target === event.currentTarget && onClose?.() },
    h("section", {
      className: "reminder-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "reminder-dialog-title"
    },
    h("div", { className: "dialog-heading" },
      h("div", null,
        h(Bell, { size: 22, "aria-hidden": "true" }),
        h("h2", { id: "reminder-dialog-title" }, "本机雨前提醒")
      ),
      h("button", { type: "button", className: "icon-button", "aria-label": "关闭提醒设置", onClick: onClose },
        h(X, { size: 18, "aria-hidden": "true" })
      )
    ),
    h("p", { className: "dialog-limit" }, "页面打开期间会定时检查降雨；关闭浏览器后无法保证提醒。"),
    h("label", null, "提醒地点",
      h("input", { value: config?.location?.name || "", readOnly: true })
    ),
    h("label", null, "提前时间",
      h("select", { value: config?.leadMinutes || 20, onChange: update("leadMinutes") },
        [10, 20, 30].map((minutes) => h("option", { value: minutes, key: minutes }, `提前 ${minutes} 分钟`))
      )
    ),
    h("div", { className: "time-fields" },
      h("label", null, "开始时间",
        h("input", { type: "time", value: config?.activeStart || "07:00", onChange: update("activeStart") })
      ),
      h("label", null, "结束时间",
        h("input", { type: "time", value: config?.activeEnd || "22:00", onChange: update("activeEnd") })
      )
    ),
    h("div", { className: "permission-row" },
      h("span", null, permissionLabel(permission)),
      permission !== "granted" && h("button", { type: "button", onClick: onRequestPermission }, "允许通知")
    ),
    h("div", { className: "dialog-actions" },
      config?.enabled && h("button", { type: "button", className: "danger-button", onClick: onDisable }, "关闭提醒"),
      h("button", { type: "button", className: "secondary-button", onClick: onClose }, "取消"),
      h("button", { type: "button", onClick: onSave }, config?.enabled ? "保存设置" : "开启提醒")
    ))
  );
}

function permissionLabel(permission) {
  if (permission === "granted") return "浏览器通知已允许";
  if (permission === "denied") return "通知权限已拒绝，将使用页面内提示";
  return "尚未请求浏览器通知权限";
}
