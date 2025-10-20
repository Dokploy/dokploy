"use client";

import { Button } from "@/components/ui/button";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Bot, Send, Sparkles, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { api } from "@/utils/api";
import { toast } from "sonner";

interface Message {
	id: string;
	role: "user" | "assistant";
	content: string;
	timestamp: Date;
	actions?: Array<{
		type: string;
		description: string;
		status: "pending" | "executing" | "completed" | "failed";
	}>;
}

export const WoapAIChat = () => {
	const [open, setOpen] = useState(false);
	const [messages, setMessages] = useState<Message[]>([
		{
			id: "welcome",
			role: "assistant",
			content:
				"Hey there! I'm your WOAP AI assistant. I can help you:\n\n• Create databases (PostgreSQL, MySQL, MongoDB, Redis)\n• Deploy applications from Git\n• Configure domains and SSL\n• Set up Docker services\n• Manage backups and monitoring\n\nJust tell me what you need in plain English!",
			timestamp: new Date(),
		},
	]);
	const [input, setInput] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const sendMessageMutation = api.ai.chat.useMutation({
		onSuccess: (response) => {
			const assistantMessage: Message = {
				id: Date.now().toString(),
				role: "assistant",
				content: response.message,
				timestamp: new Date(),
				actions: response.actions,
			};
			setMessages((prev) => [...prev, assistantMessage]);
			setIsLoading(false);
		},
		onError: (error) => {
			toast.error("AI Error", {
				description: error.message || "Failed to get AI response",
			});
			setIsLoading(false);
		},
	});

	const handleSend = async () => {
		if (!input.trim() || isLoading) return;

		const userMessage: Message = {
			id: Date.now().toString(),
			role: "user",
			content: input,
			timestamp: new Date(),
		};

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsLoading(true);

		// Send to AI backend
		sendMessageMutation.mutate({
			message: input,
			conversationHistory: messages.map((m) => ({
				role: m.role,
				content: m.content,
			})),
		});
	};

	const handleKeyPress = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSend();
		}
	};

	useEffect(() => {
		if (scrollRef.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	const quickActions = [
		"Create a PostgreSQL database",
		"Deploy a Node.js app from GitHub",
		"Set up Redis for caching",
		"Add SSL to my domain",
	];

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>
				<Button
					size="lg"
					className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-all duration-200 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 z-50"
					aria-label="Open WOAP AI Assistant"
				>
					<Sparkles className="h-6 w-6" />
				</Button>
			</SheetTrigger>

			<SheetContent
				side="right"
				className="w-full sm:max-w-xl p-0 flex flex-col"
			>
				<SheetHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20">
					<div className="flex items-center gap-3">
						<div className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center">
							<Bot className="h-6 w-6 text-white" />
						</div>
						<div>
							<SheetTitle className="text-xl">WOAP AI Assistant</SheetTitle>
							<SheetDescription>
								Build your backend with conversation
							</SheetDescription>
						</div>
					</div>
				</SheetHeader>

				{/* Messages Area */}
				<ScrollArea className="flex-1 p-6" ref={scrollRef}>
					<div className="space-y-4">
						{messages.map((message) => (
							<div
								key={message.id}
								className={cn(
									"flex gap-3 animate-in slide-in-from-bottom-2",
									message.role === "user" ? "flex-row-reverse" : "flex-row",
								)}
							>
								{message.role === "assistant" && (
									<div className="h-8 w-8 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
										<Bot className="h-5 w-5 text-white" />
									</div>
								)}

								<div
									className={cn(
										"rounded-lg px-4 py-3 max-w-[85%]",
										message.role === "user"
											? "bg-primary text-primary-foreground ml-auto"
											: "bg-muted",
									)}
								>
									<p className="text-sm whitespace-pre-wrap leading-relaxed">
										{message.content}
									</p>

									{message.actions && message.actions.length > 0 && (
										<div className="mt-3 space-y-2">
											{message.actions.map((action, idx) => (
												<div
													key={idx}
													className="flex items-center gap-2 text-xs text-muted-foreground"
												>
													<div
														className={cn(
															"h-2 w-2 rounded-full",
															action.status === "completed" &&
																"bg-green-500",
															action.status === "executing" &&
																"bg-yellow-500 animate-pulse",
															action.status === "failed" && "bg-red-500",
															action.status === "pending" && "bg-gray-400",
														)}
													/>
													<span>{action.description}</span>
												</div>
											))}
										</div>
									)}

									<span className="text-xs opacity-70 mt-2 block">
										{message.timestamp.toLocaleTimeString()}
									</span>
								</div>
							</div>
						))}

						{isLoading && (
							<div className="flex gap-3 animate-in slide-in-from-bottom-2">
								<div className="h-8 w-8 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
									<Bot className="h-5 w-5 text-white" />
								</div>
								<div className="rounded-lg px-4 py-3 bg-muted">
									<Loader2 className="h-4 w-4 animate-spin" />
								</div>
							</div>
						)}
					</div>
				</ScrollArea>

				{/* Quick Actions */}
				{messages.length <= 1 && (
					<div className="px-6 py-3 border-t bg-muted/30">
						<p className="text-xs font-medium mb-2 text-muted-foreground">
							Quick actions:
						</p>
						<div className="flex flex-wrap gap-2">
							{quickActions.map((action, idx) => (
								<Button
									key={idx}
									variant="outline"
									size="sm"
									className="text-xs"
									onClick={() => setInput(action)}
								>
									{action}
								</Button>
							))}
						</div>
					</div>
				)}

				{/* Input Area */}
				<div className="p-4 border-t bg-background">
					<div className="flex gap-2">
						<Textarea
							placeholder="Ask me anything... (Press Enter to send, Shift+Enter for new line)"
							value={input}
							onChange={(e) => setInput(e.target.value)}
							onKeyDown={handleKeyPress}
							className="min-h-[60px] resize-none"
							disabled={isLoading}
						/>
						<Button
							size="icon"
							onClick={handleSend}
							disabled={!input.trim() || isLoading}
							className="h-[60px] w-[60px] bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
						>
							{isLoading ? (
								<Loader2 className="h-5 w-5 animate-spin" />
							) : (
								<Send className="h-5 w-5" />
							)}
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
};
