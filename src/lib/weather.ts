export type WeatherIntent = {
  locationQuery: string | null;
  targetDay: 'today' | 'tomorrow';
};

type ChatMessage = {
  role: string;
  content: string;
};

type FetchLike = typeof fetch;

type GeocodingResult = {
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
};

type ForecastResponse = {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_sum?: number[];
  };
};

type GeocodeResolution = {
  location?: GeocodingResult;
  clarification?: string;
};

const DEFAULT_GEOCODING_URL = process.env.WEATHER_GEOCODING_URL || 'https://geocoding-api.open-meteo.com/v1/search';
const DEFAULT_FORECAST_URL = process.env.WEATHER_FORECAST_URL || 'https://api.open-meteo.com/v1/forecast';
const WEATHER_LOOKUP_TIMEOUT_MS = Number(process.env.WEATHER_LOOKUP_TIMEOUT_MS || '8000');

const getDefaultFetch = () => (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);

const LOCATION_ALIASES: Record<string, string> = {
  nyc: 'New York City',
  'new york city': 'New York City',
  sf: 'San Francisco',
  'san fran': 'San Francisco',
  la: 'Los Angeles',
  dc: 'Washington, DC',
  'washington dc': 'Washington, DC',
};

const US_STATE_ABBREVIATIONS: Record<string, string> = {
  AL: 'Alabama',
  AK: 'Alaska',
  AZ: 'Arizona',
  AR: 'Arkansas',
  CA: 'California',
  CO: 'Colorado',
  CT: 'Connecticut',
  DE: 'Delaware',
  FL: 'Florida',
  GA: 'Georgia',
  HI: 'Hawaii',
  ID: 'Idaho',
  IL: 'Illinois',
  IN: 'Indiana',
  IA: 'Iowa',
  KS: 'Kansas',
  KY: 'Kentucky',
  LA: 'Louisiana',
  ME: 'Maine',
  MD: 'Maryland',
  MA: 'Massachusetts',
  MI: 'Michigan',
  MN: 'Minnesota',
  MS: 'Mississippi',
  MO: 'Missouri',
  MT: 'Montana',
  NE: 'Nebraska',
  NV: 'Nevada',
  NH: 'New Hampshire',
  NJ: 'New Jersey',
  NM: 'New Mexico',
  NY: 'New York',
  NC: 'North Carolina',
  ND: 'North Dakota',
  OH: 'Ohio',
  OK: 'Oklahoma',
  OR: 'Oregon',
  PA: 'Pennsylvania',
  RI: 'Rhode Island',
  SC: 'South Carolina',
  SD: 'South Dakota',
  TN: 'Tennessee',
  TX: 'Texas',
  UT: 'Utah',
  VT: 'Vermont',
  VA: 'Virginia',
  WA: 'Washington',
  WV: 'West Virginia',
  WI: 'Wisconsin',
  WY: 'Wyoming',
  DC: 'District of Columbia',
};

const US_STATE_NAME_LOOKUP = Object.fromEntries(
  Object.entries(US_STATE_ABBREVIATIONS).flatMap(([abbr, name]) => [
    [abbr.toLowerCase(), name],
    [name.toLowerCase(), name],
  ]),
);

const WEATHER_WORD_RE = /\b(weather|forecast|temperature|rain|snow|wind|sunny|cloudy|storm)\b/i;

const LOCATION_PATTERNS = [
  /\b(?:weather|forecast|temperature)\b(?:\s+(?:like|for))?\s+(?:in|for|at)\s+(.+?)(?:\s+\b(today|tomorrow|now|right now|currently)\b|[?!.,]|$)/i,
  /\b(?:in|for|at)\s+(.+?)(?:\s+\b(weather|forecast|temperature)\b|\s+\b(today|tomorrow|now|right now|currently)\b|[?!.,]|$)/i,
  /^(.+?)\s+\b(?:weather|forecast)\b/i,
];

