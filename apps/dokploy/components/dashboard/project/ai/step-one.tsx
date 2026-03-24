"use client";

import { useTranslations } from "next-intl";
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
	const t = useTranslations("aiAssistant");
	const { data: servers } = api.server.withSSHKey.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const hasServers = servers && servers.length > 0;
	const shouldShowServerDropdown = hasServers;

	const handleExampleClick = (example: string) => {
		setTemplateInfo({ ...templateInfo, userInput: example });
	};
	return (
		<div className="flex flex-col h-full gap-4">
			<div className="">
				<div className="space-y-4 ">
					<h2 className="text-lg font-semibold">{t("step1Title")}</h2>
					<div className="space-y-2">
						<Label htmlFor="user-needs">{t("step1Label")}</Label>
						<Textarea
							id="user-needs"
							placeholder={t("step1Placeholder")}
							value={templateInfo?.userInput}
							onChange={(e) =>
								setTemplateInfo({ ...templateInfo, userInput: e.target.value })
							}
							className="min-h-[100px]"
						/>
					</div>

					{shouldShowServerDropdown && (
						<div className="space-y-2">
							<Label htmlFor="server-deploy">{t("selectServerLabel")}</Label>
							<Select
								value={
									templateInfo.server?.serverId ||
									(!isCloud ? "dokploy" : undefined)
								}
								onValueChange={(value) => {
									if (value === "dokploy") {
										setTemplateInfo({
											...templateInfo,
											server: undefined,
										});
									} else {
										const server = servers?.find((s) => s.serverId === value);
										if (server) {
											setTemplateInfo({
												...templateInfo,
												server: server,
											});
										}
									}
								}}
							>
								<SelectTrigger className="w-full">
									<SelectValue
										placeholder={
											!isCloud ? t("dokploy") : t("selectServerPlaceholder")
										}
									/>
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{!isCloud && (
											<SelectItem value="dokploy">
												<span className="flex items-center gap-2 justify-between w-full">
													<span>{t("dokploy")}</span>
													<span className="text-muted-foreground text-xs self-center">
														{t("defaultBadge")}
													</span>
												</span>
											</SelectItem>
										)}
										{servers?.map((server) => (
											<SelectItem key={server.serverId} value={server.serverId}>
												{server.name}
											</SelectItem>
										))}
										<SelectLabel>
											{t("serversLabel", {
												count: (servers?.length ?? 0) + (!isCloud ? 1 : 0),
											})}
										</SelectLabel>
									</SelectGroup>
								</SelectContent>
							</Select>
						</div>
					)}

					<div className="space-y-2">
						<Label>{t("examplesLabel")}</Label>
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
