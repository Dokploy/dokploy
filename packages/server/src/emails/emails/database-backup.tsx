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

export type TemplateProps = {
	projectName: string;
	applicationName: string;
	databaseType: "postgres" | "mysql" | "mongodb" | "mariadb";
	type: "error" | "success";
	errorMessage?: string;
	date: string;
};

export const DatabaseBackupEmail = ({
	projectName = "dokploy",
	applicationName = "frontend",
	databaseType = "postgres",
	type = "success",
	errorMessage,
	date = "2023-05-01T00:00:00.000Z",
}: TemplateProps) => {
	const previewText = `Database backup for ${applicationName} was ${type === "success" ? "successful ✅" : "failed ❌"}`;
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
							Database backup for <strong>{applicationName}</strong>
						</Heading>
						<Text className="text-black text-[14px] leading-[24px]">
							Hello,
						</Text>
						<Text className="text-black text-[14px] leading-[24px]">
							Your database backup for <strong>{applicationName}</strong> was{" "}
							{type === "success"
								? "successful ✅"
								: "failed  Please check the error message below. ❌"}
							.
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
								Database Type: <strong>{databaseType}</strong>
							</Text>
							<Text className="!leading-3">
								Date: <strong>{date}</strong>
							</Text>
						</Section>
						{type === "error" && errorMessage ? (
							<Section className="flex text-black text-[14px]  mt-4 leading-[24px] bg-[#F4F4F5] rounded-lg p-2">
								<Text className="!leading-3 font-bold">Reason: </Text>
								<Text className="text-[12px] leading-[24px]">
									{errorMessage || "Error message not provided"}
								</Text>
							</Section>
						) : null}
					</Container>
				</Body>
			</Tailwind>
		</Html>
	);
};

export default DatabaseBackupEmail;
