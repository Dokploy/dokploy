import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
	return (
		<Html lang="en" className="font-sans">
			<Head>
				{/* Default favicon; WhitelabelHead overrides with key="favicon" when custom favicon is set */}
			</Head>
			<body className="flex h-full w-full flex-col font-sans">
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
