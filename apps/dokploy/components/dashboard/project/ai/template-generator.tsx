import { defineStepper } from "@stepperize/react";
import { Bot } from "lucide-react";
import Link from "next/link";
import React, { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/utils/api";
import { StepOne } from "./step-one";
import { StepThree } from "./step-three";
import { StepTwo } from "./step-two";

interface EnvVariable {
	name: string;
	value: string;
}

interface Domain {
	host: string;
	port: number;
	serviceName: string;
}

interface Details {
	name: string;
	id: string;
	description: string;
	dockerCompose: string;
	envVariables: EnvVariable[];
	shortDescription: string;
	domains: Domain[];
	configFiles: Mount[];
}

interface Mount {
	filePath: string;
	content: string;
}

export interface TemplateInfo {
	userInput: string;
	details?: Details | null;
	suggestions?: Details[];
	server?: {
		serverId: string;
		name: string;
	};
	aiId: string;
}

const defaultTemplateInfo: TemplateInfo = {
	aiId: "",
	userInput: "",
	server: undefined,
	details: null,
	suggestions: [],
};

export const { useStepper, steps, Scoped } = defineStepper(
	{
		id: "needs",
		title: "Describe your needs",
	},
	{
		id: "variant",
		title: "Choose a Variant",
	},
	{
		id: "review",
		title: "Review and Finalize",
	},
);

interface Props {
	projectId: string;
	projectName?: string;
}

export const TemplateGenerator = ({ projectId }: Props) => {
	const [open, setOpen] = useState(false);
	const stepper = useStepper();
	const { data: aiSettings } = api.ai.getAll.useQuery();
	const { mutateAsync } = api.ai.deploy.useMutation();
	const [templateInfo, setTemplateInfo] =
		useState<TemplateInfo>(defaultTemplateInfo);
	const utils = api.useUtils();

	const haveAtleasOneProviderEnabled = aiSettings?.some(
		(ai) => ai.isEnabled === true,
	);

	const isDisabled = () => {
		if (stepper.current.id === "needs") {
			return !templateInfo.aiId || !templateInfo.userInput;
		}

		if (stepper.current.id === "variant") {
			return !templateInfo?.details?.id;
		}

		return false;
	};

	const onSubmit = async () => {
		await mutateAsync({
			projectId,
			id: templateInfo.details?.id || "",
			name: templateInfo?.details?.name || "",
			description: templateInfo?.details?.shortDescription || "",
			dockerCompose: templateInfo?.details?.dockerCompose || "",
			envVariables: (templateInfo?.details?.envVariables || [])
				.map((env: any) => `${env.name}=${env.value}`)
				.join("\n"),
			domains: templateInfo?.details?.domains || [],
			...(templateInfo.server?.serverId && {
				serverId: templateInfo.server?.serverId || "",
			}),
			configFiles: templateInfo?.details?.configFiles || [],
		})
			.then(async () => {
				toast.success("Compose Created");
				setOpen(false);
				await utils.project.one.invalidate({
					projectId,
				});
			})
			.catch(() => {
				toast.error("Error creating the compose");
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Bot className="size-4 text-muted-foreground" />
					<span>AI Assistant</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-4xl w-full  flex flex-col">
				<DialogHeader>
					<DialogTitle>AI Assistant</DialogTitle>
					<DialogDescription>
						Create a custom template based on your needs
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<div className="flex justify-between">
						<h2 className="text-lg font-semibold">Steps</h2>
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">
								Step {stepper.current.index + 1} of {steps.length}
							</span>
							<div />
						</div>
					</div>
					<Scoped>
						<nav aria-label="Checkout Steps" className="group my-4">
							<ol
								className="flex items-center justify-between gap-2"
								aria-orientation="horizontal"
							>
								{stepper.all.map((step, index, array) => (
									<React.Fragment key={step.id}>
										<li className="flex items-center gap-4 flex-shrink-0">
											<Button
												type="button"
												role="tab"
												variant={
													index <= stepper.current.index ? "secondary" : "ghost"
												}
												aria-current={
													stepper.current.id === step.id ? "step" : undefined
												}
												aria-posinset={index + 1}
												aria-setsize={steps.length}
												aria-selected={stepper.current.id === step.id}
												className="flex size-10 items-center justify-center rounded-full border-2 border-border"
											>
												{index + 1}
											</Button>
											<span className="text-sm font-medium">{step.title}</span>
										</li>
										{index < array.length - 1 && (
											<Separator
												className={`flex-1 ${
													index < stepper.current.index
														? "bg-primary"
														: "bg-muted"
												}`}
											/>
										)}
									</React.Fragment>
								))}
							</ol>
						</nav>
						{stepper.switch({
							needs: () => (
								<>
									{!haveAtleasOneProviderEnabled && (
										<AlertBlock type="warning">
											<div className="flex flex-col w-full">
												<span>AI features are not enabled</span>
												<span>
													To use AI-powered template generation, please{" "}
													<Link
														href="/dashboard/settings/ai"
														className="font-medium underline underline-offset-4"
													>
														enable AI in your settings
													</Link>
													.
												</span>
											</div>
										</AlertBlock>
									)}

									{haveAtleasOneProviderEnabled &&
										aiSettings &&
										aiSettings?.length > 0 && (
											<div className="space-y-4">
												<div className="flex flex-col gap-2">
													<label
														htmlFor="user-needs"
														className="text-sm font-medium"
													>
														Select AI Provider
													</label>
													<Select
														value={templateInfo.aiId}
														onValueChange={(value) =>
															setTemplateInfo((prev) => ({
																...prev,
																aiId: value,
															}))
														}
													>
														<SelectTrigger>
															<SelectValue placeholder="Select an AI provider" />
														</SelectTrigger>
														<SelectContent>
															{aiSettings.map((ai) => (
																<SelectItem key={ai.aiId} value={ai.aiId}>
																	{ai.name} ({ai.model})
																</SelectItem>
															))}
														</SelectContent>
													</Select>
												</div>
												{templateInfo.aiId && (
													<StepOne
														setTemplateInfo={setTemplateInfo}
														templateInfo={templateInfo}
													/>
												)}
											</div>
										)}
								</>
							),
							variant: () => (
								<StepTwo
									templateInfo={templateInfo}
									setTemplateInfo={setTemplateInfo}
								/>
							),
							review: () => (
								<StepThree
									templateInfo={templateInfo}
									setTemplateInfo={setTemplateInfo}
								/>
							),
						})}
					</Scoped>
				</div>
				<DialogFooter>
					<div className="flex items-center justify-between w-full">
						<div className="flex items-center gap-2 w-full justify-end">
							<Button
								onClick={stepper.prev}
								disabled={stepper.isFirst}
								variant="secondary"
							>
								Back
							</Button>
							<Button
								disabled={isDisabled()}
								onClick={async () => {
									if (stepper.current.id === "needs") {
										setTemplateInfo((prev) => ({
											...prev,
											suggestions: [],
											details: null,
										}));
									}

									if (stepper.isLast) {
										await onSubmit();
										return;
									}
									stepper.next();
									// if (stepper.isLast) {
									// 	// setIsOpen(false);
									// 	// push("/dashboard/projects");
									// } else {
									// 	stepper.next();
									// }
								}}
							>
								{stepper.isLast ? "Create" : "Next"}
							</Button>
						</div>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
