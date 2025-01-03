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
import { AlertCircle, Bot, Folder } from "lucide-react";
import { useState } from "react";
import { StepFour } from "./step-four";
import { StepOne } from "./step-one";
import { StepThree } from "./step-three";
import { StepTwo } from "./step-two";

export function TemplateGenerator() {
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState(1);
	// const [aiEnabled, setAiEnabled] = useState(true)
	const { data: aiSettings } = api.ai.get.useQuery();
	const [templateInfo, setTemplateInfo] = useState({
		userInput: "",
		type: "",
		details: {},
		name: "",
		server: "",
		description: "",
	});

	const totalSteps = 4;

	const nextStep = () => setStep((prev) => Math.min(prev + 1, totalSteps));
	const prevStep = () => setStep((prev) => Math.max(prev - 1, 1));

	const handleOpenChange = (newOpen: boolean) => {
		setOpen(newOpen);
		if (!newOpen) {
			// Reset to the first step when closing the dialog
			setStep(1);
			setTemplateInfo({
				userInput: "",
				type: "",
				details: {},
				name: "",
				server: "",
				description: "",
			});
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
							setOpen={setOpen}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
