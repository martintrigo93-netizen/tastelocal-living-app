import { UserLocation, WeatherInfo } from '../types';
import { getWeatherProxy } from './apiProxy';

export async function getWeather(location: UserLocation): Promise<WeatherInfo> {
  return await getWeatherProxy(location);
}
