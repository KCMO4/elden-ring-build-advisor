import type { ParseResponse } from '../types';
import type { BuildTemplate } from '../utils/buildMatcher';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export async function parseSave(file: File): Promise<ParseResponse> {
  const formData = new FormData();
  formData.append('savefile', file);

  const res = await fetch(`${API_URL}/api/parse?inventory=true`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? 'Error al parsear el archivo');
  }

  return res.json() as Promise<ParseResponse>;
}

export async function getBuilds(): Promise<BuildTemplate[]> {
  const res = await fetch(`${API_URL}/api/builds`);

  if (!res.ok) {
    throw new Error('Failed to load build templates');
  }

  return res.json() as Promise<BuildTemplate[]>;
}
