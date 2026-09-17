import { queryOptions } from '@tanstack/react-query'
import { arsenalService } from '@/services/calcs/arsenal.service'
import type { ArsenalResponse } from '@/types/arsenal.type'

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000

const msUntilNextMskBoundary = () => {
	const mskNow = new Date(Date.now() + MSK_OFFSET_MS)
	const next = new Date(mskNow)

	const hour = mskNow.getUTCHours()

	if (hour < 12) {
		next.setUTCHours(12, 0, 0, 0)
	} else {
		next.setUTCDate(next.getUTCDate() + 1)
		next.setUTCHours(0, 0, 0, 0)
	}

	return next.getTime() - mskNow.getTime()
}

class ArsenalQueries {
	get() {
		return queryOptions<ArsenalResponse>({
			queryKey: ['arsenal'],
			queryFn: () => arsenalService.get(),
			staleTime: 1000 * 60 * 10,
			refetchInterval: () => msUntilNextMskBoundary(),
			refetchIntervalInBackground: true,
		})
	}
}

export const arsenalQueries = new ArsenalQueries()
