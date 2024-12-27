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

export type TemplateProps = {
	email: string;
	name: string;
};

interface VercelInviteUserEmailProps {
	inviteLink: string;
	toEmail: string;
}

export const InvitationEmail = ({
	inviteLink,
	toEmail,
}: VercelInviteUserEmailProps) => {
	const previewText = "Join to Dokploy";
	return (
		<Html>
			<Head />
			<Preview>{previewText}</Preview>
			<Tailwind
				config={{
					theme: {
						extend: {
							colors: {
								brand: "#007291",
							},
						},
					},
				}}
			>
				<Body className="mx-auto my-auto bg-white px-2 font-sans">
					<Container className="mx-auto my-[40px] max-w-[465px] rounded-lg border border-[#eaeaea] border-solid p-[20px]">
						<Section className="mt-[32px]">
							<Img
								src={
									"https://raw.githubusercontent.com/Dokploy/dokploy/refs/heads/canary/apps/dokploy/logo.png"
								}
								width="100"
								height="50"
								alt="Dokploy"
								className="mx-auto my-0"
							/>
						</Section>
						<Heading className="mx-0 my-[30px] p-0 text-center font-normal text-[24px] text-black">
							Join to <strong>Dokploy</strong>
						</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							Hello,
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							You have been invited to join <strong>Dokploy</strong>, a platform
							that helps for deploying your apps to the cloud.
						</Text>
						<Section className="mt-[32px] mb-[32px] text-center">
							<Button
								href={inviteLink}
								className="rounded bg-[#000000] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
							>
								Join the team 🚀
							</Button>
						</Section>
						<Text className="text-[14px] text-black leading-[24px]">
							or copy and paste this URL into your browser:{" "}
							<Link href={inviteLink} className="text-blue-600 no-underline">
								https://dokploy.com
							</Link>
						</Text>
						<Hr className="mx-0 my-[26px] w-full border border-[#eaeaea] border-solid" />
						<Text className="text-[#666666] text-[12px] leading-[24px]">
							This invitation was intended for {toEmail}. This invite was sent
							from <strong className="text-black">dokploy.com</strong>. If you
							were not expecting this invitation, you can ignore this email. If
							you are concerned about your account's safety, please reply to
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default InvitationEmail;
