#include <emscripten.h>
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include "../p5-redux/P5OSPPB/mods/include/key.h"
#include "../p5-redux/P5OSPPB/mods/include/wyg.h"
#include "../p5-redux/P5OSPPB/mods/include/p5.h"
#include "../p5-redux/P5OSPPB/mods/include/gfx.h"

#undef main

//This way we get access to the entry point of WYG
extern void WYG_main(void);
extern unsigned char font_array[];
extern int initMouse(void);
extern int checkMouse(int* x, int* y, unsigned char *buttons);
extern void putMouse(int x, int y, unsigned char buttons);
extern void resizeWindowHandle(unsigned int handle, int w, int h);
extern void print_list();

void repaintAll(unsigned int handle);
void repaintRegion(unsigned int handle, unsigned int x, unsigned int y, unsigned int w, unsigned int h);
void drawCharacter(bitmap* b, char c, int x, int y, unsigned int color, int redraw);

unsigned short w, h;

unsigned char off_top, off_left, off_bottom, off_right;

int main(int argc, char** argv) {
	
	WYG_main();
	
	return 0;
}

#define CMD_COUNT 8

//Function declarations
int usrClear(void);
int consVer(void);
int usrExit(void);
int makeChild(void);
int closeChild(void);
int focusCmd(void);
int moveChild(void);
int moveMe(void);
void cmd_pchar(unsigned char c);
void cmd_prints(unsigned char* s);
void cmd_clear();
void cmd_init(unsigned int win);
void cmd_getCursor(unsigned char *x, unsigned char *y);
void cmd_putCursor(unsigned char x, unsigned char y);
void cmd_printHexByte(unsigned char byte);
void cmd_printHexWord(unsigned short wd);
void cmd_printHexDword(unsigned int dword);
void cmd_printDecimal(unsigned int dword);
void cmd_scans(int c, char* b);

//Typedefs
typedef int (*sys_command)(void);

//Variable declarations
char* cmdWord[CMD_COUNT] = {
    "CLR",
    "VER",
    "EXIT",
    "FOCUS",
    "MOV",
    "MOVME"
};

sys_command cmdFunc[CMD_COUNT] = {
    (sys_command)&usrClear,
    (sys_command)&consVer,
    (sys_command)&usrExit,
    (sys_command)&focusCmd,
    (sys_command)&moveChild,
    (sys_command)&moveMe
};

char inbuf[50];

int parse(char* cmdbuf) {

    int i, found;

    found = 0;
    for(i = 0; i < CMD_COUNT; i++) {

        if(!strcmp(cmdWord[i], cmdbuf)) {

            return cmdFunc[i]();
        }
    }

    cmd_prints("Unknown command ");
    cmd_prints(cmdbuf);
    cmd_prints("\n");
    
    return 0;
}

unsigned int window_a = 0, window_b = 0, main_panel_handle = 0, menu_panel_handle = 0;

int focusCmd() {
    
    focus(window_a);
    return 0;
}

unsigned int winx, winy;

extern void bmpDrawHLine(bitmap* bmp, int x, int y, int w, unsigned int c);
extern void bmpDrawVLine(bitmap* bmp, int x, int y, int h, unsigned int c);
void winDrawPanel(unsigned int handle, int x, int y, int width, int height, unsigned int color, int border_width, int invert) {

    bitmap* bmp = getWindowContext(handle);
    unsigned char r = RVAL(color);
    unsigned char g = GVAL(color);
    unsigned char b = BVAL(color);
    unsigned int light_color = RGB(r > 155 ? 255 : r + 100, g > 155 ? 255 : g + 100, b > 155 ? 255 : b + 100);
    unsigned int shade_color = RGB(r < 100 ? 0 : r - 100, g < 100 ? 0 : g - 100, b < 100 ? 0 : b - 100);
    unsigned int temp;
    int i;

    if(invert) {

        temp = shade_color;
        shade_color = light_color;
        light_color = temp;
    }

    for(i = y + border_width; i < height + y - border_width; i++) {

        bmpDrawHLine(bmp, x + border_width, i, width - (border_width * 2), color);
    }

    for(i = 0; i < border_width; i++) {

        bmpDrawHLine(bmp, x+i, y+i, width-(2*i), light_color);
        bmpDrawVLine(bmp, x+i, y+i+1, height-((i+1)*2), light_color);
        bmpDrawHLine(bmp, x+i, (y+height)-(i+1), width-(2*i), shade_color);
        bmpDrawVLine(bmp, x+width-i-1, y+i+1, height-((i+1)*2), shade_color);
    }

}

int moveChild() {
    
    if(!window_b) {
        
        cmd_prints("No window\n");
        return 0;
    }   
    
    winx += 20;
    winy += 20;
    moveHandle(window_b, winx, winy);
    
    return 0;
}

