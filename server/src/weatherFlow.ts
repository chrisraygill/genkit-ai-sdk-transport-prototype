import { UserFacingError, z } from 'genkit';
import { ai, MODEL } from './genkit.js';

const WeatherInputSchema = z.object({
  location: z.string().describe('City name, e.g. "Tokyo" or "San Francisco, CA"'),
});

const WeatherOutputSchema = z.object({
  location: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  temperatureC: z.number(),
  windKph: z.number(),
  conditions: z.string(),
});

const WMO_CODES: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Foggy',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  71: 'Slight snow',
  73: 'Moderate snow',
  75: 'Heavy snow',
  80: 'Rain showers',
  81: 'Heavy rain showers',
  82: 'Violent rain showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with heavy hail',
};

export const getWeather = ai.defineTool(
  {
    name: 'getWeather',
    description: 'Get current weather for a city. Use this whenever the user asks about weather.',
    inputSchema: WeatherInputSchema,
    outputSchema: WeatherOutputSchema,
  },
  async ({ location }) => {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1`;
    const geoRes = await fetch(geoUrl);
    const geo = (await geoRes.json()) as {
      results?: Array<{ name: string; latitude: number; longitude: number; country?: string }>;
    };
    if (!geo.results || geo.results.length === 0) {
      throw new UserFacingError(
        'NOT_FOUND',
        `Could not find a location named "${location}". Try a city name like "Tokyo" or "San Francisco".`
      );
    }
    const place = geo.results[0];

    const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,wind_speed_10m,weather_code`;
    const wxRes = await fetch(wxUrl);
    const wx = (await wxRes.json()) as {
      current: { temperature_2m: number; wind_speed_10m: number; weather_code: number };
    };

    return {
      location: place.country ? `${place.name}, ${place.country}` : place.name,
      latitude: place.latitude,
      longitude: place.longitude,
      temperatureC: wx.current.temperature_2m,
      windKph: wx.current.wind_speed_10m,
      conditions: WMO_CODES[wx.current.weather_code] ?? 'Unknown',
    };
  }
);

export const chatFlow = ai.defineFlow(
  {
    name: 'chat',
    inputSchema: z.object({ prompt: z.string() }),
    outputSchema: z.string(),
    streamSchema: z.any(),
  },
  async ({ prompt }, { sendChunk }) => {
    const { text } = await ai.generate({
      model: MODEL,
      tools: [getWeather],
      prompt,
      onChunk: (chunk) => sendChunk(chunk.toJSON()),
    });
    return text;
  }
);
