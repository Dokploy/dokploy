"use client";
import clsx from "clsx";

import { cn } from "@/lib/utils";
import { MinusIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Container } from "./Container";
import { trackGAEvent } from "./analitycs";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { NumberInput } from "./ui/input";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

function SwirlyDoodle(props: React.ComponentPropsWithoutRef<"svg">) {
	return (
		<svg
			aria-hidden="true"
			viewBox="0 0 281 40"
			preserveAspectRatio="none"
			{...props}
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M240.172 22.994c-8.007 1.246-15.477 2.23-31.26 4.114-18.506 2.21-26.323 2.977-34.487 3.386-2.971.149-3.727.324-6.566 1.523-15.124 6.388-43.775 9.404-69.425 7.31-26.207-2.14-50.986-7.103-78-15.624C10.912 20.7.988 16.143.734 14.657c-.066-.381.043-.344 1.324.456 10.423 6.506 49.649 16.322 77.8 19.468 23.708 2.65 38.249 2.95 55.821 1.156 9.407-.962 24.451-3.773 25.101-4.692.074-.104.053-.155-.058-.135-1.062.195-13.863-.271-18.848-.687-16.681-1.389-28.722-4.345-38.142-9.364-15.294-8.15-7.298-19.232 14.802-20.514 16.095-.934 32.793 1.517 47.423 6.96 13.524 5.033 17.942 12.326 11.463 18.922l-.859.874.697-.006c2.681-.026 15.304-1.302 29.208-2.953 25.845-3.07 35.659-4.519 54.027-7.978 9.863-1.858 11.021-2.048 13.055-2.145a61.901 61.901 0 0 0 4.506-.417c1.891-.259 2.151-.267 1.543-.047-.402.145-2.33.913-4.285 1.707-4.635 1.882-5.202 2.07-8.736 2.903-3.414.805-19.773 3.797-26.404 4.829Zm40.321-9.93c.1-.066.231-.085.29-.041.059.043-.024.096-.183.119-.177.024-.219-.007-.107-.079ZM172.299 26.22c9.364-6.058 5.161-12.039-12.304-17.51-11.656-3.653-23.145-5.47-35.243-5.576-22.552-.198-33.577 7.462-21.321 14.814 12.012 7.205 32.994 10.557 61.531 9.831 4.563-.116 5.372-.288 7.337-1.559Z"
			/>
		</svg>
	);
}

