"use client";

import { useChat } from "@ai-sdk/react";
import type { ChatContext } from "@dokploy/server/utils/ai/chat-tools";
import { DefaultChatTransport } from "ai";
import {
	Bot,
	Check,
	ChevronDown,
	Loader2,
	Send,
	Trash2,
	Wrench,
	X,
} from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

function useChatContext(): ChatContext {
	const router = useRouter();
	const { query, pathname } = router;

	return useMemo(() => {
		const projectId =
			typeof query.projectId === "string" ? query.projectId : undefined;
		const environmentId =
			typeof query.environmentId === "string"
				? query.environmentId
				: undefined;
		const serverId =
			typeof query.serverId === "string" ? query.serverId : undefined;

		const serviceParams = [
			{ key: "applicationId", type: "application" },
			{ key: "composeId", type: "compose" },
			{ key: "postgresId", type: "postgres" },
			{ key: "mysqlId", type: "mysql" },
			{ key: "redisId", type: "redis" },
			{ key: "mongoId", type: "mongo" },
			{ key: "mariadbId", type: "mariadb" },
			{ key: "libsqlId", type: "libsql" },
		] as const;

		for (const { key, type } of serviceParams) {
			if (query[key] && typeof query[key] === "string") {
				return {
					type,
					id: query[key] as string,
					projectId,
					environmentId,
					serverId,
				};
			}
		}

		if (query.projectId && typeof query.projectId === "string") {
			return {
				type: "project" as const,
				id: query.projectId,
				projectId,
				environmentId,
				serverId,
			};
		}
		return {
			type: "general" as const,
			id: "",
			projectId,
			environmentId,
			serverId,
		};
	}, [
		query.applicationId,
		query.composeId,
		query.postgresId,
		query.mysqlId,
		query.redisId,
		query.mongoId,
		query.mariadbId,
		query.libsqlId,
		query.projectId,
		query.environmentId,
		query.serverId,
		pathname,
	]);
}