const cleanLocation = (raw: string) => {
  const normalized = raw
    .replace(/\b(please|tell me|show me|give me|what is|what's|how is|how's|can you|could you)\b/gi, ' ')
    .replace(/[?!.,]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return null;

  const withoutLeadingArticle = normalized.replace(/^(the|a|an)\b\s*/i, '').trim();
  if (!withoutLeadingArticle || /^(weather|forecast|temperature|like)$/i.test(withoutLeadingArticle)) {
    return null;
  }

  return withoutLeadingArticle;
};

export const extractWeatherIntent = (prompt: string): WeatherIntent | null => {
  if (!WEATHER_WORD_RE.test(prompt)) {
    return null;
  }

  const targetDay = /\btomorrow\b/i.test(prompt) ? 'tomorrow' : 'today';
  for (const pattern of LOCATION_PATTERNS) {
    const match = prompt.match(pattern);
    const locationQuery = cleanLocation(match?.[1] || '');
    if (locationQuery) {
      return { locationQuery, targetDay };
    }
  }

  return { locationQuery: null, targetDay };
};

const buildLocationQueries = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return [] as string[];

  const queries: string[] = [];
  const pushUnique = (value: string) => {
    const next = value.trim();
    if (!next) return;
    if (!queries.some((q) => q.toLowerCase() === next.toLowerCase())) {
      queries.push(next);
    }
  };

  pushUnique(trimmed);

  const lower = trimmed.toLowerCase();
  const alias = LOCATION_ALIASES[lower];
  if (alias) pushUnique(alias);

  pushUnique(trimmed.replace(/\s*\([^)]*\)\s*/g, ' '));
  pushUnique(trimmed.replace(/\bcity\b/gi, ' '));

  if (trimmed.includes(',')) {
    const [first] = trimmed.split(',');
    pushUnique(first);
    pushUnique(trimmed.replace(/,/g, ' '));
  }

  pushUnique(trimmed.replace(/\s*\/\s*/g, ' '));

  if (!trimmed.includes(',')) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    const maxTail = Math.min(3, tokens.length - 1);
    for (let tail = 1; tail <= maxTail; tail++) {
      const tailTokens = tokens.slice(-tail);
      const candidate = tailTokens.join(' ').toLowerCase().replace(/\./g, '');
      const stateName = US_STATE_NAME_LOOKUP[candidate];
      if (!stateName) continue;
      const city = tokens.slice(0, -tail).join(' ');
      if (!city) continue;
      pushUnique(`${city}, ${stateName}`);
      pushUnique(`${city}, ${stateName}, United States`);
      break;
    }
  }

  if (!/\bunited states\b/i.test(trimmed) && /\b(u\.s\.|us|usa)\b/i.test(trimmed)) {
    pushUnique(`${trimmed} United States`);
  }

  return queries;
};

const scoreLocationMatch = (location: GeocodingResult, query: string) => {
  const q = query.toLowerCase();
  const name = location.name?.toLowerCase() || '';
  const admin = location.admin1?.toLowerCase() || '';
  const country = location.country?.toLowerCase() || '';
  let score = 0;
  if (name === q) score += 5;
  else if (name.startsWith(q)) score += 3;
  else if (name.includes(q)) score += 2;
  if (admin.includes(q)) score += 1;
  if (country.includes(q)) score += 1;
  return score;
};

