import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
	ssr: false,
});

export function StepFour({
	prevStep,
	templateInfo,
	setOpen,
	setTemplateInfo,
}: any) {
	const handleSubmit = () => {
		setTemplateInfo(templateInfo); // Update the template info
		setOpen(false);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow">
				<div className="space-y-6 pb-20">
					<h2 className="text-lg font-semibold">Step 4: Review and Finalize</h2>
					<ScrollArea className="h-[400px] p-5">
						<div className="space-y-4">
							<div className="p-4">
								<ReactMarkdown className="prose dark:prose-invert">
									{templateInfo.details.description}
								</ReactMarkdown>
							</div>
							<div>
								<h3 className="text-md font-semibold">Name</h3>
								<p>{templateInfo.name}</p>
							</div>
							<div>
								<h3 className="text-md font-semibold">Server</h3>
								<p>{templateInfo.server || "localhost"}</p>
							</div>
							<div>
								<h3 className="text-md font-semibold">Docker Compose</h3>
								<MonacoEditor
									height="200px"
									language="yaml"
									theme="vs-dark"
									value={templateInfo.details.dockerCompose}
									options={{
										minimap: { enabled: false },
										scrollBeyondLastLine: false,
										fontSize: 14,
										lineNumbers: "on",
										readOnly: true,
										wordWrap: "on",
										automaticLayout: true,
									}}
								/>
							</div>
							<div>
								<h3 className="text-md font-semibold">Environment Variables</h3>
								<ul className="list-disc pl-5">
									{templateInfo.details.envVariables.map(
										(
											env: {
												name: string;
												value: string;
											},
											index: number,
										) => (
											<li key={index}>
												<strong>{env.name}</strong>:
												<span className="ml-2 font-mono">{env.value}</span>
											</li>
										),
									)}
								</ul>
							</div>
						</div>
					</ScrollArea>
				</div>
			</div>
			<div className="sticky bottom-0 bg-background pt-2 border-t">
				<div className="flex justify-between">
					<Button onClick={prevStep} variant="outline">
						Back
					</Button>
					<Button onClick={handleSubmit}>Create</Button>
				</div>
			</div>
		</div>
	);
}
