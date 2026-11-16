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
	returnUrl: string;
	providers: { name: string; url: string }[];
};

export const OnboardingReturnEmail = ({
	userName = "User",
	returnUrl = "https://app.dokploy.com/dashboard/home",
	providers = [
		{ name: "Hostinger", url: "https://www.hostinger.com/vps-hosting" },
		{ name: "Hetzner", url: "https://www.hetzner.com/cloud" },
		{ name: "Contabo", url: "https://contabo.com/en/vps/" },
		{ name: "DigitalOcean", url: "https://www.digitalocean.com" },
	],
}: TemplateProps) => {
	const previewText = "Pick up where you left off: connect a server to Dokploy";

	return (
		<Html>
			<Head />
			<Preview>{previewText}</Preview>
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
								Your setup is saved
							</Heading>
							<Text className="text-[#71717a] text-[14px] leading-[22px] m-0 mb-[24px]">
								Hello {userName}, your Dokploy account is ready and one step is
								left: connecting a server. It takes about 2 minutes.
							</Text>

							<Section className="text-center mb-[24px]">
								<Button
									href={returnUrl}
									className="bg-[#09090b] rounded-lg text-white text-[14px] font-semibold no-underline text-center px-[24px] py-[12px]"
								>
									Continue where you left off
								</Button>
							</Section>

							<Section className="border border-solid border-[#e4e4e7] rounded-lg px-[20px] py-[16px] mb-[24px]">
								<Text className="text-[#09090b] text-[14px] font-semibold m-0 mb-[4px]">
									No server yet?
								</Text>
								<Text className="text-[#71717a] text-[13px] leading-[20px] m-0 mb-[8px]">
									Any VPS with Ubuntu or Debian, 2 GB of RAM and 30 GB of disk
									works. These four work well with Dokploy:
								</Text>
								{providers.map((provider) => (
									<Text
										key={provider.name}
										className="text-[13px] leading-[20px] m-0"
									>
										<Link
											href={provider.url}
											className="text-[#09090b] underline"
										>
											{provider.name}
										</Link>
									</Text>
								))}
							</Section>

							<Section className="bg-[#f0fdf4] border border-solid border-[#bbf7d0] rounded-lg px-[20px] py-[16px]">
								<Text className="text-[#166534] text-[13px] leading-[20px] m-0">
									Your 7-day trial hasn't started. It starts when your first
									server connects, with no card needed.
								</Text>
							</Section>

							<Hr className="border-[#e4e4e7] my-[24px]" />

							<Text className="text-[#a1a1aa] text-[12px] leading-[18px] m-0">
								You're receiving this because you created a Dokploy Cloud
								account and haven't connected a server yet.
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

export default OnboardingReturnEmail;
