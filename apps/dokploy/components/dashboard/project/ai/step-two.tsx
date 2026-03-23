import { Bot, PlusCircle, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
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
import type { TemplateInfo } from "./template-generator";

export interface StepProps {
	stepper?: any;
	templateInfo: TemplateInfo;
	setTemplateInfo: React.Dispatch<React.SetStateAction<TemplateInfo>>;
}

export const StepTwo = ({ templateInfo, setTemplateInfo }: StepProps) => {
	const t = useTranslations("aiAssistant");
	const suggestions = templateInfo.suggestions || [];
	const selectedVariant = templateInfo.details;

	const { mutateAsync, isPending, error, isError } =
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
					suggestions: data || [],
				});
			})
			.catch((error) => {
				toast.error(t("errorGenerating"), {
					description: error.message,
				});
			});
	}, [templateInfo.userInput]);

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
				<h2 className="text-2xl font-semibold animate-pulse">{t("errorTitle")}</h2>
				<AlertBlock type="error">
					{error?.message || t("errorGenerating")}
				</AlertBlock>
			</div>
		);
	}
	if (isPending) {
		return (
			<div className="flex flex-col items-center justify-center h-full space-y-4">
				<Bot className="w-16 h-16 text-primary animate-pulse" />
				<h2 className="text-2xl font-semibold animate-pulse">
					{t("generatingTitle")}
				</h2>
				<p className="text-muted-foreground">
					{t("generatingDesc")}
				</p>
				<pre className="whitespace-normal">{templateInfo.userInput}</pre>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full gap-6">
			<div className="flex-grow overflow-auto pb-8">
				<div className="space-y-6">
					<h2 className="text-lg font-semibold">{t("step2Title")}</h2>
					{!selectedVariant && (
						<div className="space-y-4">
							<div>{t("basedOnInput")}</div>
							<RadioGroup
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
										<AccordionTrigger>{t("descriptionAccordion")}</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="w-full rounded-md border p-4">
												<ReactMarkdown className="text-muted-foreground text-sm">
													{selectedVariant?.description}
												</ReactMarkdown>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="docker-compose">
										<AccordionTrigger>{t("dockerComposeAccordion")}</AccordionTrigger>
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
										<AccordionTrigger>{t("envVariablesAccordion")}</AccordionTrigger>
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
																placeholder={t("variableNamePlaceholder")}
																className="flex-1"
															/>
															<div className="relative">
																<Input
																	type={"password"}
																	value={env.value}
																	onChange={(e) =>
																		handleEnvVariableChange(
																			index,
																			"value",
																			e.target.value,
																		)
																	}
																	placeholder={t("variableValuePlaceholder")}
																/>
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
														{t("addVariable")}
													</Button>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="domains">
										<AccordionTrigger>{t("domainsAccordion")}</AccordionTrigger>
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
																placeholder={t("domainHostPlaceholder")}
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
																placeholder={t("portPlaceholder")}
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
																placeholder={t("serviceNamePlaceholder")}
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
														{t("addDomain")}
													</Button>
												</div>
											</ScrollArea>
										</AccordionContent>
									</AccordionItem>
									<AccordionItem value="mounts">
										<AccordionTrigger>{t("configFilesAccordion")}</AccordionTrigger>
										<AccordionContent>
											<ScrollArea className="w-full rounded-md border">
												<div className="p-4 space-y-4">
													{selectedVariant?.configFiles?.length &&
													selectedVariant?.configFiles?.length > 0 ? (
														<>
															<div className="text-sm text-muted-foreground mb-4">
																{t("configFilesRequired")}
															</div>
															{selectedVariant?.configFiles?.map(
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
																					{t("configFileMountedAs")}{config.filePath}
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
															<p>{t("noConfigFiles")}</p>
															<p className="text-sm mt-2">
																{t("noConfigFilesDesc")}
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
							{t("changeVariant")}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
};
