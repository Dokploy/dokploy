import { useTranslations } from 'next-intl'
import { Container } from './Container'

const faqs = [
	[
		{
			question: 'faq.q1',
			answer: 'faq.a1',
		},
		{
			question: 'faq.q2',
			answer: 'faq.a2',
		},
		{
			question: 'faq.q3',
			answer: 'faq.a3',
		},
		{
			question: 'faq.q4',
			answer: 'faq.a4',
		},
	],
	[
		{
			question: 'faq.q5',
			answer: 'faq.a5',
		},
		{
			question: 'faq.q6',
			answer: 'faq.a6',
		},
		{
			question: 'faq.q7',
			answer: "faq.a7",
		},
	],
	[
		{
			question:
				'faq.q8',
			answer: 'faq.a8',
		},
		{
			question: 'faq.q9',
			answer: 'faq.a9',
		},
		{
			question: 'faq.q10',
			answer: 'faq.a10',
		},
	],
]

export function Faqs() {
	const t = useTranslations('HomePage')
	return (
		<section
			id="faqs"
			aria-labelledby="faq-title"
			className="relative overflow-hidden bg-black py-20 sm:py-32"
		>
			<Container className="relative">
				<div className="mx-auto max-w-2xl lg:mx-0">
					<h2
						id="faq-title"
						className="font-display text-3xl tracking-tight text-primary sm:text-4xl"
					>
						{t('faq.title')}
					</h2>
					<p className="mt-4 text-lg tracking-tight text-muted-foreground">
						{t('faq.des')}
					</p>
				</div>
				<ul className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
					{faqs.map((column, columnIndex) => (
						<li key={columnIndex}>
							<ul className="flex flex-col gap-y-8">
								{column.map((faq, faqIndex) => (
									<li key={faqIndex}>
										<h3 className="font-display text-lg leading-7 text-primary">
											{t(faq.question)}
										</h3>
										<p className="mt-4 text-sm text-muted-foreground">
											{t(faq.answer)}
										</p>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
			</Container>
		</section>
	)
}
