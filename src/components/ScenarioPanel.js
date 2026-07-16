import React from "react";
import { Bike, BriefcaseBusiness, Check, ShieldAlert, Sun } from "lucide-react";

const h = React.createElement;
const modeMeta = {
  commute: ["通勤提醒", BriefcaseBusiness],
  outdoor: ["户外窗口", Bike],
  family: ["家庭健康", Sun]
};

export function ScenarioPanel({ scenario, loading = false }) {
  const [fallbackTitle, Icon] = modeMeta[scenario?.mode] || modeMeta.commute;
  return h("section", { className: "surface scenario-panel", "data-mode": scenario?.mode || "commute" },
    h("div", { className: "section-heading" },
      h("div", null,
        h("h2", null, fallbackTitle),
        h("p", null, scenario?.summary || "正在根据当前天气生成场景建议。")
      ),
      h(Icon, { size: 22, "aria-hidden": "true" })
    ),
    h("div", { className: "scenario-headline", "aria-live": "polite" },
      scenario?.headline || "场景建议生成中"
    ),
    h("div", { className: "decision-list" },
      loading
        ? [0, 1, 2].map((item) => h("div", { className: "decision loading-decision", key: item },
            h("span"), h("div")))
        : (scenario?.decisions || []).map((item) => h(DecisionRow, { item, key: item.key }))
    )
  );
}

function DecisionRow({ item }) {
  const positive = item.status === "ok";
  return h("div", { className: `decision decision-${item.status || "unknown"}` },
    h("span", { className: positive ? "ok" : "warn" },
      positive
        ? h(Check, { size: 15, "aria-hidden": "true" })
        : h(ShieldAlert, { size: 15, "aria-hidden": "true" })
    ),
    h("div", null,
      h("strong", null, item.label),
      h("small", null, item.value),
      h("p", null, item.reason)
    )
  );
}
