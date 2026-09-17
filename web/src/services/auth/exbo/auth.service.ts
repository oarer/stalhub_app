import { apiClient } from '@/app/api/interceptors/root.interceptor'

class ExboAuthService {
	async getLoginUrl(): Promise<string> {
		const { data } = await apiClient.get<{ url: string }>(
			'/api/v1/auth/exbo/login'
		)
		return data.url
	}

	async handleCallback(code: string, state: string): Promise<{
		desktopUrl?: string
	}> {
		const { data } = await apiClient.get<{ desktopUrl?: string }>(
			'/api/v1/auth/exbo/callback',
			{
				params: { code, state },
				skipAuthRefresh: true,
			}
		)
		return data
	}
}

export const exboAuthService = new ExboAuthService()
