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
import { getInvitationEmailContent } from "../../utils/i18n/backend";

export type TemplateProps = {
	email: string;
	name: string;
};


interface InvitationEmailProps {
	inviteLink: string;
	toEmail: string;
	organizationName?: string;
}

export const InvitationEmail = ({
	inviteLink,
	toEmail,
	organizationName = "Dokploy",
}: InvitationEmailProps) => {
	const content = getInvitationEmailContent({
		organizationName,
		inviteLink,
		toEmail,
	});
	return (
		<Html>
			<Head />
			<Preview>{content.previewText}</Preview>
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
									"https://raw.githubusercontent.com/Frankieli123/dokploy-i18n/refs/heads/main/apps/dokploy/logo.png"
								}
								width="100"
								height="50"
								alt="Dokploy"
								className="my-0 mx-auto"
							/>
						</Section>
						<Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
							{content.heading.beforeOrganizationName}
							<strong>{organizationName}</strong>
							{content.heading.afterOrganizationName}
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.greeting}
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.mainText.beforeOrganizationName}
							<strong>{organizationName}</strong>
							{content.mainText.afterOrganizationName}
						</Text>
						<Section className="text-center mt-[32px] mb-[32px]">
							<Button
								href={inviteLink}
								className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
							>
								{content.buttonLabel}
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.orCopyUrlText}{" "}
							<Link href={inviteLink} className="text-blue-600 no-underline">
								{inviteLink}
							</Link>
						</Text>
						<Hr className="border border-solid border-[#eaeaea] my-[26px] mx-0 w-full" />
						<Text className="text-[#666666] text-[12px] leading-[24px]">
							{content.footer.beforeEmail}
							{toEmail}
							{content.footer.afterEmail}
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default InvitationEmail;
