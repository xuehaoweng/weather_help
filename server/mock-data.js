const baseDate = "2026-06-25";

export const mockLocations = [
  city("北京", "beijing", "101010100", "39.90499", "116.40529", "北京", "北京市", 10),
  city("海淀", "haidian", "101010200", "39.95607", "116.31032", "北京", "北京市", 15),
  city("上海", "shanghai", "101020100", "31.23037", "121.47370", "上海", "上海市", 10),
  city("杭州", "hangzhou", "101210101", "30.27415", "120.15515", "杭州", "浙江省", 13),
  city("深圳", "shenzhen", "101280601", "22.54286", "114.05956", "深圳", "广东省", 13),
  city("哈尔滨", "haerbin", "101050101", "45.80378", "126.53497", "哈尔滨", "黑龙江省", 12),
  city("重庆", "chongqing", "101040100", "29.56301", "106.55156", "重庆", "重庆市", 10),
  city("石家庄", "shijiazhuang", "101090101", "38.04276", "114.51430", "石家庄", "河北省", 12),
  city("兰州", "lanzhou", "101160101", "36.06138", "103.83417", "兰州", "甘肃省", 12)
];

const weatherScenarios = {
  "101010100": scenario("100", "晴", "0", "北风", "0", "0.0", "10", "rain"),
  "101010200": scenario("101", "多云", "90", "东风", "18", "0.0", "72", "rain"),
  "101210101": scenario("104", "阴", "180", "南风", "12", "0.0", "95", "rain"),
  "101020100": scenario("306", "中雨", "90", "东风", "28", "2.4", "94", "rain"),
  "101280601": scenario("302", "雷阵雨", "135", "东南风", "32", "3.2", "100", "rain"),
  "101050101": scenario("400", "小雪", "315", "西北风", "16", "1.2", "88", "snow"),
  "101040100": scenario("501", "雾", "0", "北风", "4", "0.0", "100", "rain"),
  "101090101": scenario("502", "霾", "270", "西风", "14", "0.0", "95", "rain"),
  "101160101": scenario("503", "扬沙", "270", "西风", "35", "0.0", "65", "rain")
};

export function mockWeatherPayload(location = "101010100", point = "116.41,39.90") {
  const current = weatherScenarios[location] || weatherScenarios["101010100"];
  const hasPrecipitation = Number(current.precip) > 0;
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
        icon: current.icon,
        text: current.text,
        wind360: current.wind360,
        windDir: current.windDir,
        windScale: current.windSpeed === "0" ? "0" : "1-3",
        windSpeed: current.windSpeed,
        humidity: "35",
        precip: current.precip,
        cloud: current.cloud,
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
        icon: current.icon,
        text: current.text,
        wind360: current.wind360,
        windDir: current.windDir,
        windScale: "1-3",
        windSpeed: current.windSpeed,
        humidity: String(38 + index),
        precip: hasPrecipitation && index < 4 ? current.precip : "0.0",
        cloud: current.cloud
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
      summary: hasPrecipitation ? `未来两小时有${current.text}` : "未来两小时无降水",
      minutely: Array.from({ length: 24 }, (_, index) => ({
        fxTime: `2026-06-25T${String(10 + Math.floor((55 + index * 5) / 60)).padStart(2, "0")}:${String((55 + index * 5) % 60).padStart(2, "0")}+08:00`,
        precip: hasPrecipitation ? String(Math.max(0.05, Number(current.precip) / 6).toFixed(2)) : "0.00",
        type: current.precipType
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

function scenario(icon, text, wind360, windDir, windSpeed, precip, cloud, precipType) {
  return { icon, text, wind360, windDir, windSpeed, precip, cloud, precipType };
}

export function matchesMockLocation(item, query) {
  const normalized = query.toLowerCase();
  return [item.name, item.adm1, item.adm2, item.id, item.pinyin]
    .some((value) => String(value || "").toLowerCase().includes(normalized));
}

export function findNearestMockLocation(lon, lat) {
  return mockLocations.reduce((nearest, item) => {
    const distance = (Number(item.lon) - lon) ** 2 + (Number(item.lat) - lat) ** 2;
    if (!nearest || distance < nearest.distance) return { item, distance };
    return nearest;
  }, null)?.item || null;
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
