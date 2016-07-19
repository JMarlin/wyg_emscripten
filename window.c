#include "window.h"
#include "rect.h"
#include "list.h"

Window* newWindow(unsigned int width, unsigned int height, unsigned char flags, unsigned int pid) {

	static int next_handle = 1;
	Window *new_window, *temp_window;
	unsigned int i, bufsz;

	if (!(new_window = (Window*)malloc(sizeof(window)))) {

		printf("Coudln't allocate a new window structure");
		return 0;
	}

	new_window->active = 1;
	new_window->pid = pid;
	new_window->flags = flags;
	new_window->x = 0;
	new_window->y = 0;
	new_window->w = width;
	new_window->h = height;
	new_window->title = (unsigned char*)0;
	new_window->frame_needs_redraw = 1;

	//Create a drawing context for the new window
	if (!(new_window->context = newBitmap(new_window->w, new_window->h))) {

		free((void*)new_window);
		printf("Couldn't allocate bitmap area for new window");
		return (window*)0;
	}

	bufsz = new_window->w * new_window->h;

	//Clear new window to white
	for (i = 0; i < bufsz; i++)
		new_window->context->data[i] = RGB(255, 255, 255);

	new_window->handle = next_handle++;

	if (mouse_window)
		List_pop(window_list, (void*)mouse_window);

	//De-activate the old active window
	if (temp_window = (window*)List_get_at(window_list, window_list->count - (mouse_window ? 2 : 1))) {

		temp_window->active = 0;
	}

	if (!List_add(window_list, (void*)new_window)){

		freeBitmap(new_window->context);
		free((void*)new_window);

		//re-activate the old active window
		if (temp_window)
			temp_window->active = 1;

		return (window*)0;
	}

	//Give the new window its initial decoration
	if (!(new_window->flags & WIN_UNDECORATED))
		drawFrame(new_window);

	drawWindow(new_window, 0);

	//Update the titlebar on the old active window 
	if (temp_window)
		drawTitlebar(temp_window, 1);

	if (mouse_window) {

		List_add(window_list, mouse_window);
		drawWindow(mouse_window, 0);
	}

	return new_window;
}

void resizeWindow(Window* win, int width, int height) {

	bitmap* new_context = newBitmap(width, height);

	if (!new_context)
		return;

	int copy_w = width < win->w ? width : win->w;
	int copy_h = height < win->h ? height : win->h;

	win->w = width;
	win->h = height;

	int x, y;
	for (y = 0; y < copy_h; y++)
	for (x = 0; x < copy_w; x++)
		new_context->data[y*new_context->width + x] = win->context->data[y*win->context->width + x];

	freeBitmap(win->context);
	win->context = new_context;

	drawWindow(win, 0);
}

//Redraws every window intersected by window_bounds
void updateOverlapped(Rect* window_bounds, Window* avoid_window) {

	int i = 0;
	Rect comp_rect, draw_rect;
	window* cur_window;

	//prints("[WYG] Looking for previously overlapped windows\n");

	for (i = 0; i < window_list->count; i++) {

		cur_window = (Window*)List_get_at(window_list, i);

		if (!cur_window || cur_window == avoid_window)
			continue;

		comp_rect.top = cur_window->y;
		comp_rect.left = cur_window->x;
		comp_rect.bottom = comp_rect.top + cur_window->h - 1;
		comp_rect.right = comp_rect.left + cur_window->w - 1;

		if ((cur_window->flags & WIN_VISIBLE) &&
			window_bounds->left <= comp_rect.right &&
			window_bounds->right >= comp_rect.left &&
			window_bounds->top <= comp_rect.bottom &&
			window_bounds->bottom >= comp_rect.top) {

			if (window_bounds->top < comp_rect.top)
				draw_rect.top = comp_rect.top;
			else
				draw_rect.top = window_bounds->top;

			if (window_bounds->left < comp_rect.left)
				draw_rect.left = comp_rect.left;
			else
				draw_rect.left = window_bounds->left;

			if (window_bounds->bottom > comp_rect.bottom)
				draw_rect.bottom = comp_rect.bottom;
			else
				draw_rect.bottom = window_bounds->bottom;

			if (window_bounds->right > comp_rect.right)
				draw_rect.right = comp_rect.right;
			else
				draw_rect.right = window_bounds->right;

			cur_window->context->top = draw_rect.top - cur_window->y;
			cur_window->context->left = draw_rect.left - cur_window->x;
			cur_window->context->bottom = draw_rect.bottom - cur_window->y;
			cur_window->context->right = draw_rect.right - cur_window->x;
			drawWindow(cur_window, 1);
		}
	}
}

