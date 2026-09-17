import { cache } from 'react'
import type { CatalogResponse } from '@/types/loot.type'

// Catalog is public UI data. Decryption stays on the backend; desktop bundles
// must not contain a shared LOOT_KEY or decrypt protected payloads locally.
export const getLootCatalog = cache(async (): Promise<CatalogResponse> => {
 const origin = (process.env.STALHUB_API_ORIGIN || 'https://api.stalhub.dev').replace(/\/$/, '')
 const response = await fetch(`${origin}/api/v1/loot/catalog`, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(15000) })
 if (!response.ok) throw new Error(`Loot catalog backend returned ${response.status}; backend desktop catalog endpoint is required`)
 return response.json()
})