int moveMe() {

    static int moved = 0;

    if(!moved)
        moveHandle(window_a, 0, 0);
    else
        moveHandle(window_a, 54, 66);

    moved = !moved;
}

typedef struct Button_s {
    unsigned int win_handle;
    unsigned int x;
    unsigned int y;
    unsigned int width;
    unsigned int height;
    char* title;
} Button;

Button* p5_button = (Button*)0;
Button* win_button = (Button*)0;

Button* newButton(unsigned int handle, unsigned int height, unsigned int width, char* title) {

    Button* ret_button = (Button*)malloc(sizeof(Button));

    if(!ret_button)
        return ret_button;

    ret_button->x = 0;
    ret_button->y = 0;
    ret_button->height = height;
    ret_button->width = width;
    ret_button->title = title;
    ret_button->win_handle = handle;

    return ret_button;
}

void drawButton(Button* button, int pressed);

void moveButton(Button* button, unsigned int x, unsigned int y) {

    //Need to be able to call a parentWindowRepaintBackground()
    //method here for the old rect the button was previously
    //occupying
    //repaintRegion(button->win_handle, button->x, button->y, button->width, button->height);

    button->x = x;
    button->y = y;

    drawButton(button, 0);
}

unsigned int stringLength(char* s) {

    char* old_s = s;

    while(*(s++));

    return s - old_s;
}

void winDrawCharacter(unsigned int handle, char c, int x, int y, unsigned int color, int repaint) {

    bitmap* bmp = getWindowContext(handle);

    drawCharacter(bmp, c, x, y, color, repaint);
}

void drawButton(Button* button, int pressed) {
    
    int orig_len = 0;
   
    if(button->title)
        orig_len = stringLength(button->title);

    //Draw the basic button bevel
    winDrawPanel(main_panel_handle, button->x, button->y, button->width, button->height, RGB(238, 203, 137), 1, pressed);
    
    //Draw the button title centered if it has one
    if(orig_len) {

        //Limit displayed characters to the available width of the control
        int max_chars = (button->width / 8) - 3;
     
        //Make sure it doesn't become negative, and then clamp len to it
        max_chars = max_chars < 0 ? 0 : max_chars; 
        int len = orig_len > max_chars ? max_chars : orig_len;

        //Calculate text location
        int str_x = (button->x + (button->width / 2)) - ((len + (len == orig_len ? 0 : 3)) * 4);
        int str_y = (button->y + (button->height / 2)) - 6;

        //Draw base characters up to visibility limit
        int i;
        for(i = 0; i < len; i++)
            winDrawCharacter(main_panel_handle, button->title[i], str_x + (i*8), str_y, RGB(0, 0, 0), 0);

        //Draw ellipsis if the title is too wide
        if(len < orig_len) 
            for( ; i < len + 3; i++)
                winDrawCharacter(main_panel_handle, '.', str_x + (i*8), str_y, RGB(0, 0, 0), 0);
    }

    repaintRegion(main_panel_handle, button->x, button->y, button->width, button->height); 
}

//Called by wyg in the test harness
//Would be replaced in production by a
//message loop
void message_client(int handle, int x, int y, unsigned char buttons, unsigned char key, unsigned char evt) {

    static char is_down = 0, shown = 0, in_button = 0;

    if(handle == main_panel_handle) {

        if(evt == 1) {

        if(x >= p5_button->x && x <= (p5_button->x + p5_button->width) &&
           y >= p5_button->y && y <= (p5_button->y + p5_button->height)) {

            if(buttons & 1) {

                if((!is_down) && in_button) {

                    drawButton(p5_button, 1);
                    is_down = 1;
                }
            } else if(buttons & 2) {

                if(is_down) {

                    drawButton(p5_button, 0);

                    if(!win_button) {

                        resizeWindowHandle(main_panel_handle, 100, 130);
                        win_button = newButton(main_panel_handle, 30, 100, "Window B");
                        moveButton(win_button, 0, 100);
                        showWindow(menu_panel_handle);
                        moveHandle(main_panel_handle, w - 301, 1);
                        shown = 1;
                    } else {
    
                        if(shown) {

                            moveHandle(main_panel_handle, w - 101, 1);
                            hideWindow(menu_panel_handle);
                        } else {

                            moveHandle(main_panel_handle, w - 301, 1);
                            showWindow(menu_panel_handle);
                            //focus(window_b);
                        }

                        shown = !shown;
                    }

                    is_down = 0;
                }
            }
 
            in_button = 1;

        } else {

            in_button = 0;
 
            if(is_down) {

                is_down = !is_down;
                drawButton(p5_button, 0);
            }
        }
        } else if(evt = 2) {

           in_button = 0;
       
           if(is_down) {
 
                is_down = !is_down;
                drawButton(p5_button, 0);
            }
        }
    }
}

