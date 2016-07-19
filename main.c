
//------| Includes and externs exclusive to test harness |------//
#ifdef HARNESS_TEST
#include "../p5-redux/P5OSPPB/mods/include/gfx.h"
#include "../p5-redux/P5OSPPB/mods/include/p5.h"
#include "../p5-redux/P5OSPPB/mods/include/key.h"
#include <stdlib.h>
#include <memory.h>
#include <stdio.h>
#include <emscripten.h>
#include "../p5-redux/P5OSPPB/mods/include/wyg.h"
#define REGISTRAR_PID 0
#define REG_DEREGISTER 0
#define SVC_WYG 0
extern unsigned char font_array[];
extern void testMain();
#else 

//------| Includes and externs exclusive to production |------//
#include "../include/p5.h"
#include "../include/registrar.h"
#include "../include/gfx.h"
#include "../include/memory.h"
#include "../include/wyg.h"
#include "../include/key.h"
#include "../include/mouse.h"
#include "../vesa/font.h"
#endif //HARNESS_TEST

//------| Includes and externs common to all releases |------//
#include "list.h"
#include "rect.h"
#include "window.h"
#include "wygdebug.h"
#include "bmpdraw.h"

#define new(x) (((x)*)malloc(sizeof(x)))

void window_printer(void* value);

message temp_msg;

unsigned char inbuf[12];

Window *root_window, *mouse_window;
List* window_list;
unsigned char inited = 0;
bitmap* old_mouse_bkg;
unsigned short mouse_x;
unsigned short mouse_y;
unsigned char mouse_buffer_ok = 0;

unsigned int newWindowHandle(unsigned int width, unsigned int height, unsigned char flags, unsigned int pid) {
	
	Window* ret_window = newWindow(width, height, flags, pid);
	
	if(ret_window)
	    return ret_window->handle;
	
        return 0;
}

//Make this part of the WindowManager object?
window* getWindowByHandle(unsigned int handle) {
    
    Window* out_window;
    
    int i; 
    for(i = 0; i < window_list->count; i++) {

       out_window = (window*)List_get_at(window_list, i); 

	if(out_window->handle == handle) {

	    return out_window;
        }
    }
    
    return (Window*)0;
}

void resizeWindowHandle(unsigned int handle, int width, int height) {

    Window* win = getWindowByHandle(handle);

    if(!win)
        return;

    resizeWindow(win, width, height);
}

bitmap* getWindowContext(unsigned int handle) {
    
    Window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) {
     
        return (bitmap*)0;
    }
        
    return dest_window->context;
}

void moveHandle(unsigned int handle, unsigned short new_x, unsigned short new_y) {
    
    Window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) {
     
        //prints("[WYG] Couldn't find window to mark it visible\n");   
        return;
    }
       
    changeWindowPosition(dest_window, new_x, new_y);
}

void installWindow(unsigned int child_handle, unsigned int parent_handle) {
    
	//Right now, we removed all of the parent-child relationships in the window object,
	//so this doesn't really do anything. In the future, we should probably do 
	//something with it, though
}

void markHandleVisible(unsigned int handle, unsigned char is_visible) {
    
    Window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) {
     
        //prints("[WYG] Couldn't find window to mark it visible\n");   
        return;
    }
    
    markWindowVisible(dest_window, is_visible);
}

void markHandleDirty(unsigned int handle) {
    
    Window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) {
     
        //prints("[WYG] Couldn't find window to mark it dirty\n");   
        return;
    }
        
    dest_window->needs_redraw = 1;
    
    return;
}

void setWindowTitle(unsigned int handle, unsigned char* newstr) {
    
    Window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) {
     
        //prints("[WYG] Couldn't find window to mark it dirty\n");   
        return;
    }
    
    if(dest_window->title)
        free(dest_window->title);
        
    dest_window->title = newstr;
    
    drawTitlebar(dest_window, 1);
}

void drawHandle(unsigned int handle) {
    
    window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) {
     
         //prints("[WYG] Couldn't find the window to be raised\n");   
        return;
    }
    
    //Draw the window, assume we want to use the blit window set up by the client   
    drawWindow(dest_window, 1, window_list);
}

void raiseHandle(unsigned int handle) {

    //Can't raise the root or mouse windows
    if(handle == 1 || handle == 2)
        return;
    
    window* dest_window = getWindowByHandle(handle);

    if(!dest_window) {
     
         //prints("[WYG] Couldn't find the window to be raised\n");   
        return;
    }
    
    raiseWindow(dest_window);
}

