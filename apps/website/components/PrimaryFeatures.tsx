"use client";

import { Tab } from "@headlessui/react";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Container } from "./Container";

const features = [
	{
		title: "primaryFeatures.projects",
		description: "primaryFeatures.projectsDes",
		image: "/primary/projects.png",
	},
	{
		title: "primaryFeatures.applications",
		description: "primaryFeatures.applicationsDes",
		image: "/primary/applications.png",
	},
	{
		title: "primaryFeatures.compose",
		description: "primaryFeatures.composeDes",
		image: "/primary/compose.png",
	},
	{
		title: "primaryFeatures.multinode",
		description: "primaryFeatures.multinodeDes",
		image: "/primary/multinode.png",
	},
	{
		title: "primaryFeatures.monitoring",
		description: "primaryFeatures.monitoringDes",
		image: "/primary/monitoring.png",
	},
	{
		title: "primaryFeatures.backups",
		description: "primaryFeatures.backupsDes",
		image: "/primary/backups.png",
	},
];

export function PrimaryFeatures() {
	const t = useTranslations("HomePage");
	const [tabOrientation, setTabOrientation] = useState<
		"horizontal" | "vertical"
	>("horizontal");

	useEffect(() => {
		const lgMediaQuery = window.matchMedia("(min-width: 1024px)");

		function onMediaQueryChange({ matches }: { matches: boolean }) {
			setTabOrientation(matches ? "vertical" : "horizontal");
		}

		onMediaQueryChange(lgMediaQuery);
		lgMediaQuery.addEventListener("change", onMediaQueryChange);

		return () => {
			lgMediaQuery.removeEventListener("change", onMediaQueryChange);
		};
	}, []);

	const [isMounted, setIsMounted] = useState(false);

	// Cambiar isMounted a true después del primer render
	useEffect(() => {
		setIsMounted(true);
	}, []);

	return (
		<section
			id="features"
			aria-label="Features for running your books"
			className="relative overflow-hidden bg-black pb-28 pt-20 sm:py-32"
		>
			{/* <div class="absolute inset-0 h-full w-full bg-background bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" /> */}

			{/* <Image
				className="absolute left-1/2 top-1/2 max-w-none translate-x-[-44%] translate-y-[-42%]"
				src={backgroundImage}
				alt=""
				width={2245}
				height={1636}
				unoptimized
			/> */}
			<Container className="relative">
				<div className="max-w-2xl md:mx-auto md:text-center xl:max-w-none">
					<h2 className="font-display text-3xl tracking-tight text-white sm:text-4xl md:text-5xl">
						{t("primaryFeatures.title")}
					</h2>
					<p className="mt-6 text-lg tracking-tight text-muted-foreground">
						{t("primaryFeatures.des")}
					</p>
				</div>
				<Tab.Group
					as="div"
					className="mt-16 grid grid-cols-1 items-center gap-y-2 pt-10 sm:gap-y-6 md:mt-20 lg:grid-cols-12 lg:pt-0"
					vertical={tabOrientation === "vertical"}
				>
					{({ selectedIndex }) => (
						<>
							<div className="-mx-4 flex overflow-x-auto pb-4 sm:mx-0 sm:overflow-visible sm:pb-0 lg:col-span-5">
								<Tab.List
									aria-description="primary feature tabs"
									aria-roledescription="primary feature tabs"
									className="relative z-10 flex gap-x-4 whitespace-nowrap px-4 sm:mx-auto sm:px-0 lg:mx-0 lg:block lg:gap-x-0 lg:gap-y-1 lg:whitespace-normal"
								>
									{features.map((feature, featureIndex) => (
										<motion.div
											layout
											initial={false}
											key={`feature-${featureIndex}`}
											className={cn(
												"group relative rounded-full px-4 py-1 transition-colors lg:rounded-l-xl lg:rounded-r-none lg:p-6 ",
											)}
										>
											<AnimatePresence>
												{selectedIndex === featureIndex && (
													<motion.span
														layoutId="tab"
														className="absolute inset-0 z-10 rounded-full bg-white/5 mix-blend-difference lg:rounded-l-xl lg:rounded-r-none"
														initial={{ opacity: 1 }}
														animate={{ opacity: 1 }}
														exit={{ opacity: 0 }}
														transition={{
															type: "spring",
															bounce: 0.2,
															duration: 0.5,
														}}
													/>
												)}
											</AnimatePresence>
											<h3>
												<Tab
													className={cn(
														"font-display text-lg text-primary ui-not-focus-visible:outline-none",
													)}
												>
													<span className="absolute inset-0 rounded-full lg:rounded-l-xl lg:rounded-r-none" />
													{t(feature.title)}
												</Tab>
											</h3>
											<p
												className={cn(
													"mt-2 hidden text-sm text-muted-foreground lg:block",
												)}
											>
												{t(feature.description)}
											</p>
										</motion.div>
									))}
								</Tab.List>
							</div>
							<Tab.Panels className="lg:col-span-7">
								{features.map((feature, index) => (
									<Tab.Panel key={`panel-${index}`}>
										<div className="relative sm:px-6 lg:hidden">
											<div className="absolute -inset-x-4 bottom-[-4.25rem] top-[-6.5rem] bg-white/10 ring-1 ring-inset ring-white/10 sm:inset-x-0 sm:rounded-t-xl" />
											<p className="relative mx-auto max-w-2xl text-base text-white sm:text-center">
												{t(feature.description)}
											</p>
										</div>

										<motion.div
											key={feature.title}
											initial={isMounted ? { opacity: 0.8, x: 50 } : {}}
											animate={isMounted ? { opacity: 1, x: 0 } : {}}
											exit={{ opacity: 0, x: -50 }}
											transition={{
												type: "spring",
												bounce: 0.2,
												duration: 0.6,
											}}
											className="mt-10 h-[24rem] w-[45rem] overflow-hidden rounded-xl border shadow-xl sm:w-auto  lg:mt-0 lg:h-[40rem] lg:w-[67.8125rem]"
										>
											<img
												alt=""
												className="w-full"
												src={feature.image}
												srcSet={`${feature.image} 1x`}
											/>
										</motion.div>
									</Tab.Panel>
								))}
							</Tab.Panels>
						</>
					)}
				</Tab.Group>
			</Container>
		</section>
	);
}
