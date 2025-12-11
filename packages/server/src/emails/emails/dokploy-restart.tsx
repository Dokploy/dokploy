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
import { getDokployRestartEmailContent } from "../../utils/i18n/backend";

export type TemplateProps = {
	date: string;
};

export const DokployRestartEmail = ({
	date = "2023-05-01T00:00:00.000Z",
}: TemplateProps) => {
	const content = getDokployRestartEmailContent({
		date,
	});
	return (
		<Html>
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
				<Head />

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
							{content.headingText}
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.greeting}
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							{content.bodyText}
						</Text>

						<Section className="flex text-black text-[14px]  leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
							<Text className="!leading-3 font-bold">
								{content.detailsLabel}
							</Text>
							<Text className="!leading-3">
								{content.dateLabel} <strong>{date}</strong>
							</Text>
						</Section>
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default DokployRestartEmail;
