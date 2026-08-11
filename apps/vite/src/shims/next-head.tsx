import * as React from "react";
import { useEffect } from "react";

const Head = ({ children }: { children?: React.ReactNode }) => {
	useEffect(() => {
		React.Children.forEach(children, (child) => {
			if (!React.isValidElement(child)) return;
			if (child.type === "title") {
				const titleChildren = (child.props as { children?: React.ReactNode })
					.children;
				const text = Array.isArray(titleChildren)
					? titleChildren.join("")
					: titleChildren;
				if (typeof text === "string") {
					document.title = text;
				}
			}
		});
	}, [children]);

	return null;
};

export default Head;
