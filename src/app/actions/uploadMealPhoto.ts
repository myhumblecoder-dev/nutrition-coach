'use server'

import { put } from '@vercel/blob';
import { auth } from '@/auth';

export async function uploadMealPhoto(formData: FormData): Promise<{ url: string }> {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error('Unauthorized');
  }

  const file = formData.get('file');

  if (!file || !(file instanceof File)) {
    throw new Error('No file provided');
  }

  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type)) {
    throw new Error('Unsupported image type');
  }

  const result = await put(file.name, file, {
    access: 'public',
    addRandomSuffix: true,
  });

  return { url: result.url };
}