void changeWindowPosition(Window* dest_window, unsigned short new_x, unsigned short new_y) {

	Rect overlap_rect;

	//If a window is moved, we must ensure that it is the active window 
	markWindowVisible(dest_window, 1);
	raiseWindow(dest_window);

	//Create a rectangle covering the old location for later intersection
	overlap_rect.top = dest_window->y;
	overlap_rect.left = dest_window->x;
	overlap_rect.bottom = overlap_rect.top + dest_window->h - 1;
	overlap_rect.right = overlap_rect.left + dest_window->w - 1;

	dest_window->x = new_x;
	dest_window->y = new_y;

	//Need to update the screen if we're visible    
	if (dest_window->flags & WIN_VISIBLE) {

		//Should update this so that we don't redraw stuff that's going to
		//be under the window's new location because we're going to draw
		//over that when we draw the window at the new location anyhow     
		updateOverlapped(&overlap_rect, dest_window); //Redraw all of the siblings that this window was covering up

		//Redraw the window at its new location
		dest_window->frame_needs_redraw = 1;
		drawWindow(dest_window, 0);
	}

	return;
}

void markWindowVisible(Window* dest_window, unsigned char is_visible) {

	unsigned char was_visible;
	Rect overlap_rect;

	was_visible = dest_window->flags & WIN_VISIBLE;

	if (!!was_visible && !!is_visible)
		return;

	if (is_visible) {

		dest_window->flags |= WIN_VISIBLE;
		drawWindow(dest_window, 0);
	}
	else {

		dest_window->flags &= ~((unsigned char)WIN_VISIBLE);
		overlap_rect.top = dest_window->y;
		overlap_rect.left = dest_window->x;
		overlap_rect.bottom = overlap_rect.top + dest_window->h - 1;
		overlap_rect.right = overlap_rect.left + dest_window->w - 1;
		updateOverlapped(&overlap_rect, dest_window); //Redraw all of the siblings that this window was covering up
	}

	return;
}

void window_printer(void* value) {

	Window* win = (window*)value;

	//Do debug printing here
}

void window_deleter(void* item) {

	window* win = (window*)item;

	//Free the context
	freeBitmap((void*)win->context);

#ifndef HARNESS_TEST    
	//Free the title (if we ever decide to error on unsuccessful frees, this could be an issue for static or undefined titles)
	if (win->title)
		free((void*)win->title);
#endif //HARNESS_TEST

	//And finally free ourself 
	free((void*)win);
}

void drawTitlebar(Window* cur_window, int do_refresh) {

	unsigned char* s;
	unsigned int tb_color, text_color;
	Rect old_ctx_rect;

	if (cur_window->flags & WIN_UNDECORATED)
		return;

	//Titlebar
	if (cur_window->active)
		tb_color = RGB(182, 0, 0);
	else
		tb_color = RGB(238, 203, 137);

	bmpFillRect(cur_window->context, 4, 4, cur_window->w - 28, 20, tb_color);

	//Window title
	if (cur_window->title) {

		int base_x, base_y, off_x, titlebar_width;

		s = cur_window->title;
		base_x = 7;
		base_y = 9;
		off_x = 0;
		titlebar_width = cur_window->w - 28;

		if (cur_window->active)
			text_color = RGB(255, 255, 255);
		else
			text_color = RGB(138, 103, 37);

		while (*s) {

			bmpDrawCharacter(cur_window->context, *(s++), base_x + off_x, base_y, text_color);
			off_x += 8;

			//Truncate the text if it's wider than the titlebar
			if (off_x >= titlebar_width)
				break;
		}
	}

	if (do_refresh) {

		old_ctx_rect.top = cur_window->context->top;
		old_ctx_rect.left = cur_window->context->left;
		old_ctx_rect.bottom = cur_window->context->bottom;
		old_ctx_rect.right = cur_window->context->right;

		cur_window->context->top = 4;
		cur_window->context->left = 4;
		cur_window->context->bottom = 23;
		cur_window->context->right = cur_window->w - 26;

		drawWindow(cur_window, 1);

		cur_window->context->top = old_ctx_rect.top;
		cur_window->context->left = old_ctx_rect.left;
		cur_window->context->bottom = old_ctx_rect.bottom;
		cur_window->context->right = old_ctx_rect.right;
	}
}

