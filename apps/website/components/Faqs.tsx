import { Container } from "./Container";

const faqs = [
	[
		{
			question: "What is dokploy?",
			answer:
				"Dokploy is a stable, easy-to-use deployment solution designed to simplify the application management process. Think of Dokploy as a free alternative self-hostable solution to platforms like Heroku, Vercel, and Netlify.",
		},
		{
			question: "Why Choose Dokploy?",
			answer: "Simplicity, Flexibility, and Fast",
		},
		{
			question: "Is free?",
			answer:
				"Yes, dokploy is totally free. You can use it for personal projects, small teams, or even for large-scale applications.",
		},
		{
			question: "Is it open source?",
			answer: "Yes, dokploy is open source and free to use.",
		},
	],
	[
		{
			question: "What type of applications can i deploy with dokploy?",
			answer:
				"Dokploy is a great choice for any type of application. You can deploy your code to dokploy and manage it from the dashboard. We support a wide range of languages and frameworks, so you can choose the one that best fits your needs.",
		},
		{
			question: "How do I request a feature or report a bug?",
			answer:
				"Currently we are working on fixing bug fixes, but we will be releasing new features soon. You can also request features or report bugs.",
		},
		{
			question: "Do you track the usage of Dokploy?",
			answer: "No, we don't track any usage data.",
		},
	],
	[
		{
			question:
				"Are there any user forums or communities where I can interact with other users?",
			answer:
				"Yes, we have active github discussions where you can share ideas, ask for help, and connect with other users.",
		},
		{
			question: "What types of applications can I deploy with Dokploy?",
			answer:
				"Dokploy supports a variety of applications, including those built with Docker, as well as applications from any Git repository, offering custom builds with Nixpacks, Dockerfiles, or Buildpacks like Heroku and Paketo.",
		},
		{
			question: "How does Dokploy handle database management?",
			answer:
				"Dokploy supports multiple database systems including Postgres, MySQL, MariaDB, MongoDB, and Redis, providing tools for easy deployment and management directly from the dashboard.",
		},
	],
];

export function Faqs() {
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
						Frequently asked questions
					</h2>
					<p className="mt-4 text-lg tracking-tight text-muted-foreground">
						If you can’t find what you’re looking for, email our support team
						and if you’re lucky someone will get back to you.
					</p>
				</div>
				<ul className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-8 lg:max-w-none lg:grid-cols-3">
					{faqs.map((column, columnIndex) => (
						<li key={columnIndex}>
							<ul className="flex flex-col gap-y-8">
								{column.map((faq, faqIndex) => (
									<li key={faqIndex}>
										<h3 className="font-display text-lg leading-7 text-primary">
											{faq.question}
										</h3>
										<p className="mt-4 text-sm text-muted-foreground">
											{faq.answer}
										</p>
									</li>
								))}
							</ul>
						</li>
					))}
				</ul>
			</Container>
		</section>
	);
}
