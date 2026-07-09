import type { WeatherLocation } from "./types";

export const defaultWeatherLocation: WeatherLocation = {
  id: "weather-default-ponteareas-vigo",
  name: "Ponteareas / Vigo",
  latitude: 42.1767,
  longitude: -8.5022,
  isDefault: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export interface DailyWeatherSummary {
  date: string;
  temperatureMax: number;
  temperatureMin: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  weatherCode?: number;
  description: string;
  currentTemperature?: number;
  currentWeatherCode?: number;
  isDay?: boolean;
}

export interface WeatherLocationSearchResult {
  id: string;
  name: string;
  countryCode?: string;
  admin1?: string;
  latitude: number;
  longitude: number;
}

export interface WeatherContextSummary {
  label: string;
  notes: string[];
  needsClosedShoes: boolean;
  needsJacket: boolean;
  needsUmbrella: boolean;
  isCold: boolean;
  isHot: boolean;
  isRainy: boolean;
  isWindy: boolean;
  isMild: boolean;
  nightFresh: boolean;
}

const weatherCodeMap: Record<number, string> = {
  0: "Despejado",
  1: "Mayormente despejado",
  2: "Algo nuboso",
  3: "Cubierto",
  45: "Niebla",
  48: "Niebla con escarcha",
  51: "Llovizna ligera",
  53: "Llovizna",
  55: "Llovizna intensa",
  61: "Lluvia ligera",
  63: "Lluvia",
  65: "Lluvia intensa",
  66: "Lluvia helada ligera",
  67: "Lluvia helada",
  71: "Nieve ligera",
  73: "Nieve",
  75: "Nieve intensa",
  77: "Granos de nieve",
  80: "Chubascos ligeros",
  81: "Chubascos",
  82: "Chubascos intensos",
  85: "Nieve intermitente",
  86: "Nieve intensa",
  95: "Tormenta",
  96: "Tormenta con granizo",
  99: "Tormenta fuerte con granizo",
};

export function weatherCodeLabel(code?: number) {
  if (code == null) return "Tiempo variable";
  return weatherCodeMap[code] || "Tiempo variable";
}

export async function searchWeatherLocations(query: string) {
  const name = query.trim();
  if (name.length < 2) return [] as WeatherLocationSearchResult[];
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", name);
  url.searchParams.set("count", "8");
  url.searchParams.set("language", "es");
  url.searchParams.set("format", "json");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("weather_geocoding_failed");
  const json = (await res.json()) as {
    results?: Array<{
      id?: number;
      name: string;
      country_code?: string;
      admin1?: string;
      latitude: number;
      longitude: number;
    }>;
  };
  return (json.results || []).map((entry) => ({
    id: String(
      entry.id ||
        `${entry.name}-${entry.latitude.toFixed(3)}-${entry.longitude.toFixed(3)}`,
    ),
    name: entry.name,
    countryCode: entry.country_code,
    admin1: entry.admin1,
    latitude: entry.latitude,
    longitude: entry.longitude,
  }));
}

export async function fetchWeatherForecast(
  location: Pick<WeatherLocation, "latitude" | "longitude">,
  days = 5,
) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(location.latitude));
  url.searchParams.set("longitude", String(location.longitude));
  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max",
      "wind_speed_10m_max",
    ].join(","),
  );
  url.searchParams.set("current", "temperature_2m,weather_code,is_day");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", String(days));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("weather_forecast_failed");
  const json = (await res.json()) as {
    current?: {
      temperature_2m?: number;
      weather_code?: number;
      is_day?: number;
    };
    daily: {
      time: string[];
      weather_code?: number[];
      temperature_2m_max?: number[];
      temperature_2m_min?: number[];
      precipitation_probability_max?: number[];
      wind_speed_10m_max?: number[];
    };
  };
  return json.daily.time.map((date, index) => ({
    date,
    temperatureMax: json.daily.temperature_2m_max?.[index] ?? 0,
    temperatureMin: json.daily.temperature_2m_min?.[index] ?? 0,
    precipitationProbabilityMax:
      json.daily.precipitation_probability_max?.[index] ?? 0,
    windSpeedMax: json.daily.wind_speed_10m_max?.[index] ?? 0,
    weatherCode: json.daily.weather_code?.[index],
    description: weatherCodeLabel(json.daily.weather_code?.[index]),
    currentTemperature:
      date === new Date().toISOString().slice(0, 10)
        ? json.current?.temperature_2m
        : undefined,
    currentWeatherCode:
      date === new Date().toISOString().slice(0, 10)
        ? json.current?.weather_code
        : undefined,
    isDay:
      date === new Date().toISOString().slice(0, 10)
        ? json.current?.is_day === 1
        : undefined,
  })) as DailyWeatherSummary[];
}

export function buildWeatherContext(
  day?: Partial<DailyWeatherSummary>,
  options?: { night?: boolean },
): WeatherContextSummary {
  const max = day?.temperatureMax ?? 20;
  const min = day?.temperatureMin ?? max;
  const rain = day?.precipitationProbabilityMax ?? 0;
  const wind = day?.windSpeedMax ?? 0;
  const isCold = max < 10;
  const isCool = max >= 10 && max <= 16;
  const isMild = max >= 17 && max <= 22;
  const isHot = max > 23;
  const isRainy = rain >= 40;
  const isWindy = wind >= 26;
  const nightFresh = !!options?.night && min <= 17;
  const notes: string[] = [];
  if (isCold) notes.push("Hace frío");
  else if (isCool) notes.push("Temperatura fresca");
  else if (isMild) notes.push("Entretiempo");
  else if (isHot) notes.push("Hace calor");
  if (isRainy) notes.push("Puede llover");
  if (isWindy) notes.push("Se nota el viento");
  if (nightFresh) notes.push("Noche fresca");
  const needsClosedShoes = isCold || isCool || isRainy || isWindy;
  const needsJacket = isCold || isCool || isRainy || nightFresh;
  const needsUmbrella = isRainy;
  if (needsClosedShoes) notes.push("Mejor zapato cerrado");
  if (needsJacket) notes.push("Conviene llevar chaqueta");
  if (needsUmbrella) notes.push("No sobra paraguas");
  return {
    label: notes[0] || weatherCodeLabel(day?.weatherCode),
    notes,
    needsClosedShoes,
    needsJacket,
    needsUmbrella,
    isCold,
    isHot,
    isRainy,
    isWindy,
    isMild,
    nightFresh,
  };
}
