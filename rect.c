#include <emscripten.h>
#include <stdlib.h>
#include "rect.h"

//Used to delete the elements of a list when those elements are 
void Rect_deleter(void* item, int count) {
	
        Rect* rect = (Rect*)item;

        EM_ASM_({console.log('Deleting rectangle ' + $0 + ' ( ' + $1  + ' left)');}, rect->id, count);
	free(item);
}

Rect* Rect_new(unsigned int top, unsigned int left, unsigned int bottom, unsigned int right) {
    
    static int next_id = 0;
    Rect* rect = (Rect*)malloc(sizeof(Rect));
    	
    if(!rect)
        return rect;
    
	rect->top = top;
	rect->left = left;
	rect->bottom = bottom;
	rect->right = right;
	rect->id = next_id++;

    return rect;
}
