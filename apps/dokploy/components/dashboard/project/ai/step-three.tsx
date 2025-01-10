"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { useState } from "react";

export function StepThree({
	nextStep,
	prevStep,
	templateInfo,
	setTemplateInfo,
}: any) {
	const [name, setName] = useState(templateInfo.name);
	const [server, setServer] = useState(templateInfo.server);
	const { data: servers } = api.server.withSSHKey.useQuery();

	const handleNext = () => {
		const updatedInfo = { ...templateInfo, name };
		if (server?.trim()) {
			updatedInfo.server = server;
		}
		setTemplateInfo(updatedInfo);
		nextStep();
	};

	return (
		<div className="flex flex-col h-full">
			<div className="flex-grow overflow-auto">
				<div className="space-y-4 pb-20">
					<h2 className="text-lg font-semibold">Step 3: Additional Details</h2>
					<div>
						<Label htmlFor="name">App Name</Label>
						<Input
							id="name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Enter app name"
							className="mt-1"
						/>
					</div>
					<div>
						<Label htmlFor="server">Server Attachment (Optional)</Label>
						<Select value={server} onValueChange={setServer}>
							<SelectTrigger>
								<SelectValue placeholder="Select a Server" />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{servers?.map((server) => (
										<SelectItem key={server.serverId} value={server.serverId}>
											{server.name}
										</SelectItem>
									))}
									<SelectLabel>Servers ({servers?.length})</SelectLabel>
								</SelectGroup>
							</SelectContent>
						</Select>
					</div>
				</div>
			</div>
			<div className="sticky bottom-0 bg-background pt-2 border-t">
				<div className="flex justify-between">
					<Button onClick={prevStep} variant="outline">
						Back
					</Button>
					<Button onClick={handleNext} disabled={!name.trim()}>
						Next
					</Button>
				</div>
			</div>
		</div>
	);
}
