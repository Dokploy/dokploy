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
import { api } from "@/utils/api";
import { AlertCircle, Bot } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StepFour } from "./step-four";
import { StepOne } from "./step-one";
import { StepThree } from "./step-three";
import { StepTwo } from "./step-two";

const emptyState = {
	userInput: "",
	type: "",
	details: {
		id: "",
		dockerCompose: "",
		envVariables: [],
		shortDescription: "",
	},
	name: "",
	server: undefined,
	description: "",
};

interface Props {
	projectId: string;
	projectName?: string;
}

export function TemplateGenerator({ projectId }: Props) {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(1);
	const { data: aiSettings } = api.ai.get.useQuery();
	const { mutateAsync } = api.ai.deploy.useMutation();
	const [templateInfo, setTemplateInfo] = useState(emptyState);
	const utils = api.useUtils();

	const totalSteps = 4;

	const nextStep = () => setStep((prev) => Math.min(prev + 1, totalSteps));
	const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			// Reset to the first step when closing the dialog
			setStep(1);
			setTemplateInfo(emptyState);
		}
	};

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
			<DialogContent className="max-w-[800px] w-full max-h-[90vh] flex flex-col">
				<DialogHeader>
					<DialogTitle>AI Assistant</DialogTitle>
					<DialogDescription>
						Create a custom template based on your needs
					</DialogDescription>
				</DialogHeader>
				<div className="mt-4 flex-grow overflow-auto">
					{step === 1 && (
						<>
							{(!aiSettings || !aiSettings?.isEnabled) && (
								<Alert variant="destructive" className="mb-4">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>AI features are not enabled</AlertTitle>
									<AlertDescription>
										To use AI-powered template generation, please{" "}
										<a
											href="/dashboard/settings/ai"
											className="font-medium underline underline-offset-4"
										>
											enable AI in your settings
										</a>
										.
									</AlertDescription>
								</Alert>
							)}
							{!!aiSettings && !!aiSettings?.isEnabled && (
								<StepOne
									nextStep={nextStep}
									setTemplateInfo={setTemplateInfo}
									templateInfo={templateInfo}
								/>
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
									id: templateInfo.details?.id,
									name: templateInfo.name,
									description: data.details.shortDescription,
									dockerCompose: data.details.dockerCompose,
									envVariables: (data.details?.envVariables || [])
										.map((env: any) => `${env.name}=${env.value}`)
										.join("\n"),
									serverId: data.server,
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
}
