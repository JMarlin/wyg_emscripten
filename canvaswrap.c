#include <emscripten.h>

unsigned char* screen_buffer = (unsigned char*)0;
int screen_width, screen_height;

void init_screen(int x_resolution, int y_resolution) {

    if(screen_buffer)
        free(screen_buffer);

    screen_buffer = (unsigned char*)

    EM_ASM(
        var screen;
         
        if(screen = document.getElementById('screen_canvas'))
            screen.parentElement.removeChild(screen);

        window.screen_buffer = screen.get

        screen = document.createElement('canvas');
        screen.id = 'screen_canvas';
        screen.width = window.innerWidth;
        screen.height = window.innerHeight;
        document.body.appendChild(screen); 
        
        window.addEventListener('resize', function() {
            screen.width = window.innerWidth;
            screen.height = window.innerHeight;
        });
    );    
}



void main() {

    init_screen();
}
