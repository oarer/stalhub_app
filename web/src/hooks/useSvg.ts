'use client'

import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export default function useSvg(): string {
	const { theme, resolvedTheme } = useTheme()
	// Дефолт — тёмная тема (корневой layout хардкодит class="dark").
	// Пустая строка давала относительный src "logo.svg" → 404 на первом
	// paint (в Tauri это ещё и шум в логах asset-протокола).
	const [svgPath, setSvgPath] = useState<string>('/svg/dark/')

	useEffect(() => {
		if (theme || resolvedTheme) {
			const currentTheme = theme === 'system' ? resolvedTheme : theme
			const baseUrl = ''
			const path =
				currentTheme === 'dark'
					? `${baseUrl}/svg/dark/`
					: `${baseUrl}/svg/light/`
			setSvgPath(path)
		}
	}, [theme, resolvedTheme])

	return svgPath
}
