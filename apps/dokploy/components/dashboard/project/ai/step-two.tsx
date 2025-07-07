import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
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
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import type { TemplateInfo } from "./template-generator";

export interface StepProps {
	stepper?: any;
	templateInfo: TemplateInfo;
	setTemplateInfo: React.Dispatch<React.SetStateAction<TemplateInfo>>;
}

export const StepTwo = ({ templateInfo, setTemplateInfo }: StepProps) => {
	const { t } = useTranslation("dashboard");
	const suggestions = templateInfo.suggestions || [];
	const selectedVariant = templateInfo.details;
	const [showValues, setShowValues] = useState<Record<string, boolean>>({});

	const { mutateAsync, isLoading, error, isError } =
		api.ai.suggest.useMutation();

	useEffect(() => {
		if (suggestions?.length > 0) {
			return;
		}
		mutateAsync({
			aiId: templateInfo.aiId,
			serverId: templateInfo.server?.serverId || "",
			input: templateInfo.userInput,
		})
			.then((data) => {
				setTemplateInfo({
					...templateInfo,
					suggestions: data,
				});
			})
			.catch((error) => {
				toast.error(t("dashboard.ai.errorGeneratingSuggestions"), {
					description: error.message,
				});
			});
	}, [templateInfo.userInput]);

	const toggleShowValue = (name: string) => {
		setShowValues((prev) => ({ ...prev, [name]: !prev[name] }));
	};

	const handleEnvVariableChange = (
		index: number,
		field: "name" | "value",
		value: string,
	) => {
		if (!selectedVariant) return;

		const updatedEnvVariables = [...selectedVariant.envVariables];
		// @ts-ignore
		updatedEnvVariables[index] = {
			...updatedEnvVariables[index],
			[field]: value,
		};

		setTemplateInfo({
			...templateInfo,
			...(templateInfo.details && {
				details: {
					...templateInfo.details,
					envVariables: updatedEnvVariables,
				},
			}),
		});
	};

	const removeEnvVariable = (index: number) => {
		if (!selectedVariant) return;

		const updatedEnvVariables = selectedVariant.envVariables.filter(
			(_, i) => i !== index,
		);

		setTemplateInfo({
			...templateInfo,
			...(templateInfo.details && {
				details: {
					...templateInfo.details,
					envVariables: updatedEnvVariables,
				},
			}),
		});
	};

	const handleDomainChange = (
		index: number,
		field: "host" | "port" | "serviceName",
		value: string | number,
	) => {
		if (!selectedVariant) return;

		const updatedDomains = [...selectedVariant.domains];
		// @ts-ignore
		updatedDomains[index] = {
			...updatedDomains[index],
			[field]: value,
		};

		setTemplateInfo({
			...templateInfo,
			...(templateInfo.details && {
				details: {
					...templateInfo.details,
					domains: updatedDomains,
				},
			}),
		});
	};

	const removeDomain = (index: number) => {
		if (!selectedVariant) return;

		const updatedDomains = selectedVariant.domains.filter(
			(_, i) => i !== index,
		);

		setTemplateInfo({
			...templateInfo,
			...(templateInfo.details && {
				details: {
					...templateInfo.details,
					domains: updatedDomains,
				},
			}),
		});
	};

	const addEnvVariable = () => {
		if (!selectedVariant) return;

		setTemplateInfo({
			...templateInfo,

			...(templateInfo.details && {
				details: {
					...templateInfo.details,
					envVariables: [
						...selectedVariant.envVariables,
						{ name: "", value: "" },
					],
				},
			}),
		});
	};

	const addDomain = () => {
		if (!selectedVariant) return;

		setTemplateInfo({
			...templateInfo,
			...(templateInfo.details && {
				details: {
					...templateInfo.details,
					domains: [
						...selectedVariant.domains,
						{ host: "", port: 80, serviceName: "" },
					],
				},
			}),
		});
	};
	if (isError) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-4">
				<Bot className="w-16 h-16 text-primary animate-pulse" />
				<h2 className="text-2xl font-semibold animate-pulse">
					{t("dashboard.ai.error")}
				</h2>
				<AlertBlock type="error">
					{error?.message || t("dashboard.ai.errorGeneratingSuggestions")}
				</AlertBlock>
			</div>
		);
	}
	if (isLoading) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-4">
				<Bot className="w-16 h-16 text-primary animate-pulse" />
				<h2 className="text-2xl font-semibold animate-pulse">
					{t("dashboard.ai.aiProcessingRequest")}
				</h2>
				<p className="text-muted-foreground">
					{t("dashboard.ai.generatingTemplateSuggestions")}
				</p>
				<pre className="whitespace-normal">{templateInfo.userInput}</pre>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full gap-6">
			<div className="flex-grow overflow-auto pb-8">
				<div className="space-y-6">
					<h2 className="text-lg font-semibold">
						{t("dashboard.ai.stepTwoChooseVariant")}
					</h2>
					{!selectedVariant && (
						<div className="space-y-4">
							<div>{t("dashboard.ai.basedOnInputWeSuggest")}</div>
							<RadioGroup
								// value={selectedVariant?.}
								onValueChange={(value) => {
									const element = suggestions?.find((s) => s?.id === value);
									setTemplateInfo({
										...templateInfo,
										details: element,
									});
								}}
								className="space-y-4"
							>
								{suggestions?.map((suggestion) => (
									<div
										key={suggestion?.id}
										className="flex items-start space-x-3"
									>
										<RadioGroupItem
											value={suggestion?.id || ""}
											id={suggestion?.id}
											className="mt-1"
										/>
										<div>
											<Label htmlFor={suggestion?.id} className="font-medium">
												{suggestion?.name}
											</Label>
											<p className="text-sm text-muted-foreground">
												{suggestion?.shortDescription}
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
								<h3 className="text-xl font-bold">{selectedVariant?.name}</h3>
								<p className="text-muted-foreground mt-2">
									{selectedVariant?.shortDescription}
								</p>
							</div>
							<ScrollArea>
								<Accordion type="single" collapsible className="w-full">
									<AccordionItem value="description">
										<AccordionTrigger>
											{t("dashboard.ai.description")}
										</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="w-full rounded-md border p-4">
												<ReactMarkdown className="text-muted-foreground text-sm">
													{selectedVariant?.description}
												</ReactMarkdown>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="docker-compose">
										<AccordionTrigger>
											{t("dashboard.ai.dockerCompose")}
										</AccordionTrigger>
										<AccordionContent>
											<CodeEditor
												value={selectedVariant?.dockerCompose}
												className="font-mono"
												onChange={(value) => {
													setTemplateInfo({
														...templateInfo,
														...(templateInfo?.details && {
															details: {
																...templateInfo.details,
																dockerCompose: value,
															},
														}),
													});
												}}
											/>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="env-variables">
										<AccordionTrigger>
											{t("dashboard.ai.environmentVariables")}
										</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="w-full rounded-md border">
												<div className="p-4 space-y-4">
													{selectedVariant?.envVariables.map((env, index) => (
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
																placeholder={t("dashboard.ai.variableName")}
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
																	placeholder={t("dashboard.ai.variableValue")}
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
														{t("dashboard.ai.addVariable")}
													</Button>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="domains">
										<AccordionTrigger>
											{t("dashboard.ai.domains")}
										</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="w-full rounded-md border">
												<div className="p-4 space-y-4">
													{selectedVariant?.domains.map((domain, index) => (
														<div
															key={index}
															className="flex items-center space-x-2"
														>
															<Input
																value={domain.host}
																onChange={(e) =>
																	handleDomainChange(
																		index,
																		"host",
																		e.target.value,
																	)
																}
																placeholder={t("dashboard.ai.domainHost")}
																className="flex-1"
															/>
															<Input
																type="number"
																value={domain.port}
																onChange={(e) =>
																	handleDomainChange(
																		index,
																		"port",
																		Number.parseInt(e.target.value),
																	)
																}
																placeholder={t("dashboard.ai.port")}
																className="w-24"
															/>
															<Input
																value={domain.serviceName}
																onChange={(e) =>
																	handleDomainChange(
																		index,
																		"serviceName",
																		e.target.value,
																	)
																}
																placeholder={t("dashboard.ai.serviceName")}
																className="flex-1"
															/>
															<Button
																type="button"
																variant="ghost"
																size="icon"
																onClick={() => removeDomain(index)}
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
														onClick={addDomain}
													>
														<PlusCircle className="h-4 w-4 mr-2" />
														{t("dashboard.ai.addDomain")}
													</Button>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="mounts">
										<AccordionTrigger>
											{t("dashboard.ai.configurationFiles")}
										</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="w-full rounded-md border">
												<div className="p-4 space-y-4">
													{selectedVariant?.configFiles?.length > 0 ? (
														<>
															<div className="text-sm text-muted-foreground mb-4">
																{t("dashboard.ai.templateRequiresMounting")}
															</div>
															{selectedVariant.configFiles.map(
																(config, index) => (
																	<div
																		key={index}
																		className="space-y-2 border rounded-lg p-4"
																	>
																		<div className="flex items-center justify-between">
																			<div className="space-y-1">
																				<Label className="text-primary">
																					{config.filePath}
																				</Label>
																				<p className="text-xs text-muted-foreground">
																					{t("dashboard.ai.willBeMountedAs")}
																					{config.filePath}
																				</p>
																			</div>
																		</div>
																		<CodeEditor
																			value={config.content}
																			className="font-mono"
																			onChange={(value) => {
																				if (!selectedVariant?.configFiles)
																					return;
																				const updatedConfigFiles = [
																					...selectedVariant.configFiles,
																				];
																				updatedConfigFiles[index] = {
																					filePath: config.filePath,
																					content: value,
																				};
																				setTemplateInfo({
																					...templateInfo,
																					...(templateInfo.details && {
																						details: {
																							...templateInfo.details,
																							configFiles: updatedConfigFiles,
																						},
																					}),
																				});
																			}}
																		/>
																	</div>
																),
															)}
														</>
													) : (
														<div className="text-center text-muted-foreground py-8">
															<p>
																{t("dashboard.ai.templateDoesNotRequireFiles")}
															</p>
															<p className="text-sm mt-2">
																{t(
																	"dashboard.ai.allConfigurationsHandledThroughEnvVars",
																)}
															</p>
														</div>
													)}
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
			<div className="">
				<div className="flex justify-between">
					{selectedVariant && (
						<Button
							onClick={() => {
								const { details, ...rest } = templateInfo;
								setTemplateInfo(rest);
							}}
							variant="outline"
						>
							{t("dashboard.ai.changeVariant")}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};
