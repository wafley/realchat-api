import { promises as fs } from 'fs';

export async function unlinkQuietly(filePath: string) {
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}
