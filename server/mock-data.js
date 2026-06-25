const baseDate = "2026-06-25";

export const mockLocations = [
  city("北京", "beijing", "101010100", "39.90499", "116.40529", "北京", "北京市", 10),
  city("海淀", "haidian", "101010200", "39.95607", "116.31032", "北京", "北京市", 15),
  city("上海", "shanghai", "101020100", "31.23037", "121.47370", "上海", "上海市", 10),
  city("杭州", "hangzhou", "101210101", "30.27415", "120.15515", "杭州", "浙江省", 13),
  city("深圳", "shenzhen", "101280601", "22.54286", "114.05956", "深圳", "广东省", 13)
];

export function mockWeatherPayload(location = "101010100", point = "116.41,39.90") {
  return {
    location,
    point,
    now: {
      code: "200",
      updateTime: `${baseDate}T10:40+08:00`,
      now: {
        obsTime: `${baseDate}T10:36+08:00`,
        temp: "27",
        feelsLike: "24",
        text: "晴",
        windDir: "北风",
        windScale: "4",
        windSpeed: "24",
        humidity: "35",
        precip: "0.0",
        pressure: "1006",
        vis: "30"
      },
      refer: mockRefer()
    },
    daily: {
      code: "200",
      daily: [
        day("2026-06-25", "晴", "晴", "31", "20", "11", "0.0"),
        day("2026-06-26", "多云", "多云", "32", "21", "7", "0.0"),
        day("2026-06-27", "雷阵雨", "阴", "34", "22", "11", "1.7"),
        day("2026-06-28", "中雨", "雷阵雨", "32", "20", "9", "7.7"),
        day("2026-06-29", "多云", "多云", "30", "21", "7", "0.0"),
        day("2026-06-30", "多云", "多云", "31", "22", "3", "0.0"),
        day("2026-07-01", "多云", "雷阵雨", "30", "21", "3", "0.0")
      ],
      refer: mockRefer()
    },
    hourly: {
      code: "200",
      hourly: Array.from({ length: 24 }, (_, index) => ({
        fxTime: `2026-06-${index < 13 ? "25" : "26"}T${String((11 + index) % 24).padStart(2, "0")}:00+08:00`,
        temp: String(index < 7 ? 28 + Math.floor(index / 2) : 24 + Math.max(0, 5 - Math.floor(index / 3))),
        text: index < 10 ? "晴" : "多云",
        windDir: "东南风",
        windScale: "1-3",
        windSpeed: index < 6 ? "10" : "7",
        humidity: String(38 + index),
        precip: index === 17 ? "0.2" : "0.0"
      })),
      refer: mockRefer()
    },
    warning: {
      code: "200",
      warning: [],
      refer: mockRefer()
    },
    minutely: {
      code: "200",
      summary: "未来两小时无降水",
      minutely: Array.from({ length: 24 }, (_, index) => ({
        fxTime: `2026-06-25T${String(10 + Math.floor((55 + index * 5) / 60)).padStart(2, "0")}:${String((55 + index * 5) % 60).padStart(2, "0")}+08:00`,
        precip: "0.00",
        type: "rain"
      })),
      refer: mockRefer()
    },
    indices: {
      code: "200",
      daily: [
        index("1", "运动指数", "较适宜", "天气较好，户外运动请注意防晒。"),
        index("2", "洗车指数", "适宜", "未来持续两天无雨，适合洗车。"),
        index("3", "穿衣指数", "炎热", "建议短袖、短裤等清凉夏季服装。"),
        index("5", "紫外线指数", "很强", "建议做好防晒，减少长时间暴露。"),
        index("8", "舒适度指数", "不舒适", "阳光强烈，体感偏热。"),
        index("9", "感冒指数", "少发", "感冒概率较低。"),
        index("10", "空气污染扩散条件指数", "良", "扩散条件较好。"),
        index("15", "交通指数", "良好", "路面干燥，交通气象条件良好。")
      ],
      refer: mockRefer()
    },
    errors: []
  };
}

export function matchesMockLocation(item, query) {
  const normalized = query.toLowerCase();
  return [item.name, item.adm1, item.adm2, item.id, item.pinyin]
    .some((value) => String(value || "").toLowerCase().includes(normalized));
}

function city(name, pinyin, id, lat, lon, adm2, adm1, rank) {
  return {
    name,
    pinyin,
    id,
    lat,
    lon,
    adm2,
    adm1,
    country: "中国",
    tz: "Asia/Shanghai",
    utcOffset: "+08:00",
    isDst: "0",
    type: "city",
    rank: String(rank),
    fxLink: "https://www.qweather.com"
  };
}

function day(fxDate, textDay, textNight, tempMax, tempMin, uvIndex, precip) {
  return {
    fxDate,
    sunrise: "04:48",
    sunset: "19:48",
    tempMax,
    tempMin,
    textDay,
    textNight,
    windDirDay: "北风",
    windScaleDay: "1-3",
    humidity: "53",
    precip,
    pressure: "1001",
    vis: "24",
    uvIndex
  };
}

function index(type, name, category, text) {
  return {
    date: baseDate,
    type,
    name,
    level: "2",
    category,
    text
  };
}

function mockRefer() {
  return { sources: ["Mock"], license: ["MIT"] };
}
