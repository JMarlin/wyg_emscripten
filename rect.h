#ifndef RECT_H
#define RECT_H

typedef struct Rect {
    unsigned int top;
    unsigned int right;
    unsigned int bottom;
    unsigned int left;
    unsigned int id;
} Rect;

Rect* Rect_new(unsigned int top, unsigned int left, unsigned int bottom, unsigned int right);
void Rect_deleter(void* value, int count);

#endif //RECT_H
