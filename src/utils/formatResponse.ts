export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: Record<string, unknown>;
}

export function formatSuccess<T>(
  message: string,
  data?: T,
  meta?: Record<string, unknown>,
): ApiResponse<T> {
  return { success: true, message, data, meta };
}

export function formatError(message: string, data?: Record<string, unknown>): ApiResponse {
  return { success: false, message, data };
}