void destroyHandle(unsigned int handle) {
    
    Window* dest_window = getWindowByHandle(handle);
    
    if(!dest_window) 
        return;
        
    destroyWindow(dest_window);
}

void exceptionHandler(void) {

/*	
	cons_init();
	cons_prints("Operating system raised an exception\n");
	cons_prints("There were ");
	cons_printDecimal(window_list->count);
	cons_prints(" windows installed:\n");
	List_print(window_list, window_printer);
*/
	while(1);
}

unsigned char mouse_down = 0;
window* drag_window = (window*)0;
window* last_mouse_window = (window*)0;
int drag_x, drag_y;

//Normally called by mouse_move in turn from the message loop,
//but directly called from the canvas event handler in the 
//test harness
//This could be spun out into a mouse class, perhaps?
#ifdef HARNESS_TEST
extern void message_client(int window, int mouse_x, int mouse_y, unsigned char buttons, unsigned char key, unsigned char evt); 
#endif
void putMouse(int x, int y, unsigned char buttons) {

    int i;
    static unsigned char old_buttons = 0;
    window* cur_window;
    window* over_window = (window*)0;

    changeWindowPosition(mouse_window, x, y);
    
    for(i = window_list->count -2; i > 0; i--) {
    
        cur_window = (window*)List_get_at(window_list, i);

        if(!cur_window || cur_window == root_window || cur_window == mouse_window || !(cur_window->flags & WIN_VISIBLE))
            continue;

        if(x >= cur_window->x &&
           x < cur_window->x + cur_window->w &&
           y >= cur_window->y &&
           y < cur_window->y + cur_window->h) {

            over_window = cur_window;
            break;
        }
    }

    if(buttons) {

        if(!mouse_down) {

            mouse_down = 1;
            if(over_window && y < over_window->y + FRAME_SIZE_TOP && !(over_window->flags & WIN_NODRAG)) {

                drag_window = over_window;
                drag_x = x - over_window->x;
                drag_y = y - over_window->y;
            }
        }
    } else {

        mouse_down = 0;
        drag_window = (window*)0;
    }

    if((!drag_window && over_window) || (over_window != last_mouse_window)) {

        int evt, handle, msg_x, msg_y, msg_btn;

        if(last_mouse_window && (over_window != last_mouse_window)) {

            message_client(last_mouse_window->handle, 0, 0, 0, ' ', 2);
        }

        if(!drag_window && over_window) {

#ifdef HARNESS_TEST
            message_client(over_window->handle, x - over_window->x, y - over_window->y, ((buttons && !old_buttons) ? 1 : 0) | ((!buttons && old_buttons) ? 2 : 0), ' ', 1);
#else
            postMessage(over_window->pid, 0, 0); //Need to specify a protocol for this
#endif //HARNESS_TEST
        }
    }

    if(mouse_down && drag_window) {
   
         changeWindowPosition(drag_window, x - drag_x, y - drag_y);
    }

    last_mouse_window = over_window;
    old_buttons = buttons;
}

//Should be called by the message loop when in situ
void moveMouse(short x_off, short y_off, unsigned char buttons) {

    mouse_x += x_off;
    mouse_y += y_off;

    if(mouse_x < 0)
        mouse_x = 0;

    if(mouse_x > root_window->w - 20)
        mouse_x = root_window->w - 20;

    if(mouse_y < 0)
        mouse_y = 0;
    
    if(mouse_y > root_window->h - 20)
        mouse_y = root_window->h - 20;

    putMouse(mouse_x, mouse_y, buttons); 
}

#define MOUSE_WIDTH 11
#define MOUSE_HEIGHT 18
#define MOUSE_BUFSZ (MOUSE_WIDTH * MOUSE_HEIGHT)
#define CA 0x0
#define CB 0xFFFFFF
#define CD 0xFF000000

unsigned int mouse_img[MOUSE_BUFSZ] = {
CA, CD, CD, CD, CD, CD, CD, CD, CD, CD, CD,
CA, CA, CD, CD, CD, CD, CD, CD, CD, CD, CD,
CA, CB, CA, CD, CD, CD, CD, CD, CD, CD, CD,
CA, CB, CB, CA, CD, CD, CD, CD, CD, CD, CD,
CA, CB, CB, CB, CA, CD, CD ,CD, CD, CD, CD,
CA, CB, CB, CB, CB, CA, CD, CD, CD, CD, CD,
CA, CB, CB, CB, CB, CB, CA, CD, CD, CD, CD,
CA, CB, CB, CB, CB, CB, CB, CA, CD, CD, CD,
CA, CB, CB, CB, CB, CB, CB, CB, CA, CD, CD,
CA, CB, CB, CB, CB, CB, CB, CB, CB, CA, CD,
CA, CB, CB, CB, CB, CB, CB, CB, CB, CB, CA,
CA, CA, CA, CA, CB, CB, CB, CA, CA, CA, CA,
CD, CD, CD, CD, CA, CB, CB, CA, CD, CD, CD,
CD, CD, CD, CD, CA, CB, CB, CA, CD, CD, CD,
CD, CD, CD, CD, CD, CA, CB, CB, CA, CD, CD,
CD, CD, CD, CD, CD, CA, CB, CB, CA, CD, CD,
CD, CD, CD, CD, CD, CD, CA, CB, CA, CD, CD,
CD, CD, CD, CD, CD, CD, CD, CA, CA, CD, CD 
};

