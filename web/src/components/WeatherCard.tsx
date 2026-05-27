interface WeatherToolInput {
  location?: string;
}

interface WeatherToolOutput {
  location: string;
  latitude: number;
  longitude: number;
  temperatureC: number;
  windKph: number;
  conditions: string;
}

/**
 * Renders a Vercel UIMessage tool part of type `tool-getWeather`. Pulls
 * `state`, `input`, and `output` directly off the part — useChat handles
 * the streaming state transitions for us based on the chunks our transport
 * emits (`tool-input-available` → state `input-available`,
 * `tool-output-available` → state `output-available`).
 */
export function WeatherCard({
  state,
  input,
  output,
}: {
  state: string;
  input: unknown;
  output?: unknown;
}) {
  const inp = (input ?? {}) as WeatherToolInput;
  const out = output as WeatherToolOutput | undefined;
  const isError = state === 'output-error';
  const isLoading = state === 'input-streaming' || state === 'input-available';

  return (
    <div className={`weather-card ${isLoading ? 'loading' : ''} ${isError ? 'errored' : ''}`}>
      <div className="tool-label">Tool call · getWeather</div>
      <div className="location">{out?.location ?? inp.location ?? 'Locating...'}</div>
      {out ? (
        <>
          <div className="temp">{Math.round(out.temperatureC)}°C</div>
          <div className="conditions">{out.conditions}</div>
          <div className="meta">
            <span>Wind {Math.round(out.windKph)} km/h</span>
            <span>
              {out.latitude.toFixed(2)}, {out.longitude.toFixed(2)}
            </span>
          </div>
        </>
      ) : isError ? (
        <div className="spinner">Could not load forecast</div>
      ) : (
        <div className="spinner">Fetching forecast…</div>
      )}
    </div>
  );
}
