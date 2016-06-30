//This is the test harness version of the P5 lib
#include <emscripten.h>
#include "../p5-redux/P5OSPPB/mods/include/p5.h"
#include <stdlib.h>
#include <stdio.h>

int getMessage(message* msg) {
    
    //We don't emulate message passing
    return 1;
}


int getMessageFrom(message* msg, unsigned int source, unsigned int command) {

    //We don't emulate message passing
    return 1;
}


void postMessage(unsigned int ldest, unsigned int lcommand, unsigned int lpayload)  {

    //We don't emulate message passing
}

void resetPidSearch() {

}

unsigned int getNextPid() {

    return 0;
}

unsigned int getCurrentPid() {

    return 0;
}

unsigned int getProcessCPUUsage(unsigned int pid) {

    return 100;
}

unsigned int registerIRQ(unsigned int irq_number) {

    //We don't do IRQs, they will never work
    return 0;
}

//Sleep the process until the kernel passes it an interrupt message
void waitForIRQ(unsigned int irq_number) {

    while(1);
}

void pchar(char c) {

    putchar(c);
}


void terminate(void) {

}

int initMouse() {

    //Setup a function that stores mouse movement events 
    //into a buffer every time the mouse move event fires
    //on our canvas object
    EM_ASM(
        if(window.mchange === undefined) {
            window.mchange = false;
            window.mouse = {x: 0, y: 0, down: 0};
        }

        var canvas = document.getElementById('screen_canvas');

        canvas.addEventListener('mousemove', function(event) {
            
            var rect = canvas.getBoundingClientRect();

            window.mchange = true;
            window.mouse = {x: event.clientX - rect.left, y: event.clientY - rect.top, down: window.mouse.down}; 
        });

        canvas.addEventListener('mousedown', function(event) {
        
            window.mchange = true;
            window.mouse = {x: window.mouse.x, y: window.mouse.y, down: true};
        });

        canvas.addEventListener('mouseup', function(event) {
        
            window.mchange = true;
            window.mouse = {x: window.mouse.x, y: window.mouse.y, down: false}; 
        });
    );

    return 1;
}

int checkMouse(int *x, int *y, unsigned char* buttons) {

    if(!EM_ASM_INT({ if(window.mchange) return 1; else return 0; }, 0))
        return 0;

    *x = EM_ASM_INT({ return window.mouse.x }, 0);
    *y = EM_ASM_INT({ return window.mouse.y }, 0);
    *buttons = EM_ASM_INT({ return window.mouse.down ? 1 : 0 }, 0); 

    EM_ASM(window.mchange = false;);

    return 1;
}

int initKey() {

    //Setup a function that places key codes into a buffer
    //every time the key event fires on our canvas object
    EM_ASM(
        if(window.keyq === undefined)
            window.keyq = []; 

        document.addEventListener('keydown', function(event) {
            
            window.keyq.push(event.keyCode);
        });
    );

    return 1;
}

unsigned char getch() {

    //Get the most recent character from the queue or zero
    //if there are none
    return (unsigned char)EM_ASM_INT({
        if(window.keyq !== undefined && window.keyq.length > 0)
            return window.keyq.shift();
        else
            return 0;
    }, 0);
}


void clearScreen() {

}


unsigned int startProc(unsigned char* path) {

    return 0;
}


unsigned int startSuperProc(unsigned char* path) {

    return 0;
}


unsigned int startV86(unsigned char* path) {

    return 0;
}

void prints(char* s) {

EM_ASM_({console.log(Module.Pointer_stringify($0));}, s);

/*
    int index = 0;

    while(s[index] != 0) {
        pchar(s[index]);
        index++;
    }
*/
}

unsigned char digitToHex(unsigned char digit) {

    if(digit < 0xA) {
        return (digit + '0');
    } else {
        return ((digit - 0xA) + 'A');
    }
}


void printHexByte(unsigned char byte) {

    pchar(digitToHex((byte & 0xF0)>>4));
    pchar(digitToHex(byte & 0xF));
}


void printHexWord(unsigned short wd) {

    printHexByte((unsigned char)((wd & 0xFF00)>>8));
    printHexByte((unsigned char)(wd & 0xFF));
}


void printHexDword(unsigned int dword) {

    printHexWord((unsigned short)((dword & 0xFFFF0000)>>16));
    printHexWord((unsigned short)(dword & 0xFFFF));
}


unsigned int getBuildNumber(void) {

    return 0;
}

void* allocatePhysical(void* base_address, unsigned int byte_count) {

    return malloc(byte_count);
}

unsigned char freePhysical(void* base_address, unsigned int byte_count) {

    free(base_address);
    return 1;
}

void* getSharedPages(unsigned int count) {

    return malloc(count*4096);
}

void freeSharedPages(void* base) {
    
    free(base);
}

void* getSharedPage(void) {

    return malloc(4096);
}

/*
unsigned int sleep(unsigned int ms) {

    //Maybe I'll figure this out later
    return 1;
}
*/

unsigned int getImageSize(unsigned int pid) {

    return 0;
}

unsigned int appendPage(void) {

    return 1;
}

void printDecimal(unsigned int dword) {

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
        pchar(digit[j] + '0');
}

void sendString(unsigned char* s, unsigned int dest) {

    //don't implement
}

unsigned int getStringLength(unsigned int src) {
    
    //don't implement
    return 0;
}

void getString(unsigned int src, unsigned char* outstring, unsigned int count) {
    
    //Don't implement
}
