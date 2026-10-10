import { Capacitor, registerPlugin } from '@capacitor/core';

export interface DevicePosition {
  coords: { latitude: number; longitude: number; accuracy: number };
  timestamp: number;
  provider?: string;
}

interface FarmLocationPlugin {
  getCurrentPosition(): Promise<DevicePosition>;
  cancelCurrentPosition(): Promise<void>;
}

const nativeLocation = registerPlugin<FarmLocationPlugin>('FarmLocation');

function positionError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

/** A fresh foreground fix. Android uses the system providers without Google Play Services. */
export async function getDevicePosition(): Promise<DevicePosition> {
  if (Capacitor.getPlatform() === 'android') return nativeLocation.getCurrentPosition();
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw positionError('此浏览器不支持定位，请手动选择城市。', 'POSITION_UNAVAILABLE');
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw positionError('网页定位需要 HTTPS 或 localhost，请手动选择城市。', 'POSITION_UNAVAILABLE');
  }
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, maximumAge: 0, timeout: 25_000,
      });
    });
    return {
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      },
      timestamp: position.timestamp,
      provider: 'browser',
    };
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 1) throw positionError('未允许浏览器位置权限，请允许定位或手动选择城市。', 'PERMISSION_DENIED');
    if (code === 3) throw positionError('25 秒内没有获取到位置，请重试或手动选择城市。', 'POSITION_TIMEOUT');
    throw positionError('浏览器暂时无法获取位置，请检查系统位置服务或手动选择城市。', 'POSITION_UNAVAILABLE');
  }
}

/** Stop the Android listener when a location page is dismissed. */
export async function cancelDevicePosition(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') await nativeLocation.cancelCurrentPosition();
}
