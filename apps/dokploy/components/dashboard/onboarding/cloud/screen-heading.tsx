import type { ReactNode } from "react";
import { displayFont } from "../font";

interface Props {
	eyebrow: ReactNode;
	title: ReactNode;
	children?: ReactNode;
}

export const ScreenHeading = ({ eyebrow, title, children }: Props) => (
	<div className="flex flex-col gap-4">
		<span className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-primary">
			{eyebrow}
		</span>
		<h1
			className={`${displayFont.className} text-4xl sm:text-5xl leading-[1.05] tracking-tight`}
		>
			{title}
		</h1>
		{children && (
			<p className="text-muted-foreground text-lg max-w-lg leading-relaxed">
				{children}
			</p>
		)}
	</div>
);

export const BackLink = ({ onClick }: { onClick: () => void }) => (
	<button
		type="button"
		onClick={onClick}
		className="w-fit font-mono text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
	>
		← Back
	</button>
);
