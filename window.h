#define FRAME_SIZE_TOP 28
#define FRAME_SIZE_LEFT 4
#define FRAME_SIZE_BOTTOM 4
#define FRAME_SIZE_RIGHT 4

typedef struct Window_s {
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
} Window;

Window* newWindow(unsigned int width, unsigned int height, unsigned char flags, unsigned int pid);
void resizeWindow(Window* win, int width, int height);
void updateOverlapped(Rect* window_bounds, Window* avoid_window);
void changeWindowPosition(Window* dest_window, unsigned short new_x, unsigned short new_y);
void markWindowVisible(Window* dest_window, unsigned char is_visible);
void window_printer(void* value);
void window_deleter(void* item);
void drawFrame(Window* cur_window);
void drawTitlebar(Window* cur_window, int do_refresh);
void drawWindow(window* cur_window, unsigned char use_current_blit, List* window_list);
void drawWindowIntersects(window* cur_window, unsigned char use_current_blit);
void drawOccluded(Window* win, Rect* baserect, List* splitrect_list);
void drawBmpRect(Window* win, Rect* r);

//These functions might be better suited to apply to a WindowManager class which can be
//spun out on its own and be the parent of all Window objects
List* getOverlappingWindows(int lowest_z_level, Rect* baserect, List* window_list);
void raiseWindow(window* dest_window, List* window_list);
void destroyWindow(Window* dest_window, List* window_list);

//Maybe this better belongs in the rect class?
List* splitRect(Rect* rdest, Rect* rknife);
