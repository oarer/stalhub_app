import { queryOptions } from '@tanstack/react-query'

import { itemsService } from '@/services/calcs/build.service'
import type { ItemsParams, ItemsResponse } from '@/types/build.type'
import type { Item } from '@/types/item.type'

class ItemsQueries {
	get({ type }: ItemsParams) {
		return queryOptions<ItemsResponse, Error, Item[]>({
			queryKey: ['build', type],
			queryFn: () => itemsService.get({ type }),
			select: (data) => Object.values(data),
			placeholderData: undefined,
			staleTime: 1000 * 60 * 120,
		})
	}
}

export const itemsQueries = new ItemsQueries()