void scans(int c, char* b) {

	unsigned char temp_char;
	int index = 0;

	for (index = 0; index < c - 1;) {
		temp_char = getch();

		if (temp_char != 0) {
			b[index] = temp_char;
			pchar(b[index]);

			if (b[index] == '\n') {
				b[index] = 0;
				break;
			}

			index++;

			if (index == c - 1)
				pchar('\n');
		}
	}

	b[index + 1] = 0;
}

void showModes(void) {


	unsigned short mode_count;
	unsigned short i;
	screen_mode* mode;

	prints("Enumerating modes...");
	mode_count = enumerateModes();
	prints("done\n");

	prints("\nAvailible modes:\n");
	for (i = 1; i <= mode_count; i++) {

		mode = getModeDetails(i);
		prints("    ");
		printDecimal((unsigned int)i);
		prints(") ");
		printDecimal((unsigned int)mode->width);
		pchar('x');
		printDecimal((unsigned int)mode->height);
		prints(", ");
		printDecimal((unsigned int)mode->depth);
		prints("bpp");

		if (mode->is_linear)
			prints(" linear");

		pchar('\n');
	}
}

#ifdef HARNESS_TEST
void WYG_main(void) {
#else 
void main(void) {
#endif //HARNESS_TEST

    unsigned int parent_pid;
    screen_mode* mode;
    unsigned short num;
    unsigned int current_handle;
    int i;
    window* temp_window;
    unsigned int src_pid;
    unsigned char* instr;
    unsigned int strlen;

#ifndef HARNESS_TEST

    //Get the 'here's my pid' message from init
    getMessage(&temp_msg);
    parent_pid = temp_msg.source;
    //prints("[WYG] Starting WYG GUI services.\n");

    //First thing, register as a WYG service with the registrar
    postMessage(REGISTRAR_PID, REG_REGISTER, SVC_WYG);
    getMessage(&temp_msg);

    if(!temp_msg.payload) {

        //prints("\n[WYG] failed to register WYG service.\n");
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    }

    if(!initKey()) {
        
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    }

    if(!initMouse()) {
        
        //Don't need to terminate, but do need to display a warning to the user
    }

#endif //HARNESS_TEST

    if(!initGfx()) {
        
        //prints("\n[WYG] failed to get the GFX server.\n");
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    }

#ifdef HARNESS_TEST

    num = 1;

#else

    //Prompt user for a screen mode
    showModes();
    prints("mode: ");
    scans(10, inbuf);
    num = inbuf[0] > '9' ? inbuf[0] - 'A' + 10 : inbuf[0] - '0';

#endif //HARNESS_TEST

    if(!setScreenMode(num)) {

        //prints("[WYG] Could not set screen mode.\n");
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    }

//    installExceptionHandler((void*)exceptionHandler);

    if(num) {

        mode = getModeDetails(num);
    } else {

        //prints("[WYG] Staying in text mode.\n");
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    }
    
	//cmd_init(mode->width, mode->height);
	
    if(!(window_list = List_new())) {
        
        prints("[WYG] Couldn't allocate window list.\n");
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    }
    
    //Init the root window (aka the desktop)
    root_window = newWindow(mode->width, mode->height, WIN_UNDECORATED | WIN_FIXEDSIZE | WIN_VISIBLE, 0);
	
    //Create a drawing context for the root window
    if(!root_window) {
        
        //prints("[WYG] Could not allocate a context for the root window.\n");
        //Need to do a list free here for the window_list
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0); //Tell the parent we're done registering
        terminate();
    } 

    //Set up the initial mouse position
    mouse_x = root_window->w / 2 - 1;
    mouse_y = root_window->h / 2 - 1;

    //Create the mouse window
    mouse_window = newWindow(MOUSE_WIDTH, MOUSE_HEIGHT, WIN_UNDECORATED | WIN_FIXEDSIZE | WIN_VISIBLE, 0);

    //Fail if the mouse couldn't be created
    if(!mouse_window) {
        
        postMessage(REGISTRAR_PID, REG_DEREGISTER, SVC_WYG);
        postMessage(parent_pid, 0, 0);
        terminate();
    }

    changeWindowPosition(mouse_window, mouse_x, mouse_y);

    postMessage(parent_pid, 0, 1); //Tell the parent we're done registering

    //Paint the initial scene
    for(i = 0; i < root_window->w * root_window->h; i++)
        root_window->context->data[i] = RGB(11, 162, 193);

    //Paint the mouse cursor
    mouse_window->context->mask_color = CD;

    for(i = 0; i < MOUSE_BUFSZ; i++)
        mouse_window->context->data[i] = mouse_img[i];
    
    drawWindow(root_window, 0);
    drawWindow(mouse_window, 0);
	        
    //Start debug console
    //init(root_window.w, 48);

#ifdef HARNESS_TEST

    //enter the testing code
    testMain();
    endGfx();
    return;

#else 
    
	cons_init();
	
    //Now we can start the main message loop 
	//cmd_prints("Wyg started");
    while(1) {

        //prints("[WYG] Waiting for message...");
        getMessage(&temp_msg);
        //prints("got message ");
         //printDecimal(temp_msg.command);
        ////pchar('\n');

        src_pid = temp_msg.source;

        switch(temp_msg.command) {

            case WYG_CREATE_WINDOW:
			    //cmd_prints("Request to create a new window");
                postMessage(src_pid, WYG_CREATE_WINDOW, (unsigned int)newWindowHandle((temp_msg.payload & 0xFFF00000) >> 20, (temp_msg.payload & 0xFFF00) >> 8, temp_msg.payload & 0xFF, src_pid));
            break;
            
            case WYG_GET_CONTEXT:
                postMessage(src_pid, WYG_GET_CONTEXT, (unsigned int)getWindowContext(temp_msg.payload));
            break;
            
            case WYG_GET_DIMS:
                temp_window = getWindowByHandle(temp_msg.payload);
                postMessage(src_pid, WYG_GET_DIMS, (unsigned int)((((temp_window->w & 0xFFFF) << 16)) | (temp_window->h & 0xFFFF)));
            break;
            
            case WYG_GET_LOCATION:
                temp_window = getWindowByHandle(temp_msg.payload);
                postMessage(src_pid, WYG_GET_LOCATION, (unsigned int)((((temp_window->x & 0xFFFF) << 16)) | (temp_window->y & 0xFFFF)));
            break;
            
            case WYG_MOVE_WINDOW:
                current_handle = temp_msg.payload;
                getMessageFrom(&temp_msg, src_pid, WYG_POINT);
                moveHandle(current_handle, (temp_msg.payload & 0xFFFF0000) >> 16, temp_msg.payload & 0xFFFF);
            break;

            case WYG_INSTALL_WINDOW:
                current_handle = temp_msg.payload;
                getMessageFrom(&temp_msg, src_pid, WYG_WHANDLE);
                installWindow(current_handle, temp_msg.payload);
            break;

            case WYG_SHOW_WINDOW:
                markHandleVisible(temp_msg.payload, 1);
            break;
            
            case WYG_RAISE_WINDOW:
                raiseHandle(temp_msg.payload);
            break;

            case WYG_REPAINT_WINDOW:
                drawHandle(temp_msg.payload);
                postMessage(src_pid, WYG_REPAINT_WINDOW, 1);
            break;

            case WYG_SET_TITLE:
                current_handle = temp_msg.payload;
                postMessage(src_pid, WYG_SET_TITLE, 1);
                strlen = getStringLength(src_pid);
                instr = (unsigned char*)malloc(strlen);
                getString(src_pid, instr, strlen);
                setWindowTitle(current_handle, instr);
            break;
            
            case WYG_DESTROY:
                destroyHandle(temp_msg.payload);
                postMessage(src_pid, WYG_DESTROY, 1);
            break;
            
            case WYG_GET_FRAME_DIMS:
                postMessage(src_pid, WYG_GET_FRAME_DIMS, (FRAME_SIZE_TOP << 24) | (FRAME_SIZE_LEFT << 16) | (FRAME_SIZE_BOTTOM << 8) | (FRAME_SIZE_RIGHT));
            break;

            case MOUSE_SEND_UPDATE:
                setColor(RGB(255, 0, 0));
                displayString(0, 0, "GOT A MOUSE EVENT!");
                while(1);
            break;

            default:
            break;
        }
    }
    
#endif //HARNESS_TEST
    
}
