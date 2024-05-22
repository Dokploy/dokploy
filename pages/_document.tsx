import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
	return (
		<Html lang="en" className="font-sans">
			<Head />

			<body className="flex h-full flex-col font-sans">
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
