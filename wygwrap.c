#include "../p5-redux/P5OSPPB/mods/include/gfx.h"

typedef struct window {
    unsigned char active;
    unsigned char flags;
    unsigned int handle;
    unsigned int pid;
    bitmap* context;
    unsigned int w;
    unsigned int h;
    unsigned int x;
    unsigned int y;
    unsigned char needs_redraw;
    unsigned char* title;
    unsigned char frame_needs_redraw;
} window;

extern void moveMouse(short x_off, short y_off);
extern window* getWindowByHandle(unsigned int handle);
extern void moveHandle(unsigned int handle, unsigned short new_x, unsigned short new_y);
extern void markHandleVisible(unsigned int handle, unsigned char is_visible);
extern void drawHandle(unsigned int handle);
extern void raiseHandle(unsigned int handle);
extern void setWindowTitle(unsigned int handle, unsigned char* newstr);
extern void destroyHandle(unsigned int handle);
extern unsigned int newWindowHandle(unsigned int width, unsigned int height, unsigned char flags, unsigned int pid);

unsigned int createWindow(unsigned short width, unsigned short height, unsigned char flags) {

    return newWindowHandle((unsigned int)width, (unsigned int)height, (unsigned int)flags, 0);
}

unsigned int initWYG(void) {

    return 1;
}

void updateMouse(short x_off, short y_off) {

    moveMouse(x_off, y_off);
}

void getWindowDimensions(unsigned int handle, unsigned short *w, unsigned short *h) {

    window* temp_window = getWindowByHandle(handle);
    *w = (unsigned short)(temp_window->w & 0xFFFF);
    *h = (unsigned short)(temp_window->h & 0xFFFF);
}

void moveWindow(unsigned int handle, unsigned short x, unsigned short y) {

    moveHandle(handle, (unsigned int)x, (unsigned int)y);
}

void showWindow(unsigned int handle) {

    markHandleVisible(handle, 1);
}

void repaintWindow(unsigned int handle) {
  
    drawHandle(handle);
}

void focus(unsigned int handle) {

    raiseHandle(handle);
}

void setTitle(unsigned int handle, unsigned char* string) {

    setWindowTitle(handle, string);
}

void getWindowLocation(unsigned int handle, unsigned short* x, unsigned short* y) {

    window* temp_window = getWindowByHandle(handle);
    *x = (unsigned short)(temp_window->x & 0xFFFF);
    *y = (unsigned short)(temp_window->y & 0xFFFF);
}

void destroyWindow(unsigned int handle) {

    destroyHandle(handle);
}

void getFrameDims(unsigned char* top, unsigned char* left, unsigned char* bottom, unsigned char* right) {

    *top = 28;
    *left = 4;
    *bottom = 4;
    *right = 4;
}
