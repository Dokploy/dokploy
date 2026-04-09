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
		if (query.applicationId && typeof query.applicationId === "string") {
			return { type: "application" as const, id: query.applicationId };
		}
		if (query.composeId && typeof query.composeId === "string") {
			return { type: "compose" as const, id: query.composeId };
		}
		if (query.projectId && typeof query.projectId === "string") {
			return { type: "project" as const, id: query.projectId };
		}
		return { type: "general" as const, id: "" };
	}, [query.applicationId, query.composeId, query.projectId, pathname]);
}

export function ChatPanel() {
	const [open, setOpen] = useState(false);
	const [aiId, setAiId] = useState<string>("");
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const context = useChatContext();
	const aiIdRef = useRef(aiId);
	const contextRef = useRef(context);
	aiIdRef.current = aiId;
	contextRef.current = context;

	const { data: providers } = api.ai.getEnabledProviders.useQuery(undefined, {
		refetchOnWindowFocus: false,
	});

	const enabledProviders = providers ?? [];

	const { messages, sendMessage, status, setMessages } = useChat({
		id: "dokploy-chat",
		transport: new DefaultChatTransport({
			api: "/api/ai/chat",
			body: () => ({ aiId: aiIdRef.current, context: contextRef.current }),
		}),
	});

	const isLoading = status === "streaming" || status === "submitted";

	useEffect(() => {
		if (!aiId && enabledProviders.length > 0 && enabledProviders[0]) {
			setAiId(enabledProviders[0].aiId);
		}
	}, [enabledProviders, aiId]);

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages, status]);

	if (enabledProviders.length === 0) return null;

	const handleSend = () => {
		if (!input.trim() || !aiId || isLoading) return;
		sendMessage({ text: input });
		setInput("");
	};

	const contextLabel =
		context.type === "general"
			? "General"
			: context.type;

	// Check if the AI is currently in a tool-calling phase (no text yet, just tools)
	const lastMessage = messages[messages.length - 1];
	const isThinking =
		isLoading &&
		lastMessage?.role === "assistant" &&
		lastMessage.parts.every(
			(p) => p.type !== "text" || !(p as { text?: string }).text?.trim(),
		);

	return (
		<>
			<Button
				onClick={() => setOpen(true)}
				className="fixed bottom-6 right-6 z-50 h-12 w-12 rounded-full shadow-lg"
				size="icon"
			>
				<Bot className="h-5 w-5" />
			</Button>

			<Sheet open={open} onOpenChange={setOpen}>
				<SheetContent
					side="right"
					className="w-full sm:w-[480px] p-0 flex flex-col"
				>
					<SheetHeader className="px-4 py-3 border-b shrink-0">
						<div className="flex items-center justify-between">
							<div className="flex items-center gap-2">
								<Bot className="h-4 w-4" />
								<SheetTitle className="text-base">AI Assistant</SheetTitle>
								{isLoading && (
									<Badge variant="secondary" className="text-xs animate-pulse">
										thinking...
									</Badge>
								)}
							</div>
						</div>
						<SheetDescription className="sr-only">
							Chat with AI to manage your infrastructure
						</SheetDescription>
						<div className="flex items-center gap-2 pt-1">
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
							<Badge variant="outline" className="text-xs shrink-0 capitalize">
								{contextLabel}
							</Badge>
							{messages.length > 0 && (
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 shrink-0"
									onClick={() => setMessages([])}
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
								<Bot className="h-10 w-10 opacity-50" />
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
										: context.type === "project"
											? [
													"How many services do I have?",
													"Show me all environments",
													"Which services are failing?",
												]
											: [
													"List all my projects",
													"Show project overview",
												]
									).map((suggestion) => (
										<Button
											key={suggestion}
											variant="outline"
											size="sm"
											className="text-xs h-7"
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
										<div className="max-w-[85%] rounded-lg px-3 py-2 text-sm bg-primary text-primary-foreground">
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

							// Assistant message
							const toolParts = message.parts.filter(
								(p) => p.type === "dynamic-tool",
							);
							const textParts = message.parts.filter(
								(p) => p.type === "text" && (p as { text?: string }).text?.trim(),
							);

							return (
								<div key={message.id} className="flex justify-start">
									<div className="max-w-[90%] space-y-2">
										{/* Tool calls section */}
										{toolParts.length > 0 && (
											<div className="rounded-lg border border-dashed px-3 py-2 space-y-1">
												{toolParts.map((part) => {
													if (part.type !== "dynamic-tool") return null;
													return (
														<ToolCallDisplay
															key={part.toolCallId}
															toolName={part.toolName}
															state={part.state}
															output={
																part.state === "output-available"
																	? part.output
																	: undefined
															}
														/>
													);
												})}
											</div>
										)}

										{/* Text response */}
										{textParts.map((part, i) => {
											if (part.type !== "text") return null;
											const text = (part as { text: string }).text;
											if (!text.trim()) return null;
											return (
												<div
													key={`text-${message.id}-${i}`}
													className="rounded-lg bg-muted px-3 py-2 text-sm prose prose-sm dark:prose-invert max-w-none break-words"
												>
													<ReactMarkdown>{text}</ReactMarkdown>
												</div>
											);
										})}
									</div>
								</div>
							);
						})}

						{/* Loading indicator when waiting for first response */}
						{isLoading &&
							lastMessage?.role === "user" && (
								<div className="flex justify-start">
									<div className="rounded-lg border border-dashed px-3 py-2 flex items-center gap-2 text-xs text-muted-foreground">
										<Loader2 className="h-3 w-3 animate-spin" />
										Investigating...
									</div>
								</div>
							)}
					</div>

					<div className="border-t p-3 shrink-0 flex gap-2">
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder={
								aiId ? "Ask anything..." : "Select a provider first..."
							}
							disabled={!aiId || isLoading}
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
							disabled={!aiId || !input.trim() || isLoading}
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
	toolName,
	state,
	output,
}: {
	toolName: string;
	state: string;
	output?: unknown;
}) {
	const [isOpen, setIsOpen] = useState(false);
	const isRunning =
		state === "input-streaming" || state === "input-available";
	const isDone = state === "output-available";
	const isError = state === "output-error";

	const outputText = output
		? typeof output === "string"
			? output
			: JSON.stringify(output, null, 2)
		: null;

	// Format tool name for display: "application-one" → "Application One"
	const displayName = toolName
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

	return (
		<div className="flex items-start gap-1.5 text-xs">
			{isRunning ? (
				<Loader2 className="h-3 w-3 animate-spin text-muted-foreground mt-0.5 shrink-0" />
			) : isDone ? (
				<Check className="h-3 w-3 text-green-500 mt-0.5 shrink-0" />
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
						<pre className="mt-1 p-2 bg-background rounded text-[10px] overflow-x-auto max-h-[150px] overflow-y-auto leading-tight">
							{outputText.length > 2000
								? `${outputText.slice(0, 2000)}\n... (truncated)`
								: outputText}
						</pre>
					</CollapsibleContent>
				</Collapsible>
			) : (
				<span className="text-muted-foreground">
					{isRunning ? `Calling ${displayName}...` : displayName}
				</span>
			)}
		</div>
	);
}