function CheckIcon({
	className,
	...props
}: React.ComponentPropsWithoutRef<"svg">) {
	return (
		<svg
			aria-hidden="true"
			className={clsx(
				"h-6 w-6 flex-none fill-current stroke-current",
				className,
			)}
			{...props}
		>
			<path
				d="M9.307 12.248a.75.75 0 1 0-1.114 1.004l1.114-1.004ZM11 15.25l-.557.502a.75.75 0 0 0 1.15-.043L11 15.25Zm4.844-5.041a.75.75 0 0 0-1.188-.918l1.188.918Zm-7.651 3.043 2.25 2.5 1.114-1.004-2.25-2.5-1.114 1.004Zm3.4 2.457 4.25-5.5-1.187-.918-4.25 5.5 1.188.918Z"
				strokeWidth={0}
			/>
			<circle
				cx={12}
				cy={12}
				r={8.25}
				fill="none"
				strokeWidth={1.5}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
export const calculatePrice = (count: number, isAnnual = false) => {
	if (isAnnual) {
		if (count <= 1) return 45.9;
		return 35.7 * count;
	}
	if (count <= 1) return 4.5;
	return count * 3.5;
};
function Plan({
	name,
	price,
	description,
	href,
	features,
	featured = false,
	buttonText = "Get Started",
}: {
	name: string;
	price: string;
	description: string;
	href: string;
	features: Array<string>;
	featured?: boolean;
	buttonText?: string;
}) {
	const router = useRouter();
	return (
		<section
			className={clsx(
				"flex flex-col rounded-3xl px-6 sm:px-8",
				featured ? "order-first bg-black border py-8 lg:order-none" : "lg:py-8",
			)}
		>
			<h3 className="mt-5 font-display text-lg text-white">{name}</h3>
			<p
				className={clsx(
					"mt-2 text-base",
					featured ? "text-white" : "text-slate-400",
				)}
			>
				{description}
			</p>
			<p className="order-first font-display text-5xl font-light tracking-tight text-white">
				{price}
			</p>
			<ul
				role="list"
				className={clsx(
					"order-last mt-10 flex flex-col gap-y-3 text-sm",
					featured ? "text-white" : "text-slate-200",
				)}
			>
				{features.map((feature) => (
					<li key={feature} className="flex">
						<CheckIcon className={featured ? "text-white" : "text-slate-400"} />
						<span className="ml-4">{feature}</span>
					</li>
				))}
			</ul>
			<Button
				onClick={() => {
					router.push(href);
					trackGAEvent({
						action: "Buy Plan Clicked",
						category: "Pricing",
						label: `${name} - ${price}`,
					});
				}}
				className="rounded-full mt-8"
			>
				{buttonText}
			</Button>
		</section>
	);
}

export function Pricing() {
	const router = useRouter();
	const [isAnnual, setIsAnnual] = useState(true);
	const [serverQuantity, setServerQuantity] = useState(3);
	const featured = true;
	return (
		<section
			id="pricing"
			aria-label="Pricing"
			className="bg-black border-t border-border/30 py-20 sm:py-32"
		>
			<Container>
				<div className="text-center">
					<h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl">
						<span className="relative whitespace-nowrap">
							<SwirlyDoodle className="absolute left-0 top-1/2 h-[1em] w-full fill-muted-foreground" />
							<span className="relative"> Simple & Affordable,</span>
						</span>{" "}
						Pricing.
					</h2>
					<p className="mt-4 text-lg text-muted-foreground">
						Deploy Smarter, Scale Faster – Without Breaking the Bank
					</p>
				</div>

				<div className=" mt-10 mx-auto">
					<div className="mt-16 flex flex-col gap-10 mx-auto w-full lg:-mx-8 xl:mx-0 xl:gap-x-8 justify-center items-center">
						<Tabs
							defaultValue="monthly"
							value={isAnnual ? "annual" : "monthly"}
							// className="w-full"
							onValueChange={(e) => setIsAnnual(e === "annual")}
						>
							<TabsList>
								<TabsTrigger value="monthly">Monthly</TabsTrigger>
								<TabsTrigger value="annual">Annual</TabsTrigger>
							</TabsList>
						</Tabs>
						<div className="flex flex-row max-w-4xl gap-4 mx-auto">
							<section
								className={clsx(
									"flex flex-col rounded-3xl  border-dashed border-muted border-2 px-4 max-w-sm",
									featured
										? "order-first bg-black border py-8 lg:order-none"
										: "lg:py-8",
								)}
							>
								<div className="flex flex-row gap-2 items-center">
									<p className=" text-2xl font-semibold tracking-tight text-primary ">
										Free
									</p>
									|
									<p className=" text-base font-semibold tracking-tight text-muted-foreground">
										Open Source
									</p>
								</div>

								<h3 className="mt-5 font-medium text-lg text-white">
									Dokploy Open Source
								</h3>
								<p
									className={clsx(
										"text-sm",
										featured ? "text-white" : "text-slate-400",
									)}
								>
									Manager your own infrastructure installing dokploy ui in your
									own server.
								</p>

								<ul
									role="list"
									className={clsx(
										" mt-4 flex flex-col gap-y-2 text-sm",
										featured ? "text-white" : "text-slate-200",
									)}
								>
									{[
										"Complete Flexibility: Install Dokploy UI on your own infrastructure",
										"Unlimited Deployments",
										"Self-hosted Infrastructure",
										"Community Support",
										"Access to Core Features",
										"Dokploy Integration",
										"Basic Backups",
										"Access to All Updates",
									].map((feature) => (
										<li key={feature} className="flex text-muted-foreground">
											<CheckIcon />
											<span className="ml-2">{feature}</span>
										</li>
									))}
								</ul>
								<div className="flex flex-col gap-2 mt-4">
									<div className="flex items-center gap-2 justify-center">
										<span className="text-sm text-muted-foreground">
											Unlimited Servers
										</span>
									</div>
								</div>
							</section>
							<section
								className={clsx(
									"flex flex-col rounded-3xl  border-dashed  border-2 px-4 max-w-sm",
									featured
										? "order-first bg-black border py-8 lg:order-none"
										: "lg:py-8",
								)}
							>
								<div className="flex flex-row gap-2 items-center mb-4">
									<Badge>Recommended 🚀</Badge>
								</div>
								{isAnnual ? (
									<div className="flex flex-row gap-2 items-center">
										<p className=" text-2xl font-semibold tracking-tight text-primary ">
											$ {calculatePrice(serverQuantity, isAnnual).toFixed(2)}{" "}
											USD
										</p>
										|
										<p className=" text-base font-semibold tracking-tight text-muted-foreground">
											${" "}
											{(calculatePrice(serverQuantity, isAnnual) / 12).toFixed(
												2,
											)}{" "}
											/ Month USD
										</p>
									</div>
								) : (
									<p className=" text-2xl font-semibold tracking-tight text-primary ">
										$ {calculatePrice(serverQuantity, isAnnual).toFixed(2)} USD
									</p>
								)}
								<h3 className="mt-5 font-medium text-lg text-white">
									Dokploy Plan
								</h3>
								<p
									className={clsx(
										"text-sm",
										featured ? "text-white" : "text-slate-400",
									)}
								>
									No need to manage Dokploy UI infrastructure, we take care of
									it for you.
								</p>

								<ul
									role="list"
									className={clsx(
										" mt-4 flex flex-col gap-y-2 text-sm",
										featured ? "text-white" : "text-slate-200",
									)}
								>
									{[
										"Managed Hosting: No need to manage your own servers",
										"Priority Support",
										"Future-Proof Features",
									].map((feature) => (
										<li key={feature} className="flex text-muted-foreground">
											<CheckIcon />
											<span className="ml-2">{feature}</span>
										</li>
									))}
								</ul>
								<div className="flex flex-col gap-2 mt-4">
									<div className="flex items-center gap-2 justify-center">
										<span className="text-sm text-muted-foreground">
											{serverQuantity} Servers (You bring the servers)
										</span>
									</div>

									<div className="flex items-center space-x-2">
										<Button
											disabled={serverQuantity <= 1}
											variant="outline"
											onClick={() => {
												if (serverQuantity <= 1) return;

												setServerQuantity(serverQuantity - 1);
											}}
										>
											<MinusIcon className="h-4 w-4" />
										</Button>
										<NumberInput
											value={serverQuantity}
											onChange={(e) => {
												setServerQuantity(e.target.value as unknown as number);
											}}
										/>

										<Button
											variant="outline"
											onClick={() => {
												setServerQuantity(serverQuantity + 1);
											}}
										>
											<PlusIcon className="h-4 w-4" />
										</Button>
									</div>
									<div
										className={cn(
											"justify-between",
											// : "justify-end",
											"flex flex-row  items-center gap-2 mt-4",
										)}
									>
										<div className="justify-end w-full">
											<Link
												href="https://app.dokploy.com/register"
												target="_blank"
												className={buttonVariants({ className: "w-full" })}
											>
												Subscribe
											</Link>
										</div>
									</div>
								</div>
							</section>
						</div>
					</div>
				</div>
			</Container>

			<Faqs />
		</section>
	);
}

const faqs = [
	[
		{
			question: "How does Dokploy's Open Source plan work?",
			answer:
				"You can host Dokploy UI on your own infrastructure and you will be responsible for the maintenance and updates.",
		},
		{
			question: "Do I need to provide my own server for the managed plan?",
			answer:
				"Yes, in the managed plan, you provide your own server eg(Hetzner, Hostinger, AWS, ETC.) VPS, and we manage the Dokploy UI infrastructure for you.",
		},
		{
			question: "What happens if I need more than one server?",
			answer:
				"The first server costs $4.50/month, if you buy more than one it will be $3.50/month per server.",
		},
	],
	[
		{
			question: "Is there a limit on the number of deployments?",
			answer:
				"No, there is no limit on the number of deployments in any of the plans.",
		},
		{
			question: "What happens if I exceed my purchased server limit?",
			answer:
				"The most recently added servers will be deactivated. You won't be able to create services on inactive servers until they are reactivated.",
		},
		{
			question: "Do you offer a refunds?",
			answer:
				"We do not offer refunds. However, you can cancel your subscription at any time. Feel free to try our open-source version for free before making a purchase.",
		},
	],
	[
		{
			question: "What kind of support do you offer?",
			answer:
				"We offer community support for the open source version and priority support for paid plans.",
		},
		{
			question: "Is Dokploy open-source?",
			answer:
				"Yes, Dokploy is fully open-source. You can contribute or modify it as needed for your projects.",
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
						{"Frequently asked questions"}
					</h2>
					<p className="mt-4 text-lg tracking-tight text-muted-foreground">
						If you can’t find what you’re looking for, please send us an email
						to:{" "}
						<Link href={"mailto:support@dokploy.com"} className="text-primary">
							support@dokploy.com
						</Link>
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