export function ChatPanel() {
	const [open, setOpen] = useState(false);
	const [aiId, setAiId] = useState<string>("");
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const context = useChatContext();
	const aiIdRef = useRef(aiId);
	const contextRef = useRef(context);
	aiIdRef.current = aiId;
	contextRef.current = context;

	const { data: isCloud } = api.settings.isCloud.useQuery(undefined, {
		refetchOnWindowFocus: false,
	});

	const { data: providers } = api.ai.getEnabledProviders.useQuery(undefined, {
		refetchOnWindowFocus: false,
		enabled: !isCloud,
	});

	const enabledProviders = providers ?? [];

	const STORAGE_KEY = "dokploy-chat-messages";

	const { messages, sendMessage, status, setMessages, addToolApprovalResponse } = useChat({
			id: "dokploy-chat",
			transport: new DefaultChatTransport({
				api: "/api/ai/chat",
				body: () => ({
					...(isCloud ? {} : { aiId: aiIdRef.current }),
					context: contextRef.current,
				}),
			}),
			initialMessages: () => {
				try {
					const stored = localStorage.getItem(STORAGE_KEY);
					return stored ? JSON.parse(stored) : [];
				} catch {
					return [];
				}
			},
		});

	const isLoading = status === "streaming" || status === "submitted";

	// Persist messages to localStorage
	useEffect(() => {
		if (messages.length > 0) {
			try {
				// Keep only last 50 messages to avoid localStorage bloat
				const toStore = messages.slice(-50);
				localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
			} catch {
				// localStorage full or unavailable — ignore
			}
		}
	}, [messages]);

	useEffect(() => {
		if (!isCloud && !aiId && enabledProviders.length > 0 && enabledProviders[0]) {
			setAiId(enabledProviders[0].aiId);
		}
	}, [enabledProviders, aiId, isCloud]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages, status]);

	if (!isCloud && enabledProviders.length === 0) return null;

	const handleSend = () => {
		if (!input.trim() || isLoading) return;
		if (!isCloud && !aiId) return;
		sendMessage({ text: input });
		setInput("");
		setTimeout(() => inputRef.current?.focus(), 0);
	};

	const contextLabel =
		context.type === "general" ? "General" : context.type;

	const lastMessage = messages[messages.length - 1];

	return (
		<>
			<Button
				onClick={() => setOpen(true)}
				variant="outline"
				className="fixed bottom-6 right-6 z-50 h-11 w-11 rounded-full shadow-md border"
				size="icon"
			>
				<Bot className="h-5 w-5" />
			</Button>

			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent
					side="right"
					className="w-full sm:w-[480px] p-0 flex flex-col border-l outline-none"
				>
					<SheetHeader className="px-4 py-3 border-b shrink-0">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Bot className="h-4 w-4 text-muted-foreground" />
								<SheetTitle className="text-sm font-medium">
									{isCloud ? "Dokploy Agent" : "AI Assistant"}
								</SheetTitle>
								{isLoading && (
									<span className="text-xs text-muted-foreground animate-pulse">
										working...
									</span>
								)}
							</div>
						</div>
						<SheetDescription className="sr-only">
							Chat with AI to manage your infrastructure
						</SheetDescription>
						<div className="flex items-center gap-2 pt-1">
							{!isCloud && (
								<Select value={aiId} onValueChange={setAiId}>
									<SelectTrigger className="h-8 text-xs flex-1">
										<SelectValue placeholder="Select provider..." />
									</SelectTrigger>
									<SelectContent>
										{enabledProviders.map((p) => (
											<SelectItem key={p.aiId} value={p.aiId}>
												{p.name} ({p.model})
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							)}
							<Badge
								variant="outline"
								className="text-xs shrink-0 capitalize font-normal"
							>
								{contextLabel}
							</Badge>
							{messages.length > 0 && (
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 shrink-0"
									onClick={() => { setMessages([]); localStorage.removeItem(STORAGE_KEY); }}
									title="Clear chat"
								>
									<Trash2 className="h-3.5 w-3.5" />
								</Button>
							)}
						</div>
					</SheetHeader>

					<div
						ref={scrollRef}
						className="flex-1 overflow-y-auto p-4 space-y-3"
					>
						{messages.length === 0 && (
							<div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
								<Bot className="h-8 w-8 opacity-30" />
								<p className="text-sm text-center">
									Ask me anything about your{" "}
									{context.type === "general"
										? "infrastructure"
										: context.type}
								</p>
								<div className="flex flex-wrap gap-1.5 justify-center">
									{(context.type === "application"
										? [
												"What's the status of this app?",
												"Why did the last build fail?",
												"Show me recent deployments",
												"Redeploy this app",
											]
										: context.type === "compose"
											? [
													"Show compose service status",
													"Why did the last deploy fail?",
													"Show me the domains",
													"Redeploy this service",
												]
											: context.type === "postgres" ||
												  context.type === "mysql" ||
												  context.type === "redis" ||
												  context.type === "mongo" ||
												  context.type === "mariadb" ||
												  context.type === "libsql"
												? [
														`Show ${context.type} status`,
														"What's the connection info?",
														"Show recent deployments",
														"Restart this database",
													]
												: context.type === "project"
													? [
															"How many services do I have?",
															"Show me all environments",
															"Which services are failing?",
														]
													: [
															"List all my projects",
															"Show project overview",
															"What servers do I have?",
														]
									).map((suggestion) => (
										<Button
											key={suggestion}
											variant="outline"
											size="sm"
											className="text-xs h-7 font-normal"
											onClick={() => setInput(suggestion)}
										>
											{suggestion}
										</Button>
									))}
								</div>
							</div>
						)}

						{messages.map((message) => {
							if (message.role === "user") {
								return (
									<div key={message.id} className="flex justify-end">
										<div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-muted">
											<p className="whitespace-pre-wrap">
												{message.parts
													.filter(
														(p): p is { type: "text"; text: string } =>
															p.type === "text",
													)
													.map((p) => p.text)
													.join("")}
											</p>
										</div>
									</div>
								);
							}

							return (
								<div key={message.id} className="flex justify-start">
									<div className="max-w-[90%] space-y-2">
										{message.parts.map((part, i) => {
											if (
												part.type === "text" &&
												(part as { text?: string }).text?.trim()
											) {
												return (
													<div
														key={`text-${message.id}-${i}`}
														className="rounded-lg border px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none break-words"
													>
														<ReactMarkdown>
															{(part as { text: string }).text}
														</ReactMarkdown>
													</div>
												);
											}

											if (part.type === "dynamic-tool") {
												return (
													<div
														key={part.toolCallId}
														className="rounded-lg border px-3 py-2"
													>
														<ToolCallDisplay
															toolCallId={part.toolCallId}
															toolName={part.toolName}
															state={part.state}
															output={
																part.state === "output-available"
																	? part.output
																	: undefined
															}
															onApprove={(id) =>
																addToolApprovalResponse({
																	id,
																	approved: true,
																})
															}
															onDeny={(id) =>
																addToolApprovalResponse({
																	id,
																	approved: false,
																	reason: "User denied",
																})
															}
														/>
													</div>
												);
											}

											if (part.type === "reasoning") {
												return (
													<Collapsible key={`reasoning-${message.id}-${i}`}>
														<CollapsibleTrigger asChild>
															<button
																type="button"
																className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
															>
																<Bot className="h-3 w-3" />
																<span>Thinking...</span>
																<ChevronDown className="h-3 w-3" />
															</button>
														</CollapsibleTrigger>
														<CollapsibleContent>
															<div className="mt-1 rounded-lg border px-3 py-2 text-xs text-muted-foreground italic">
																{(part as any).text ||
																	(part as any).reasoning}
															</div>
														</CollapsibleContent>
													</Collapsible>
												);
											}

											return null;
										})}
									</div>
								</div>
							);
						})}

						{isLoading && lastMessage?.role === "user" && (
							<div className="flex justify-start">
								<div className="rounded-lg border px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
									<Loader2 className="h-3 w-3 animate-spin" />
									Investigating...
								</div>
							</div>
						)}
					</div>

					<div className="border-t p-3 shrink-0 flex gap-2">
						<Textarea
							ref={inputRef}
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder={
								!isCloud && !aiId
									? "Select a provider first..."
									: "Ask anything..."
							}
							disabled={(!isCloud && !aiId) || isLoading}
							className="min-h-[40px] max-h-[120px] resize-none text-sm"
							rows={1}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									handleSend();
								}
							}}
						/>
						<Button
							type="button"
							size="icon"
							variant="outline"
							disabled={
								(!isCloud && !aiId) || !input.trim() || isLoading
							}
							className="shrink-0 h-10 w-10"
							onClick={handleSend}
						>
							<Send className="h-4 w-4" />
						</Button>
					</div>
				</SheetContent>
			</Sheet>
		</>
	);
}

