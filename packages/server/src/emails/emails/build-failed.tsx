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
import { getBuildFailedEmailContent } from "../../utils/i18n/backend";

export type TemplateProps = {
	projectName: string;
	applicationName: string;
	applicationType: string;
	errorMessage: string;
	buildLink: string;
	date: string;
};

export const BuildFailedEmail = ({
	projectName = "dokploy",
	applicationName = "frontend",
	applicationType = "application",
	errorMessage = "Error array.length is not a function",
	buildLink = "https://dokploy.com/projects/dokploy-test/applications/dokploy-test",
	date = "2023-05-01T00:00:00.000Z",
}: TemplateProps) => {
	const content = getBuildFailedEmailContent({
		projectName,
		applicationName,
		applicationType,
		buildLink,
		date,
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
							{content.heading.beforeApplicationName}
							<strong>{applicationName}</strong>
							{content.heading.afterApplicationName}
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.greeting}
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.mainText.beforeApplicationName}
							<strong>{applicationName}</strong>
							{content.mainText.afterApplicationName}
						</Text>
						<Section className="flex text-black text-[14px]  leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">
								{content.detailsLabel}
							</Text>
							<Text className="!leading-3">
								{content.projectNameLabel} <strong>{projectName}</strong>
							</Text>
							<Text className="!leading-3">
								{content.applicationNameLabel} <strong>{applicationName}</strong>
							</Text>
							<Text className="!leading-3">
								{content.applicationTypeLabel} <strong>{applicationType}</strong>
							</Text>
							<Text className="!leading-3">
								{content.dateLabel} <strong>{date}</strong>
							</Text>
						</Section>
						<Section className="flex text-black text-[14px]  mt-4 leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">
								{content.reasonLabel}
							</Text>
							<Text className="text-[12px] leading-[24px]">{errorMessage}</Text>
						</Section>
						<Section className="text-center mt-[32px] mb-[32px]">
							<Button
								href={buildLink}
								className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
							>
								{content.viewBuildButtonLabel}
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.orCopyUrlText}{" "}
							<Link href={buildLink} className="text-blue-600 no-underline">
								{buildLink}
							</Link>
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default BuildFailedEmail;
