export const resizeImage = (file: File, maxSize: number): Promise<string> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				let { width, height } = img;

				if (width > maxSize || height > maxSize) {
					if (width > height) {
						height = Math.round((height * maxSize) / width);
						width = maxSize;
					} else {
						width = Math.round((width * maxSize) / height);
						height = maxSize;
					}
				}

				const canvas = document.createElement("canvas");
				canvas.width = width;
				canvas.height = height;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					resolve(event.target?.result as string);
					return;
				}

				ctx.drawImage(img, 0, 0, width, height);
				resolve(canvas.toDataURL("image/webp", 0.8));
			};
			img.onerror = reject;
			img.src = event.target?.result as string;
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
};
