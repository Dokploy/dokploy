import { cn } from "@/lib/utils";

interface Props {
	className?: string;
	logoUrl?: string;
}

export const Logo = ({ className = "size-14", logoUrl }: Props) => {
	if (logoUrl) {
		return (
			// biome-ignore lint/performance/noImgElement: this is for dynamic logo loading
			<img
				src={logoUrl}
				alt="Organization Logo"
				className={cn(className, "object-contain rounded-sm")}
			/>
		);
	}

	return (
		<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" className={className}>
			<defs>
				<linearGradient id="gockerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
					<stop offset="0%" stopColor="#22d3ee" />
					<stop offset="100%" stopColor="#2563eb" />
				</linearGradient>
			</defs>
			<rect x="6" y="6" width="52" height="52" rx="14" fill="url(#gockerGradient)" />
			<path
				d="M42 24.5a13 13 0 1 0 0 15"
				fill="none"
				stroke="white"
				strokeWidth="6"
				strokeLinecap="round"
			/>
			<path
				d="M41.5 32h-9"
				fill="none"
				stroke="white"
				strokeWidth="6"
				strokeLinecap="round"
			/>
		</svg>
	);
};
