import { Container } from "./Container";

const testimonials = [
	[
		{
			content:
				"This application has revolutionized the way we handle deployments. The integration of Docker and Traefik through such a user-friendly interface has saved us countless hours.",
			author: {
				name: "Emily R.",
				role: "Full Stack Developer",
				image: "/avatars/avatar-1.png",
			},
		},
		{
			content:
				"As a fast-paced startup, efficiency and reliability are paramount. This software delivered on both, allowing us to focus more on development and less on operations.",
			author: {
				name: "Mark T.",
				role: "CTO, Tech Innovations Inc.",
				image: "/avatars/avatar-2.png",
			},
		},
	],
	[
		{
			content:
				"The comprehensive monitoring and robust backup solutions have given us the peace of mind we need to operate at our best 24/7. Highly recommended!",
			author: {
				name: "Sarah L.",
				role: "IT Director, Creative Solutions Agency",
				image: "/avatars/avatar-3.png",
			},
		},
		{
			content:
				"Upgrading to this platform was a game-changer for our agency. The user permission controls and real-time updates have greatly enhanced our team's efficiency.",
			author: {
				name: "James P.",
				role: "Lead Developer, Dynamic Web Solutions",
				image: "/avatars/avatar-4.png",
			},
		},
	],
	[
		{
			content:
				"Fantastic tool! The direct container access and dynamic Traefik configuration features have made it so easy to manage our services. It's like having a DevOps team in a box!",
			author: {
				name: "Ana D.",
				role: "Full Stack Developer, Independent Contractor",
				image: "/avatars/avatar-7.png",
			},
		},
		{
			content:
				"his tool has been indispensable for managing my client projects. It has streamlined my workflow and dramatically increased my productivity, allowing me to take on more clients without sacrificing quality.",
			author: {
				name: "Carlos M.",
				role: "Freelance Full Stack Developer",
				image: "/avatars/avatar-6.png",
			},
		},
	],
];

function QuoteIcon(props: React.ComponentPropsWithoutRef<"svg">) {
	return (
		<svg aria-hidden="true" width={105} height={78} {...props}>
			<path d="M25.086 77.292c-4.821 0-9.115-1.205-12.882-3.616-3.767-2.561-6.78-6.102-9.04-10.622C1.054 58.534 0 53.411 0 47.686c0-5.273.904-10.396 2.712-15.368 1.959-4.972 4.746-9.567 8.362-13.786a59.042 59.042 0 0 1 12.43-11.3C28.325 3.917 33.599 1.507 39.324 0l11.074 13.786c-6.479 2.561-11.677 5.951-15.594 10.17-3.767 4.219-5.65 7.835-5.65 10.848 0 1.356.377 2.863 1.13 4.52.904 1.507 2.637 3.089 5.198 4.746 3.767 2.41 6.328 4.972 7.684 7.684 1.507 2.561 2.26 5.5 2.26 8.814 0 5.123-1.959 9.19-5.876 12.204-3.767 3.013-8.588 4.52-14.464 4.52Zm54.24 0c-4.821 0-9.115-1.205-12.882-3.616-3.767-2.561-6.78-6.102-9.04-10.622-2.11-4.52-3.164-9.643-3.164-15.368 0-5.273.904-10.396 2.712-15.368 1.959-4.972 4.746-9.567 8.362-13.786a59.042 59.042 0 0 1 12.43-11.3C82.565 3.917 87.839 1.507 93.564 0l11.074 13.786c-6.479 2.561-11.677 5.951-15.594 10.17-3.767 4.219-5.65 7.835-5.65 10.848 0 1.356.377 2.863 1.13 4.52.904 1.507 2.637 3.089 5.198 4.746 3.767 2.41 6.328 4.972 7.684 7.684 1.507 2.561 2.26 5.5 2.26 8.814 0 5.123-1.959 9.19-5.876 12.204-3.767 3.013-8.588 4.52-14.464 4.52Z" />
		</svg>
	);
}

export function Testimonials() {
	return (
		<section
			id="testimonials"
			aria-label="What our customers are saying"
			className="bg-black  py-20 sm:py-32"
		>
			<Container>
				<div className="mx-auto max-w-2xl md:text-center">
					<h2 className="font-display text-3xl tracking-tight  sm:text-4xl">
						What Our Users Say
					</h2>
					<p className="mt-4 text-lg tracking-tight text-muted-foreground ">
						Don’t just take our word for it—see what our users across the globe
						are saying about how our platform has transformed their development
						workflows and boosted their productivity.
					</p>
				</div>
				<ul className="mx-auto mt-16 grid max-w-2xl grid-cols-1 gap-6 sm:gap-8 lg:mt-20 lg:max-w-none lg:grid-cols-3">
					{testimonials.map((column, columnIndex) => (
						<li key={columnIndex}>
							<ul className="flex flex-col gap-y-6 sm:gap-y-8">
								{column.map((testimonial, testimonialIndex) => (
									<li key={testimonialIndex}>
										<figure className="relative rounded-2xl bg-muted p-6 shadow-xl shadow-slate-900/10">
											<QuoteIcon className="absolute left-6 top-6 fill-border" />
											<blockquote className="relative">
												<p className="text-lg tracking-tight ">
													{testimonial.content}
												</p>
											</blockquote>
											<figcaption className="relative mt-6 flex items-center justify-between border-t border-border pt-6">
												<div>
													<div className="font-display text-base ">
														{testimonial.author.name}
													</div>
													<div className="mt-1 text-sm text-muted-foreground">
														{testimonial.author.role}
													</div>
												</div>
												<div className="overflow-hidden rounded-full bg-slate-50">
													<img
														className="h-14 w-14 object-cover"
														src={testimonial.author.image}
														alt=""
														width={56}
														height={56}
													/>
												</div>
											</figcaption>
										</figure>
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
