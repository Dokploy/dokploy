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
import * as React from "react";

export type TemplateProps = {
	projectName: string;
	applicationName: string;
	applicationType: string;
	buildLink: string;
	date: string;
};

export const BuildSuccessEmail = ({
	projectName = "dokploy",
	applicationName = "frontend",
	applicationType = "application",
	buildLink = "https://dokploy.com/projects/dokploy-test/applications/dokploy-test",
	date = "2023-05-01T00:00:00.000Z",
}: TemplateProps) => {
	const previewText = `Build success for ${applicationName}`;
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
							Build success for <strong>{applicationName}</strong>
						</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							Hello,
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							Your build for <strong>{applicationName}</strong> was successful
						</Text>
						<Section className="flex rounded-lg bg-[#F4F4F5] p-2 text-[14px] text-black leading-[24px]">
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
							<Text className="!leading-3">
								Date: <strong>{date}</strong>
							</Text>
						</Section>
						<Section className="mt-[32px] mb-[32px] text-center">
							<Button
								href={buildLink}
								className="rounded bg-[#000000] px-5 py-3 text-center font-semibold text-[12px] text-white no-underline"
							>
								View build
							</Button>
						</Section>
						<Text className="text-[14px] text-black leading-[24px]">
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

export default BuildSuccessEmail;