function ToolCallDisplay({
	toolCallId,
	toolName,
	state,
	output,
	onApprove,
	onDeny,
}: {
	toolCallId: string;
	toolName: string;
	state: string;
	output?: unknown;
	onApprove?: (id: string) => void;
	onDeny?: (id: string) => void;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const isRunning =
		state === "input-streaming" || state === "input-available";
	const isDone = state === "output-available";
	const isError = state === "output-error";
	const needsApproval = state === "requires-approval";

	const outputText = output
		? typeof output === "string"
			? output
			: JSON.stringify(output, null, 2)
		: null;

	const displayName = toolName
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

	if (needsApproval) {
		return (
			<div className="flex items-center justify-between gap-2 text-xs">
				<div className="flex items-center gap-1.5">
					<Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
					<span>{displayName}</span>
				</div>
				<div className="flex gap-1.5 shrink-0">
					<Button
						variant="outline"
						size="sm"
						className="h-6 text-xs px-2"
						onClick={() => onApprove?.(toolCallId)}
					>
						<Check className="h-3 w-3 mr-1" />
						Approve
					</Button>
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-xs px-2"
						onClick={() => onDeny?.(toolCallId)}
					>
						<X className="h-3 w-3 mr-1" />
						Deny
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="flex items-start gap-1.5 text-xs">
			{isRunning ? (
				<Loader2 className="h-3 w-3 animate-spin text-muted-foreground mt-0.5 shrink-0" />
			) : isDone ? (
				<Check className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
			) : isError ? (
				<X className="h-3 w-3 text-destructive mt-0.5 shrink-0" />
			) : (
				<Wrench className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
			)}

			{outputText ? (
				<Collapsible open={isOpen} onOpenChange={setIsOpen}>
					<CollapsibleTrigger asChild>
						<button
							type="button"
							className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
						>
							<span>{displayName}</span>
							<ChevronDown
								className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
							/>
						</button>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<pre className="mt-1 p-2 bg-muted/50 rounded text-[10px] overflow-x-auto max-h-[150px] overflow-y-auto leading-tight">
							{outputText.length > 2000
								? `${outputText.slice(0, 2000)}\n... (truncated)`
								: outputText}
						</pre>
					</CollapsibleContent>
				</Collapsible>
			) : (
				<span className="text-muted-foreground">
					{isRunning ? `${displayName}...` : displayName}
				</span>
			)}
		</div>
	);
}
