import {
	Body,
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
	code: string;
	expiresInMinutes: number;
};

export const AccountDeletionCodeTemplate = ({
	userName = "User",
	code = "123456",
	expiresInMinutes = 10,
}: TemplateProps) => {
	const previewText = `${code} is your account deletion code`;
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
								Confirm your account deletion
							</Heading>
							<Text className="text-[#71717a] text-[14px] leading-[22px] m-0 mb-[24px]">
								Hello {userName}, we received a request to permanently delete
								your Dokploy account. Enter the code below to confirm it.
							</Text>

							<Section className="text-center mb-[24px]">
								<Text className="inline-block bg-[#f4f4f5] rounded-lg text-[#09090b] text-[32px] font-semibold tracking-[8px] px-[24px] py-[16px] m-0">
									{code}
								</Text>
							</Section>

							<Text className="text-[#a1a1aa] text-[13px] leading-[20px] m-0 text-center mb-[16px]">
								This code expires in {expiresInMinutes} minutes. Once confirmed,
								your subscriptions are cancelled and every organization you own
								is deleted. This cannot be undone.
							</Text>
						</Section>

						<Section className="bg-[#fafafa] rounded-b-xl px-[40px] py-[24px] text-center border-t border-solid border-[#e4e4e7]">
							<Text className="text-[#a1a1aa] text-[12px] leading-[18px] m-0">
								If you did not request this, someone else may have access to
								your account. Change your password and contact{" "}
								<Link
									href="https://dokploy.com"
									className="text-[#71717a] underline"
								>
									Dokploy support
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

export default AccountDeletionCodeTemplate;