void drawFrame(Window* cur_window) {

	int i;


	//prints("[WYG] Drawing frame for window ");
	//printDecimal(cur_window->handle);
	//pchar('\n');

	//Outer border
	bmpDrawPanel(cur_window->context, 0, 0, cur_window->w, cur_window->h, RGB(238, 203, 137), 1, 0);

	//Title border
	bmpDrawPanel(cur_window->context, 3, 3, cur_window->w - 6, 22, RGB(238, 203, 137), 1, 1);

	//Body border
	bmpDrawPanel(cur_window->context, 3, 27, cur_window->w - 6, cur_window->h - 30, RGB(238, 203, 137), 1, 1);

	//Left frame
	bmpFillRect(cur_window->context, 1, 1, 2, cur_window->h - 2, RGB(238, 203, 137));

	//Right frame
	bmpFillRect(cur_window->context, cur_window->w - 3, 1, 2, cur_window->h - 2, RGB(238, 203, 137));

	//Top frame
	bmpFillRect(cur_window->context, 3, 1, cur_window->w - 6, 2, RGB(238, 203, 137));

	//Mid frame
	bmpFillRect(cur_window->context, 3, 25, cur_window->w - 6, 2, RGB(238, 203, 137));

	//Bottom frame
	bmpFillRect(cur_window->context, 3, cur_window->h - 3, cur_window->w - 6, 2, RGB(238, 203, 137));

	//Button
	bmpDrawPanel(cur_window->context, cur_window->w - 24, 4, 20, 20, RGB(238, 203, 137), 1, 0);
	bmpFillRect(cur_window->context, cur_window->w - 23, 5, 18, 18, RGB(238, 203, 137));

	drawTitlebar(cur_window, 0);

	cur_window->frame_needs_redraw = 0;
}

void drawWindow(window* cur_window, unsigned char use_current_blit, List* window_list) {

	unsigned int rect_count;
	List* splitrect_list;
	Rect winrect;
	int i;

	//prints("[WYG] Drawing window ");
	//printDecimal(cur_window->handle);
	//pchar('\n');

	if (cur_window->flags & WIN_VISIBLE) {

		cur_window->needs_redraw = 0;

		//Start by drawing this window
		//prints("[WYG] Drawing window frame\n");

		//Create a rectangle for the window to be drawn
		if (use_current_blit) {

			//prints("[WYG] Setting base rectangle using winrect\n");
			//Convert the current blit window to desktop space
			winrect.top = cur_window->y + cur_window->context->top;
			winrect.left = cur_window->x + cur_window->context->left;
			winrect.bottom = cur_window->y + cur_window->context->bottom;
			winrect.right = cur_window->x + cur_window->context->right;
		}
		else {

			//prints("[WYG] Setting base rectangle using whole ctx\n");
			winrect.top = cur_window->y;
			winrect.left = cur_window->x;
			winrect.bottom = cur_window->y + cur_window->context->height - 1;
			winrect.right = cur_window->x + cur_window->context->width - 1;
		}


		if (!(splitrect_list = getOverlappingWindows(List_get_index(window_list, (void*)cur_window) + 1, &winrect))) { //build the rects

			return;
		}

		drawOccluded(cur_window, &winrect, splitrect_list);
		//prints("[WYG] Finished doing occluded draw\n");    

		//getch();

		List_delete(splitrect_list, Rect_deleter);
	}

	//prints("[WYG] Finished drawing window ");
	//printDecimal(cur_window->handle);
	//pchar('\n');

	return;
}

//To be used in raise window code
void drawWindowIntersects(window* cur_window, unsigned char use_current_blit) {

}