int closeChild() {
    
    if(window_b) {
     
        cmd_prints("Destroying window\n");   
        destroyWindow(window_b);
        window_b = 0;
        return 0;
    }
    
    cmd_prints("Window doesn't exist\n");
    
    return 0;
}

void input_loop();

unsigned int desktop = 0;

void makeWindows() {
    
    getFrameDims(&off_top, &off_left, &off_bottom, &off_right);
        
    getWindowDimensions(ROOT_WINDOW, &w, &h);

    main_panel_handle = createWindow(100, 100, WIN_FIXEDSIZE | WIN_UNDECORATED | WIN_NODRAG);

    menu_panel_handle = createWindow(200, h - 2, WIN_FIXEDSIZE | WIN_UNDECORATED | WIN_NODRAG);
    
    setTitle(main_panel_handle, "MainPanel");
        
    moveHandle(menu_panel_handle, w - 201, 1);
    moveHandle(main_panel_handle, w - 101, 1);

    winDrawPanel(menu_panel_handle, 0, 0, 200, h - 2, RGB(238, 203, 137), 1, 0);
    winDrawPanel(main_panel_handle, 0, 0, 100, 100, RGB(238, 203, 137), 1, 0);

    p5_button = newButton(main_panel_handle, 100, 100, "P5");
    moveButton(p5_button, 0, 0);
    
    hideWindow(menu_panel_handle);
    showWindow(main_panel_handle);

    repaintAll(main_panel_handle);    
        
    initKey();
    initMouse(); //Should be called in WYG, not here
    
    //Only for emscripten. Should be configurable via compiler directive
    //In real production, this would be a message loop waiting for
    //event messages passed back from WYG
    emscripten_set_main_loop(input_loop, 0, 1);
}

unsigned char temp_char = 0;
int inbuf_ptr = 0;
int finished = 0;

void input_loop() {

    int mouse_x, mouse_y;
    unsigned char buttons;
  
    //prints("::");
    //cmd_scans(50, inbuf);

    //Check the mouse
    if(checkMouse(&mouse_x, &mouse_y, &buttons)) {
       
        putMouse(mouse_x, mouse_y, buttons);
    }

    temp_char = getch();

    if(!temp_char)
        return;

    cmd_pchar(temp_char);

    if(temp_char == 0xA || temp_char == 0xD || inbuf_ptr == 49) {

        inbuf[inbuf_ptr] = 0;

        //If the command function returns 1 it signals that we need to exit
        if(parse(inbuf))
            finished = 1;

        inbuf[0] = 0;
        inbuf_ptr = 0;
        cmd_prints("::");

        if(finished)
            emscripten_cancel_main_loop();
    } else {

        inbuf[inbuf_ptr++] = temp_char;
    }
}

int usrClear(void) {

    cmd_clear();
    return 0;
}


int consVer(void) {

    cmd_prints("P5 usermode console build 1\n");
    cmd_prints("P5 build [need fmt print and P5 build number hook]\n");
    return 0;
}


int usrExit(void) {

    destroyWindow(window_a);
    return 1;
}

//Wrapper for setting the blit mask for the window bitmap to a specific region before requesting redraw
void repaintAll(unsigned int handle) {
    
    bitmap* h_bmp = getWindowContext(handle);

    //Set the blitting rect 
    h_bmp->top = 0;
    h_bmp->left = 0;
    h_bmp->bottom = h_bmp->height;
    h_bmp->right = h_bmp->width;   
    
    //Redraw 
    repaintWindow(handle);
}

//Wrapper for setting the blit mask for the window bitmap to a specific region before requesting redraw
void repaintRegion(unsigned int handle, unsigned int x, unsigned int y, unsigned int w, unsigned int h) {

    bitmap* h_bmp = getWindowContext(handle);

    //Set the blitting rect 
    h_bmp->top = y;
    h_bmp->left = x;
    h_bmp->bottom = y + h;
    h_bmp->right = x + w;   
    
    //Redraw 
    repaintWindow(handle); 
}

bitmap* cmd_bmp;
unsigned int cmd_window;
unsigned char cmd_x;
unsigned char cmd_y;
unsigned short cmd_bx, cmd_by; 
unsigned int cmd_width;
unsigned int cmd_height;
int cmd_max_chars;
int cmd_max_lines;

void drawCharacter(bitmap* b, char c, int x, int y, unsigned int color, int redraw) {
   
    int j, i;
    unsigned char line;
    c &= 0x7F; //Reduce to base ASCII set

    for(i = 0; i < 12; i++) {

        line = font_array[i * 128 + c];
        for(j = 0; j < 8; j++) {

            if(line & 0x80) b->data[(y + i)*b->width + (x + j)] = color;
            line = line << 1;
        }
    }
    
    if(redraw)
        repaintRegion(cmd_window, x, y, 8, 12);
}


