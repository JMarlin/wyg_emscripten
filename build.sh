#!/bin/bash

emcc -c -o entry.bc entry.c 
emcc -c gfx.c -o gfx.bc
emcc -c p5.c -o p5.bc
emcc -c main.c -o main.bc
emcc -c list.c -o list.bc
emcc -c rect.c -o rect.bc
emcc -DHARNESS_TEST=1 ./main.bc ./list.bc ./rect.bc ./gfx.bc ./p5.bc ./entry.bc -o wyg_test.js

