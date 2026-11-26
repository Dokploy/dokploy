import {
	Body,
	Button,
	Container,
	Head,
	Heading,
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
	message: string;
	warning?: string;
	actionLabel: string;
	actionUrl: string;
};

export const CloudServerNoticeEmail = ({
	userName = "User",
	title = "Payment failed",
	message = "we could not charge the payment for your cloud server acme-x7k2p9, so it has been powered off.",
	warning,
	actionLabel = "Update Payment Method",
	actionUrl = "https://app.dokploy.com/dashboard/settings/billing",
}: TemplateProps) => {
	return (
		<Html>
			<Head />
			<Preview>{title}</Preview>
			<Tailwind config={emailTailwindConfig}>
				<Body className="bg-[#f4f4f5] my-auto mx-auto font-sans">
					<Container className="my-[40px] mx-auto max-w-[520px]">
						<Section className="bg-[#09090b] rounded-t-xl px-[40px] py-[32px] text-center">
							<Img
								src="https://raw.githubusercontent.com/Dokploy/website/1305b14577d1516a79a2d121e54dc7406a6785d5/apps/docs/public/logo-dokploy-blackpng.png"
								width="190"
								height="120"
								alt="Dokploy"
								className="my-0 mx-auto"
							/>
						</Section>

						<Section className="bg-white px-[40px] py-[32px]">
							<Heading className="text-[#09090b] text-[22px] font-semibold m-0 mb-[8px]">
								{title}
							</Heading>
							<Text className="text-[#71717a] text-[14px] leading-[22px] m-0 mb-[24px]">
								Hello {userName}, {message}
							</Text>

							{warning && (
								<Section className="bg-[#fefce8] border border-solid border-[#fef08a] rounded-lg px-[20px] py-[16px] mb-[24px]">
									<Text className="text-[#854d0e] text-[13px] leading-[20px] m-0">
										{warning}
									</Text>
								</Section>
							)}

							<Section className="text-center mb-[24px]">
								<Button
									href={actionUrl}
									className="bg-[#09090b] rounded-lg text-white text-[14px] font-semibold no-underline text-center px-[24px] py-[12px]"
								>
									{actionLabel}
								</Button>
							</Section>
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
								. If you have any questions about your billing, please contact
								our{" "}
								<Link
									href="https://discord.gg/2tBnJ3jDJc"
									className="text-[#71717a] underline"
								>
									support team
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

export default CloudServerNoticeEmail;
