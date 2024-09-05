import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing, { localeDetection: false })

export const config = {
	// Match only internationalized pathnames
	matcher: ['/((?!_next|.*\\..*).*)']
}
