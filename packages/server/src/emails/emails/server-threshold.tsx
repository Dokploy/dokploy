import {
	Body,
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
import { emailTailwindConfig } from "../tailwind-config";

export type TemplateProps = {
	serverName: string;
	type: "CPU" | "Memory";
	value: string;
	threshold: string;
	message: string;
	date: string;
};

export const ServerThresholdEmail = ({
	serverName = "my-server",
	type = "CPU",
	value = "95.00",
	threshold = "90.00",
	message = "Resource usage exceeded the configured threshold",
	date = "2023-05-01T00:00:00.000Z",
}: TemplateProps) => {
	const previewText = `Server ${type} alert for ${serverName} ⚠️`;
	return (
		<Html>
			<Preview>{previewText}</Preview>
			<Tailwind config={emailTailwindConfig}>
				<Head />

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
							⚠️ Server {type} alert for <strong>{serverName}</strong>
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello,
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							The {type} usage on <strong>{serverName}</strong> exceeded the
							configured threshold.
						</Text>
						<Section className="flex text-black text-[14px]  leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">Details: </Text>
							<Text className="!leading-3">
								Server Name: <strong>{serverName}</strong>
							</Text>
							<Text className="!leading-3">
								Type: <strong>{type}</strong>
							</Text>
							<Text className="!leading-3">
								Current Value: <strong>{value}%</strong>
							</Text>
							<Text className="!leading-3">
								Threshold: <strong>{threshold}%</strong>
							</Text>
							<Text className="!leading-3">
								Date: <strong>{date}</strong>
							</Text>
						</Section>
						<Section className="flex text-black text-[14px]  mt-4 leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">Message: </Text>
							<Text className="text-[12px] leading-[24px]">{message}</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default ServerThresholdEmail;
