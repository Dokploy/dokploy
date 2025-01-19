import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
	Dialog,
	DialogContent,
	DialogDescription,
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
import { api } from "@/utils/api";
import { Bot } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StepFour } from "./step-four";
import { StepOne } from "./step-one";
import { StepThree } from "./step-three";
import { StepTwo } from "./step-two";
import { AlertBlock } from "@/components/shared/alert-block";
import Link from "next/link";

interface EnvVariable {
	name: string;
	value: string;
}

interface Domain {
	host: string;
	port: number;
	serviceName: string;
}
export interface TemplateInfo {
	id: string;
	userInput: string;
	type: string;
	details?: {
		name: string;
		id: string;
		description: string;
		dockerCompose: string;
		envVariables: EnvVariable[];
		shortDescription: string;
		domains: Domain[];
	};
	serverId?: string;
	aiId: string;
}

const defaultTemplateInfo: TemplateInfo = {
	id: "",
	aiId: "",
	userInput: "",
	type: "",
	details: {
		id: "",
		name: "",
		description: "",
		dockerCompose: "",
		envVariables: [],
		shortDescription: "",
		domains: [],
	},
};

interface Props {
	projectId: string;
	projectName?: string;
}

export const TemplateGenerator = ({ projectId }: Props) => {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(1);
	const { data: aiSettings } = api.ai.getAll.useQuery();
	const { mutateAsync } = api.ai.deploy.useMutation();
	const [templateInfo, setTemplateInfo] =
		useState<TemplateInfo>(defaultTemplateInfo);
	const utils = api.useUtils();

	const totalSteps = 4;

	const nextStep = () => setStep((prev) => Math.min(prev + 1, totalSteps));
	const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			setStep(1);
			setTemplateInfo(defaultTemplateInfo);
		}
	};

	const haveAtleasOneProviderEnabled = aiSettings?.some(
		(ai) => ai.isEnabled === true,
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogTrigger asChild className="w-full">
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					<Bot className="size-4 text-muted-foreground" />
					<span>AI Assistant</span>
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen overflow-y-auto sm:max-w-4xl w-full  flex flex-col">
				<DialogHeader>
					<DialogTitle>AI Assistant</DialogTitle>
					<DialogDescription>
						Create a custom template based on your needs
					</DialogDescription>
				</DialogHeader>
				<div className="mt-4 flex-grow overflow-auto">
					{step === 1 && (
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
												nextStep={nextStep}
												setTemplateInfo={setTemplateInfo}
												templateInfo={templateInfo}
											/>
										)}
									</div>
								)}
						</>
					)}
					{step === 2 && (
						<StepTwo
							nextStep={nextStep}
							prevStep={prevStep}
							templateInfo={templateInfo}
							setTemplateInfo={setTemplateInfo}
						/>
					)}
					{step === 3 && (
						<StepThree
							nextStep={nextStep}
							prevStep={prevStep}
							templateInfo={templateInfo}
							setTemplateInfo={setTemplateInfo}
						/>
					)}
					{step === 4 && (
						<StepFour
							prevStep={prevStep}
							templateInfo={templateInfo}
							setTemplateInfo={async (data: any) => {
								console.log("Submitting template:", data);
								setTemplateInfo(data);
								await mutateAsync({
									projectId,
									id: templateInfo.details?.id || "",
									name: templateInfo?.details?.name || "",
									description: data?.details?.shortDescription || "",
									dockerCompose: data?.details?.dockerCompose || "",
									envVariables: (data?.details?.envVariables || [])
										.map((env: any) => `${env.name}=${env.value}`)
										.join("\n"),
									serverId: data.server || "",
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
							}}
							setOpen={setOpen}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};
