import { Head, Html, Main, NextScript } from "next/document";
export default function Document() {
	return (
		<Html lang="en">
			<Head>
				<link rel="shortcut icon" href="/icon.svg" />
				<link rel="preconnect" href="https://fonts.googleapis.com" />
				<link rel="preconnect" href="https://fonts.gstatic.com" />
				<link
					href="https://fonts.googleapis.com/css2?family=Inter:wght@100;400;500;600;700&display=swap"
					rel="stylesheet"
				/>
			</Head>

			<body className="flex h-full flex-col ">
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
