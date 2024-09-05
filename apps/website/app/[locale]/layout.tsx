import clsx from 'clsx'
import { Inter, Lexend } from 'next/font/google'
import '@/styles/tailwind.css'
import GoogleAnalytics from '@/components/analitycs/google'

import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'

import type { Metadata } from 'next'

export const metadata: Metadata = {
	title: {
		default: 'Dokploy - Effortless Deployment Solutions',
		template: '%s | Simplify Your DevOps',
	},
	alternates: {
		canonical: 'https://dokploy.com',
		languages: {
			en: 'https://dokploy.com',
		},
	},
	description:
		'Streamline your deployment process with Dokploy. Effortlessly manage applications and databases on any VPS using Docker and Traefik for improved performance and security.',
	applicationName: 'Dokploy',
	keywords: [
		'Dokploy',
		'Docker',
		'Traefik',
		'deployment',
		'VPS',
		'application management',
		'database management',
		'DevOps',
		'cloud infrastructure',
		'UI Self hosted',
	],
	referrer: 'origin',
	robots: 'index, follow',
	openGraph: {
		type: 'website',
		url: 'https://dokploy.com',
		title: 'Dokploy - Effortless Deployment Solutions',
		description:
			'Simplify your DevOps with Dokploy. Deploy applications and manage databases efficiently on any VPS.',
		siteName: 'Dokploy',
		images: [
			{
				url: 'http://dokploy.com/og.png',
			},
		],
	},
	twitter: {
		card: 'summary_large_image',
		site: '@Dokploy',
		creator: '@Dokploy',
		title: 'Dokploy - Simplify Your DevOps',
		description:
			'Deploy applications and manage databases with ease using Dokploy. Learn how our platform can elevate your infrastructure management.',
		images: 'https://dokploy.com/og.png',
	},
}

const inter = Inter({
	subsets: ['latin'],
	display: 'swap',
	variable: '--font-inter',
})

const lexend = Lexend({
	subsets: ['latin'],
	display: 'swap',
	variable: '--font-lexend',
})

export default async function RootLayout({
	children,
	params,
}: {
	children: React.ReactNode
	params: { locale: string }
}) {
	const { locale } = params
	const messages = await getMessages()
	return (
		<html
			lang={locale}
			className={clsx(
				'h-full scroll-smooth',
				inter.variable,
				lexend.variable,
			)}
		>
			<GoogleAnalytics />
			<body className="flex h-full flex-col">
				<NextIntlClientProvider messages={messages}>
					{children}
				</NextIntlClientProvider>
			</body>
		</html>
	)
}
