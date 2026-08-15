import * as repository from './devices.repository';

export async function registerDevice(
  userId: string,
  data: { token: string; platform: 'android' | 'web' },
) {
  return repository.upsertDeviceToken(userId, data.token, data.platform);
}

export async function unregisterDevice(userId: string, token: string) {
  await repository.removeDeviceToken(userId, token);
}
