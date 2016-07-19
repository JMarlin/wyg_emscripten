void bmpDrawHLine(bitmap* bmp, int x, int y, int length, unsigned int color) {

	int i, endx;

	endx = x + length;

	for (i = x; i < endx; i++)
		bmp->data[y*bmp->width + i] = color;
}

void bmpDrawVLine(bitmap* bmp, int x, int y, int length, unsigned int color) {

	int i, endy;

	endy = length + y;

	for (i = y; i < endy; i++)
		bmp->data[i*bmp->width + x] = color;
}

void bmpDrawRect(bitmap* bmp, int x, int y, int width, int height, unsigned int color) {

	bmpDrawHLine(bmp, x, y, width, color);
	bmpDrawVLine(bmp, x, y, height, color);
	bmpDrawHLine(bmp, x, y + height - 1, width, color);
	bmpDrawVLine(bmp, x + width - 1, y, height, color);
}

void bmpFillRect(bitmap* bmp, int x, int y, int width, int height, unsigned int color) {

	int j, i;
	int endx, endy;

	endx = width + x;
	endy = height + y;

	for (i = y; i < endy; i++) {

		for (j = x; j < endx; j++) {

			bmp->data[i*bmp->width + j] = color;
		}
	}
}

void bmpDrawCharacter(bitmap* bmp, unsigned char c, int x, int y, unsigned int color) {

	int j, i;
	unsigned char line;
	c &= 0x7F; //Reduce to base ASCII set

	for (i = 0; i < 12; i++) {

		//prints("Reading a line from font cache...");
		line = font_array[i * 128 + c];
		//prints("done\n");
		for (j = 0; j < 8; j++) {

			if (line & 0x80) bmp->data[(y + i)*bmp->width + (x + j)] = color;
			line = line << 1;
		}
	}
}

void displayString(int x, int y, unsigned char* s) {

	while ((*s)) {

		setCursor(x, y);
		drawChar(*(s++));

		x += 8;
	}
}

void bmpDrawPanel(bitmap* bmp, int x, int y, int width, int height, unsigned int color, int border_width, int invert) {

	unsigned char r = RVAL(color);
	unsigned char g = GVAL(color);
	unsigned char b = BVAL(color);
	unsigned int light_color = RGB(r > 155 ? 255 : r + 100, g > 155 ? 255 : g + 100, b > 155 ? 255 : b + 100);
	unsigned int shade_color = RGB(r < 100 ? 0 : r - 100, g < 100 ? 0 : g - 100, b < 100 ? 0 : b - 100);
	unsigned int temp;
	int i;

	if (invert) {

		temp = shade_color;
		shade_color = light_color;
		light_color = temp;
	}

	for (i = 0; i < border_width; i++) {

		//Top edge
		bmpDrawHLine(bmp, x + i, y + i, width - (2 * i), light_color);

		//Left edge
		bmpDrawVLine(bmp, x + i, y + i + 1, height - ((i + 1) * 2), light_color);

		//Bottom edge
		bmpDrawHLine(bmp, x + i, (y + height) - (i + 1), width - (2 * i), shade_color);

		//Right edge
		bmpDrawVLine(bmp, x + width - i - 1, y + i + 1, height - ((i + 1) * 2), shade_color);
	}
}