import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/utils/api";
import { Bot, Eye, EyeOff, PlusCircle, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
	ssr: false,
});

interface EnvVariable {
	name: string;
	value: string;
}

interface TemplateInfo {
	id: string;
	name: string;
	shortDescription: string;
	description: string;
	dockerCompose: string;
	envVariables: EnvVariable[];
}

export function StepTwo({
	nextStep,
	prevStep,
	templateInfo,
	setTemplateInfo,
}: any) {
	const [suggestions, setSuggestions] = useState<Array<TemplateInfo>>([]);
	const [selectedVariant, setSelectedVariant] = useState("");
	const [dockerCompose, setDockerCompose] = useState("");
	const [envVariables, setEnvVariables] = useState<Array<EnvVariable>>([]);
	const [showValues, setShowValues] = useState<Record<string, boolean>>({});

	const { mutateAsync, isLoading } = api.ai.suggest.useMutation();

	useEffect(() => {
		mutateAsync(templateInfo.userInput)
			.then((data) => {
				setSuggestions(data);
			})
			.catch(() => {
				toast.error("Error updating AI settings");
			});
	}, [templateInfo.userInput]);

	useEffect(() => {
		if (selectedVariant) {
			const selected = suggestions.find(
				(s: { id: string }) => s.id === selectedVariant,
			);
			if (selected) {
				setDockerCompose(selected.dockerCompose);
				setEnvVariables(selected.envVariables);
				setShowValues(
					selected.envVariables.reduce((acc: Record<string, boolean>, env) => {
						acc[env.name] = false;
						return acc;
					}, {}),
				);
			}
		}
	}, [selectedVariant, suggestions]);

	const handleNext = () => {
		const selected = suggestions.find(
			(s: { id: string }) => s.id === selectedVariant,
		);
		if (selected) {
			setTemplateInfo({
				...templateInfo,
				type: selectedVariant,
				details: {
					...selected,
					dockerCompose,
					envVariables,
				},
			});
		}
		nextStep();
	};

	const handleEnvVariableChange = (
		index: number,
		field: string,
		value: string,
	) => {
		const updatedEnvVariables = [...envVariables];
		if (updatedEnvVariables[index]) {
			updatedEnvVariables[index] = {
				...updatedEnvVariables[index],
				[field]: value,
			};
			setEnvVariables(updatedEnvVariables);
		}
	};

	const addEnvVariable = () => {
		setEnvVariables([...envVariables, { name: "", value: "" }]);
		setShowValues((prev) => ({ ...prev, "": false }));
	};

	const removeEnvVariable = (index: number) => {
		const updatedEnvVariables = envVariables.filter((_, i) => i !== index);
		setEnvVariables(updatedEnvVariables);
	};

	const toggleShowValue = (name: string) => {
		setShowValues((prev) => ({ ...prev, [name]: !prev[name] }));
	};

	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-4">
				<Bot className="w-16 h-16 text-primary animate-pulse" />
				<h2 className="text-2xl font-semibold animate-pulse">
					AI is processing your request
				</h2>
				<p className="text-muted-foreground">
					Generating template suggestions based on your input...
				</p>
				<pre>{templateInfo.userInput}</pre>
			</div>
		);
	}

	const selectedTemplate = suggestions.find(
		(s: { id: string }) => s.id === selectedVariant,
	);

	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow overflow-auto">
				<div className="space-y-6 pb-20">
					<h2 className="text-lg font-semibold">Step 2: Choose a Variant</h2>
					{!selectedVariant && (
						<div className="space-y-4">
							<div>Based on your input, we suggest the following variants:</div>
							<RadioGroup
								value={selectedVariant}
								onValueChange={setSelectedVariant}
								className="space-y-4"
							>
								{suggestions.map((suggestion) => (
									<div
										key={suggestion.id}
										className="flex items-start space-x-3"
									>
										<RadioGroupItem
											value={suggestion.id}
											id={suggestion.id}
											className="mt-1"
										/>
										<div>
											<Label htmlFor={suggestion.id} className="font-medium">
												{suggestion.name}
											</Label>
											<p className="text-sm text-muted-foreground">
												{suggestion.shortDescription}
											</p>
										</div>
									</div>
								))}
							</RadioGroup>
						</div>
					)}
					{selectedVariant && (
						<>
							<div className="mb-6">
								<h3 className="text-xl font-bold">{selectedTemplate?.name}</h3>
								<p className="text-muted-foreground mt-2">
									{selectedTemplate?.shortDescription}
								</p>
							</div>
							<ScrollArea className="h-[400px] p-5">
								<Accordion type="single" collapsible className="w-full">
									<AccordionItem value="description">
										<AccordionTrigger>Description</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="h-[300px] w-full rounded-md border">
												<div className="p-4">
													<ReactMarkdown className="prose dark:prose-invert">
														{selectedTemplate?.description}
													</ReactMarkdown>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="docker-compose">
										<AccordionTrigger>Docker Compose</AccordionTrigger>
										<AccordionContent>
											<div className="h-[400px] w-full rounded-md border overflow-hidden">
												<MonacoEditor
													height="100%"
													language="yaml"
													theme="vs-dark"
													value={dockerCompose}
													onChange={(value) =>
														setDockerCompose(value as string)
													}
													options={{
														minimap: { enabled: false },
														scrollBeyondLastLine: false,
														fontSize: 14,
														lineNumbers: "on",
														readOnly: false,
														wordWrap: "on",
														automaticLayout: true,
													}}
												/>
											</div>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="env-variables">
										<AccordionTrigger>Environment Variables</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="h-[300px] w-full rounded-md border">
												<div className="p-4 space-y-4">
													{envVariables.map((env, index) => (
														<div
															key={index}
															className="flex items-center space-x-2"
														>
															<Input
																value={env.name}
																onChange={(e) =>
																	handleEnvVariableChange(
																		index,
																		"name",
																		e.target.value,
																	)
																}
																placeholder="Variable Name"
																className="flex-1"
															/>
															<div className="flex-1 relative">
																<Input
																	type={
																		showValues[env.name] ? "text" : "password"
																	}
																	value={env.value}
																	onChange={(e) =>
																		handleEnvVariableChange(
																			index,
																			"value",
																			e.target.value,
																		)
																	}
																	placeholder="Variable Value"
																/>
																<Button
																	type="button"
																	variant="ghost"
																	size="icon"
																	className="absolute right-2 top-1/2 transform -translate-y-1/2"
																	onClick={() => toggleShowValue(env.name)}
																>
																	{showValues[env.name] ? (
																		<EyeOff className="h-4 w-4" />
																	) : (
																		<Eye className="h-4 w-4" />
																	)}
																</Button>
															</div>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																onClick={() => removeEnvVariable(index)}
															>
																<Trash2 className="h-4 w-4" />
															</Button>
														</div>
													))}
													<Button
														type="button"
														variant="outline"
														size="sm"
														className="mt-2"
														onClick={addEnvVariable}
													>
														<PlusCircle className="h-4 w-4 mr-2" />
														Add Variable
													</Button>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
								</Accordion>
							</ScrollArea>
						</>
					)}
				</div>
			</div>
			<div className="sticky bottom-0 bg-background pt-2 border-t">
				<div className="flex justify-between">
					<Button
						onClick={() =>
							selectedVariant ? setSelectedVariant("") : prevStep()
						}
						variant="outline"
					>
						{selectedVariant ? "Change Variant" : "Back"}
					</Button>
					<Button onClick={handleNext} disabled={!selectedVariant}>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
