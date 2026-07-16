import React from "react";
import { CloudRain, Gauge, ThermometerSun } from "lucide-react";

const h = React.createElement;

export function MobileSummary({ now, insight, rainText }) {
  return h("section", { className: "mobile-summary", "aria-label": "当前天气摘要" },
    h("p", { className: "mobile-summary-title" }, insight?.title || "正在生成出门建议"),
    h("div", { className: "mobile-summary-grid" },
      h(SummaryFact, { icon: ThermometerSun, label: now?.text || "天气", value: `${now?.temp || "--"}°` }),
      h(SummaryFact, { icon: CloudRain, label: "降雨", value: rainText || "分析中" }),
      h(SummaryFact, { icon: Gauge, label: insight?.score?.label || "评分", value: insight?.score?.value || "--" })
    )
  );
}

function SummaryFact({ icon: Icon, label, value }) {
  return h("div", null,
    h(Icon, { size: 18, "aria-hidden": "true" }),
    h("span", null, label),
    h("strong", null, value)
  );
}