void drawCharacterBold(bitmap* b, char c, int x, int y, unsigned int color, int redraw) {

    drawCharacter(b, c, x, y, color, redraw);
    drawCharacter(b, c, x+1, y, color, redraw);
    drawCharacter(b, c, x, y+1, color, redraw);
    drawCharacter(b, c, x+1, y+1, color, redraw);
}


void drawString(bitmap* b, char* str, int x, int y, unsigned int color, int redraw) {

    int i;

    for(i = 0; str[i]; i++) 
        drawCharacter(b, str[i], x+(i*8), y, color, redraw);
}

void cmd_getCursor(unsigned char *x, unsigned char *y) {

    *x = cmd_x;
    *y = cmd_y;
}

void cmd_putCursor(unsigned char x, unsigned char y) {

    cmd_x = x;
    cmd_y = y;
}

void cmd_pchar(unsigned char c) {

    if(c == '\n') {

        cmd_x = 0;
        cmd_y++;
    } else {
        
//        putchar(c);
        drawCharacter(cmd_bmp, c, (cmd_x*8) + off_left, (cmd_y*12) + off_top, RGB(0, 0, 0), 1);
        cmd_x++;

        if(cmd_x > cmd_max_chars) {

            cmd_x = 0;
            cmd_y++;
        }
    }
    
    //Should update this so it only repaints the section
    //of bitmap where the character was drawn    
    if(cmd_y > cmd_max_lines)
        cmd_clear();        
}

void cmd_prints(unsigned char* s) {

    while(*s)
        cmd_pchar(*s++);
}

void cmd_clear() {

    unsigned int x, y;

    printf("%i\n", cmd_width);

    for(y = 0; y < cmd_height; y++)
        for(x = 0; x < cmd_width; x++) {
            cmd_bmp->data[(y+off_top)*cmd_bmp->width + (x+off_left)] = RGB(255, 255, 255);
        }
            
    cmd_x = 0;
    cmd_y = 0;
    
    repaintAll(cmd_window);
    
    //Now clear to green temporarily to see what's getting repainted and where
    for(y = 0; y < cmd_height; y++)
        for(x = 0; x < cmd_width; x++)
            cmd_bmp->data[(y+off_top)*cmd_bmp->width + (x+off_left)] = RGB(0, 255, 0);
}

void cmd_printDecimal(unsigned int dword) {

    unsigned char digit[12];
    int i, j;

    i = 0;
    while(1) {

        if(!dword) {

            if(i == 0)
                digit[i++] = 0;

            break;
        }

        digit[i++] = dword % 10;
        dword /= 10;
    }

    for(j = i - 1; j >= 0; j--)
        cmd_pchar(digit[j] + '0');
}

void cmd_printHexByte(unsigned char byte) {

    cmd_pchar(digitToHex((byte & 0xF0)>>4));
    cmd_pchar(digitToHex(byte & 0xF));
}


void cmd_printHexWord(unsigned short wd) {

    cmd_printHexByte((unsigned char)((wd & 0xFF00)>>8));
    cmd_printHexByte((unsigned char)(wd & 0xFF));
}


void cmd_printHexDword(unsigned int dword) {

    cmd_printHexWord((unsigned short)((dword & 0xFFFF0000)>>16));
    cmd_printHexWord((unsigned short)(dword & 0xFFFF));
}

void cmd_scans(int c, char* b) {

    unsigned char temp_char;
    int index = 0;

    for(index = 0 ; index < c-1 ; ) {
        temp_char = getch();

        if(temp_char != 0) {
            b[index] = temp_char;
            cmd_pchar(b[index]);

            if(b[index] == '\n') {
                b[index] = 0;
                break;
            }

            index++;

            if(index == c-1)
                cmd_pchar('\n');
        }
    }

    b[index+1] = 0;
}


void cmd_init(unsigned int win) {
    
    cmd_window = win;
    cmd_bmp = getWindowContext(cmd_window);
    cmd_x = 0;
    cmd_y = 0;
    printf("%i:%i, %i\n", cmd_window, cmd_bmp->width, cmd_bmp->height);
    //getWindowDimensions(win, &cmd_bx, &cmd_by);
    cmd_width = cmd_bmp->width - (off_left + off_right);
    cmd_height = cmd_bmp->height - (off_top + off_bottom);
    cmd_max_chars = (cmd_width/8) - 1;
    cmd_max_lines = (cmd_height/12) - 1;
    print_list();
    cmd_clear();
}

void testMain() {
	
	makeWindows();
}
