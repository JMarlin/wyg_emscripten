#!/bin/bash

emcc -c -o entry.bc entry.c 
emcc -c gfx.c -o gfx.bc
emcc -c wygwrap.c -o wygwrap.bc
emcc -c p5.c -o p5.bc
emcc -c main.c -DHARNESS_TEST=1 -o main.bc
emcc -c list.c -o list.bc
emcc -c rect.c -o rect.bc
emcc ./main.bc ./wygwrap.bc ./list.bc ./rect.bc ./gfx.bc ./p5.bc ./entry.bc -o wyg_test.js -s ALLOW_MEMORY_GROWTH=1