const selectBestLocation = (locations: GeocodingResult[], query: string) => {
  let best = locations[0];
  let bestScore = scoreLocationMatch(best, query);
  for (let i = 1; i < locations.length; i++) {
    const candidate = locations[i];
    const score = scoreLocationMatch(candidate, query);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
};

const findAmbiguousLocations = (locations: GeocodingResult[], query: string) => {
  if (locations.length < 2) return [] as GeocodingResult[];
  const scored = locations
    .map((location) => ({ location, score: scoreLocationMatch(location, query) }))
    .sort((a, b) => b.score - a.score);
  const topScore = scored[0]?.score ?? 0;
  if (topScore === 0) return [];
  const closeMatches = scored
    .filter((entry) => entry.score >= Math.max(1, topScore - 1))
    .map((entry) => entry.location);
  return closeMatches.length > 1 ? closeMatches : [];
};

const formatClarificationPrompt = (options: GeocodingResult[], query: string) => {
  const labels = options.map((loc) => formatLocationLabel(loc)).filter(Boolean);
  const unique = Array.from(new Set(labels)).slice(0, 4);
  if (!unique.length) {
    return `Which country or state is "${query}" in?`;
  }
  const list = unique.join(' / ');
  return `Which location did you mean for "${query}"? For example: ${list}.`;
};

const normalizeLocationLabel = (value: string) =>
  value
    .toLowerCase()
    .replace(/\b(u\.s\.|us|usa)\b/g, 'united states')
    .replace(/[\s,\.]+/g, ' ')
    .trim();

const findExactLabelMatch = (locations: GeocodingResult[], query: string) => {
  const normalizedQuery = normalizeLocationLabel(query);
  if (!normalizedQuery) return null;
  for (const location of locations) {
    const label = formatLocationLabel(location);
    if (label && normalizeLocationLabel(label) === normalizedQuery) {
      return location;
    }
  }
  return null;
};

const narrowLocationsByQueryTokens = (locations: GeocodingResult[], query: string) => {
  const normalizedQuery = normalizeLocationLabel(query);
  if (!normalizedQuery) return [] as GeocodingResult[];
  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (!tokens.length) return [] as GeocodingResult[];
  return locations.filter((location) => {
    const label = formatLocationLabel(location);
    if (!label) return false;
    const labelTokens = new Set(normalizeLocationLabel(label).split(' '));
    return tokens.every((token) => labelTokens.has(token));
  });
};

const withTimeout = async <T>(work: Promise<T>, controller: AbortController) => {
  const timeoutId = setTimeout(() => controller.abort(), WEATHER_LOOKUP_TIMEOUT_MS);
  try {
    return await work;
  } finally {
    clearTimeout(timeoutId);
  }
};

const fetchJson = async <T>(url: string, fetchImpl: FetchLike, controller: AbortController): Promise<T> => {
  const response = await withTimeout(fetchImpl(url, { signal: controller.signal }), controller);
  if (!response.ok) {
    throw new Error(`Weather service returned ${response.status}`);
  }
  return await response.json() as T;
};

const geocodeLocation = async (locationQuery: string, fetchImpl: FetchLike): Promise<GeocodeResolution | null> => {
  const queries = buildLocationQueries(locationQuery);
  for (const query of queries) {
    const controller = new AbortController();
    const params = new URLSearchParams({
      name: query,
      count: '10',
      language: 'en',
      format: 'json',
    });
    const data = await fetchJson<{ results?: GeocodingResult[] }>(`${DEFAULT_GEOCODING_URL}?${params.toString()}`, fetchImpl, controller);
    const results = data.results || [];
    if (results.length) {
      const exactMatch = findExactLabelMatch(results, query);
      if (exactMatch) {
        return { location: exactMatch };
      }
      const narrowed = narrowLocationsByQueryTokens(results, query);
      if (narrowed.length === 1) {
        return { location: narrowed[0] };
      }
      if (narrowed.length > 1) {
        return { clarification: formatClarificationPrompt(narrowed, query) };
      }
      const ambiguous = findAmbiguousLocations(results, query);
      if (ambiguous.length > 1) {
        return { clarification: formatClarificationPrompt(ambiguous, query) };
      }
      return { location: selectBestLocation(results, query) };
    }
  }
  return null;
};

const fetchForecast = async (location: GeocodingResult, fetchImpl: FetchLike) => {
  const controller = new AbortController();
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum',
    temperature_unit: 'fahrenheit',
    wind_speed_unit: 'mph',
    precipitation_unit: 'inch',
    timezone: 'auto',
    forecast_days: '2',
  });

  return await fetchJson<ForecastResponse>(`${DEFAULT_FORECAST_URL}?${params.toString()}`, fetchImpl, controller);
};