void drawOccluded(Window* win, Rect* baserect, List* splitrect_list) {

	if (!splitrect_list)
		return;

	int split_count = 0;
	int total_count = 1;
	int working_total = 0;
	List* out_rects;
	Rect* working_rects = (Rect*)0;
	int i, j, k;
	Rect *new_rect, *rect, *split_rect, *out_rect;

	//If there's nothing occluding us, just render the bitmap and get out of here
	if (!splitrect_list->count) {

		drawBmpRect(win, baserect);
		return;
	}

	out_rects = List_new();

	if (!out_rects) {

		return;
	}

	rect = Rect_new(baserect->top, baserect->left, baserect->bottom, baserect->right);

	if (!rect) {

		List_delete(out_rects, Rect_deleter);
		return;
	}

	if (!List_add(out_rects, (void*)rect)) {

		free((void*)rect);
		List_delete(out_rects, Rect_deleter);
		return;
	}

	//For each splitting rect, split each rect in out_rects, delete the rectangle that was split, and add the resultant split rectangles
	List_for_each(splitrect_list, split_rect, Rect*) {

		List_for_each(out_rects, out_rect, Rect*) {

			if ((split_rect->left <= out_rect->right &&
				split_rect->right >= out_rect->left &&
				split_rect->top <= out_rect->bottom &&
				split_rect->bottom >= out_rect->top)) {

				List* clip_list = splitRect(out_rect, split_rect);

				if (!clip_list) {

					List_delete(out_rects, Rect_deleter);
					return;
				}

				//If nothing was returned, we actually want to clip a rectangle in its entirety
				if (!clip_list->count) {

					List_remove(out_rects, (void*)out_rect, Rect_deleter);

					//If we deleted the last output rectangle, we are completely 
					//occluded and can return early
					if (out_rects->count == 0) {

						List_delete(clip_list, Rect_deleter);
						List_delete(out_rects, Rect_deleter);
						return;
					}

					//Otherwise, go back to the top of the loop and test the next out_rect
					continue;
				}

				//Replace the rectangle that got split with the first result rectangle 
				rect = (Rect*)List_get_at(clip_list, 0);
				out_rect->top = rect->top;
				out_rect->left = rect->left;
				out_rect->bottom = rect->bottom;
				out_rect->right = rect->right;

				//Append the rest of the result rectangles to the output collection
				List_for_each_skip(clip_list, rect, Rect*, 1) {

					new_rect = Rect_new(rect->top, rect->left, rect->bottom, rect->right);

					if (!new_rect) {
						List_delete(clip_list, Rect_deleter);
						List_delete(out_rects, Rect_deleter);
						return;
					}

					if (!List_add(out_rects, (void*)new_rect)){

						free((void*)new_rect);
						List_delete(clip_list, Rect_deleter);
						List_delete(out_rects, Rect_deleter);
						return;
					}
				}

				//Free the space that was used for the split 
				List_delete(clip_list, Rect_deleter);

				//Restart the list 
				List_rewind(out_rects);
			}
		}
	}

	int i;

	for (i = 0; i < out_rects->count; i++) {

		out_rect = (Rect*)List_get_at(i);
		drawBmpRect(win, out_rect);
	}

	List_delete(out_rects, Rect_deleter);
}

void drawBmpRect(Window* win, Rect* r) {

	//Adjust the rectangle coordinate from global space to window space 
	win->context->top = r->top - win->y;
	win->context->left = r->left - win->x;
	win->context->bottom = r->bottom - win->y;
	win->context->right = r->right - win->x;

	//Do the blit
	setCursor(win->x, win->y);
	drawBitmap(win->context);
}

