import { UserLocation, WeatherInfo } from '../types';
import { getWeatherProxy } from './apiProxy';

export async function getWeather(
  location: UserLocation,
  timeoutMs = 3000
): Promise<WeatherInfo> {
  return await getWeatherProxy(location, timeoutMs);
}
