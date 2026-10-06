// A dialog that fills the screen except for a small margin, for reading long
// documents (the QC report, a whole test plan). The overrides cover the
// dialog's own max width, which has a larger-screen variant of its own.
export const FULLSCREEN_DIALOG_CLASS =
	"w-[calc(100vw-3rem)] max-w-[calc(100vw-3rem)] sm:max-w-[calc(100vw-3rem)] h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] flex flex-col gap-3";
