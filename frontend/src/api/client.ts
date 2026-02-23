import type { ParseResponse, AdvisorResponse, CharacterStats } from '../types';

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

export async function getAdvisor(stats: CharacterStats): Promise<AdvisorResponse> {
  const res = await fetch(`${API_URL}/api/advisor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(stats),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error ?? 'Error al obtener recomendaciones');
  }

  return res.json() as Promise<AdvisorResponse>;
}
