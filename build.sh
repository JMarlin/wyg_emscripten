#!/bin/bash

emcc -c -o entry.bc entry.c -s CYBERDWARF=1 -g4 
emcc -c gfx.c -o gfx.bc -s CYBERDWARF=1 -g4
emcc -c wygwrap.c -o wygwrap.bc -s CYBERDWARF=1 -g4
emcc -c p5.c -o p5.bc -s CYBERDWARF=1 -g4
emcc -c main.c -DHARNESS_TEST=1 -o main.bc -s CYBERDWARF=1 -g4
emcc -c list.c -o list.bc -s CYBERDWARF=1 -g4
emcc -c rect.c -o rect.bc -s CYBERDWARF=1 -g4
emcc ./main.bc ./wygwrap.bc ./list.bc ./rect.bc ./gfx.bc ./p5.bc ./entry.bc -o wyg_test.js -s ALLOW_MEMORY_GROWTH=1 -s CYBERDWARF=1 -s ASSERTIONS=2 -g4

