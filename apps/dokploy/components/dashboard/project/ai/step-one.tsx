"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";

const examples = [
	"Make a personal blog",
	"Add a photo studio portfolio",
	"Create a personal ad blocker",
	"Build a social media dashboard",
	"Sendgrid service opensource analogue",
];

export const StepOne = ({ nextStep, setTemplateInfo, templateInfo }: any) => {
	const [userInput, setUserInput] = useState(templateInfo.userInput);

	const handleNext = () => {
		setTemplateInfo({ ...templateInfo, userInput });
		nextStep();
	};

	const handleExampleClick = (example: string) => {
		setUserInput(example);
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow overflow-auto">
				<div className="space-y-4 pb-20">
					<h2 className="text-lg font-semibold">Step 1: Describe Your Needs</h2>
					<div className="space-y-2">
						<Label htmlFor="user-needs">Describe your template needs</Label>
						<Textarea
							id="user-needs"
							placeholder="Describe the type of template you need, its purpose, and any specific features you'd like to include."
							value={userInput}
							onChange={(e) => setUserInput(e.target.value)}
							className="min-h-[100px]"
						/>
					</div>
					<div className="space-y-2">
						<Label>Examples:</Label>
						<div className="flex flex-wrap gap-2">
							{examples.map((example, index) => (
								<Button
									key={index}
									variant="outline"
									size="sm"
									onClick={() => handleExampleClick(example)}
								>
									{example}
								</Button>
							))}
						</div>
					</div>
				</div>
			</div>
			<div className="sticky bottom-0 bg-background pt-2 border-t">
				<div className="flex justify-end">
					<Button onClick={handleNext} disabled={!userInput.trim()}>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
};
