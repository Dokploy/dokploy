import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import { CodeEditor } from "@/components/shared/code-editor";
import type { StepProps } from "./step-two";

export const StepThree = ({ templateInfo }: StepProps) => {
	const t = useTranslations("aiAssistant");
	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow">
				<div className="space-y-6">
					<h2 className="text-lg font-semibold">{t("step3Title")}</h2>
					<div className="space-y-4">
						<div>
							<h3 className="text-sm font-semibold">{t("reviewName")}</h3>
							<p className="text-sm text-muted-foreground">
								{templateInfo?.details?.name}
							</p>
						</div>
						<div>
							<h3 className="text-sm font-semibold">
								{t("reviewDescription")}
							</h3>
							<ReactMarkdown className="text-sm text-muted-foreground">
								{templateInfo?.details?.description}
							</ReactMarkdown>
						</div>
						<div>
							<h3 className="text-md font-semibold">{t("reviewServer")}</h3>
							<p className="text-sm text-muted-foreground">
								{templateInfo?.server?.name || t("dokployServer")}
							</p>
						</div>
						<div className="space-y-2">
							<h3 className="text-sm font-semibold">
								{t("reviewDockerCompose")}
							</h3>
							<CodeEditor
								lineWrapping
								value={templateInfo?.details?.dockerCompose}
								disabled
								className="font-mono"
							/>
						</div>
						<div>
							<h3 className="text-sm font-semibold">
								{t("reviewEnvVariables")}
							</h3>
							<ul className="list-disc pl-5">
								{templateInfo?.details?.envVariables.map(
									(
										env: {
											name: string;
											value: string;
										},
										index: number,
									) => (
										<li key={index}>
											<strong className="text-sm font-semibold">
												{env.name}
											</strong>
											:
											<span className="text-sm ml-2 text-muted-foreground">
												{env.value}
											</span>
										</li>
									),
								)}
							</ul>
						</div>
						<div>
							<h3 className="text-sm font-semibold">{t("reviewDomains")}</h3>
							<ul className="list-disc pl-5">
								{templateInfo?.details?.domains.map(
									(
										domain: {
											host: string;
											port: number;
											serviceName: string;
										},
										index: number,
									) => (
										<li key={index}>
											<strong className="text-sm font-semibold">
												{domain.host}
											</strong>
											:
											<span className="text-sm ml-2 text-muted-foreground">
												{domain.port} - {domain.serviceName}
											</span>
										</li>
									),
								)}
							</ul>
						</div>
						<div>
							<h3 className="text-sm font-semibold">
								{t("reviewConfigFiles")}
							</h3>
							<ul className="list-disc pl-5">
								{templateInfo?.details?.configFiles?.map((file, index) => (
									<li key={index}>
										<strong className="text-sm font-semibold">
											{file.filePath}
										</strong>
										:
										<span className="text-sm ml-2 text-muted-foreground">
											{file.content}
										</span>
									</li>
								))}
							</ul>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};
