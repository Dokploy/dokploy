import ReactMarkdown from "react-markdown";
import { CodeEditor } from "@/components/shared/code-editor";
import type { StepProps } from "./step-two";

export const StepThree = ({ templateInfo }: StepProps) => {
	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow">
				<div className="space-y-6">
					<h2 className="text-lg font-semibold">Step 3: Review and Finalize</h2>
					<div className="space-y-4">
						<div>
							<h3 className="text-sm font-semibold">Name</h3>
							<p className="text-sm text-muted-foreground">
								{templateInfo?.details?.name}
							</p>
						</div>
						<div>
							<h3 className="text-sm font-semibold">Description</h3>
							<ReactMarkdown className="text-sm text-muted-foreground">
								{templateInfo?.details?.description}
							</ReactMarkdown>
						</div>
						<div>
							<h3 className="text-md font-semibold">Server</h3>
							<p className="text-sm text-muted-foreground">
								{templateInfo?.server?.name || "Dokploy Server"}
							</p>
						</div>
						<div className="space-y-2">
							<h3 className="text-sm font-semibold">Docker Compose</h3>
							<CodeEditor
								lineWrapping
								value={templateInfo?.details?.dockerCompose}
								disabled
								className="font-mono"
							/>
						</div>
						<div>
							<h3 className="text-sm font-semibold">Environment Variables</h3>
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
							<h3 className="text-sm font-semibold">Domains</h3>
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
							<h3 className="text-sm font-semibold">Configuration Files</h3>
							<ul className="list-disc pl-5">
								{templateInfo?.details?.configFiles.map((file, index) => (
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
