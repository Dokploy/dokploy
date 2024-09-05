import Link from 'next/link'

import { Container } from './Container'
import { NavLink } from './NavLink'
import { Logo } from './shared/Logo'
import { useTranslations } from 'next-intl'

export function Footer() {
	const t = useTranslations('HomePage')
	return (
		<footer className="bg-black">
			<Container>
				<div className="py-16">
					<div className="flex flex-col items-center gap-2">
						<Logo className="mx-auto h-10 w-auto" />
						<span className="text-center text-sm font-medium text-primary">
							Dokploy
						</span>
					</div>

					<nav className="mt-10 text-sm" aria-label="quick links">
						<div className="-my-1 flex flex-wrap justify-center gap-6">
							<NavLink href="/#features">
								{t('navigation.features')}
							</NavLink>
							<NavLink href="/#faqs">
								{t('navigation.faqs')}
							</NavLink>
							<NavLink
								href="https://docs.dokploy.com/get-started/introduction"
								target="_blank"
							>
								{t('navigation.docs')}
							</NavLink>
						</div>
					</nav>
				</div>
				<div className="flex flex-col items-center border-t border-slate-400/10 py-10 sm:flex-row-reverse sm:justify-between">
					<div className="flex gap-x-6">
						<Link
							href="https://twitter.com/Siumauricio"
							className="group"
							aria-label="Dokploy on Twitter"
						>
							<svg
								aria-hidden="true"
								className="h-6 w-6 fill-muted-foreground group-hover:fill-muted-foreground/70"
							>
								<path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0 0 22 5.92a8.19 8.19 0 0 1-2.357.646 4.118 4.118 0 0 0 1.804-2.27 8.224 8.224 0 0 1-2.605.996 4.107 4.107 0 0 0-6.993 3.743 11.65 11.65 0 0 1-8.457-4.287 4.106 4.106 0 0 0 1.27 5.477A4.073 4.073 0 0 1 2.8 9.713v.052a4.105 4.105 0 0 0 3.292 4.022 4.093 4.093 0 0 1-1.853.07 4.108 4.108 0 0 0 3.834 2.85A8.233 8.233 0 0 1 2 18.407a11.615 11.615 0 0 0 6.29 1.84" />
							</svg>
						</Link>
						<Link
							href="https://github.com/dokploy/dokploy"
							className="group"
							aria-label="Dokploy on GitHub"
						>
							<svg
								aria-hidden="true"
								className="h-6 w-6 fill-muted-foreground group-hover:fill-muted-foreground/70"
							>
								<path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z" />
							</svg>
						</Link>
					</div>
					<p className="mt-6 text-sm text-muted-foreground sm:mt-0">
						{t('footer.copyright', {
							year: new Date().getFullYear(),
						})}
					</p>
				</div>
			</Container>
		</footer>
	)
}
