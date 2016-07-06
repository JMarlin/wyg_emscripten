#!/bin/bash

#EXFLAGS=-g4
EXFLAGS=

emcc -c -o entry.bc entry.c $EXFLAGS 
emcc -c gfx.c -o gfx.bc $EXFLAGS
emcc -c wygwrap.c -o wygwrap.bc $EXFLAGS
emcc -c p5.c -o p5.bc $EXFLAGS
emcc -c main.c -DHARNESS_TEST=1 -o main.bc $EXFLAGS
emcc -c list.c -o list.bc $EXFLAGS
emcc -c rect.c -o rect.bc $EXFLAGS
emcc ./main.bc ./wygwrap.bc ./list.bc ./rect.bc ./gfx.bc ./p5.bc ./entry.bc -o wyg_test.js -s ALLOW_MEMORY_GROWTH=1 -s ASSERTIONS=2 $EXFLAGS

