"use client";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const examples = [
	"Make a personal blog",
	"Add a photo studio portfolio",
	"Create a personal ad blocker",
	"Build a social media dashboard",
	"Sendgrid service opensource analogue",
];

export const StepOne = ({ setTemplateInfo, templateInfo }: any) => {
	// Get servers from the API
	const { data: servers } = api.server.withSSHKey.useQuery();
	const hasServers = servers && servers.length > 0;

	const handleExampleClick = (example: string) => {
		setTemplateInfo({ ...templateInfo, userInput: example });
	};
	return (
		<div className="flex flex-col h-full gap-4">
			<div className="">
				<div className="space-y-4 ">
					<h2 className="text-lg font-semibold">Step 1: Describe Your Needs</h2>
					<div className="space-y-2">
						<Label htmlFor="user-needs">Describe your template needs</Label>
						<Textarea
							id="user-needs"
							placeholder="Describe the type of template you need, its purpose, and any specific features you'd like to include."
							value={templateInfo?.userInput}
							onChange={(e) =>
								setTemplateInfo({ ...templateInfo, userInput: e.target.value })
							}
							className="min-h-[100px]"
						/>
					</div>

					{hasServers && (
						<div className="space-y-2">
							<Label htmlFor="server-deploy">
								Select the server where you want to deploy (optional)
							</Label>
							<Select
								value={templateInfo.server?.serverId}
								onValueChange={(value) => {
									const server = servers?.find((s) => s.serverId === value);
									if (server) {
										setTemplateInfo({
											...templateInfo,
											server: server,
										});
									}
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue placeholder="Select a server" />
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
					)}

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
		</div>
	);
};
