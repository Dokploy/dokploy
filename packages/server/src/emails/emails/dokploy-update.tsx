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
	currentVersion: string;
	latestVersion: string;
	updateInstructions: string;
	dashboardLink: string;
	date: string;
};

export const UpdateAvailableEmail = ({
	currentVersion,
	latestVersion,
	dashboardLink,
	date,
	updateInstructions = "curl -sSL https://dokploy.com/install.sh | sh",
}: TemplateProps) => {
	const previewText = `Dokploy ${latestVersion} is now available`;
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
							🎉 New Dokploy version available: <strong>{latestVersion}</strong>
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello,
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							A new version of Dokploy is ready to install. Update now to get
							the latest features, improvements, and security fixes.
						</Text>
						<Section className="flex text-black text-[14px] leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">Version Info: </Text>
							<Text className="!leading-3">
								Current Version: <strong>{currentVersion}</strong>
							</Text>
							<Text className="!leading-3">
								Latest Version: <strong>{latestVersion}</strong>
							</Text>
							<Text className="!leading-3">
								Date: <strong>{date}</strong>
							</Text>
						</Section>
						<Section className="flex text-black text-[14px] mt-4 leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">
								Update Command to run inside your server:{" "}
							</Text>
							<Text className="text-[12px] leading-[24px] font-mono bg-[#E4E4E7] px-2 py-1 rounded">
								{updateInstructions}
							</Text>
						</Section>
						<Section className="text-center mt-[32px] mb-[32px]">
							<Button
								href={dashboardLink}
								className="bg-[#000000] rounded text-white text-[12px] font-semibold no-underline text-center px-5 py-3"
							>
								Open Dashboard
							</Button>
						</Section>
						<Text className="text-black text-[14px] leading-[24px]">
							or copy and paste this URL into your browser:{" "}
							<Link href={dashboardLink} className="text-blue-600 no-underline">
								{dashboardLink}
							</Link>
						</Text>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default UpdateAvailableEmail;
