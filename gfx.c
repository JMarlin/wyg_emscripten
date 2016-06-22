#include "../p5-redux/P5OSPPB/mods/include/p5.h"
#include "../p5-redux/P5OSPPB/mods/include/gfx.h"
#include <stdlib.h>
#include <stdio.h>
#include <emscripten.h>
#include "../p5-redux/P5OSPPB/mods/vesa/font.h" 

screen_mode mode_details;

unsigned int pen_x = 0;
unsigned int pen_y = 0;
unsigned int pen_color = 0;

unsigned char initGfx() {    
    
    EM_ASM(
        var screen;

        if(screen = document.getElementById('screen_canvas'))
            screen.parentElement.removeChild(screen);

        screen = document.createElement('canvas');
        screen.width = 800;
        screen.height = 600;
        window.screen_ctx = screen.getContext('2d');
        document.body.appendChild(screen);
    );
            
    return 1;
}

void endGfx() {
    
    //Don't need to do anything
}

//Simply returns the number of modes supported
unsigned char enumerateModes() {

    return (unsigned char)(1);
}

screen_mode* getModeDetails(unsigned short modenum) {

    if(!modenum)
        return (screen_mode*)0;

    //Unpack the passed values
    mode_details.width = 800;
    mode_details.height = 600;

    //The bit of math in here is representative of the fact that we support 8-bit
    //16-bit, 24-bit or 32-bit color
    mode_details.depth = 32;
    mode_details.is_linear = 1;
    mode_details.number = 0; //Only the server cares about this

    return &mode_details;
}

unsigned char setScreenMode(unsigned short modenum) {
    
    //Later maybe we'll try to set the window size dynamically later
    return 1;
}

void setColor(unsigned int color) {

    pen_color = color;
    
    EM_ASM({
        window.screen_ctx.strokeStyle = 'rgb(' + $0 + ',' + $1 + ',' + $2 + ',0)';
        window.screen_ctx.fillStyle = window.screen_ctx.strokeStyle;
    }, RVAL(color), GVAL(color), BVAL(color));
}

void setCursor(unsigned short x, unsigned short y) {

    pen_x = x;
    pen_y = y;
}

void setPixel() {

    EM_ASM({
       var data = window.screen_ctx.getImageData(0, 0, 800, 600);
       var i = ($0 + $1 * 800) * 4;
       data.data[i + 0] = $2;
       data.data[i + 1] = $3;
       data.data[i + 2] = $4;
       data.data[i + 3] = 255;
       window.screen_ctx.putImageData(data, 0, 0);
    }, pen_x, pen_y, RVAL(pen_color), GVAL(pen_color), BVAL(pen_color)); 
}

void drawHLine(unsigned short length) {

    EM_ASM({
        window.screen_ctx.beginPath();
        window.screen_ctx.moveTo($0, $1);
        window.screen_ctx.lineTo($0 + $2 - 1, $1);
        ctx.stroke();
    }, pen_x, pen_y, length);
}

void drawVLine(unsigned short length) {

    EM_ASM({
        window.screen_ctx.beginPath();
        window.screen_ctx.moveTo($0, $1);
        window.screen_ctx.lineTo($0, $1 + $2 - 1);
    }, pen_x, pen_y, length);
}

void drawRect(unsigned short width, unsigned short height) {

    EM_ASM({
        window.screen_ctx.rect($0, $1, $2, $3);
        window.screen_ctx.stroke();
    }, pen_x, pen_y, width, height);
}

void fillRect(unsigned short width, unsigned short height) {

    EM_ASM({
        window.screen_ctx.fillRect($0, $1, $2, $3);
    }, pen_x, pen_y, width, height);
}

void drawChar(char c) {

    int j, i;
    unsigned int old_x, old_y;
    unsigned char line;

    c = c & 0x7F; //Reduce to base ASCII set
    old_x = pen_x;
    old_y = pen_y;

    for(i = 0; i < 12; i++) {

        line = font_array[i * 128 + c];
        for(j = 0; j < 8; j++) {

            if(line & 0x80) {
                pen_x = old_x + j;
                pen_y = old_y + i;
                setPixel();
            }

            line = line << 1;
        }
    }
    
    pen_x = old_x;
    pen_y = old_y;
}

void drawStr(char* str) {

    //Not implemented in production code, so not implemented here
}

bitmap* newBitmap(unsigned int width, unsigned int height) {
    
    unsigned int bmp_size = width * height;
    unsigned int bufsz = (bmp_size *  sizeof(unsigned int)) + sizeof(bitmap);
    bitmap* return_bmp;
    unsigned int i;
        
    if(!(return_bmp = (bitmap*)malloc(bufsz)))
        return (bitmap*)0;
    
    //Set dimensions    
    return_bmp->height = height;
    return_bmp->width = width;
    
    //Default the window to max
    return_bmp->top = 0;
    return_bmp->left = 0;
    return_bmp->bottom = return_bmp->height;
    return_bmp->right = return_bmp->width;
    
    //Plug in the data region
    return_bmp->data = (unsigned int*)((unsigned char*)return_bmp + sizeof(bitmap));
    
    //Clear the bitmap
    for(i = 0; i < bmp_size; i++) {
            
        return_bmp->data[i] = 0;
    }
        
    return return_bmp;
}

void freeBitmap(bitmap* bmp) {
    
    free((void*)bmp);
}

void drawBitmap(bitmap* bmp) {
    
    SDL_Rect srcrect, destrect;
    
    srcrect.x = bmp->left;
    srcrect.y = bmp->top;
    int width = bmp->right - bmp->left + 1;
    int height = bmp->bottom - bmp->top + 1; 
    
    EM_ASM({
        window.imgdata = new ImageData($0, $1);
    }, width, height);

    int srcx, srcy;
    unsigned int color;

    for(srcy = 0; srcy < height; srcy++) {
        for(srcx = 0; srcx < width; srcx++) {
      
             color = bmp->data[(srcx + bmp->left) + ((srcy + bmp->top) * bmp->width)];
             
             EM_ASM({
                 var i = ($1 + ($2 * $0)) * 4;
                 window.imgdata.data[i + 0] = $3;
                 window.imgdata.data[i + 1] = $4;
                 window.imgdata.data[i + 2] = $5;
                 window.imgdata.data[i + 3] = 255;
             }, width, srcx, srcy, RVAL(color), GVAL(color), BVAL(color));
        }
    }

    EM_ASM({
        window.screen_ctx.putImageData(window.imgdata, $0, $1);
    }, pen_x, pen_y);
}

void copyScreen(bitmap* bmp) {
    
    //Not implemented yet (semi-large pita)
    /*
    unsigned int color;
    
    pixrect.x = pen_x;
    pixrect.y = pen_y;
    pixrect.w = bmp->width;
    pixrect.h = bmp->height;
    
    SDL_RenderReadPixels(renderer, &pixrect, SDL_PIXELFORMAT_ARGB8888, (void*)(bmp->data), 4*pixrect.w);
    */
}
