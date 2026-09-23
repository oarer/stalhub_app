import { apiClient } from '@/app/api/interceptors/root.interceptor'
import type { StatusResponse } from '@/types/status.type'

class StatusService {
	async get(): Promise<StatusResponse> {
		try {
			const res = await apiClient.get('/api/status')
			return res.data
		} catch {
			throw new Error('STATUS_API_FAILED')
		}
	}
}

export const statusService = new StatusService()
