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
				<Body className="bg-white my-auto mx-auto font-sans px-2">
					<Container className="border border-solid border-[#eaeaea] rounded-lg my-[40px] mx-auto p-[20px] max-w-[465px]">
						<Section className="mt-[32px]">
							<Img
								src={
									"https://raw.githubusercontent.com/Dokploy/dokploy/refs/heads/canary/apps/dokploy/logo.png"
								}
								width="100"
								height="50"
								alt="Dokploy"
								className="my-0 mx-auto"
							/>
						</Section>
						<Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
							Join to <strong>Dokploy</strong>
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello,
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							You have been invited to join <strong>Dokploy</strong>, a platform
							that helps for deploying your apps to the cloud.
						</Text>
						<Section className="text-center mt-[32px] mb-[32px]">
							<Button
								href={inviteLink}
								className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
							>
								Join the team 🚀
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							or copy and paste this URL into your browser:{" "}
							<Link href={inviteLink} className="text-blue-600 no-underline">
								https://dokploy.com
							</Link>
						</Text>
						<Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
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
