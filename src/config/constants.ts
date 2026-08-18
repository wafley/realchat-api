export const BCRYPT_SALT_ROUNDS = 10;

export const MAX_GROUP_MEMBERS = 50;

export const MAX_AVATAR_SIZE = 2 * 1024 * 1024; // 2 MB

export const MAX_GROUP_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const ALLOWED_MESSAGE_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  'image/gif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-7z-compressed',
  'application/x-rar-compressed',
] as const;

export const ALLOWED_MESSAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.csv',
  '.zip',
  '.7z',
  '.rar',
]);
