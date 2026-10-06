import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Official brand marks of the Devino products Dokploy Community integrates
 * with, as inline SVG so they need no network request and follow the
 * dashboard's light/dark theme. Each one is the product's own app-icon tile
 * (a rounded square with its mark), so it reads on both themes without
 * recolouring. Sources (read-only copies, SVGO-style minified, viewBox kept):
 *
 * - Uptimely  uptimely/apps/landing/src/app/icon.svg
 * - Snapvisor snapvisor/apps/frontend/public/favicon.svg
 * - DoDomain  dodomain/apps/web/src/app/icon.svg (the dock key mark; its
 *   prefers-color-scheme rule is replaced by theme tokens so it follows the
 *   dashboard theme instead of the OS)
 * - Sendly    sendly/packages/brand/assets/logo.svg (the "S" is outlined from
 *   the brand's Newsreader Italic 500, OFL, so no web font is needed)
 * - Notifly   notifly/apps/dashboard/public/favicon.svg
 */
interface LogoProps {
	className?: string;
}

const RING = "ring-1 ring-black/10 dark:ring-white/15";

export const UptimelyLogo = ({ className }: LogoProps) => (
	<svg
		viewBox="0 0 512 512"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Uptimely"
		className={cn("size-8 rounded-[19%]", RING, className)}
	>
		<rect width="512" height="512" rx="96" fill="#F6F4EE" />
		<g transform="translate(73 73) scale(.23)">
			<path
				fill="#0F1E2D"
				d="M682.964 1.00018L683.001 349.499C683.057 349.503 798.112 349.507 798.168 349.511C1017.36 364.566 1236 516.391 1236 801C1236 801.643 1236 802.285 1236 802.927C1234.96 1049.46 1034.78 1249 788.002 1249C503.503 1249 351.685 1030.53 336.53 811.42C336.52 811.28 339.002 696 339.002 696L0.00212174 692C0.00212174 692 0.00173999 801.649 0.00212531 801.999C0.54208 1243.37 346.508 1601 788.002 1601C788.334 1601 788.666 1601 788.998 1601L789.001 1601C1228.79 1600.52 1587.99 1241.7 1588 802.014C1588 802.009 1588 802.005 1588 802C1588 801.667 1588 801.333 1588 801C1588 360.504 1234.4 2.62164 794.451 1.0035L682.964 1.00018Z"
			/>
			<circle fill="#1CB78B" cx="802" cy="770" r="178" />
			<path fill="#0F1E2D" d="M682 347.5L339.12 0H0V347.5L339.12 695V347.5H682Z" />
		</g>
	</svg>
);

export const SnapvisorLogo = ({ className }: LogoProps) => (
	<svg
		viewBox="0 0 512 512"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Snapvisor"
		className={cn("size-8 rounded-[18%]", RING, className)}
	>
		<rect width="512" height="512" rx="92" fill="#0D0F14" />
		<g transform="translate(81.49 71.68) scale(.332708)">
			<path
				fill="#F3F3F3"
				d="M1046.67 -0.0017889C1054.94 19.4945 1033.95 107.624 1025.85 129.26C979.122 253.982 885.776 342.06 768.115 397.642C781.566 412.165 793.908 427.675 805.056 444.035C860.026 525.615 875.865 620.916 856.937 716.754C910.738 643.757 943.16 569.619 971.546 484.455C969.212 552.511 955.255 619.665 930.297 683.008C879.166 809.471 780.186 910.606 654.882 964.365C467.114 1043.28 262.783 959.987 184.103 771.869C150.188 818.283 120.138 869.286 92.1028 919.41C57.8058 982.734 29.7779 1041.86 -0.000361406 1107.13C3.21818 1070.98 12.1425 1021.55 19.9071 985.338C52.8063 831.874 103.877 603.657 206.456 482.879C291.231 383.062 487.939 284.775 608.16 241.393C525.155 291.348 415.166 364.855 349.095 437.216C399.912 405.491 432.007 387.9 487.312 362.496C647.114 289.094 835.722 240.52 966.375 117.852C1002.03 84.371 1026.34 43.4935 1046.67 -0.0017889Z"
			/>
			<path
				fill="#151826"
				d="M561.225 480.476C591.045 468.32 621.087 456.663 651.307 445.518C669.182 438.765 692.4 430.662 709.214 422.612C770.476 483.283 805.417 551.878 805.744 639.852C805.781 718.254 774.694 793.461 719.348 848.925C664.01 904.545 588.654 935.563 510.205 934.996C440.788 934.676 360.723 905.634 311.955 855.444C281.336 823.948 264.598 781.494 265.481 737.571C266.116 694.226 284.028 652.935 315.236 622.875C326.265 612.227 339.492 601.777 351.536 592.126L561.225 480.476Z"
			/>
			<path
				fill="#F5A623"
				d="M366.505 729.115C339.88 685.679 339.911 641.068 351.42 592.803C351.618 591.971 352.18 591.255 352.934 590.852L560.626 479.938C561.386 479.533 562.306 479.468 563.11 479.774C594.732 491.801 611.42 506.456 634.338 531.617C658.737 562.562 667.342 581.17 673.856 617.706C677.349 636.103 675.602 659.235 671.556 677.395C661.74 721.36 634.75 759.555 596.601 783.457C558.932 806.759 513.559 814.194 470.41 804.133C427.187 793.948 389.793 766.951 366.505 729.115Z"
			/>
		</g>
	</svg>
);

export const DoDomainLogo = ({ className }: LogoProps) => {
	const maskId = `dodomain-dock-${useId().replace(/:/g, "")}`;
	return (
		<svg
			viewBox="0 0 32 32"
			xmlns="http://www.w3.org/2000/svg"
			role="img"
			aria-label="DoDomain"
			className={cn("size-8", className)}
		>
			<mask
				id={maskId}
				maskUnits="userSpaceOnUse"
				maskContentUnits="userSpaceOnUse"
			>
				<rect width="32" height="32" fill="#fff" />
				<circle cx="26" cy="26" r="5.2" fill="#000" />
			</mask>
			<rect
				x="3"
				y="3"
				width="26"
				height="26"
				rx="7"
				className="fill-foreground"
				mask={`url(#${maskId})`}
			/>
			<g transform="translate(1.65 3.33) scale(.88)">
				<path
					className="fill-background"
					d="M8 8.4h3c4.4 0 7.2 2.4 7.2 6s-2.8 6-7.2 6H8v-12Z"
				/>
				<path
					className="fill-foreground"
					d="M11 11.6h.4c2.3 0 3.7 1.2 3.7 2.8s-1.4 2.8-3.7 2.8H11v-5.6Z"
				/>
				<rect
					className="fill-background"
					x="16.8"
					y="12.8"
					width="7.8"
					height="3.3"
				/>
				<rect
					className="fill-background"
					x="20.4"
					y="14.7"
					width="2.5"
					height="3.5"
				/>
			</g>
			<circle cx="26" cy="26" r="3.25" fill="#0e6b4e" />
		</svg>
	);
};

export const SendlyLogo = ({ className }: LogoProps) => (
	<svg
		viewBox="6 6 44 44"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Sendly"
		className={cn("size-8", className)}
	>
		<circle
			cx="28"
			cy="28"
			r="20"
			fill="none"
			stroke="#c14a1f"
			strokeWidth="1.5"
			strokeDasharray="2 3"
			strokeLinecap="round"
		/>
		<circle cx="28" cy="28" r="16" fill="#c14a1f" />
		<path
			fill="#f6f1e7"
			d="[exited with code 0]"
		/>
	</svg>
);

export const NotiflyLogo = ({ className }: LogoProps) => (
	<svg
		viewBox="0 0 512 512"
		xmlns="http://www.w3.org/2000/svg"
		role="img"
		aria-label="Notifly"
		className={cn("size-8 rounded-[19%]", className)}
	>
		<rect width="512" height="512" rx="96" fill="#E5443C" />
		<g transform="translate(87.5 72) scale(.33)">
			<path
				opacity=".55"
				fill="#fff"
				d="M510.955 0C619.276 94.7673 670.938 152.672 735.772 283.855C817.524 449.267 792.095 454.181 879.978 672.689C967.861 891.196 1021 921.828 1021 921.828C1021 921.828 704.212 915.701 610.198 991.26C563.457 1028.83 510.955 1115 510.955 1115V0Z"
			/>
			<path
				fill="#fff"
				d="M510.045 0C401.724 94.7673 350.062 152.672 285.228 283.855C203.476 449.267 228.905 454.181 141.022 672.689C53.1387 891.196 4.2815e-05 921.828 4.2815e-05 921.828C4.2815e-05 921.828 316.788 915.701 410.802 991.26C457.543 1028.83 510.045 1115 510.045 1115V0Z"
			/>
		</g>
	</svg>
);
