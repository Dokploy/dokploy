"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

interface WhitelabelingPreviewProps {
	config: {
		appName?: string;
		logoUrl?: string;
		primaryColor?: string;
		footerText?: string;
	};
}

export function WhitelabelingPreview({ config }: WhitelabelingPreviewProps) {
	const appName = config.appName || "Dokploy";
	const primaryColor = config.primaryColor || "hsl(var(--primary))";

	return (
		<Card className="bg-transparent">
			<CardHeader>
				<CardTitle>Live Preview</CardTitle>
				<CardDescription>
					A quick preview of how your branding changes will look.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="rounded-lg border overflow-hidden">
					{/* Simulated sidebar header */}
					<div className="flex items-center gap-3 p-4 border-b bg-sidebar">
						{config.logoUrl ? (
							<img
								src={config.logoUrl}
								alt="Preview Logo"
								className="size-8 rounded-sm object-contain"
							/>
						) : (
							<div
								className="size-8 rounded-sm flex items-center justify-center text-white font-bold text-sm"
								style={{ backgroundColor: primaryColor }}
							>
								{appName.charAt(0).toUpperCase()}
							</div>
						)}
						<span className="font-semibold text-sm">{appName}</span>
					</div>

					{/* Simulated content area */}
					<div className="p-4 bg-background">
						<div className="flex items-center gap-2 mb-3">
							<div
								className="h-2 w-16 rounded-full"
								style={{ backgroundColor: primaryColor }}
							/>
							<div className="h-2 w-24 rounded-full bg-muted" />
						</div>
						<div className="flex gap-2">
							<div
								className="px-3 py-1.5 rounded-md text-xs text-white font-medium"
								style={{ backgroundColor: primaryColor }}
							>
								Button
							</div>
							<div className="px-3 py-1.5 rounded-md text-xs border font-medium">
								Secondary
							</div>
						</div>
					</div>

					{/* Simulated footer */}
					{config.footerText && (
						<div className="px-4 py-2 border-t text-xs text-muted-foreground text-center bg-sidebar">
							{config.footerText}
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
