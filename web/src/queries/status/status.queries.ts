import { queryOptions } from '@tanstack/react-query'
import { statusService } from '@/services/status/status.service'
import type { StatusResponse } from '@/types/status.type'

class StatusQueries {
	get() {
		return queryOptions<StatusResponse>({
			queryKey: ['status'],
			queryFn: () => statusService.get(),
			placeholderData: undefined,
			staleTime: 1000 * 60,
			refetchInterval: 1000 * 60,
		})
	}
}

export const statusQueries = new StatusQueries()
