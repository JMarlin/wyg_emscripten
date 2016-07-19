unsigned int cons_x, cons_y;
unsigned int cons_max_c, cons_max_l;

void cons_init() {

	cons_x = 0;

	if (inited)
		cons_y = 1;
	else
		cons_y = 0;

	cons_max_c = root_window->w / 8;
	cons_max_l = (root_window->h / 12) - cons_y;
}

void cons_putc(char c) {

	if (cons_y >= cons_max_l)
		return;

	if (c == '\n') {

		cons_x = 0;
		cons_y++;
		return;
	}

	drawCharacter(c, cons_x * 8, cons_y * 12, RGB(0, 0, 0));

	cons_x++;

	if (cons_x >= cons_max_c) {
		cons_x = 0;
		cons_y++;
	}
}

void cons_prints(char* s) {

	while (*s)
		cons_putc(*(s++));
}

void cons_printDecimal(unsigned int dword) {

	unsigned char digit[12];
	int i, j;

	i = 0;
	while (1) {

		if (!dword) {

			if (i == 0)
				digit[i++] = 0;

			break;
		}

		digit[i++] = dword % 10;
		dword /= 10;
	}

	for (j = i - 1; j >= 0; j--)
		cons_putc(digit[j] + '0');
}

void cons_printHexByte(unsigned char byte) {

	cons_putc(digitToHex((byte & 0xF0) >> 4));
	cons_putc(digitToHex(byte & 0xF));
}


void cons_printHexWord(unsigned short wd) {

	cons_printHexByte((unsigned char)((wd & 0xFF00) >> 8));
	cons_printHexByte((unsigned char)(wd & 0xFF));
}


void cons_printHexDword(unsigned int dword) {

	cons_printHexWord((unsigned short)((dword & 0xFFFF0000) >> 16));
	cons_printHexWord((unsigned short)(dword & 0xFFFF));
}