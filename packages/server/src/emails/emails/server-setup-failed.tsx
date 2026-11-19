import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Img,
	Link,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import { emailTailwindConfig } from "../tailwind-config";

export type TemplateProps = {
	userName: string;
	title: string;
	body: string;
	fix: string[];
	returnUrl: string;
	trialNotStarted: boolean;
};

export const ServerSetupFailedEmail = ({
	userName = "User",
	title = "This server has less than 2 GB of RAM",
	body = "Dokploy needs 2 GB of RAM and 30 GB of disk to build and run apps, so the command stopped before installing anything.",
	fix = [
		"Resize the server to at least 2 GB of RAM in your provider's dashboard.",
		"Wait for the resize to finish, then open the console as root.",
		"Run the same command again.",
	],
	returnUrl = "https://app.dokploy.com/dashboard/home",
	trialNotStarted = true,
}: TemplateProps) => {
	return (
		<Html>
			<Head />
			<Preview>{`Server setup stopped: ${title}`}</Preview>
			<Tailwind config={emailTailwindConfig}>
				<Body className="bg-[#f4f4f5] my-auto mx-auto font-sans">
					<Container className="my-[40px] mx-auto max-w-[520px]">
						<Section className="bg-[#09090b] rounded-t-xl px-[40px] py-[32px] text-center">
							<Img
								src="https://raw.githubusercontent.com/Dokploy/website/refs/heads/main/apps/docs/public/logo-dokploy-blackpng.png"
								width="190"
								height="120"
								alt="Dokploy"
								className="my-0 mx-auto"
							/>
						</Section>

						<Section className="bg-white px-[40px] py-[32px]">
							<Heading className="text-[#09090b] text-[22px] font-semibold m-0 mb-[8px]">
								Your server setup stopped
							</Heading>
							<Text className="text-[#71717a] text-[14px] leading-[22px] m-0 mb-[24px]">
								Hello {userName}, one check failed while connecting your server
								to Dokploy. Here is what happened and how to fix it.
							</Text>

							<Section className="bg-[#fef2f2] border border-solid border-[#fecaca] rounded-lg px-[20px] py-[16px] mb-[24px]">
								<Text className="text-[#991b1b] text-[14px] font-semibold m-0 mb-[4px]">
									{title}
								</Text>
								<Text className="text-[#991b1b] text-[13px] leading-[20px] m-0">
									{body}
								</Text>
							</Section>

							<Text className="text-[#09090b] text-[14px] font-semibold m-0 mb-[8px]">
								How to fix it
							</Text>
							{fix.map((step, index) => (
								<Text
									key={step}
									className="text-[#3f3f46] text-[13px] leading-[20px] m-0 mb-[6px]"
								>
									{index + 1}. {step}
								</Text>
							))}

							<Section className="text-center my-[24px]">
								<Button
									href={returnUrl}
									className="bg-[#09090b] rounded-lg text-white text-[14px] font-semibold no-underline text-center px-[24px] py-[12px]"
								>
									Back to server setup
								</Button>
							</Section>

							{trialNotStarted && (
								<Section className="bg-[#f0fdf4] border border-solid border-[#bbf7d0] rounded-lg px-[20px] py-[16px]">
									<Text className="text-[#166534] text-[13px] leading-[20px] m-0">
										Your 7-day trial hasn't started. It starts when your server
										connects.
									</Text>
								</Section>
							)}

							<Hr className="border-[#e4e4e7] my-[24px]" />

							<Text className="text-[#a1a1aa] text-[12px] leading-[18px] m-0">
								You're receiving this because a server setup you started in
								Dokploy Cloud didn't finish.
							</Text>
						</Section>

						<Section className="bg-[#fafafa] rounded-b-xl px-[40px] py-[24px] text-center border-t border-solid border-[#e4e4e7]">
							<Text className="text-[#a1a1aa] text-[12px] leading-[18px] m-0">
								This is an automated email from{" "}
								<Link
									href="https://dokploy.com"
									className="text-[#71717a] underline"
								>
									Dokploy Cloud
								</Link>
								. Need help? Join our{" "}
								<Link
									href="https://discord.gg/2tBnJ3jDJc"
									className="text-[#71717a] underline"
								>
									Discord
								</Link>
								.
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default ServerSetupFailedEmail;
