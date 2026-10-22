import { useEffect, useState } from "react";

export interface WeatherState {
  /** Nhiệt độ hiện tại (°C, đã làm tròn) */
  temperatureC: number;
  description: string;
  icon: string;
  place: string;
}

/**
 * Dữ liệu thời tiết cho khối ngày ở trang chủ.
 *
 * Nguồn: Open-Meteo (miễn phí, không cần khoá API); toạ độ dò qua địa chỉ IP,
 * không dò được thì mặc định Hà Nội. Nếu có lỗi mạng, widget tự ẩn — luồng
 * trang chủ không bao giờ bị chặn vì thời tiết.
 */

const CACHE_KEY = "vd.weather.v2";
const CACHE_TTL = 30 * 60 * 1000; // 30 phút
const HANOI = { latitude: 21.0278, longitude: 105.8342, place: "Hà Nội" };

/**
 * Mã thời tiết WMO (current_weather.weathercode) → [mô tả tiếng Việt, icon].
 *
 * Icon đổi theo thời điểm trong ngày (is_day): ban ngày dùng mặt trời /
 * mây có nắng, ban đêm dùng mặt trăng; dông/bão dùng lốc xoáy.
 */
function describe(code: number, isDay: boolean): [string, string] {
  const night = !isDay;
  switch (code) {
    case 0:
      return night ? ["Đêm quang", "🌙"] : ["Trời quang", "☀️"];
    case 1:
      return night ? ["Đêm ít mây", "🌙"] : ["Ít mây", "🌤️"];
    case 2:
      return night ? ["Đêm mây rải rác", "🌙"] : ["Mây rải rác", "⛅"];
    case 3:
      return ["Nhiều mây", "☁️"];
    case 45:
    case 48:
      return ["Sương mù", "🌫️"];
    case 51:
      return ["Mưa phùn nhẹ", "🌦️"];
    case 53:
      return ["Mưa phùn", "🌦️"];
    case 55:
      return ["Mưa phùn dày", "🌧️"];
    case 56:
    case 57:
      return ["Mưa phùn lạnh", "🌧️"];
    case 61:
      return ["Mưa nhẹ", "🌦️"];
    case 63:
      return ["Mưa", "🌧️"];
    case 65:
      return ["Mưa to", "🌧️"];
    case 66:
    case 67:
      return ["Mưa lạnh", "🌧️"];
    case 71:
      return ["Tuyết nhẹ", "🌨️"];
    case 73:
      return ["Tuyết", "🌨️"];
    case 75:
      return ["Tuyết dày", "❄️"];
    case 77:
      return ["Hạt tuyết", "❄️"];
    case 80:
      return ["Mưa rào nhẹ", "🌦️"];
    case 81:
      return ["Mưa rào", "🌧️"];
    case 82:
      return ["Mưa rào mạnh", "🌀"];
    case 85:
    case 86:
      return ["Mưa tuyết", "🌨️"];
    case 95:
      return night ? ["Đêm có dông", "🌀"] : ["Có dông", "🌀"];
    case 96:
    case 99:
      return ["Dông kèm mưa đá", "🌀"];
    default:
      return ["Thời tiết thay đổi", "🌡️"];
  }
}

interface CachedWeather extends WeatherState {
  fetchedAt: number;
}

function readCache(): CachedWeather | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedWeather;
    if (
      typeof parsed.temperatureC !== "number" ||
      typeof parsed.description !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(next: WeatherState): void {
  try {
    const value: CachedWeather = { ...next, fetchedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // không lưu được cache chỗ nào cũng không sao
  }
}

async function fetchJson(url: string, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function locate(): Promise<{
  latitude: number;
  longitude: number;
  place: string;
}> {
  try {
    const data = await fetchJson("https://ipapi.co/json/", 5000);
    if (
      typeof data?.latitude === "number" &&
      typeof data?.longitude === "number"
    ) {
      return {
        latitude: data.latitude,
        longitude: data.longitude,
        place: typeof data.city === "string" ? data.city : "",
      };
    }
  } catch {
    // rớt mạng hoặc API bị chặn → dùng Hà Nội
  }
  return HANOI;
}

export function useWeather(): WeatherState | null {
  const [state, setState] = useState<WeatherState | null>(() => {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      return {
        temperatureC: cached.temperatureC,
        description: cached.description,
        icon: cached.icon,
        place: cached.place,
      };
    }
    return null;
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const location = await locate();
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${location.latitude}&longitude=${location.longitude}` +
          `&current_weather=true&timezone=auto`;
        const data = await fetchJson(url, 8000);
        const current = data?.current_weather;
        if (!current || cancelled) return;
        const [description, icon] = describe(
          typeof current.weathercode === "number" ? current.weathercode : -1,
          current.is_day !== 0,
        );
        const next: WeatherState = {
          temperatureC: Math.round(current.temperature),
          description,
          icon,
          place: location.place,
        };
        setState(next);
        writeCache(next);
      } catch {
        // lỗi mạng: giữ nguyên cache cũ nếu có, ngược lại không hiển thị gì
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
