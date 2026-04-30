import { extractWeatherIntent, lookupWeatherReply, lookupWeatherReplyFromMessages } from '../src/lib/weather.ts';

describe('weather lookup helpers', () => {
  it('extracts a location and target day from a weather prompt', () => {
    const intent = extractWeatherIntent('What is the weather in Seattle tomorrow?');

    expect(intent).toEqual({
      locationQuery: 'Seattle',
      targetDay: 'tomorrow',
    });
  });

  it('asks for a location when weather is requested without one', async () => {
    const reply = await lookupWeatherReply('What is the weather like?');
    expect(reply).toContain('which city or location');
  });

  it('formats a live weather reply from geocoding and forecast responses', async () => {
    const mockFetch = async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                name: 'Seattle',
                admin1: 'Washington',
                country: 'United States',
                latitude: 47.6062,
                longitude: -122.3321,
              },
            ],
          }),
        } as Response;
      }

      if (asString.startsWith('https://api.open-meteo.com/v1/forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 58,
              apparent_temperature: 56,
              weather_code: 2,
              wind_speed_10m: 7,
            },
            daily: {
              temperature_2m_max: [63, 66],
              temperature_2m_min: [50, 52],
              precipitation_sum: [0.05, 0.0],
              weather_code: [2, 1],
            },
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${asString}`);
    };

    const reply = await lookupWeatherReply('What is the weather in Seattle today?', mockFetch as typeof fetch);
    expect(reply).toContain('Seattle, Washington, United States');
    expect(reply).toContain('58F');
    expect(reply).toContain('partly cloudy');
    expect(reply).toContain("Today's forecast");
  });

  it('retries geocoding with alternate names for fuzzy locations', async () => {
    let geocodeCalls = 0;
    const mockFetch = async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
        geocodeCalls += 1;
        const name = new URL(asString).searchParams.get('name');
        if (name === 'New York City') {
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  name: 'New York City',
                  admin1: 'New York',
                  country: 'United States',
                  latitude: 40.7128,
                  longitude: -74.0060,
                },
              ],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }

      if (asString.startsWith('https://api.open-meteo.com/v1/forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 70,
              apparent_temperature: 69,
              weather_code: 1,
              wind_speed_10m: 5,
            },
            daily: {
              temperature_2m_max: [72, 75],
              temperature_2m_min: [60, 62],
              precipitation_sum: [0.0, 0.1],
              weather_code: [1, 2],
            },
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${asString}`);
    };

    const reply = await lookupWeatherReply('What is the weather in NYC today?', mockFetch as typeof fetch);
    expect(geocodeCalls).toBeGreaterThan(1);
    expect(reply).toContain('New York City');
  });

  it('asks to clarify when multiple locations match', async () => {
    const mockFetch = async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                name: 'Springfield',
                admin1: 'Illinois',
                country: 'United States',
                latitude: 39.7817,
                longitude: -89.6501,
              },
              {
                name: 'Springfield',
                admin1: 'Missouri',
                country: 'United States',
                latitude: 37.2089,
                longitude: -93.2923,
              },
            ],
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${asString}`);
    };

    const reply = await lookupWeatherReply('What is the weather in Springfield today?', mockFetch as typeof fetch);
    expect(reply).toContain('Which location did you mean');
    expect(reply).toContain('Springfield, Illinois');
    expect(reply).toContain('Springfield, Missouri');
  });

  it('handles clarification follow-ups by retrying the weather lookup', async () => {
    const mockFetch = async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
        const name = new URL(asString).searchParams.get('name');
        if (name === 'Hillsborough, New Jersey') {
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  name: 'Hillsborough',
                  admin1: 'New Jersey',
                  country: 'United States',
                  latitude: 40.4987,
                  longitude: -74.6496,
                },
              ],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }

      if (asString.startsWith('https://api.open-meteo.com/v1/forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 66,
              apparent_temperature: 65,
              weather_code: 2,
              wind_speed_10m: 4,
            },
            daily: {
              temperature_2m_max: [70, 72],
              temperature_2m_min: [55, 57],
              precipitation_sum: [0.0, 0.0],
              weather_code: [2, 1],
            },
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${asString}`);
    };

    const reply = await lookupWeatherReplyFromMessages(
      [
        { role: 'user', content: 'Tell me about the weather in Hillsborough.' },
        { role: 'assistant', content: 'Which location did you mean for "Hillsborough"? For example: Hillsborough, North Carolina, United States / Hillsborough, Carriacou and Petite Martinique, Grenada / Hillsborough, New Jersey, United States.' },
        { role: 'user', content: 'Hillsborough, New Jersey.' },
      ],
      mockFetch as typeof fetch,
    );

    expect(reply).toContain('Hillsborough, New Jersey');
  });

  it('accepts fully qualified location replies without repeating clarification', async () => {
    const mockFetch = async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
        return {
          ok: true,
          json: async () => ({
            results: [
              {
                name: 'Hillsborough',
                admin1: 'North Carolina',
                country: 'United States',
                latitude: 36.0754,
                longitude: -79.0997,
              },
              {
                name: 'Hillsborough',
                admin1: 'New Jersey',
                country: 'United States',
                latitude: 40.4987,
                longitude: -74.6496,
              },
            ],
          }),
        } as Response;
      }

      if (asString.startsWith('https://api.open-meteo.com/v1/forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 66,
              apparent_temperature: 65,
              weather_code: 2,
              wind_speed_10m: 4,
            },
            daily: {
              temperature_2m_max: [70, 72],
              temperature_2m_min: [55, 57],
              precipitation_sum: [0.0, 0.0],
              weather_code: [2, 1],
            },
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${asString}`);
    };

    const reply = await lookupWeatherReplyFromMessages(
      [
        { role: 'user', content: 'Tell me about the weather in Hillsborough.' },
        { role: 'assistant', content: 'Which location did you mean for "Hillsborough"? For example: Hillsborough, North Carolina, United States / Hillsborough, New Jersey, United States.' },
        { role: 'user', content: 'Hillsborough, New Jersey, United States.' },
      ],
      mockFetch as typeof fetch,
    );

    expect(reply).toContain('Hillsborough, New Jersey');
    expect(reply).not.toContain('Which location did you mean');
  });

  it('resolves city plus state without comma', async () => {
    const mockFetch = async (url: string | URL) => {
      const asString = String(url);
      if (asString.startsWith('https://geocoding-api.open-meteo.com/v1/search')) {
        const name = new URL(asString).searchParams.get('name');
        if (name === 'Hillsborough, New Jersey' || name === 'Hillsborough, New Jersey, United States') {
          return {
            ok: true,
            json: async () => ({
              results: [
                {
                  name: 'Hillsborough',
                  admin1: 'New Jersey',
                  country: 'United States',
                  latitude: 40.4987,
                  longitude: -74.6496,
                },
              ],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ results: [] }) } as Response;
      }

      if (asString.startsWith('https://api.open-meteo.com/v1/forecast')) {
        return {
          ok: true,
          json: async () => ({
            current: {
              temperature_2m: 66,
              apparent_temperature: 65,
              weather_code: 2,
              wind_speed_10m: 4,
            },
            daily: {
              temperature_2m_max: [70, 72],
              temperature_2m_min: [55, 57],
              precipitation_sum: [0.0, 0.0],
              weather_code: [2, 1],
            },
          }),
        } as Response;
      }

      throw new Error(`Unexpected fetch URL: ${asString}`);
    };

    const reply = await lookupWeatherReply('Tell me about the weather in Hillsborough New Jersey', mockFetch as typeof fetch);
    expect(reply).toContain('Hillsborough, New Jersey');
  });
});