const formatTodayReply = (location: GeocodingResult, forecast: ForecastResponse) => {
  const label = formatLocationLabel(location);
  const current = forecast.current || {};
  const daily = forecast.daily || {};
  const high = daily.temperature_2m_max?.[0];
  const low = daily.temperature_2m_min?.[0];
  const precipitation = daily.precipitation_sum?.[0];
  const summary = describeWeatherCode(current.weather_code ?? daily.weather_code?.[0]);

  const parts = [
    `Current weather for ${label}: ${current.temperature_2m ?? 'unknown'}F`,
    current.apparent_temperature !== undefined ? `feels like ${current.apparent_temperature}F` : null,
    summary,
    current.wind_speed_10m !== undefined ? `wind ${current.wind_speed_10m} mph` : null,
  ].filter(Boolean);

  const forecastBits = [
    high !== undefined ? `high ${high}F` : null,
    low !== undefined ? `low ${low}F` : null,
    precipitation !== undefined ? `precipitation ${precipitation} in` : null,
  ].filter(Boolean);

  return `${parts.join(', ')}.${forecastBits.length ? ` Today's forecast: ${forecastBits.join(', ')}.` : ''}`;
};

const formatTomorrowReply = (location: GeocodingResult, forecast: ForecastResponse) => {
  const label = formatLocationLabel(location);
  const daily = forecast.daily || {};
  const high = daily.temperature_2m_max?.[1];
  const low = daily.temperature_2m_min?.[1];
  const precipitation = daily.precipitation_sum?.[1];
  const summary = describeWeatherCode(daily.weather_code?.[1]);

  const bits = [
    `Tomorrow's weather for ${label}: ${summary}`,
    high !== undefined ? `high ${high}F` : null,
    low !== undefined ? `low ${low}F` : null,
    precipitation !== undefined ? `precipitation ${precipitation} in` : null,
  ].filter(Boolean);

  return `${bits.join(', ')}.`;
};

export const lookupWeatherReply = async (
  prompt: string,
  fetchImpl: FetchLike | null = getDefaultFetch(),
): Promise<string | null> => {
  const intent = extractWeatherIntent(prompt);
  if (!intent) {
    return null;
  }

  if (!intent.locationQuery) {
    return 'Tell me which city or location you want the weather for.';
  }

  if (!fetchImpl) {
    return 'Live weather lookup is unavailable right now.';
  }

  return await lookupWeatherForLocation(intent.locationQuery, intent.targetDay, fetchImpl);
};

const lookupWeatherForLocation = async (
  locationQuery: string,
  targetDay: WeatherIntent['targetDay'],
  fetchImpl: FetchLike,
): Promise<string> => {
  try {
    const resolution = await geocodeLocation(locationQuery, fetchImpl);
    if (!resolution) {
      return `I could not find a weather location matching "${locationQuery}".`;
    }
    if (resolution.clarification) {
      return resolution.clarification;
    }
    const location = resolution.location;
    if (!location) {
      return `I could not find a weather location matching "${locationQuery}".`;
    }

    const forecast = await fetchForecast(location, fetchImpl);
    return targetDay === 'tomorrow'
      ? formatTomorrowReply(location, forecast)
      : formatTodayReply(location, forecast);
  } catch {
    return `I could not look up live weather for ${locationQuery} right now.`;
  }
};

export const lookupWeatherReplyFromMessages = async (
  messages: ChatMessage[],
  fetchImpl: FetchLike | null = getDefaultFetch(),
): Promise<string | null> => {
  if (!messages.length) return null;
  const latestUserMessage = [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const direct = await lookupWeatherReply(latestUserMessage, fetchImpl);
  if (direct) return direct;

  if (!fetchImpl) return null;

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')?.content || '';
  const clarificationQuery = extractClarificationQuery(lastAssistant);
  if (!clarificationQuery) return null;

  const priorWeatherMessage = [...messages]
    .reverse()
    .find((m) => m.role === 'user' && WEATHER_WORD_RE.test(m.content))?.content || '';
  const targetDay = priorWeatherMessage ? normalizeTargetDay(priorWeatherMessage) : 'today';
  const clarifiedLocation = cleanLocation(latestUserMessage) || latestUserMessage.trim();
  if (!clarifiedLocation) return null;

  return await lookupWeatherForLocation(clarifiedLocation, targetDay, fetchImpl);
};