//Maybe this better belongs in the rect class?
List* splitRect(Rect* rdest, Rect* rknife) {

	Rect baserect;
	List* outrect;
	Rect* new_rect;

	baserect.top = rdest->top;
	baserect.left = rdest->left;
	baserect.bottom = rdest->bottom;
	baserect.right = rdest->right;

	//prints("Allocating space for ");
	//printDecimal(sizeof(rect)*rect_count);
	//prints(" rect bytes\n");
	outrect = List_new();
	if (!outrect) {

		prints("Couldn't allocate rect space\n");
		return outrect;
	}

	//cons_prints("Doing left edge split\n");
	//Split by left edge
	if (rknife->left >= baserect.left && rknife->left <= baserect.right) {

		new_rect = Rect_new(baserect.top, baserect.left, baserect.bottom, rknife->left - 1);

		if (!new_rect) {

			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		if (!List_add(outrect, new_rect)) {

			free((void*)new_rect);
			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		baserect.left = rknife->left;
	}

	//cons_prints("Doing top edge split\n");
	//Split by top edge
	if (rknife->top <= baserect.bottom && rknife->top >= baserect.top) {

		new_rect = Rect_new(baserect.top, baserect.left, rknife->top - 1, baserect.right);

		if (!new_rect) {

			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		if (!List_add(outrect, new_rect)) {

			free((void*)new_rect);
			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		baserect.top = rknife->top;
	}

	//cons_prints("Doing right edge split\n");
	//Split by right edge
	if (rknife->right >= baserect.left && rknife->right <= baserect.right) {

		new_rect = Rect_new(baserect.top, rknife->right + 1, baserect.bottom, baserect.right);

		if (!new_rect) {

			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		if (!List_add(outrect, new_rect)) {

			free((void*)new_rect);
			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		baserect.right = rknife->right;
	}

	//cons_prints("Doing bottom edge split\n");
	//Split by bottom edge
	if (rknife->bottom >= baserect.top && rknife->bottom <= baserect.bottom) {

		new_rect = Rect_new(rknife->bottom + 1, baserect.left, baserect.bottom, baserect.right);

		if (!new_rect) {

			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		if (!List_add(outrect, new_rect)) {

			free((void*)new_rect);
			List_delete(outrect, Rect_deleter);
			return (List*)0;
		}

		baserect.bottom = rknife->bottom;
	}

	return outrect;
}


//These functions might be better suited to apply to a WindowManager class which can be
//spun out on its own and be the parent of all Window objects

List* getOverlappingWindows(int lowest_z_level, Rect* baserect, List* window_list) {

	List* rect_list = List_new();

	if (!rect_list) {

		return (List*)0;
	}

	Rect* new_rect;
	window* cur_window;

	List_for_each_skip(window_list, cur_window, window*, lowest_z_level) {

		//Count the window only if it overlaps
		if ((cur_window->flags & WIN_VISIBLE) &&
			cur_window->context->mask_color == 0 &&
			cur_window->x <= baserect->right &&
			(cur_window->x + cur_window->context->width - 1) >= baserect->left &&
			cur_window->y <= baserect->bottom &&
			(cur_window->y + cur_window->context->height - 1) >= baserect->top) {

			if (!(new_rect = Rect_new(cur_window->y, cur_window->x, (cur_window->y + cur_window->context->height - 1), (cur_window->x + cur_window->context->width - 1)))) {

				List_delete(rect_list, Rect_deleter);
				return (List*)0;
			}

			if (!List_add(rect_list, new_rect)) {

				free((void*)new_rect);
				List_delete(rect_list, Rect_deleter);
				return (List*)0;
			}
		}
	}

	return rect_list;
}


void raiseWindow(window* dest_window, List* window_list) {

	window* old_active;

	//Can't raise the root window, mouse window, a null window pointer or if there's nothing but the root and
	//mouse in the window list
	if (dest_window == root_window || dest_window == mouse_window || !dest_window || window_list->count <= 2)
		return;

	//Get the previously active window (will be one deeper than the mouse, hence
	//-2 instead of normal -1)
	old_active = (window*)List_get_at(window_list, window_list->count - 2);

	//If we were already active we don't need to do anything else 
	if (old_active == dest_window)
		return;

	//extract the current window from its position in the list and
	//re-insert it at the end, making sure to pop and restore the
	//mouse window as well to keep it always on top
	if (!List_pop(window_list, (void*)mouse_window))
		return;

	if (!List_pop(window_list, (void*)dest_window))
		return;

	if (!List_add(window_list, (void*)dest_window))
		return;

	if (!List_add(window_list, (void*)mouse_window))
		return;

	//Update the titlebar on the old and new active windows 
	old_active->active = 0;
	dest_window->active = 1;
	drawTitlebar(old_active, 1);
	drawTitlebar(dest_window, 1);

	//If the window isn't visible, it will need to be in order to be
	//raised, otherwise we just redraw (would be more efficient in
	//the future to just redraw those portions that were occluded
	//prior to raising)
	if (!(dest_window->flags & WIN_VISIBLE))
		markWindowVisible(dest_window, 1);
	else
		drawWindow(dest_window, 0);
}

void destroyWindow(Window* dest_window, List* window_list) {

	window *cur_child, *next, *active_window;
	int i;

	//Start by hiding the window 
	markWindowVisible(dest_window, 0);
	List_remove(window_list, (void*)dest_window, window_deleter);
	active_window = (window*)List_get_at(window_list, window_list->count - 1);

	if (!active_window)
		return;

	if (!active_window->active) {

		active_window->active;
		drawTitlebar(active_window, 1);
	}
}
