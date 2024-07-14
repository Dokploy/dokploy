import * as React from "react";
import {
	Body,
	Button,
	Container,
	Head,
	Html,
	Link,
	Preview,
	Section,
	Text,
	Tailwind,
	Img,
	Heading,
} from "@react-email/components";

export type TemplateProps = {
	projectName: string;
	applicationName: string;
	applicationType: string;
	errorMessage: string;
	buildLink: string;
};

export const BuildFailedEmail = ({
	projectName = "dokploy",
	applicationName = "frontend",
	applicationType = "application",
	errorMessage = "Error array.length is not a function",
	buildLink = "https://dokploy.com/projects/dokploy-test/applications/dokploy-test",
}: TemplateProps) => {
	const previewText = `Build failed for ${applicationName}`;
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
									"https://avatars.githubusercontent.com/u/156882017?s=200&v=4"
								}
								width="50"
								height="50"
								alt="Dokploy"
								className="my-0 mx-auto"
							/>
						</Section>
						<Heading className="text-black text-[24px] font-normal text-center p-0 my-[30px] mx-0">
							Build failed for <strong>{applicationName}</strong>
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello,
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							Your build for <strong>{applicationName}</strong> failed. Please
							check the error message below.
						</Text>
						<Section className="flex text-black text-[14px]  leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">Details: </Text>
							<Text className="!leading-3">
								Project Name: <strong>{projectName}</strong>
							</Text>
							<Text className="!leading-3">
								Application Name: <strong>{applicationName}</strong>
							</Text>
							<Text className="!leading-3">
								Application Type: <strong>{applicationType}</strong>
							</Text>
						</Section>
						<Section className="flex text-black text-[14px]  mt-4 leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">Reason: </Text>
							<Text className="text-[12px] leading-[24px]">{errorMessage}</Text>
						</Section>
						<Section className="text-center mt-[32px] mb-[32px]">
							<Button
								href={buildLink}
								className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
							>
								View build
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							or copy and paste this URL into your browser:{" "}
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
