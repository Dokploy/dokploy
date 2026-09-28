import type { Tailwind } from "@react-email/components";
import type { ComponentProps } from "react";

type TailwindConfig = NonNullable<ComponentProps<typeof Tailwind>["config"]>;

export const emailTailwindConfig: TailwindConfig = {
	theme: {
		extend: {
			colors: {
				brand: "#007291",
			},
		},
	},
};
