import { defineStepper } from "@stepperize/react";
import {
	BookIcon,
	Code2,
	Database,
	GitMerge,
	Globe,
	Plug,
	Puzzle,
	Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import ConfettiExplosion from "react-confetti-explosion";
import { GithubIcon } from "@/components/icons/data-tools-icons";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { CreateServer } from "./create-server";
import { CreateSSHKey } from "./create-ssh-key";
import { Setup } from "./setup";
import { Verify } from "./verify";

export const { useStepper, steps, Scoped } = defineStepper(
	{
		id: "requisites",
		title: "Requisites",
		description: "Check your requisites",
	},
	{
		id: "create-ssh-key",
		title: "SSH Key",
		description: "Create your ssh key",
	},
	{
		id: "connect-server",
		title: "Connect",
		description: "Connect",
	},
	{ id: "setup", title: "Setup", description: "Setup your server" },
	{ id: "verify", title: "Verify", description: "Verify your server" },
	{ id: "complete", title: "Complete", description: "Checkout complete" },
);

export const WelcomeSuscription = () => {
	const [showConfetti, setShowConfetti] = useState(false);
	const stepper = useStepper();
	const [isOpen, setIsOpen] = useState(true);
	const { push } = useRouter();

	useEffect(() => {
		const confettiShown = localStorage.getItem("hasShownConfetti");
		if (!confettiShown) {
			setShowConfetti(true);
			localStorage.setItem("hasShownConfetti", "true");
		}
	}, [showConfetti]);

	return (
		<Dialog open={isOpen}>
			<DialogContent className="sm:max-w-7xl min-h-[75vh]">
				{showConfetti ?? "Flaso"}
				<div className="flex justify-center items-center w-full">
					{showConfetti && (
						<ConfettiExplosion
							duration={3000}
							force={0.3}
							particleSize={12}
							particleCount={300}
							className="z-[9999]"
							zIndex={9999}
							width={1500}
						/>
					)}
				</div>

				<DialogHeader>
					<DialogTitle className="text-2xl text-center">
						Welcome To Dokploy Cloud 🎉
					</DialogTitle>
					<DialogDescription className="text-center max-w-xl mx-auto">
						Thank you for choosing Dokploy Cloud! 🚀 We're excited to have you
						onboard. Before you dive in, you'll need to configure your remote
						server to unlock all the features we offer.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="flex justify-between">
						<h2 className="text-lg font-semibold">Steps</h2>
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">
								Step {stepper.current.index + 1} of {steps.length}
							</span>
							<div />
						</div>
					</div>
					<Scoped>
						<nav aria-label="Checkout Steps" className="group my-4">
							<ol
								className="flex items-center justify-between gap-2"
								aria-orientation="horizontal"
							>
								{stepper.all.map((step, index, array) => (
									<React.Fragment key={step.id}>
										<li className="flex items-center gap-4 flex-shrink-0">
											<Button
												type="button"
												role="tab"
												variant={
													index <= stepper.current.index ? "secondary" : "ghost"
												}
												aria-current={
													stepper.current.id === step.id ? "step" : undefined
												}
												aria-posinset={index + 1}
												aria-setsize={steps.length}
												aria-selected={stepper.current.id === step.id}
												className="flex size-10 items-center justify-center rounded-full border-2 border-border"
												onClick={() => stepper.goTo(step.id)}
											>
												{index + 1}
											</Button>
											<span className="text-sm font-medium">{step.title}</span>
										</li>
										{index < array.length - 1 && (
											<Separator
												className={`flex-1 ${
													index < stepper.current.index
														? "bg-primary"
														: "bg-muted"
												}`}
											/>
										)}
									</React.Fragment>
								))}
							</ol>
						</nav>
						{stepper.switch({
							requisites: () => (
								<div className="flex flex-col gap-2 border p-4 rounded-lg">
									<span className="text-primary text-base font-bold">
										Before getting started, please follow the steps below to
										ensure the best experience:
									</span>
									<div>
										<p className="text-primary text-sm font-medium">
											Supported Distributions:
										</p>
										<ul className="list-inside list-disc pl-4 text-sm text-muted-foreground  mt-4">
											<li>Ubuntu 24.04 LTS</li>
											<li>Ubuntu 23.10</li>
											<li>Ubuntu 22.04 LTS</li>
											<li>Ubuntu 20.04 LTS</li>
											<li>Ubuntu 18.04 LTS</li>
											<li>Debian 12</li>
											<li>Debian 11</li>
											<li>Debian 10</li>
											<li>Fedora 40</li>
											<li>CentOS 9</li>
											<li>CentOS 8</li>
										</ul>
									</div>
									<div>
										<p className="text-primary text-sm font-medium">
											You will need to purchase or rent a Virtual Private Server
											(VPS) to proceed, we recommend to use one of these
											providers since has been heavily tested.
										</p>
										<ul className="list-inside list-disc pl-4 text-sm text-muted-foreground mt-4">
											<li>
												<a
													href="https://www.hostinger.com/vps-hosting?REFERRALCODE=1SIUMAURICI97"
													className="text-link underline"
												>
													Hostinger - Get 20% Discount
												</a>
											</li>
											<li>
												<a
													href=" https://app.americancloud.com/register?ref=dokploy"
													className="text-link underline"
												>
													American Cloud - Get $20 Credits
												</a>
											</li>
											<li>
												<a
													href="https://m.do.co/c/db24efd43f35"
													className="text-link underline"
												>
													DigitalOcean - Get $200 Credits
												</a>
											</li>
											<li>
												<a
													href="https://hetzner.cloud/?ref=vou4fhxJ1W2D"
													className="text-link underline"
												>
													Hetzner - Get €20 Credits
												</a>
											</li>
											<li>
												<a
													href="https://www.vultr.com/?ref=9679828"
													className="text-link underline"
												>
													Vultr
												</a>
											</li>
											<li>
												<a
													href="https://www.linode.com/es/pricing/#compute-shared"
													className="text-link underline"
												>
													Linode
												</a>
											</li>
										</ul>
										<AlertBlock className="mt-4 px-4">
											You are free to use whatever provider, but we recommend to
											use one of the above, to avoid issues.
										</AlertBlock>
									</div>
								</div>
							),
							"create-ssh-key": () => <CreateSSHKey />,
							"connect-server": () => <CreateServer stepper={stepper} />,
							setup: () => <Setup />,
							verify: () => <Verify />,
							complete: () => {
								const features = [
									{
										title: "Scalable Deployments",
										description:
											"Deploy and scale your applications effortlessly to handle any workload.",
										icon: <Database className="text-primary" />,
									},
									{
										title: "Automated Backups",
										description: "Protect your data with automatic backups",
										icon: <Database className="text-primary" />,
									},
									{
										title: "Open Source Templates",
										description:
											"Big list of common open source templates in one-click",
										icon: <Puzzle className="text-primary" />,
									},
									{
										title: "Custom Domains",
										description:
											"Link your own domains to your applications for a professional presence.",
										icon: <Globe className="text-primary" />,
									},
									{
										title: "CI/CD Integration",
										description:
											"Implement continuous integration and deployment workflows to streamline development.",
										icon: <GitMerge className="text-primary" />,
									},
									{
										title: "Database Management",
										description:
											"Efficiently manage your databases with intuitive tools.",
										icon: <Database className="text-primary" />,
									},
									{
										title: "Team Collaboration",
										description:
											"Collaborate with your team on shared projects with customizable permissions.",
										icon: <Users className="text-primary" />,
									},
									{
										title: "Multi-language Support",
										description:
											"Deploy applications in multiple programming languages to suit your needs.",
										icon: <Code2 className="text-primary" />,
									},
									{
										title: "API Access",
										description:
											"Integrate and manage your applications via robust and well-documented APIs.",
										icon: <Plug className="text-primary" />,
									},
								];
								return (
									<div className="flex flex-col gap-6">
										<div className="flex flex-col gap-2">
											<h2 className="text-lg font-semibold">You're All Set!</h2>
											<p className="text-muted-foreground">
												Did you know you can deploy any number of applications
												that your server can handle?
											</p>
											<p className="text-muted-foreground">
												Here are some of the things you can do with Dokploy
												Cloud:
											</p>
										</div>

										<div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
											{features.map((feature, index) => (
												<div
													key={index}
													className="flex flex-col items-start p-4 bg-card rounded-lg shadow-md hover:shadow-lg transition-shadow"
												>
													<div className="text-3xl mb-2">{feature.icon}</div>
													<h3 className="text-lg font-medium mb-1">
														{feature.title}
													</h3>
													<p className="text-sm text-muted-foreground">
														{feature.description}
													</p>
												</div>
											))}
										</div>

										<div className="flex flex-col gap-2 mt-4">
											<span className="text-base text-primary">
												Need Help? We are here to help you.
											</span>
											<span className="text-sm text-muted-foreground">
												Join to our Discord server and we will help you.
											</span>
											<div className="flex flex-row gap-4">
												<Button className="rounded-full bg-[#5965F2] hover:bg-[#4A55E0] w-fit">
													<Link
														href="https://discord.gg/2tBnJ3jDJc"
														aria-label="Dokploy on GitHub"
														target="_blank"
														className="flex flex-row items-center gap-2 text-white"
													>
														<svg
															role="img"
															className="h-6 w-6 fill-white"
															viewBox="0 0 24 24"
															xmlns="http://www.w3.org/2000/svg"
														>
															<path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
														</svg>
														Join Discord
													</Link>
												</Button>
												<Button className="rounded-full  w-fit">
													<Link
														href="https://github.com/Dokploy/dokploy"
														aria-label="Dokploy on GitHub"
														target="_blank"
														className="flex flex-row items-center gap-2 "
													>
														<GithubIcon />
														Github
													</Link>
												</Button>

												<Button
													className="rounded-full  w-fit"
													variant="outline"
												>
													<Link
														href="https://docs.dokploy.com/docs/core"
														aria-label="Dokploy Docs"
														target="_blank"
														className="flex flex-row items-center gap-2 "
													>
														<BookIcon size={16} />
														Docs
													</Link>
												</Button>
											</div>
										</div>
									</div>
								);
							},
						})}
					</Scoped>
				</div>
				<DialogFooter>
					<div className="flex items-center justify-between w-full">
						{!stepper.isLast && (
							<Button
								variant="secondary"
								onClick={() => {
									setIsOpen(false);
									push("/dashboard/settings/servers");
								}}
							>
								Skip for now
							</Button>
						)}

						<div className="flex items-center gap-2 w-full justify-end">
							<Button
								onClick={stepper.prev}
								disabled={stepper.isFirst}
								variant="secondary"
							>
								Back
							</Button>
							<Button
								onClick={() => {
									if (stepper.isLast) {
										setIsOpen(false);
										push("/dashboard/projects");
									} else {
										stepper.next();
									}
								}}
							>
								{stepper.isLast ? "Complete" : "Next"}
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
