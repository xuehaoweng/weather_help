import React from "react";

const h = React.createElement;

export function ScoreDetails({ score, source, updatedAt, isPartial }) {
  if (!score) return null;
  return h("details", { className: "score-details" },
    h("summary", null, "查看评分依据"),
    h("div", { className: "score-breakdown" },
      h("div", { className: "score-base" },
        h("span", null, `基础分 ${score.base ?? "--"}`),
        h("strong", null, `${score.value ?? "--"} · ${score.label || "计算中"}`)
      ),
      h("ul", null,
        score.factors?.length
          ? score.factors.map((item) => h("li", { key: item.key },
              h("span", null, item.label),
              h("strong", null, item.impact > 0 ? `+${item.impact}` : item.impact)
            ))
          : h("li", null, h("span", null, "当前无明显天气扣分"), h("strong", null, "0"))
      ),
      h("p", { className: "data-meta" },
        `数据来源：${source || "未知"} · 更新时间：${formatUpdatedAt(updatedAt)}`
      ),
      isPartial && h("p", { className: "partial-data", role: "status" }, "部分详情暂不可用，建议已按现有数据生成。")
    )
  );
}

function formatUpdatedAt(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    month: "numeric",
    day: "numeric",
    timeZone: "Asia/Shanghai"
  }).format(date);
}
