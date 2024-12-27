import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Img,
	Preview,
	Section,
	Tailwind,
	Text,
} from "@react-email/components";
import * as React from "react";

export type TemplateProps = {
	message: string;
	date: string;
};

export const DockerCleanupEmail = ({
	message = "Docker cleanup for dokploy",
	date = "2023-05-01T00:00:00.000Z",
}: TemplateProps) => {
	const previewText = "Docker cleanup for dokploy";
	return (
		<Html>
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
				<Head />

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
							Docker cleanup for <strong>dokploy</strong>
						</Heading>
						<Text className="text-[14px] text-black leading-[24px]">
							Hello,
						</Text>
						<Text className="text-[14px] text-black leading-[24px]">
							The docker cleanup for <strong>dokploy</strong> was successful ✅
						</Text>

						<Section className="flex rounded-lg bg-[#F4F4F5] p-2 text-[14px] text-black leading-[24px]">
							<Text className="!leading-3 font-bold">Details: </Text>
							<Text className="!leading-3">
								Message: <strong>{message}</strong>
							</Text>
							<Text className="!leading-3">
								Date: <strong>{date}</strong>
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default DockerCleanupEmail;
