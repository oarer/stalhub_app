// Изоморфная сериализация MDX: работает и на сервере (сайт), и в браузере
// (десктоп, static export). Раньше был Server Action ('use server'), но
// Server Actions несовместимы с output:'export', а все вызовы (ArticleView,
// TOSView, useCompiledPreview) идут из клиентских компонентов — поэтому
// сериализация выполняется на клиенте в обеих сборках.
import { serialize } from 'next-mdx-remote/serialize'
import remarkBreaks from 'remark-breaks'
import remarkDirective from 'remark-directive'
import remarkGfm from 'remark-gfm'
import { remarkCalloutContainers, remarkCallouts } from '@/lib/remark/callouts'

const HTML_TAGS = new Set([
	'a',
	'abbr',
	'address',
	'area',
	'article',
	'aside',
	'audio',
	'b',
	'bdi',
	'bdo',
	'blockquote',
	'br',
	'button',
	'caption',
	'cite',
	'code',
	'col',
	'colgroup',
	'data',
	'dd',
	'del',
	'details',
	'dfn',
	'dialog',
	'div',
	'dl',
	'dt',
	'em',
	'figcaption',
	'figure',
	'footer',
	'h1',
	'h2',
	'h3',
	'h4',
	'h5',
	'h6',
	'header',
	'hr',
	'i',
	'img',
	'ins',
	'kbd',
	'label',
	'legend',
	'li',
	'main',
	'mark',
	'meter',
	'nav',
	'noscript',
	'ol',
	'optgroup',
	'option',
	'output',
	'p',
	'picture',
	'pre',
	'progress',
	'q',
	'rp',
	'rt',
	'ruby',
	's',
	'samp',
	'section',
	'small',
	'source',
	'span',
	'strong',
	'sub',
	'summary',
	'sup',
	'table',
	'tbody',
	'td',
	'tfoot',
	'th',
	'thead',
	'time',
	'tr',
	'u',
	'ul',
	'var',
	'wbr',
])

function stripDangerousExpressions(source: string): string {
	return source.replace(/\{[\s\S]*?\}/g, '')
}

export async function compileMdx(source: string) {
	const tagRegex = /<([a-z][a-z0-9-]*)[\s/>]/g
	let match
	while ((match = tagRegex.exec(source)) !== null) {
		if (!HTML_TAGS.has(match[1])) {
			throw new Error(`Unknown tag: <${match[1]}>`)
		}
	}

	const safe = stripDangerousExpressions(source)

	const result = await serialize(safe, {
		mdxOptions: {
			remarkPlugins: [
				remarkDirective,
				remarkCalloutContainers,
				remarkGfm,
				remarkBreaks,
				remarkCallouts,
			],
		},
	})

	return {
		compiledSource: result.compiledSource,
		frontmatter: result.frontmatter,
	}
}
