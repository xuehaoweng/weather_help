import React from "react";
import { LocateFixed, MapPin, Search, Star, Trash2 } from "lucide-react";

const h = React.createElement;

export function LocationPicker({
  query = "",
  results = [],
  searching = false,
  locating = false,
  error = "",
  location,
  favorites = [],
  onQueryChange,
  onSearch,
  onSelect,
  onUseCurrentLocation,
  onAddFavorite,
  onRemoveFavorite
}) {
  return h("div", { className: "location-picker" },
    h("form", { className: "search", onSubmit: onSearch },
      h("label", { className: "sr-only", htmlFor: "location-search" }, "搜索城市或区县"),
      h(Search, { size: 18, "aria-hidden": "true" }),
      h("input", {
        id: "location-search",
        value: query,
        onChange: (event) => onQueryChange?.(event.target.value),
        placeholder: "搜索城市、区县",
        autoComplete: "off"
      }),
      h("button", { type: "submit", disabled: searching }, searching ? "搜索中" : "搜索")
    ),
    results.length > 0 && h("div", { className: "search-results" },
      results.map((item) => h("button", {
        key: item.id,
        type: "button",
        onClick: () => onSelect?.(item)
      },
      h(MapPin, { size: 15, "aria-hidden": "true" }),
      h("span", null, item.name),
      h("small", null, `${item.adm1 || ""} ${item.adm2 || ""}`.trim())))
    ),
    error && h("p", { className: "search-error", role: "alert" }, error),
    h("div", { className: "location-actions" },
      h("div", { className: "location-line" },
        h(LocateFixed, { size: 17, "aria-hidden": "true" }),
        `${location?.name || "未选择地点"}${location?.adm1 ? ` · ${location.adm1}` : ""}`
      ),
      h("div", { className: "location-buttons" },
        h("button", { type: "button", className: "location-button", onClick: onUseCurrentLocation, disabled: locating },
          h(LocateFixed, { size: 16, "aria-hidden": "true" }),
          locating ? "定位中" : "使用当前位置"
        ),
        h("button", { type: "button", className: "location-button", onClick: onAddFavorite, disabled: !location },
          h(Star, { size: 16, "aria-hidden": "true" }),
          "收藏当前地点"
        )
      )
    ),
    favorites.length > 0 && h("div", { className: "favorite-locations", "aria-label": "常用地点" },
      favorites.map((item) => h("div", { className: "favorite-location", key: item.id },
        h("button", { type: "button", onClick: () => onSelect?.(item) }, item.name),
        h("button", {
          type: "button",
          className: "icon-button",
          "aria-label": `删除常用地点 ${item.name}`,
          onClick: () => onRemoveFavorite?.(item.id)
        }, h(Trash2, { size: 14, "aria-hidden": "true" }))
      ))
    )
  );
}
