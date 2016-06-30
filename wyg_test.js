// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');

    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    // The path is absolute if the normalized version is the same as the resolved.
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename);
    }
    if (ret && !binary) ret = ret.toString();
    return ret;
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available (jsc?)' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in: 
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at: 
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      if (!args.splice) args = Array.prototype.slice.call(args);
      args.splice(0, 0, ptr);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, args);
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      sigCache[func] = function dynCall_wrapper() {
        return Runtime.dynCall(sig, func, arguments);
      };
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = DYNAMICTOP;DYNAMICTOP = (DYNAMICTOP + (assert(DYNAMICTOP > 0),size))|0;DYNAMICTOP = (((DYNAMICTOP)+15)&-16); if (DYNAMICTOP >= TOTAL_MEMORY) { var success = enlargeMemory(); if (!success) { DYNAMICTOP = ret;  return 0; } }; return ret; },
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = false; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = Runtime.stackAlloc((str.length << 2) + 1);
        writeStringToMemory(str, ret);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface. 
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }
  
  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if ((typeof _sbrk !== 'undefined' && !_sbrk.called) || !runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

function UTF8ArrayToString(u8Array, idx) {
  var u0, u1, u2, u3, u4, u5;

  var str = '';
  while (1) {
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    u0 = u8Array[idx++];
    if (!u0) return str;
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    u1 = u8Array[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    u2 = u8Array[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u3 = u8Array[idx++] & 63;
      if ((u0 & 0xF8) == 0xF0) {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
      } else {
        u4 = u8Array[idx++] & 63;
        if ((u0 & 0xFC) == 0xF8) {
          u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
        } else {
          u5 = u8Array[idx++] & 63;
          u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
        }
      }
    }
    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF16ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
    if (codeUnit == 0)
      return str;
    ++i;
    // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
    str += String.fromCharCode(codeUnit);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var buf = _malloc(func.length);
      writeStringToMemory(func.substr(1), buf);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed, we can try ours which may return a partial result
    } catch(e) {
      // failure when using libcxxabi, we can try ours which may return a partial result
      return func;
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  return demangleAll(jsStackTrace());
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE = 0, STATICTOP = 0, staticSealed = false; // static area
var STACK_BASE = 0, STACKTOP = 0, STACK_MAX = 0; // stack area
var DYNAMIC_BASE = 0, DYNAMICTOP = 0; // dynamic area handled by sbrk


if (!Module['reallocBuffer']) Module['reallocBuffer'] = function(size) {
  var ret;
  try {
    if (ArrayBuffer.transfer) {
      ret = ArrayBuffer.transfer(buffer, size);
    } else {
      var oldHEAP8 = HEAP8;
      ret = new ArrayBuffer(size);
      var temp = new Int8Array(ret);
      temp.set(oldHEAP8);
    }
  } catch(e) {
    return false;
  }
  var success = _emscripten_replace_memory(ret);
  if (!success) return false;
  return ret;
};

function enlargeMemory() {
  // TOTAL_MEMORY is the current size of the actual array, and DYNAMICTOP is the new top.
  assert(DYNAMICTOP >= TOTAL_MEMORY);
  assert(TOTAL_MEMORY > 4); // So the loop below will not be infinite

  var OLD_TOTAL_MEMORY = TOTAL_MEMORY;


  var LIMIT = Math.pow(2, 31); // 2GB is a practical maximum, as we use signed ints as pointers
                               // and JS engines seem unhappy to give us 2GB arrays currently
  if (DYNAMICTOP >= LIMIT) return false;

  while (TOTAL_MEMORY <= DYNAMICTOP) { // Simple heuristic.
    if (TOTAL_MEMORY < LIMIT/2) {
      TOTAL_MEMORY = alignMemoryPage(2*TOTAL_MEMORY); // double until 1GB
    } else {
      var last = TOTAL_MEMORY;
      TOTAL_MEMORY = alignMemoryPage((3*TOTAL_MEMORY + LIMIT)/4); // add smaller increments towards 2GB, which we cannot reach
      if (TOTAL_MEMORY <= last) return false;
    }
  }

  TOTAL_MEMORY = Math.max(TOTAL_MEMORY, 16*1024*1024);

  if (TOTAL_MEMORY >= LIMIT) return false;

  Module.printErr('Warning: Enlarging memory arrays, this is not fast! ' + [OLD_TOTAL_MEMORY, TOTAL_MEMORY]);


  var start = Date.now();

  var replacement = Module['reallocBuffer'](TOTAL_MEMORY);
  if (!replacement) return false;

  // everything worked

  updateGlobalBuffer(replacement);
  updateGlobalBufferViews();

  Module.printErr('enlarged memory arrays from ' + OLD_TOTAL_MEMORY + ' to ' + TOTAL_MEMORY + ', took ' + (Date.now() - start) + ' ms (has ArrayBuffer.transfer? ' + (!!ArrayBuffer.transfer) + ')');

  return true;
}

var byteLength;
try {
  byteLength = Function.prototype.call.bind(Object.getOwnPropertyDescriptor(ArrayBuffer.prototype, 'byteLength').get);
  byteLength(new ArrayBuffer(4)); // can fail on older ie
} catch(e) { // can fail on older node/v8
  byteLength = function(buffer) { return buffer.byteLength; };
}

var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var totalMemory = 64*1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024
  }
}
totalMemory = Math.max(totalMemory, 16*1024*1024);
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();


// Endianness check (note: assumes compiler arch was little-endian)
HEAP32[0] = 255;
if (HEAPU8[0] !== 255 || HEAPU8[3] !== 0) throw 'Typed arrays 2 must be run on a little-endian system';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(((buffer)+(i))>>0)]=chr;
    i = i + 1;
  }
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[((buffer++)>>0)]=array[i];
  }
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

// === Body ===

var ASM_CONSTS = [function() { var screen; if(screen = document.getElementById('screen_canvas')) screen.parentElement.removeChild(screen); screen = document.createElement('canvas'); screen.width = window.innerWidth; screen.height = window.innerHeight; screen.id = 'screen_canvas'; window.screen_ctx = screen.getContext('2d'); document.body.style.margin = '0px'; document.body.appendChild(screen); screen.style.cursor = 'none'; },
 function($0) { {return document.getElementById('screen_canvas').width;} },
 function($0) { {return document.getElementById('screen_canvas').height;} },
 function($0, $1, $2, $3) { { window.imgdata = window.screen_ctx.getImageData($0, $1, $2, $3); } },
 function($0, $1, $2, $3, $4, $5, $6) { { if($6 === 1) return; var i = ($1 + ($2 * $0)) * 4; window.imgdata.data[i + 0] = $3; window.imgdata.data[i + 1] = $4; window.imgdata.data[i + 2] = $5; window.imgdata.data[i + 3] = 255; } },
 function($0, $1) { { window.screen_ctx.putImageData(window.imgdata, $0, $1); } },
 function() { if(window.mchange === undefined) { window.mchange = false; window.mouse = {x: 0, y: 0, down: 0}; } var canvas = document.getElementById('screen_canvas'); canvas.addEventListener('mousemove', function(event) { var rect = canvas.getBoundingClientRect(); window.mchange = true; window.mouse = {x: event.clientX - rect.left, y: event.clientY - rect.top, down: window.mouse.down}; }); canvas.addEventListener('mousedown', function(event) { window.mchange = true; window.mouse = {x: window.mouse.x, y: window.mouse.y, down: true}; }); canvas.addEventListener('mouseup', function(event) { window.mchange = true; window.mouse = {x: window.mouse.x, y: window.mouse.y, down: false}; }); },
 function($0) { { if(window.mchange) return 1; else return 0; } },
 function($0) { { return window.mouse.x } },
 function($0) { { return window.mouse.y } },
 function($0) { { return window.mouse.down ? 1 : 0 } },
 function() { window.mchange = false; },
 function() { if(window.keyq === undefined) window.keyq = []; document.addEventListener('keydown', function(event) { window.keyq.push(event.keyCode); }); },
 function($0) { { if(window.keyq !== undefined && window.keyq.length > 0) return window.keyq.shift(); else return 0; } },
 function($0) { {console.log(Module.Pointer_stringify($0));} }];

function _emscripten_asm_const_ii(code, a0) {
 return ASM_CONSTS[code](a0);
}

function _emscripten_asm_const_iiiii(code, a0, a1, a2, a3) {
 return ASM_CONSTS[code](a0, a1, a2, a3);
}

function _emscripten_asm_const_iiiiiiii(code, a0, a1, a2, a3, a4, a5, a6) {
 return ASM_CONSTS[code](a0, a1, a2, a3, a4, a5, a6);
}

function _emscripten_asm_const_iii(code, a0, a1) {
 return ASM_CONSTS[code](a0, a1);
}

function _emscripten_asm_const_v(code) {
 return ASM_CONSTS[code]();
}



STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 9072;
  /* global initializers */  __ATINIT__.push();
  

/* memory initializer */ allocate([1,0,0,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,255,255,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,255,255,255,0,0,0,0,0,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,255,0,0,0,0,0,0,0,0,0,0,0,255,0,0,0,255,194,17,0,0,198,17,0,0,202,17,0,0,207,17,0,0,211,17,0,0,217,17,0,0,223,17,0,0,227,17,0,0,1,0,0,0,2,0,0,0,3,0,0,0,4,0,0,0,5,0,0,0,6,0,0,0,7,0,0,0,8,0,0,0,104,3,0,0,5,0,0,0,0,0,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,11,0,0,0,100,31,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,104,3,0,0,67,111,117,108,100,110,39,116,32,97,108,108,111,99,97,116,101,32,114,101,99,116,32,115,112,97,99,101,10,0,91,87,89,71,93,32,67,111,117,108,100,110,39,116,32,97,108,108,111,99,97,116,101,32,119,105,110,100,111,119,32,108,105,115,116,46,10,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,36,0,0,0,0,16,8,32,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,96,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,96,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,36,0,8,0,0,16,16,16,84,0,0,0,0,4,56,8,60,126,4,62,60,126,24,60,0,0,0,0,0,24,0,24,112,60,120,126,126,60,66,124,126,68,64,65,66,60,124,60,124,60,127,66,66,65,66,68,126,28,64,56,16,0,48,0,64,0,2,0,0,0,64,0,0,32,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,36,18,28,64,24,16,16,16,56,0,0,0,0,4,76,24,66,2,12,32,66,2,36,66,16,0,0,0,0,36,56,36,72,66,68,64,64,66,66,16,4,68,64,99,98,66,66,66,66,66,8,66,66,65,66,68,2,16,64,8,40,0,16,0,64,0,2,0,12,0,64,0,0,32,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,72,18,42,162,32,16,32,8,40,16,0,0,0,8,76,40,66,4,20,64,64,4,36,66,16,16,2,0,64,66,68,66,68,64,66,64,64,64,66,16,4,72,64,99,98,66,66,66,66,64,8,66,66,65,36,68,2,16,32,8,68,0,0,0,64,0,2,0,18,0,64,16,4,32,16,0,0,0,0,0,0,0,16,0,0,0,0,0,0,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,127,40,164,16,0,32,8,40,16,0,0,0,8,76,8,2,24,36,64,64,8,24,66,0,0,12,126,48,2,130,66,68,64,66,64,64,64,66,16,4,80,64,85,82,66,66,66,66,32,8,66,66,65,36,68,4,16,32,8,0,0,0,56,64,0,2,0,16,30,64,0,0,32,16,84,44,60,92,60,44,28,62,36,34,68,66,36,62,16,8,8,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,36,24,72,32,0,32,8,0,124,0,126,0,16,84,8,2,4,68,124,92,8,36,62,0,0,48,0,12,4,146,66,120,64,66,124,124,64,66,16,4,96,64,85,82,66,124,66,124,24,8,66,66,73,24,40,8,16,16,8,0,0,0,4,92,60,58,60,16,34,64,0,4,34,16,42,18,66,34,68,18,34,16,36,34,68,34,36,2,32,8,4,50,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,36,12,16,82,0,32,8,0,16,0,0,0,16,84,8,4,2,68,2,98,16,66,2,0,0,64,0,2,8,170,126,68,64,66,64,64,78,126,16,4,80,64,73,74,66,64,66,80,4,8,66,66,73,24,16,16,16,16,8,0,0,0,60,98,66,70,66,60,34,92,16,4,44,16,42,18,66,34,68,16,32,16,36,34,84,36,36,4,16,8,8,76,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,254,10,34,74,0,32,8,0,16,0,0,0,32,84,8,8,2,126,2,66,16,66,2,16,16,48,126,12,16,170,66,66,64,66,64,64,66,66,16,68,72,64,73,74,66,64,66,76,2,8,66,36,73,36,16,32,16,8,8,0,0,0,68,66,64,66,126,16,30,98,16,4,48,16,42,18,66,50,60,16,28,16,36,34,84,24,28,8,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,72,10,69,68,0,32,8,0,0,0,0,0,32,100,8,16,2,4,66,66,16,66,2,16,16,12,0,48,16,148,66,66,64,66,64,64,66,66,16,68,68,64,65,70,66,64,74,66,66,8,66,36,73,36,16,64,16,8,8,0,0,0,68,66,64,66,64,16,2,66,16,4,40,16,42,18,66,44,4,16,2,16,36,34,84,36,4,16,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,72,42,5,58,0,16,16,0,0,32,0,0,64,100,8,32,68,4,66,66,16,66,4,0,32,2,0,64,0,64,66,66,66,68,64,64,66,66,16,68,66,64,65,70,66,64,68,66,66,8,66,36,73,66,16,64,16,4,8,0,0,0,68,98,66,70,66,16,34,66,16,36,36,16,42,18,66,32,4,16,34,16,36,20,84,68,4,32,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,28,2,0,0,16,16,0,0,32,0,0,64,56,8,126,56,4,60,60,16,60,56,0,0,0,0,0,0,56,66,124,60,120,126,64,60,66,124,56,66,126,65,66,60,64,58,66,60,8,60,24,54,66,16,126,28,4,56,0,127,0,58,92,60,58,60,16,28,66,8,24,34,8,42,18,60,32,2,16,28,14,26,8,42,66,56,62,8,8,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,8,0,0,0,8,32,0,0,64,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,6,0,96,0,0,118,97,114,32,115,99,114,101,101,110,59,32,105,102,40,115,99,114,101,101,110,32,61,32,100,111,99,117,109,101,110,116,46,103,101,116,69,108,101,109,101,110,116,66,121,73,100,40,39,115,99,114,101,101,110,95,99,97,110,118,97,115,39,41,41,32,115,99,114,101,101,110,46,112,97,114,101,110,116,69,108,101,109,101,110,116,46,114,101,109,111,118,101,67,104,105,108,100,40,115,99,114,101,101,110,41,59,32,115,99,114,101,101,110,32,61,32,100,111,99,117,109,101,110,116,46,99,114,101,97,116,101,69,108,101,109,101,110,116,40,39,99,97,110,118,97,115,39,41,59,32,115,99,114,101,101,110,46,119,105,100,116,104,32,61,32,119,105,110,100,111,119,46,105,110,110,101,114,87,105,100,116,104,59,32,115,99,114,101,101,110,46,104,101,105,103,104,116,32,61,32,119,105,110,100,111,119,46,105,110,110,101,114,72,101,105,103,104,116,59,32,115,99,114,101,101,110,46,105,100,32,61,32,39,115,99,114,101,101,110,95,99,97,110,118,97,115,39,59,32,119,105,110,100,111,119,46,115,99,114,101,101,110,95,99,116,120,32,61,32,115,99,114,101,101,110,46,103,101,116,67,111,110,116,101,120,116,40,39,50,100,39,41,59,32,100,111,99,117,109,101,110,116,46,98,111,100,121,46,115,116,121,108,101,46,109,97,114,103,105,110,32,61,32,39,48,112,120,39,59,32,100,111,99,117,109,101,110,116,46,98,111,100,121,46,97,112,112,101,110,100,67,104,105,108,100,40,115,99,114,101,101,110,41,59,32,115,99,114,101,101,110,46,115,116,121,108,101,46,99,117,114,115,111,114,32,61,32,39,110,111,110,101,39,59,0,123,114,101,116,117,114,110,32,100,111,99,117,109,101,110,116,46,103,101,116,69,108,101,109,101,110,116,66,121,73,100,40,39,115,99,114,101,101,110,95,99,97,110,118,97,115,39,41,46,119,105,100,116,104,59,125,0,123,114,101,116,117,114,110,32,100,111,99,117,109,101,110,116,46,103,101,116,69,108,101,109,101,110,116,66,121,73,100,40,39,115,99,114,101,101,110,95,99,97,110,118,97,115,39,41,46,104,101,105,103,104,116,59,125,0,123,32,119,105,110,100,111,119,46,105,109,103,100,97,116,97,32,61,32,119,105,110,100,111,119,46,115,99,114,101,101,110,95,99,116,120,46,103,101,116,73,109,97,103,101,68,97,116,97,40,36,48,44,32,36,49,44,32,36,50,44,32,36,51,41,59,32,125,0,123,32,105,102,40,36,54,32,61,61,61,32,49,41,32,114,101,116,117,114,110,59,32,118,97,114,32,105,32,61,32,40,36,49,32,43,32,40,36,50,32,42,32,36,48,41,41,32,42,32,52,59,32,119,105,110,100,111,119,46,105,109,103,100,97,116,97,46,100,97,116,97,91,105,32,43,32,48,93,32,61,32,36,51,59,32,119,105,110,100,111,119,46,105,109,103,100,97,116,97,46,100,97,116,97,91,105,32,43,32,49,93,32,61,32,36,52,59,32,119,105,110,100,111,119,46,105,109,103,100,97,116,97,46,100,97,116,97,91,105,32,43,32,50,93,32,61,32,36,53,59,32,119,105,110,100,111,119,46,105,109,103,100,97,116,97,46,100,97,116,97,91,105,32,43,32,51,93,32,61,32,50,53,53,59,32,125,0,123,32,119,105,110,100,111,119,46,115,99,114,101,101,110,95,99,116,120,46,112,117,116,73,109,97,103,101,68,97,116,97,40,119,105,110,100,111,119,46,105,109,103,100,97,116,97,44,32,36,48,44,32,36,49,41,59,32,125,0,105,102,40,119,105,110,100,111,119,46,109,99,104,97,110,103,101,32,61,61,61,32,117,110,100,101,102,105,110,101,100,41,32,123,32,119,105,110,100,111,119,46,109,99,104,97,110,103,101,32,61,32,102,97,108,115,101,59,32,119,105,110,100,111,119,46,109,111,117,115,101,32,61,32,123,120,58,32,48,44,32,121,58,32,48,44,32,100,111,119,110,58,32,48,125,59,32,125,32,118,97,114,32,99,97,110,118,97,115,32,61,32,100,111,99,117,109,101,110,116,46,103,101,116,69,108,101,109,101,110,116,66,121,73,100,40,39,115,99,114,101,101,110,95,99,97,110,118,97,115,39,41,59,32,99,97,110,118,97,115,46,97,100,100,69,118,101,110,116,76,105,115,116,101,110,101,114,40,39,109,111,117,115,101,109,111,118,101,39,44,32,102,117,110,99,116,105,111,110,40,101,118,101,110,116,41,32,123,32,118,97,114,32,114,101,99,116,32,61,32,99,97,110,118,97,115,46,103,101,116,66,111,117,110,100,105,110,103,67,108,105,101,110,116,82,101,99,116,40,41,59,32,119,105,110,100,111,119,46,109,99,104,97,110,103,101,32,61,32,116,114,117,101,59,32,119,105,110,100,111,119,46,109,111,117,115,101,32,61,32,123,120,58,32,101,118,101,110,116,46,99,108,105,101,110,116,88,32,45,32,114,101,99,116,46,108,101,102,116,44,32,121,58,32,101,118,101,110,116,46,99,108,105,101,110,116,89,32,45,32,114,101,99,116,46,116,111,112,44,32,100,111,119,110,58,32,119,105,110,100,111,119,46,109,111,117,115,101,46,100,111,119,110,125,59,32,125,41,59,32,99,97,110,118,97,115,46,97,100,100,69,118,101,110,116,76,105,115,116,101,110,101,114,40,39,109,111,117,115,101,100,111,119,110,39,44,32,102,117,110,99,116,105,111,110,40,101,118,101,110,116,41,32,123,32,119,105,110,100,111,119,46,109,99,104,97,110,103,101,32,61,32,116,114,117,101,59,32,119,105,110,100,111,119,46,109,111,117,115,101,32,61,32,123,120,58,32,119,105,110,100,111,119,46,109,111,117,115,101,46,120,44,32,121,58,32,119,105,110,100,111,119,46,109,111,117,115,101,46,121,44,32,100,111,119,110,58,32,116,114,117,101,125,59,32,125,41,59,32,99,97,110,118,97,115,46,97,100,100,69,118,101,110,116,76,105,115,116,101,110,101,114,40,39,109,111,117,115,101,117,112,39,44,32,102,117,110,99,116,105,111,110,40,101,118,101,110,116,41,32,123,32,119,105,110,100,111,119,46,109,99,104,97,110,103,101,32,61,32,116,114,117,101,59,32,119,105,110,100,111,119,46,109,111,117,115,101,32,61,32,123,120,58,32,119,105,110,100,111,119,46,109,111,117,115,101,46,120,44,32,121,58,32,119,105,110,100,111,119,46,109,111,117,115,101,46,121,44,32,100,111,119,110,58,32,102,97,108,115,101,125,59,32,125,41,59,0,123,32,105,102,40,119,105,110,100,111,119,46,109,99,104,97,110,103,101,41,32,114,101,116,117,114,110,32,49,59,32,101,108,115,101,32,114,101,116,117,114,110,32,48,59,32,125,0,123,32,114,101,116,117,114,110,32,119,105,110,100,111,119,46,109,111,117,115,101,46,120,32,125,0,123,32,114,101,116,117,114,110,32,119,105,110,100,111,119,46,109,111,117,115,101,46,121,32,125,0,123,32,114,101,116,117,114,110,32,119,105,110,100,111,119,46,109,111,117,115,101,46,100,111,119,110,32,63,32,49,32,58,32,48,32,125,0,119,105,110,100,111,119,46,109,99,104,97,110,103,101,32,61,32,102,97,108,115,101,59,0,105,102,40,119,105,110,100,111,119,46,107,101,121,113,32,61,61,61,32,117,110,100,101,102,105,110,101,100,41,32,119,105,110,100,111,119,46,107,101,121,113,32,61,32,91,93,59,32,100,111,99,117,109,101,110,116,46,97,100,100,69,118,101,110,116,76,105,115,116,101,110,101,114,40,39,107,101,121,100,111,119,110,39,44,32,102,117,110,99,116,105,111,110,40,101,118,101,110,116,41,32,123,32,119,105,110,100,111,119,46,107,101,121,113,46,112,117,115,104,40,101,118,101,110,116,46,107,101,121,67,111,100,101,41,59,32,125,41,59,0,123,32,105,102,40,119,105,110,100,111,119,46,107,101,121,113,32,33,61,61,32,117,110,100,101,102,105,110,101,100,32,38,38,32,119,105,110,100,111,119,46,107,101,121,113,46,108,101,110,103,116,104,32,62,32,48,41,32,114,101,116,117,114,110,32,119,105,110,100,111,119,46,107,101,121,113,46,115,104,105,102,116,40,41,59,32,101,108,115,101,32,114,101,116,117,114,110,32,48,59,32,125,0,123,99,111,110,115,111,108,101,46,108,111,103,40,77,111,100,117,108,101,46,80,111,105,110,116,101,114,95,115,116,114,105,110,103,105,102,121,40,36,48,41,41,59,125,0,67,76,82,0,86,69,82,0,69,88,73,84,0,87,73,78,0,67,76,79,83,69,0,70,79,67,85,83,0,77,79,86,0,77,79,86,77,69,0,80,53,32,117,115,101,114,109,111,100,101,32,99,111,110,115,111,108,101,32,98,117,105,108,100,32,49,10,0,80,53,32,98,117,105,108,100,32,91,110,101,101,100,32,102,109,116,32,112,114,105,110,116,32,97,110,100,32,80,53,32,98,117,105,108,100,32,110,117,109,98,101,114,32,104,111,111,107,93,10,0,82,97,105,115,105,110,103,32,119,105,110,100,111,119,10,0,67,114,101,97,116,105,110,103,32,119,105,110,100,111,119,10,0,87,105,110,100,111,119,32,66,0,68,101,115,116,114,111,121,105,110,103,32,119,105,110,100,111,119,10,0,87,105,110,100,111,119,32,100,111,101,115,110,39,116,32,101,120,105,115,116,10,0,78,111,32,119,105,110,100,111,119,10,0,85,110,107,110,111,119,110,32,99,111,109,109,97,110,100,32,0,10,0,83,101,116,116,105,110,103,32,117,112,32,116,105,116,108,101,10,0,80,84,101,114,109,0,80,108,97,99,105,110,103,32,119,105,110,100,111,119,32,105,110,116,111,32,100,101,115,107,116,111,112,10,0,67,97,115,99,97,100,105,110,103,32,119,105,110,100,111,119,10,0,83,104,111,119,105,110,103,32,119,105,110,100,111,119,10,0,83,101,116,116,105,110,103,32,117,112,32,99,111,110,115,111,108,101,10,0,58,58,0,17,0,10,0,17,17,17,0,0,0,0,5,0,0,0,0,0,0,9,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,15,10,17,17,17,3,10,7,0,1,19,9,11,11,0,0,9,6,11,0,0,11,0,6,17,0,0,0,17,17,17,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,17,0,10,10,17,17,17,0,10,0,0,2,0,9,11,0,0,0,9,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,14,0,0,0,0,0,0,0,0,0,0,0,13,0,0,0,4,13,0,0,0,0,9,14,0,0,0,0,0,14,0,0,14,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,16,0,0,0,0,0,0,0,0,0,0,0,15,0,0,0,0,15,0,0,0,0,9,16,0,0,0,0,0,16,0,0,16,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,18,0,0,0,18,18,18,0,0,0,0,0,0,9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,11,0,0,0,0,0,0,0,0,0,0,0,10,0,0,0,0,10,0,0,0,0,9,11,0,0,0,0,0,11,0,0,11,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,0,0,0,0,0,0,0,12,0,0,0,0,12,0,0,0,0,9,12,0,0,0,0,0,12,0,0,12,0,0,48,49,50,51,52,53,54,55,56,57,65,66,67,68,69,70,45,43,32,32,32,48,88,48,120,0,84,33,34,25,13,1,2,3,17,75,28,12,16,4,11,29,18,30,39,104,110,111,112,113,98,32,5,6,15,19,20,21,26,8,22,7,40,36,23,24,9,10,14,27,31,37,35,131,130,125,38,42,43,60,61,62,63,67,71,74,77,88,89,90,91,92,93,94,95,96,97,99,100,101,102,103,105,106,107,108,114,115,116,121,122,123,124,0,73,108,108,101,103,97,108,32,98,121,116,101,32,115,101,113,117,101,110,99,101,0,68,111,109,97,105,110,32,101,114,114,111,114,0,82,101,115,117,108,116,32,110,111,116,32,114,101,112,114,101,115,101,110,116,97,98,108,101,0,78,111,116,32,97,32,116,116,121,0,80,101,114,109,105,115,115,105,111,110,32,100,101,110,105,101,100,0,79,112,101,114,97,116,105,111,110,32,110,111,116,32,112,101,114,109,105,116,116,101,100,0,78,111,32,115,117,99,104,32,102,105,108,101,32,111,114,32,100,105,114,101,99,116,111,114,121,0,78,111,32,115,117,99,104,32,112,114,111,99,101,115,115,0,70,105,108,101,32,101,120,105,115,116,115,0,86,97,108,117,101,32,116,111,111,32,108,97,114,103,101,32,102,111,114,32,100,97,116,97,32,116,121,112,101,0,78,111,32,115,112,97,99,101,32,108,101,102,116,32,111,110,32,100,101,118,105,99,101,0,79,117,116,32,111,102,32,109,101,109,111,114,121,0,82,101,115,111,117,114,99,101,32,98,117,115,121,0,73,110,116,101,114,114,117,112,116,101,100,32,115,121,115,116,101,109,32,99,97,108,108,0,82,101,115,111,117,114,99,101,32,116,101,109,112,111,114,97,114,105,108,121,32,117,110,97,118,97,105,108,97,98,108,101,0,73,110,118,97,108,105,100,32,115,101,101,107,0,67,114,111,115,115,45,100,101,118,105,99,101,32,108,105,110,107,0,82,101,97,100,45,111,110,108,121,32,102,105,108,101,32,115,121,115,116,101,109,0,68,105,114,101,99,116,111,114,121,32,110,111,116,32,101,109,112,116,121,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,112,101,101,114,0,79,112,101,114,97,116,105,111,110,32,116,105,109,101,100,32,111,117,116,0,67,111,110,110,101,99,116,105,111,110,32,114,101,102,117,115,101,100,0,72,111,115,116,32,105,115,32,100,111,119,110,0,72,111,115,116,32,105,115,32,117,110,114,101,97,99,104,97,98,108,101,0,65,100,100,114,101,115,115,32,105,110,32,117,115,101,0,66,114,111,107,101,110,32,112,105,112,101,0,73,47,79,32,101,114,114,111,114,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,32,111,114,32,97,100,100,114,101,115,115,0,66,108,111,99,107,32,100,101,118,105,99,101,32,114,101,113,117,105,114,101,100,0,78,111,32,115,117,99,104,32,100,101,118,105,99,101,0,78,111,116,32,97,32,100,105,114,101,99,116,111,114,121,0,73,115,32,97,32,100,105,114,101,99,116,111,114,121,0,84,101,120,116,32,102,105,108,101,32,98,117,115,121,0,69,120,101,99,32,102,111,114,109,97,116,32,101,114,114,111,114,0,73,110,118,97,108,105,100,32,97,114,103,117,109,101,110,116,0,65,114,103,117,109,101,110,116,32,108,105,115,116,32,116,111,111,32,108,111,110,103,0,83,121,109,98,111,108,105,99,32,108,105,110,107,32,108,111,111,112,0,70,105,108,101,110,97,109,101,32,116,111,111,32,108,111,110,103,0,84,111,111,32,109,97,110,121,32,111,112,101,110,32,102,105,108,101,115,32,105,110,32,115,121,115,116,101,109,0,78,111,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,115,32,97,118,97,105,108,97,98,108,101,0,66,97,100,32,102,105,108,101,32,100,101,115,99,114,105,112,116,111,114,0,78,111,32,99,104,105,108,100,32,112,114,111,99,101,115,115,0,66,97,100,32,97,100,100,114,101,115,115,0,70,105,108,101,32,116,111,111,32,108,97,114,103,101,0,84,111,111,32,109,97,110,121,32,108,105,110,107,115,0,78,111,32,108,111,99,107,115,32,97,118,97,105,108,97,98,108,101,0,82,101,115,111,117,114,99,101,32,100,101,97,100,108,111,99,107,32,119,111,117,108,100,32,111,99,99,117,114,0,83,116,97,116,101,32,110,111,116,32,114,101,99,111,118,101,114,97,98,108,101,0,80,114,101,118,105,111,117,115,32,111,119,110,101,114,32,100,105,101,100,0,79,112,101,114,97,116,105,111,110,32,99,97,110,99,101,108,101,100,0,70,117,110,99,116,105,111,110,32,110,111,116,32,105,109,112,108,101,109,101,110,116,101,100,0,78,111,32,109,101,115,115,97,103,101,32,111,102,32,100,101,115,105,114,101,100,32,116,121,112,101,0,73,100,101,110,116,105,102,105,101,114,32,114,101,109,111,118,101,100,0,68,101,118,105,99,101,32,110,111,116,32,97,32,115,116,114,101,97,109,0,78,111,32,100,97,116,97,32,97,118,97,105,108,97,98,108,101,0,68,101,118,105,99,101,32,116,105,109,101,111,117,116,0,79,117,116,32,111,102,32,115,116,114,101,97,109,115,32,114,101,115,111,117,114,99,101,115,0,76,105,110,107,32,104,97,115,32,98,101,101,110,32,115,101,118,101,114,101,100,0,80,114,111,116,111,99,111,108,32,101,114,114,111,114,0,66,97,100,32,109,101,115,115,97,103,101,0,70,105,108,101,32,100,101,115,99,114,105,112,116,111,114,32,105,110,32,98,97,100,32,115,116,97,116,101,0,78,111,116,32,97,32,115,111,99,107,101,116,0,68,101,115,116,105,110,97,116,105,111,110,32,97,100,100,114,101,115,115,32,114,101,113,117,105,114,101,100,0,77,101,115,115,97,103,101,32,116,111,111,32,108,97,114,103,101,0,80,114,111,116,111,99,111,108,32,119,114,111,110,103,32,116,121,112,101,32,102,111,114,32,115,111,99,107,101,116,0,80,114,111,116,111,99,111,108,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,80,114,111,116,111,99,111,108,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,83,111,99,107,101,116,32,116,121,112,101,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,78,111,116,32,115,117,112,112,111,114,116,101,100,0,80,114,111,116,111,99,111,108,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,0,65,100,100,114,101,115,115,32,102,97,109,105,108,121,32,110,111,116,32,115,117,112,112,111,114,116,101,100,32,98,121,32,112,114,111,116,111,99,111,108,0,65,100,100,114,101,115,115,32,110,111,116,32,97,118,97,105,108,97,98,108,101,0,78,101,116,119,111,114,107,32,105,115,32,100,111,119,110,0,78,101,116,119,111,114,107,32,117,110,114,101,97,99,104,97,98,108,101,0,67,111,110,110,101,99,116,105,111,110,32,114,101,115,101,116,32,98,121,32,110,101,116,119,111,114,107,0,67,111,110,110,101,99,116,105,111,110,32,97,98,111,114,116,101,100,0,78,111,32,98,117,102,102,101,114,32,115,112,97,99,101,32,97,118,97,105,108,97,98,108,101,0,83,111,99,107,101,116,32,105,115,32,99,111,110,110,101,99,116,101,100,0,83,111,99,107,101,116,32,110,111,116,32,99,111,110,110,101,99,116,101,100,0,67,97,110,110,111,116,32,115,101,110,100,32,97,102,116,101,114,32,115,111,99,107,101,116,32,115,104,117,116,100,111,119,110,0,79,112,101,114,97,116,105,111,110,32,97,108,114,101,97,100,121,32,105,110,32,112,114,111,103,114,101,115,115,0,79,112,101,114,97,116,105,111,110,32,105,110,32,112,114,111,103,114,101,115,115,0,83,116,97,108,101,32,102,105,108,101,32,104,97,110,100,108,101,0,82,101,109,111,116,101,32,73,47,79,32,101,114,114,111,114,0,81,117,111,116,97,32,101,120,99,101,101,100,101,100,0,78,111,32,109,101,100,105,117,109,32,102,111,117,110,100,0,87,114,111,110,103,32,109,101,100,105,117,109,32,116,121,112,101,0,78,111,32,101,114,114,111,114,32,105,110,102,111,114,109,97,116,105,111,110,0,0,40,110,117,108,108,41,0,45,48,88,43,48,88,32,48,88,45,48,120,43,48,120,32,48,120,0,105,110,102,0,73,78,70,0,110,97,110,0,78,65,78,0,46,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


   
  Module["_i64Subtract"] = _i64Subtract;

   
  Module["_i64Add"] = _i64Add;

  
  
  var Browser={mainLoop:{scheduler:null,method:"",currentlyRunningMainloop:0,func:null,arg:0,timingMode:0,timingValue:0,currentFrameNumber:0,queue:[],pause:function () {
          Browser.mainLoop.scheduler = null;
          Browser.mainLoop.currentlyRunningMainloop++; // Incrementing this signals the previous main loop that it's now become old, and it must return.
        },resume:function () {
          Browser.mainLoop.currentlyRunningMainloop++;
          var timingMode = Browser.mainLoop.timingMode;
          var timingValue = Browser.mainLoop.timingValue;
          var func = Browser.mainLoop.func;
          Browser.mainLoop.func = null;
          _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true /* do not set timing and call scheduler, we will do it on the next lines */);
          _emscripten_set_main_loop_timing(timingMode, timingValue);
          Browser.mainLoop.scheduler();
        },updateStatus:function () {
          if (Module['setStatus']) {
            var message = Module['statusMessage'] || 'Please wait...';
            var remaining = Browser.mainLoop.remainingBlockers;
            var expected = Browser.mainLoop.expectedBlockers;
            if (remaining) {
              if (remaining < expected) {
                Module['setStatus'](message + ' (' + (expected - remaining) + '/' + expected + ')');
              } else {
                Module['setStatus'](message);
              }
            } else {
              Module['setStatus']('');
            }
          }
        },runIter:function (func) {
          if (ABORT) return;
          if (Module['preMainLoop']) {
            var preRet = Module['preMainLoop']();
            if (preRet === false) {
              return; // |return false| skips a frame
            }
          }
          try {
            func();
          } catch (e) {
            if (e instanceof ExitStatus) {
              return;
            } else {
              if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
              throw e;
            }
          }
          if (Module['postMainLoop']) Module['postMainLoop']();
        }},isFullScreen:false,pointerLock:false,moduleContextCreatedCallbacks:[],workers:[],init:function () {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = []; // needs to exist even in workers
  
        if (Browser.initted) return;
        Browser.initted = true;
  
        try {
          new Blob();
          Browser.hasBlobConstructor = true;
        } catch(e) {
          Browser.hasBlobConstructor = false;
          console.log("warning: no blob constructor, cannot create blobs with mimetypes");
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : (typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : (!Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null));
        Browser.URLObject = typeof window != "undefined" ? (window.URL ? window.URL : window.webkitURL) : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === 'undefined') {
          console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
          Module.noImageDecoding = true;
        }
  
        // Support for plugins that can process preloaded files. You can add more of these to
        // your app by creating and appending to Module.preloadPlugins.
        //
        // Each plugin is asked if it can handle a file based on the file's name. If it can,
        // it is given the file's raw data. When it is done, it calls a callback with the file's
        // (possibly modified) data. For example, a plugin might decompress a file, or it
        // might create some side data structure for use later (like an Image element, etc.).
  
        var imagePlugin = {};
        imagePlugin['canHandle'] = function imagePlugin_canHandle(name) {
          return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name);
        };
        imagePlugin['handle'] = function imagePlugin_handle(byteArray, name, onload, onerror) {
          var b = null;
          if (Browser.hasBlobConstructor) {
            try {
              b = new Blob([byteArray], { type: Browser.getMimetype(name) });
              if (b.size !== byteArray.length) { // Safari bug #118630
                // Safari's Blob can only take an ArrayBuffer
                b = new Blob([(new Uint8Array(byteArray)).buffer], { type: Browser.getMimetype(name) });
              }
            } catch(e) {
              Runtime.warnOnce('Blob constructor present but fails: ' + e + '; falling back to blob builder');
            }
          }
          if (!b) {
            var bb = new Browser.BlobBuilder();
            bb.append((new Uint8Array(byteArray)).buffer); // we need to pass a buffer, and must copy the array to get the right data range
            b = bb.getBlob();
          }
          var url = Browser.URLObject.createObjectURL(b);
          assert(typeof url == 'string', 'createObjectURL must return a url as a string');
          var img = new Image();
          img.onload = function img_onload() {
            assert(img.complete, 'Image ' + name + ' could not be decoded');
            var canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            var ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            Module["preloadedImages"][name] = canvas;
            Browser.URLObject.revokeObjectURL(url);
            if (onload) onload(byteArray);
          };
          img.onerror = function img_onerror(event) {
            console.log('Image ' + url + ' could not be decoded');
            if (onerror) onerror();
          };
          img.src = url;
        };
        Module['preloadPlugins'].push(imagePlugin);
  
        var audioPlugin = {};
        audioPlugin['canHandle'] = function audioPlugin_canHandle(name) {
          return !Module.noAudioDecoding && name.substr(-4) in { '.ogg': 1, '.wav': 1, '.mp3': 1 };
        };
        audioPlugin['handle'] = function audioPlugin_handle(byteArray, name, onload, onerror) {
          var done = false;
          function finish(audio) {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = audio;
            if (onload) onload(byteArray);
          }
          function fail() {
            if (done) return;
            done = true;
            Module["preloadedAudios"][name] = new Audio(); // empty shim
            if (onerror) onerror();
          }
          if (Browser.hasBlobConstructor) {
            try {
              var b = new Blob([byteArray], { type: Browser.getMimetype(name) });
            } catch(e) {
              return fail();
            }
            var url = Browser.URLObject.createObjectURL(b); // XXX we never revoke this!
            assert(typeof url == 'string', 'createObjectURL must return a url as a string');
            var audio = new Audio();
            audio.addEventListener('canplaythrough', function() { finish(audio) }, false); // use addEventListener due to chromium bug 124926
            audio.onerror = function audio_onerror(event) {
              if (done) return;
              console.log('warning: browser could not fully decode audio ' + name + ', trying slower base64 approach');
              function encode64(data) {
                var BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
                var PAD = '=';
                var ret = '';
                var leftchar = 0;
                var leftbits = 0;
                for (var i = 0; i < data.length; i++) {
                  leftchar = (leftchar << 8) | data[i];
                  leftbits += 8;
                  while (leftbits >= 6) {
                    var curr = (leftchar >> (leftbits-6)) & 0x3f;
                    leftbits -= 6;
                    ret += BASE[curr];
                  }
                }
                if (leftbits == 2) {
                  ret += BASE[(leftchar&3) << 4];
                  ret += PAD + PAD;
                } else if (leftbits == 4) {
                  ret += BASE[(leftchar&0xf) << 2];
                  ret += PAD;
                }
                return ret;
              }
              audio.src = 'data:audio/x-' + name.substr(-3) + ';base64,' + encode64(byteArray);
              finish(audio); // we don't wait for confirmation this worked - but it's worth trying
            };
            audio.src = url;
            // workaround for chrome bug 124926 - we do not always get oncanplaythrough or onerror
            Browser.safeSetTimeout(function() {
              finish(audio); // try to use it even though it is not necessarily ready to play
            }, 10000);
          } else {
            return fail();
          }
        };
        Module['preloadPlugins'].push(audioPlugin);
  
        // Canvas event setup
  
        var canvas = Module['canvas'];
        function pointerLockChange() {
          Browser.pointerLock = document['pointerLockElement'] === canvas ||
                                document['mozPointerLockElement'] === canvas ||
                                document['webkitPointerLockElement'] === canvas ||
                                document['msPointerLockElement'] === canvas;
        }
        if (canvas) {
          // forced aspect ratio can be enabled by defining 'forcedAspectRatio' on Module
          // Module['forcedAspectRatio'] = 4 / 3;
          
          canvas.requestPointerLock = canvas['requestPointerLock'] ||
                                      canvas['mozRequestPointerLock'] ||
                                      canvas['webkitRequestPointerLock'] ||
                                      canvas['msRequestPointerLock'] ||
                                      function(){};
          canvas.exitPointerLock = document['exitPointerLock'] ||
                                   document['mozExitPointerLock'] ||
                                   document['webkitExitPointerLock'] ||
                                   document['msExitPointerLock'] ||
                                   function(){}; // no-op if function does not exist
          canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
  
  
          document.addEventListener('pointerlockchange', pointerLockChange, false);
          document.addEventListener('mozpointerlockchange', pointerLockChange, false);
          document.addEventListener('webkitpointerlockchange', pointerLockChange, false);
          document.addEventListener('mspointerlockchange', pointerLockChange, false);
  
          if (Module['elementPointerLock']) {
            canvas.addEventListener("click", function(ev) {
              if (!Browser.pointerLock && canvas.requestPointerLock) {
                canvas.requestPointerLock();
                ev.preventDefault();
              }
            }, false);
          }
        }
      },createContext:function (canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx; // no need to recreate GL context if it's already been created for this canvas.
  
        var ctx;
        var contextHandle;
        if (useWebGL) {
          // For GLES2/desktop GL compatibility, adjust a few defaults to be different to WebGL defaults, so that they align better with the desktop defaults.
          var contextAttributes = {
            antialias: false,
            alpha: false
          };
  
          if (webGLContextAttributes) {
            for (var attribute in webGLContextAttributes) {
              contextAttributes[attribute] = webGLContextAttributes[attribute];
            }
          }
  
          contextHandle = GL.createContext(canvas, contextAttributes);
          if (contextHandle) {
            ctx = GL.getContext(contextHandle).GLctx;
          }
          // Set the background of the WebGL canvas to black
          canvas.style.backgroundColor = "black";
        } else {
          ctx = canvas.getContext('2d');
        }
  
        if (!ctx) return null;
  
        if (setInModule) {
          if (!useWebGL) assert(typeof GLctx === 'undefined', 'cannot set in module if GLctx is used, but we are a non-GL context that would replace it');
  
          Module.ctx = ctx;
          if (useWebGL) GL.makeContextCurrent(contextHandle);
          Module.useWebGL = useWebGL;
          Browser.moduleContextCreatedCallbacks.forEach(function(callback) { callback() });
          Browser.init();
        }
        return ctx;
      },destroyContext:function (canvas, useWebGL, setInModule) {},fullScreenHandlersInstalled:false,lockPointer:undefined,resizeCanvas:undefined,requestFullScreen:function (lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === 'undefined') Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === 'undefined') Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === 'undefined') Browser.vrDevice = null;
  
        var canvas = Module['canvas'];
        function fullScreenChange() {
          Browser.isFullScreen = false;
          var canvasContainer = canvas.parentNode;
          if ((document['webkitFullScreenElement'] || document['webkitFullscreenElement'] ||
               document['mozFullScreenElement'] || document['mozFullscreenElement'] ||
               document['fullScreenElement'] || document['fullscreenElement'] ||
               document['msFullScreenElement'] || document['msFullscreenElement'] ||
               document['webkitCurrentFullScreenElement']) === canvasContainer) {
            canvas.cancelFullScreen = document['cancelFullScreen'] ||
                                      document['mozCancelFullScreen'] ||
                                      document['webkitCancelFullScreen'] ||
                                      document['msExitFullscreen'] ||
                                      document['exitFullscreen'] ||
                                      function() {};
            canvas.cancelFullScreen = canvas.cancelFullScreen.bind(document);
            if (Browser.lockPointer) canvas.requestPointerLock();
            Browser.isFullScreen = true;
            if (Browser.resizeCanvas) Browser.setFullScreenCanvasSize();
          } else {
            
            // remove the full screen specific parent of the canvas again to restore the HTML structure from before going full screen
            canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
            canvasContainer.parentNode.removeChild(canvasContainer);
            
            if (Browser.resizeCanvas) Browser.setWindowedCanvasSize();
          }
          if (Module['onFullScreen']) Module['onFullScreen'](Browser.isFullScreen);
          Browser.updateCanvasDimensions(canvas);
        }
  
        if (!Browser.fullScreenHandlersInstalled) {
          Browser.fullScreenHandlersInstalled = true;
          document.addEventListener('fullscreenchange', fullScreenChange, false);
          document.addEventListener('mozfullscreenchange', fullScreenChange, false);
          document.addEventListener('webkitfullscreenchange', fullScreenChange, false);
          document.addEventListener('MSFullscreenChange', fullScreenChange, false);
        }
  
        // create a new parent to ensure the canvas has no siblings. this allows browsers to optimize full screen performance when its parent is the full screen root
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
  
        // use parent of canvas as full screen root to allow aspect ratio correction (Firefox stretches the root to screen size)
        canvasContainer.requestFullScreen = canvasContainer['requestFullScreen'] ||
                                            canvasContainer['mozRequestFullScreen'] ||
                                            canvasContainer['msRequestFullscreen'] ||
                                           (canvasContainer['webkitRequestFullScreen'] ? function() { canvasContainer['webkitRequestFullScreen'](Element['ALLOW_KEYBOARD_INPUT']) } : null);
  
        if (vrDevice) {
          canvasContainer.requestFullScreen({ vrDisplay: vrDevice });
        } else {
          canvasContainer.requestFullScreen();
        }
      },nextRAF:0,fakeRequestAnimationFrame:function (func) {
        // try to keep 60fps between calls to here
        var now = Date.now();
        if (Browser.nextRAF === 0) {
          Browser.nextRAF = now + 1000/60;
        } else {
          while (now + 2 >= Browser.nextRAF) { // fudge a little, to avoid timer jitter causing us to do lots of delay:0
            Browser.nextRAF += 1000/60;
          }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay);
      },requestAnimationFrame:function requestAnimationFrame(func) {
        if (typeof window === 'undefined') { // Provide fallback to setTimeout if window is undefined (e.g. in Node.js)
          Browser.fakeRequestAnimationFrame(func);
        } else {
          if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = window['requestAnimationFrame'] ||
                                           window['mozRequestAnimationFrame'] ||
                                           window['webkitRequestAnimationFrame'] ||
                                           window['msRequestAnimationFrame'] ||
                                           window['oRequestAnimationFrame'] ||
                                           Browser.fakeRequestAnimationFrame;
          }
          window.requestAnimationFrame(func);
        }
      },safeCallback:function (func) {
        return function() {
          if (!ABORT) return func.apply(null, arguments);
        };
      },allowAsyncCallbacks:true,queuedAsyncCallbacks:[],pauseAsyncCallbacks:function () {
        Browser.allowAsyncCallbacks = false;
      },resumeAsyncCallbacks:function () { // marks future callbacks as ok to execute, and synchronously runs any remaining ones right now
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
          var callbacks = Browser.queuedAsyncCallbacks;
          Browser.queuedAsyncCallbacks = [];
          callbacks.forEach(function(func) {
            func();
          });
        }
      },safeRequestAnimationFrame:function (func) {
        return Browser.requestAnimationFrame(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        });
      },safeSetTimeout:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setTimeout(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } else {
            Browser.queuedAsyncCallbacks.push(func);
          }
        }, timeout);
      },safeSetInterval:function (func, timeout) {
        Module['noExitRuntime'] = true;
        return setInterval(function() {
          if (ABORT) return;
          if (Browser.allowAsyncCallbacks) {
            func();
          } // drop it on the floor otherwise, next interval will kick in
        }, timeout);
      },getMimetype:function (name) {
        return {
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'png': 'image/png',
          'bmp': 'image/bmp',
          'ogg': 'audio/ogg',
          'wav': 'audio/wav',
          'mp3': 'audio/mpeg'
        }[name.substr(name.lastIndexOf('.')+1)];
      },getUserMedia:function (func) {
        if(!window.getUserMedia) {
          window.getUserMedia = navigator['getUserMedia'] ||
                                navigator['mozGetUserMedia'];
        }
        window.getUserMedia(func);
      },getMovementX:function (event) {
        return event['movementX'] ||
               event['mozMovementX'] ||
               event['webkitMovementX'] ||
               0;
      },getMovementY:function (event) {
        return event['movementY'] ||
               event['mozMovementY'] ||
               event['webkitMovementY'] ||
               0;
      },getMouseWheelDelta:function (event) {
        var delta = 0;
        switch (event.type) {
          case 'DOMMouseScroll': 
            delta = event.detail;
            break;
          case 'mousewheel': 
            delta = event.wheelDelta;
            break;
          case 'wheel': 
            delta = event['deltaY'];
            break;
          default:
            throw 'unrecognized mouse wheel event: ' + event.type;
        }
        return delta;
      },mouseX:0,mouseY:0,mouseMovementX:0,mouseMovementY:0,touches:{},lastTouches:{},calculateMouseEvent:function (event) { // event should be mousemove, mousedown or mouseup
        if (Browser.pointerLock) {
          // When the pointer is locked, calculate the coordinates
          // based on the movement of the mouse.
          // Workaround for Firefox bug 764498
          if (event.type != 'mousemove' &&
              ('mozMovementX' in event)) {
            Browser.mouseMovementX = Browser.mouseMovementY = 0;
          } else {
            Browser.mouseMovementX = Browser.getMovementX(event);
            Browser.mouseMovementY = Browser.getMovementY(event);
          }
          
          // check if SDL is available
          if (typeof SDL != "undefined") {
          	Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
          	Browser.mouseY = SDL.mouseY + Browser.mouseMovementY;
          } else {
          	// just add the mouse delta to the current absolut mouse position
          	// FIXME: ideally this should be clamped against the canvas size and zero
          	Browser.mouseX += Browser.mouseMovementX;
          	Browser.mouseY += Browser.mouseMovementY;
          }        
        } else {
          // Otherwise, calculate the movement based on the changes
          // in the coordinates.
          var rect = Module["canvas"].getBoundingClientRect();
          var cw = Module["canvas"].width;
          var ch = Module["canvas"].height;
  
          // Neither .scrollX or .pageXOffset are defined in a spec, but
          // we prefer .scrollX because it is currently in a spec draft.
          // (see: http://www.w3.org/TR/2013/WD-cssom-view-20131217/)
          var scrollX = ((typeof window.scrollX !== 'undefined') ? window.scrollX : window.pageXOffset);
          var scrollY = ((typeof window.scrollY !== 'undefined') ? window.scrollY : window.pageYOffset);
          // If this assert lands, it's likely because the browser doesn't support scrollX or pageXOffset
          // and we have no viable fallback.
          assert((typeof scrollX !== 'undefined') && (typeof scrollY !== 'undefined'), 'Unable to retrieve scroll position, mouse positions likely broken.');
  
          if (event.type === 'touchstart' || event.type === 'touchend' || event.type === 'touchmove') {
            var touch = event.touch;
            if (touch === undefined) {
              return; // the "touch" property is only defined in SDL
  
            }
            var adjustedX = touch.pageX - (scrollX + rect.left);
            var adjustedY = touch.pageY - (scrollY + rect.top);
  
            adjustedX = adjustedX * (cw / rect.width);
            adjustedY = adjustedY * (ch / rect.height);
  
            var coords = { x: adjustedX, y: adjustedY };
            
            if (event.type === 'touchstart') {
              Browser.lastTouches[touch.identifier] = coords;
              Browser.touches[touch.identifier] = coords;
            } else if (event.type === 'touchend' || event.type === 'touchmove') {
              var last = Browser.touches[touch.identifier];
              if (!last) last = coords;
              Browser.lastTouches[touch.identifier] = last;
              Browser.touches[touch.identifier] = coords;
            } 
            return;
          }
  
          var x = event.pageX - (scrollX + rect.left);
          var y = event.pageY - (scrollY + rect.top);
  
          // the canvas might be CSS-scaled compared to its backbuffer;
          // SDL-using content will want mouse coordinates in terms
          // of backbuffer units.
          x = x * (cw / rect.width);
          y = y * (ch / rect.height);
  
          Browser.mouseMovementX = x - Browser.mouseX;
          Browser.mouseMovementY = y - Browser.mouseY;
          Browser.mouseX = x;
          Browser.mouseY = y;
        }
      },asyncLoad:function (url, onload, onerror, noRunDep) {
        Module['readAsync'](url, function(arrayBuffer) {
          assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
          onload(new Uint8Array(arrayBuffer));
          if (!noRunDep) removeRunDependency('al ' + url);
        }, function(event) {
          if (onerror) {
            onerror();
          } else {
            throw 'Loading data file "' + url + '" failed.';
          }
        });
        if (!noRunDep) addRunDependency('al ' + url);
      },resizeListeners:[],updateResizeListeners:function () {
        var canvas = Module['canvas'];
        Browser.resizeListeners.forEach(function(listener) {
          listener(canvas.width, canvas.height);
        });
      },setCanvasSize:function (width, height, noUpdates) {
        var canvas = Module['canvas'];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners();
      },windowedWidth:0,windowedHeight:0,setFullScreenCanvasSize:function () {
        // check if SDL is available   
        if (typeof SDL != "undefined") {
        	var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        	flags = flags | 0x00800000; // set SDL_FULLSCREEN flag
        	HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },setWindowedCanvasSize:function () {
        // check if SDL is available       
        if (typeof SDL != "undefined") {
        	var flags = HEAPU32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)];
        	flags = flags & ~0x00800000; // clear SDL_FULLSCREEN flag
        	HEAP32[((SDL.screen+Runtime.QUANTUM_SIZE*0)>>2)]=flags
        }
        Browser.updateResizeListeners();
      },updateCanvasDimensions:function (canvas, wNative, hNative) {
        if (wNative && hNative) {
          canvas.widthNative = wNative;
          canvas.heightNative = hNative;
        } else {
          wNative = canvas.widthNative;
          hNative = canvas.heightNative;
        }
        var w = wNative;
        var h = hNative;
        if (Module['forcedAspectRatio'] && Module['forcedAspectRatio'] > 0) {
          if (w/h < Module['forcedAspectRatio']) {
            w = Math.round(h * Module['forcedAspectRatio']);
          } else {
            h = Math.round(w / Module['forcedAspectRatio']);
          }
        }
        if (((document['webkitFullScreenElement'] || document['webkitFullscreenElement'] ||
             document['mozFullScreenElement'] || document['mozFullscreenElement'] ||
             document['fullScreenElement'] || document['fullscreenElement'] ||
             document['msFullScreenElement'] || document['msFullscreenElement'] ||
             document['webkitCurrentFullScreenElement']) === canvas.parentNode) && (typeof screen != 'undefined')) {
           var factor = Math.min(screen.width / w, screen.height / h);
           w = Math.round(w * factor);
           h = Math.round(h * factor);
        }
        if (Browser.resizeCanvas) {
          if (canvas.width  != w) canvas.width  = w;
          if (canvas.height != h) canvas.height = h;
          if (typeof canvas.style != 'undefined') {
            canvas.style.removeProperty( "width");
            canvas.style.removeProperty("height");
          }
        } else {
          if (canvas.width  != wNative) canvas.width  = wNative;
          if (canvas.height != hNative) canvas.height = hNative;
          if (typeof canvas.style != 'undefined') {
            if (w != wNative || h != hNative) {
              canvas.style.setProperty( "width", w + "px", "important");
              canvas.style.setProperty("height", h + "px", "important");
            } else {
              canvas.style.removeProperty( "width");
              canvas.style.removeProperty("height");
            }
          }
        }
      },wgetRequests:{},nextWgetRequestHandle:0,getNextWgetRequestHandle:function () {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle;
      }};function _emscripten_set_main_loop_timing(mode, value) {
      Browser.mainLoop.timingMode = mode;
      Browser.mainLoop.timingValue = value;
  
      if (!Browser.mainLoop.func) {
        console.error('emscripten_set_main_loop_timing: Cannot set timing mode for main loop since a main loop does not exist! Call emscripten_set_main_loop first to set one up.');
        return 1; // Return non-zero on failure, can't set timing mode when there is no main loop.
      }
  
      if (mode == 0 /*EM_TIMING_SETTIMEOUT*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
          setTimeout(Browser.mainLoop.runner, value); // doing this each time means that on exception, we stop
        };
        Browser.mainLoop.method = 'timeout';
      } else if (mode == 1 /*EM_TIMING_RAF*/) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
          Browser.requestAnimationFrame(Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'rAF';
      } else if (mode == 2 /*EM_TIMING_SETIMMEDIATE*/) {
        if (!window['setImmediate']) {
          // Emulate setImmediate. (note: not a complete polyfill, we don't emulate clearImmediate() to keep code size to minimum, since not needed)
          var setImmediates = [];
          var emscriptenMainLoopMessageId = '__emcc';
          function Browser_setImmediate_messageHandler(event) {
            if (event.source === window && event.data === emscriptenMainLoopMessageId) {
              event.stopPropagation();
              setImmediates.shift()();
            }
          }
          window.addEventListener("message", Browser_setImmediate_messageHandler, true);
          window['setImmediate'] = function Browser_emulated_setImmediate(func) {
            setImmediates.push(func);
            window.postMessage(emscriptenMainLoopMessageId, "*");
          }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
          window['setImmediate'](Browser.mainLoop.runner);
        };
        Browser.mainLoop.method = 'immediate';
      }
      return 0;
    }function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
      Module['noExitRuntime'] = true;
  
      assert(!Browser.mainLoop.func, 'emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.');
  
      Browser.mainLoop.func = func;
      Browser.mainLoop.arg = arg;
  
      var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
  
      Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
          var start = Date.now();
          var blocker = Browser.mainLoop.queue.shift();
          blocker.func(blocker.arg);
          if (Browser.mainLoop.remainingBlockers) {
            var remaining = Browser.mainLoop.remainingBlockers;
            var next = remaining%1 == 0 ? remaining-1 : Math.floor(remaining);
            if (blocker.counted) {
              Browser.mainLoop.remainingBlockers = next;
            } else {
              // not counted, but move the progress along a tiny bit
              next = next + 0.5; // do not steal all the next one's progress
              Browser.mainLoop.remainingBlockers = (8*remaining + next)/9;
            }
          }
          console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + ' ms'); //, left: ' + Browser.mainLoop.remainingBlockers);
          Browser.mainLoop.updateStatus();
          
          // catches pause/resume main loop from blocker execution
          if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
          
          setTimeout(Browser.mainLoop.runner, 0);
          return;
        }
  
        // catch pauses from non-main loop sources
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Implement very basic swap interval control
        Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
        if (Browser.mainLoop.timingMode == 1/*EM_TIMING_RAF*/ && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
          // Not the scheduled time to render this frame - skip.
          Browser.mainLoop.scheduler();
          return;
        }
  
        // Signal GL rendering layer that processing of a new frame is about to start. This helps it optimize
        // VBO double-buffering and reduce GPU stalls.
  
        if (Browser.mainLoop.method === 'timeout' && Module.ctx) {
          Module.printErr('Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!');
          Browser.mainLoop.method = ''; // just warn once per call to set main loop
        }
  
        Browser.mainLoop.runIter(function() {
          if (typeof arg !== 'undefined') {
            Runtime.dynCall('vi', func, [arg]);
          } else {
            Runtime.dynCall('v', func);
          }
        });
  
        // catch pauses from the main loop itself
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
  
        // Queue new audio data. This is important to be right after the main loop invocation, so that we will immediately be able
        // to queue the newest produced audio samples.
        // TODO: Consider adding pre- and post- rAF callbacks so that GL.newRenderingFrameStarted() and SDL.audio.queueNewAudioData()
        //       do not need to be hardcoded into this function, but can be more generic.
        if (typeof SDL === 'object' && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
  
        Browser.mainLoop.scheduler();
      }
  
      if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0/*EM_TIMING_SETTIMEOUT*/, 1000.0 / fps);
        else _emscripten_set_main_loop_timing(1/*EM_TIMING_RAF*/, 1); // Do rAF by rendering each frame (no decimating)
  
        Browser.mainLoop.scheduler();
      }
  
      if (simulateInfiniteLoop) {
        throw 'SimulateInfiniteLoop';
      }
    }

   
  Module["_memset"] = _memset;

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

   
  Module["_bitshift64Lshr"] = _bitshift64Lshr;

   
  Module["_bitshift64Shl"] = _bitshift64Shl;

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _abort() {
      Module['abort']();
    }

  function ___lock() {}

  function ___unlock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  var _emscripten_asm_const=true;

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _sysconf(name) {
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 30: return PAGE_SIZE;
        case 85: return totalMemory / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
          return 200809;
        case 79:
          return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
          return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
          return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
          return 1024;
        case 31:
        case 42:
        case 72:
          return 32;
        case 87:
        case 26:
        case 33:
          return 2147483647;
        case 34:
        case 1:
          return 47839;
        case 38:
        case 36:
          return 99;
        case 43:
        case 37:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 28: return 32768;
        case 44: return 32767;
        case 75: return 16384;
        case 39: return 1000;
        case 89: return 700;
        case 71: return 256;
        case 40: return 255;
        case 2: return 100;
        case 180: return 64;
        case 25: return 20;
        case 5: return 16;
        case 6: return 6;
        case 73: return 4;
        case 84: {
          if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
          return 1;
        }
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

  function _sbrk(bytes) {
      // Implement a Linux-like 'memory area' for our 'process'.
      // Changes the size of the memory area by |bytes|; returns the
      // address of the previous top ('break') of the memory area
      // We control the "dynamic" memory - DYNAMIC_BASE to DYNAMICTOP
      var self = _sbrk;
      if (!self.called) {
        DYNAMICTOP = alignMemoryPage(DYNAMICTOP); // make sure we start out aligned
        self.called = true;
        assert(Runtime.dynamicAlloc);
        self.alloc = Runtime.dynamicAlloc;
        Runtime.dynamicAlloc = function() { abort('cannot dynamically allocate, sbrk now has control') };
      }
      var ret = DYNAMICTOP;
      if (bytes != 0) {
        var success = self.alloc(bytes);
        if (!success) return -1 >>> 0; // sbrk failure code
      }
      return ret;  // Previous break location.
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  var _emscripten_asm_const_int=true;

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _time(ptr) {
      var ret = (Date.now()/1000)|0;
      if (ptr) {
        HEAP32[((ptr)>>2)]=ret;
      }
      return ret;
    }

  function _pthread_self() {
      //FIXME: assumes only a single thread
      return 0;
    }

  function _emscripten_cancel_main_loop() {
      Browser.mainLoop.pause();
      Browser.mainLoop.func = null;
    }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) { Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice) };
  Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) { Browser.requestAnimationFrame(func) };
  Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) { Browser.setCanvasSize(width, height, noUpdates) };
  Module["pauseMainLoop"] = function Module_pauseMainLoop() { Browser.mainLoop.pause() };
  Module["resumeMainLoop"] = function Module_resumeMainLoop() { Browser.mainLoop.resume() };
  Module["getUserMedia"] = function Module_getUserMedia() { Browser.getUserMedia() }
  Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) { return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes) };
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

staticSealed = true; // seal the static portion of memory

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");

 var cttz_i8 = allocate([8,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,7,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,6,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,5,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0,4,0,1,0,2,0,1,0,3,0,1,0,2,0,1,0], "i8", ALLOC_DYNAMIC);


var debug_table_i = ["0", "_usrClear", "_consVer", "_usrExit", "_makeChild", "_closeChild", "_focusCmd", "_moveChild", "_moveMe", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_ii = ["0", "0", "0", "0", "0", "0", "0", "0", "0", "___stdio_close", "0", "0", "0", "0", "0", "0"];
var debug_table_iiii = ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "___stdout_write", "___stdio_seek", "0", "0", "0", "___stdio_write"];
var debug_table_vi = ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "_Rect_deleter", "_window_deleter", "0", "0", "_cleanup_282", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0"];
var debug_table_v = ["0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "0", "_input_loop", "0"];
function nullFunc_i(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'i'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: i: " + debug_table_i[x] + "  iiii: " + debug_table_iiii[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: ii: " + debug_table_ii[x] + "  i: " + debug_table_i[x] + "  vi: " + debug_table_vi[x] + "  v: " + debug_table_v[x] + "  "); abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: v: " + debug_table_v[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function nullFunc_v(x) { Module["printErr"]("Invalid function pointer '" + x + "' called with signature 'v'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("This pointer might make sense in another type signature: vi: " + debug_table_vi[x] + "  i: " + debug_table_i[x] + "  ii: " + debug_table_ii[x] + "  iiii: " + debug_table_iiii[x] + "  "); abort(x) }

function invoke_i(index) {
  try {
    return Module["dynCall_i"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_v(index) {
  try {
    Module["dynCall_v"](index);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity, "byteLength": byteLength };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "nullFunc_i": nullFunc_i, "nullFunc_ii": nullFunc_ii, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_v": nullFunc_v, "invoke_i": invoke_i, "invoke_ii": invoke_ii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_v": invoke_v, "_pthread_cleanup_pop": _pthread_cleanup_pop, "_emscripten_asm_const_iiiii": _emscripten_asm_const_iiiii, "_emscripten_asm_const_iiiiiiii": _emscripten_asm_const_iiiiiiii, "___syscall6": ___syscall6, "___setErrNo": ___setErrNo, "_emscripten_asm_const_ii": _emscripten_asm_const_ii, "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing, "_sbrk": _sbrk, "_emscripten_memcpy_big": _emscripten_memcpy_big, "_emscripten_asm_const_v": _emscripten_asm_const_v, "_sysconf": _sysconf, "_pthread_self": _pthread_self, "___syscall54": ___syscall54, "___unlock": ___unlock, "_emscripten_set_main_loop": _emscripten_set_main_loop, "_emscripten_asm_const_iii": _emscripten_asm_const_iii, "___lock": ___lock, "_abort": _abort, "_pthread_cleanup_push": _pthread_cleanup_push, "_time": _time, "_emscripten_cancel_main_loop": _emscripten_cancel_main_loop, "___syscall140": ___syscall140, "___syscall146": ___syscall146, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "cttz_i8": cttz_i8 };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var Int8View = global.Int8Array;
  var Int16View = global.Int16Array;
  var Int32View = global.Int32Array;
  var Uint8View = global.Uint8Array;
  var Uint16View = global.Uint16Array;
  var Uint32View = global.Uint32Array;
  var Float32View = global.Float32Array;
  var Float64View = global.Float64Array;
  var HEAP8 = new Int8View(buffer);
  var HEAP16 = new Int16View(buffer);
  var HEAP32 = new Int32View(buffer);
  var HEAPU8 = new Uint8View(buffer);
  var HEAPU16 = new Uint16View(buffer);
  var HEAPU32 = new Uint32View(buffer);
  var HEAPF32 = new Float32View(buffer);
  var HEAPF64 = new Float64View(buffer);
  var byteLength = global.byteLength;


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var cttz_i8=env.cttz_i8|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;

  var tempRet0 = 0;
  var tempRet1 = 0;
  var tempRet2 = 0;
  var tempRet3 = 0;
  var tempRet4 = 0;
  var tempRet5 = 0;
  var tempRet6 = 0;
  var tempRet7 = 0;
  var tempRet8 = 0;
  var tempRet9 = 0;
  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var nullFunc_i=env.nullFunc_i;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_v=env.nullFunc_v;
  var invoke_i=env.invoke_i;
  var invoke_ii=env.invoke_ii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var invoke_v=env.invoke_v;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var _emscripten_asm_const_iiiii=env._emscripten_asm_const_iiiii;
  var _emscripten_asm_const_iiiiiiii=env._emscripten_asm_const_iiiiiiii;
  var ___syscall6=env.___syscall6;
  var ___setErrNo=env.___setErrNo;
  var _emscripten_asm_const_ii=env._emscripten_asm_const_ii;
  var _emscripten_set_main_loop_timing=env._emscripten_set_main_loop_timing;
  var _sbrk=env._sbrk;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var _emscripten_asm_const_v=env._emscripten_asm_const_v;
  var _sysconf=env._sysconf;
  var _pthread_self=env._pthread_self;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var _emscripten_set_main_loop=env._emscripten_set_main_loop;
  var _emscripten_asm_const_iii=env._emscripten_asm_const_iii;
  var ___lock=env.___lock;
  var _abort=env._abort;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var _time=env._time;
  var _emscripten_cancel_main_loop=env._emscripten_cancel_main_loop;
  var ___syscall140=env.___syscall140;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

function _emscripten_replace_memory(newBuffer) {
  if ((byteLength(newBuffer) & 0xffffff || byteLength(newBuffer) <= 0xffffff) || byteLength(newBuffer) > 0x80000000) return false;
  HEAP8 = new Int8View(newBuffer);
  HEAP16 = new Int16View(newBuffer);
  HEAP32 = new Int32View(newBuffer);
  HEAPU8 = new Uint8View(newBuffer);
  HEAPU16 = new Uint16View(newBuffer);
  HEAPU32 = new Uint32View(newBuffer);
  HEAPF32 = new Float32View(newBuffer);
  HEAPF64 = new Float64View(newBuffer);
  buffer = newBuffer;
  return true;
}

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
if ((STACKTOP|0) >= (STACK_MAX|0)) abort();

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}
function copyTempFloat(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
}
function copyTempDouble(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
  HEAP8[tempDoublePtr+4>>0] = HEAP8[ptr+4>>0];
  HEAP8[tempDoublePtr+5>>0] = HEAP8[ptr+5>>0];
  HEAP8[tempDoublePtr+6>>0] = HEAP8[ptr+6>>0];
  HEAP8[tempDoublePtr+7>>0] = HEAP8[ptr+7>>0];
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function _bmpDrawHLine($bmp,$x,$y,$length,$color) {
 $bmp = $bmp|0;
 $x = $x|0;
 $y = $y|0;
 $length = $length|0;
 $color = $color|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $endx = 0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $x;
 $2 = $y;
 $3 = $length;
 $4 = $color;
 $5 = $1; //@line 182 "main.c"
 $6 = $3; //@line 182 "main.c"
 $7 = (($5) + ($6))|0; //@line 182 "main.c"
 $endx = $7; //@line 182 "main.c"
 $8 = $1; //@line 184 "main.c"
 $i = $8; //@line 184 "main.c"
 while(1) {
  $9 = $i; //@line 184 "main.c"
  $10 = $endx; //@line 184 "main.c"
  $11 = ($9|0)<($10|0); //@line 184 "main.c"
  if (!($11)) {
   break;
  }
  $12 = $4; //@line 185 "main.c"
  $13 = $2; //@line 185 "main.c"
  $14 = $0; //@line 185 "main.c"
  $15 = ((($14)) + 4|0); //@line 185 "main.c"
  $16 = HEAP32[$15>>2]|0; //@line 185 "main.c"
  $17 = Math_imul($13, $16)|0; //@line 185 "main.c"
  $18 = $i; //@line 185 "main.c"
  $19 = (($17) + ($18))|0; //@line 185 "main.c"
  $20 = $0; //@line 185 "main.c"
  $21 = ((($20)) + 8|0); //@line 185 "main.c"
  $22 = HEAP32[$21>>2]|0; //@line 185 "main.c"
  $23 = (($22) + ($19<<2)|0); //@line 185 "main.c"
  HEAP32[$23>>2] = $12; //@line 185 "main.c"
  $24 = $i; //@line 184 "main.c"
  $25 = (($24) + 1)|0; //@line 184 "main.c"
  $i = $25; //@line 184 "main.c"
 }
 STACKTOP = sp;return; //@line 186 "main.c"
}
function _bmpDrawVLine($bmp,$x,$y,$length,$color) {
 $bmp = $bmp|0;
 $x = $x|0;
 $y = $y|0;
 $length = $length|0;
 $color = $color|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $3 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $endy = 0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $x;
 $2 = $y;
 $3 = $length;
 $4 = $color;
 $5 = $3; //@line 192 "main.c"
 $6 = $2; //@line 192 "main.c"
 $7 = (($5) + ($6))|0; //@line 192 "main.c"
 $endy = $7; //@line 192 "main.c"
 $8 = $2; //@line 194 "main.c"
 $i = $8; //@line 194 "main.c"
 while(1) {
  $9 = $i; //@line 194 "main.c"
  $10 = $endy; //@line 194 "main.c"
  $11 = ($9|0)<($10|0); //@line 194 "main.c"
  if (!($11)) {
   break;
  }
  $12 = $4; //@line 195 "main.c"
  $13 = $i; //@line 195 "main.c"
  $14 = $0; //@line 195 "main.c"
  $15 = ((($14)) + 4|0); //@line 195 "main.c"
  $16 = HEAP32[$15>>2]|0; //@line 195 "main.c"
  $17 = Math_imul($13, $16)|0; //@line 195 "main.c"
  $18 = $1; //@line 195 "main.c"
  $19 = (($17) + ($18))|0; //@line 195 "main.c"
  $20 = $0; //@line 195 "main.c"
  $21 = ((($20)) + 8|0); //@line 195 "main.c"
  $22 = HEAP32[$21>>2]|0; //@line 195 "main.c"
  $23 = (($22) + ($19<<2)|0); //@line 195 "main.c"
  HEAP32[$23>>2] = $12; //@line 195 "main.c"
  $24 = $i; //@line 194 "main.c"
  $25 = (($24) + 1)|0; //@line 194 "main.c"
  $i = $25; //@line 194 "main.c"
 }
 STACKTOP = sp;return; //@line 196 "main.c"
}
function _bmpFillRect($bmp,$x,$y,$width,$height,$color) {
 $bmp = $bmp|0;
 $x = $x|0;
 $y = $y|0;
 $width = $width|0;
 $height = $height|0;
 $color = $color|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $endx = 0, $endy = 0, $i = 0, $j = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $x;
 $2 = $y;
 $3 = $width;
 $4 = $height;
 $5 = $color;
 $6 = $3; //@line 213 "main.c"
 $7 = $1; //@line 213 "main.c"
 $8 = (($6) + ($7))|0; //@line 213 "main.c"
 $endx = $8; //@line 213 "main.c"
 $9 = $4; //@line 214 "main.c"
 $10 = $2; //@line 214 "main.c"
 $11 = (($9) + ($10))|0; //@line 214 "main.c"
 $endy = $11; //@line 214 "main.c"
 $12 = $2; //@line 221 "main.c"
 $i = $12; //@line 221 "main.c"
 while(1) {
  $13 = $i; //@line 221 "main.c"
  $14 = $endy; //@line 221 "main.c"
  $15 = ($13|0)<($14|0); //@line 221 "main.c"
  if (!($15)) {
   break;
  }
  $16 = $1; //@line 223 "main.c"
  $j = $16; //@line 223 "main.c"
  while(1) {
   $17 = $j; //@line 223 "main.c"
   $18 = $endx; //@line 223 "main.c"
   $19 = ($17|0)<($18|0); //@line 223 "main.c"
   if (!($19)) {
    break;
   }
   $20 = $5; //@line 225 "main.c"
   $21 = $i; //@line 225 "main.c"
   $22 = $0; //@line 225 "main.c"
   $23 = ((($22)) + 4|0); //@line 225 "main.c"
   $24 = HEAP32[$23>>2]|0; //@line 225 "main.c"
   $25 = Math_imul($21, $24)|0; //@line 225 "main.c"
   $26 = $j; //@line 225 "main.c"
   $27 = (($25) + ($26))|0; //@line 225 "main.c"
   $28 = $0; //@line 225 "main.c"
   $29 = ((($28)) + 8|0); //@line 225 "main.c"
   $30 = HEAP32[$29>>2]|0; //@line 225 "main.c"
   $31 = (($30) + ($27<<2)|0); //@line 225 "main.c"
   HEAP32[$31>>2] = $20; //@line 225 "main.c"
   $32 = $j; //@line 223 "main.c"
   $33 = (($32) + 1)|0; //@line 223 "main.c"
   $j = $33; //@line 223 "main.c"
  }
  $34 = $i; //@line 221 "main.c"
  $35 = (($34) + 1)|0; //@line 221 "main.c"
  $i = $35; //@line 221 "main.c"
 }
 STACKTOP = sp;return; //@line 228 "main.c"
}
function _bmpDrawCharacter($bmp,$c,$x,$y,$color) {
 $bmp = $bmp|0;
 $c = $c|0;
 $x = $x|0;
 $y = $y|0;
 $color = $color|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $c;
 $2 = $x;
 $3 = $y;
 $4 = $color;
 STACKTOP = sp;return; //@line 233 "main.c"
}
function _drawBmpRect($win,$r) {
 $win = $win|0;
 $r = $r|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $win;
 $1 = $r;
 $2 = $1; //@line 302 "main.c"
 $3 = HEAP32[$2>>2]|0; //@line 302 "main.c"
 $4 = $0; //@line 302 "main.c"
 $5 = ((($4)) + 28|0); //@line 302 "main.c"
 $6 = HEAP32[$5>>2]|0; //@line 302 "main.c"
 $7 = (($3) - ($6))|0; //@line 302 "main.c"
 $8 = $0; //@line 302 "main.c"
 $9 = ((($8)) + 12|0); //@line 302 "main.c"
 $10 = HEAP32[$9>>2]|0; //@line 302 "main.c"
 $11 = ((($10)) + 12|0); //@line 302 "main.c"
 HEAP32[$11>>2] = $7; //@line 302 "main.c"
 $12 = $1; //@line 303 "main.c"
 $13 = ((($12)) + 12|0); //@line 303 "main.c"
 $14 = HEAP32[$13>>2]|0; //@line 303 "main.c"
 $15 = $0; //@line 303 "main.c"
 $16 = ((($15)) + 24|0); //@line 303 "main.c"
 $17 = HEAP32[$16>>2]|0; //@line 303 "main.c"
 $18 = (($14) - ($17))|0; //@line 303 "main.c"
 $19 = $0; //@line 303 "main.c"
 $20 = ((($19)) + 12|0); //@line 303 "main.c"
 $21 = HEAP32[$20>>2]|0; //@line 303 "main.c"
 $22 = ((($21)) + 16|0); //@line 303 "main.c"
 HEAP32[$22>>2] = $18; //@line 303 "main.c"
 $23 = $1; //@line 304 "main.c"
 $24 = ((($23)) + 8|0); //@line 304 "main.c"
 $25 = HEAP32[$24>>2]|0; //@line 304 "main.c"
 $26 = $0; //@line 304 "main.c"
 $27 = ((($26)) + 28|0); //@line 304 "main.c"
 $28 = HEAP32[$27>>2]|0; //@line 304 "main.c"
 $29 = (($25) - ($28))|0; //@line 304 "main.c"
 $30 = $0; //@line 304 "main.c"
 $31 = ((($30)) + 12|0); //@line 304 "main.c"
 $32 = HEAP32[$31>>2]|0; //@line 304 "main.c"
 $33 = ((($32)) + 20|0); //@line 304 "main.c"
 HEAP32[$33>>2] = $29; //@line 304 "main.c"
 $34 = $1; //@line 305 "main.c"
 $35 = ((($34)) + 4|0); //@line 305 "main.c"
 $36 = HEAP32[$35>>2]|0; //@line 305 "main.c"
 $37 = $0; //@line 305 "main.c"
 $38 = ((($37)) + 24|0); //@line 305 "main.c"
 $39 = HEAP32[$38>>2]|0; //@line 305 "main.c"
 $40 = (($36) - ($39))|0; //@line 305 "main.c"
 $41 = $0; //@line 305 "main.c"
 $42 = ((($41)) + 12|0); //@line 305 "main.c"
 $43 = HEAP32[$42>>2]|0; //@line 305 "main.c"
 $44 = ((($43)) + 24|0); //@line 305 "main.c"
 HEAP32[$44>>2] = $40; //@line 305 "main.c"
 $45 = $0; //@line 308 "main.c"
 $46 = ((($45)) + 24|0); //@line 308 "main.c"
 $47 = HEAP32[$46>>2]|0; //@line 308 "main.c"
 $48 = $47&65535; //@line 308 "main.c"
 $49 = $0; //@line 308 "main.c"
 $50 = ((($49)) + 28|0); //@line 308 "main.c"
 $51 = HEAP32[$50>>2]|0; //@line 308 "main.c"
 $52 = $51&65535; //@line 308 "main.c"
 _setCursor($48,$52); //@line 308 "main.c"
 $53 = $0; //@line 309 "main.c"
 $54 = ((($53)) + 12|0); //@line 309 "main.c"
 $55 = HEAP32[$54>>2]|0; //@line 309 "main.c"
 _drawBitmap($55); //@line 309 "main.c"
 STACKTOP = sp;return; //@line 311 "main.c"
}
function _splitRect($rdest,$rknife) {
 $rdest = $rdest|0;
 $rknife = $rknife|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0;
 var $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0;
 var $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $baserect = 0, $new_rect = 0, $outrect = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $baserect = sp + 8|0;
 $1 = $rdest;
 $2 = $rknife;
 $3 = $1; //@line 319 "main.c"
 $4 = HEAP32[$3>>2]|0; //@line 319 "main.c"
 HEAP32[$baserect>>2] = $4; //@line 319 "main.c"
 $5 = $1; //@line 320 "main.c"
 $6 = ((($5)) + 12|0); //@line 320 "main.c"
 $7 = HEAP32[$6>>2]|0; //@line 320 "main.c"
 $8 = ((($baserect)) + 12|0); //@line 320 "main.c"
 HEAP32[$8>>2] = $7; //@line 320 "main.c"
 $9 = $1; //@line 321 "main.c"
 $10 = ((($9)) + 8|0); //@line 321 "main.c"
 $11 = HEAP32[$10>>2]|0; //@line 321 "main.c"
 $12 = ((($baserect)) + 8|0); //@line 321 "main.c"
 HEAP32[$12>>2] = $11; //@line 321 "main.c"
 $13 = $1; //@line 322 "main.c"
 $14 = ((($13)) + 4|0); //@line 322 "main.c"
 $15 = HEAP32[$14>>2]|0; //@line 322 "main.c"
 $16 = ((($baserect)) + 4|0); //@line 322 "main.c"
 HEAP32[$16>>2] = $15; //@line 322 "main.c"
 $17 = (_List_new()|0); //@line 352 "main.c"
 $outrect = $17; //@line 352 "main.c"
 $18 = $outrect; //@line 353 "main.c"
 $19 = ($18|0)!=(0|0); //@line 353 "main.c"
 if (!($19)) {
  _prints(988); //@line 355 "main.c"
  $20 = $outrect; //@line 356 "main.c"
  $0 = $20; //@line 356 "main.c"
  $152 = $0; //@line 465 "main.c"
  STACKTOP = sp;return ($152|0); //@line 465 "main.c"
 }
 $21 = $2; //@line 361 "main.c"
 $22 = ((($21)) + 12|0); //@line 361 "main.c"
 $23 = HEAP32[$22>>2]|0; //@line 361 "main.c"
 $24 = ((($baserect)) + 12|0); //@line 361 "main.c"
 $25 = HEAP32[$24>>2]|0; //@line 361 "main.c"
 $26 = ($23>>>0)>($25>>>0); //@line 361 "main.c"
 do {
  if ($26) {
   $27 = $2; //@line 361 "main.c"
   $28 = ((($27)) + 12|0); //@line 361 "main.c"
   $29 = HEAP32[$28>>2]|0; //@line 361 "main.c"
   $30 = ((($baserect)) + 4|0); //@line 361 "main.c"
   $31 = HEAP32[$30>>2]|0; //@line 361 "main.c"
   $32 = ($29>>>0)<($31>>>0); //@line 361 "main.c"
   if ($32) {
    $33 = HEAP32[$baserect>>2]|0; //@line 363 "main.c"
    $34 = ((($baserect)) + 12|0); //@line 363 "main.c"
    $35 = HEAP32[$34>>2]|0; //@line 363 "main.c"
    $36 = ((($baserect)) + 8|0); //@line 363 "main.c"
    $37 = HEAP32[$36>>2]|0; //@line 363 "main.c"
    $38 = $2; //@line 363 "main.c"
    $39 = ((($38)) + 12|0); //@line 363 "main.c"
    $40 = HEAP32[$39>>2]|0; //@line 363 "main.c"
    $41 = (($40) - 1)|0; //@line 363 "main.c"
    $42 = (_Rect_new($33,$35,$37,$41)|0); //@line 363 "main.c"
    $new_rect = $42; //@line 363 "main.c"
    $43 = $new_rect; //@line 365 "main.c"
    $44 = ($43|0)!=(0|0); //@line 365 "main.c"
    $45 = $outrect; //@line 371 "main.c"
    if (!($44)) {
     _List_delete($45,12); //@line 367 "main.c"
     $0 = 0; //@line 368 "main.c"
     $152 = $0; //@line 465 "main.c"
     STACKTOP = sp;return ($152|0); //@line 465 "main.c"
    }
    $46 = $new_rect; //@line 371 "main.c"
    $47 = (_List_add($45,$46)|0); //@line 371 "main.c"
    $48 = ($47|0)!=(0); //@line 371 "main.c"
    if ($48) {
     $51 = $2; //@line 378 "main.c"
     $52 = ((($51)) + 12|0); //@line 378 "main.c"
     $53 = HEAP32[$52>>2]|0; //@line 378 "main.c"
     $54 = ((($baserect)) + 12|0); //@line 378 "main.c"
     HEAP32[$54>>2] = $53; //@line 378 "main.c"
     break;
    }
    $49 = $new_rect; //@line 373 "main.c"
    _free($49); //@line 373 "main.c"
    $50 = $outrect; //@line 374 "main.c"
    _List_delete($50,12); //@line 374 "main.c"
    $0 = 0; //@line 375 "main.c"
    $152 = $0; //@line 465 "main.c"
    STACKTOP = sp;return ($152|0); //@line 465 "main.c"
   }
  }
 } while(0);
 $55 = $2; //@line 383 "main.c"
 $56 = HEAP32[$55>>2]|0; //@line 383 "main.c"
 $57 = ((($baserect)) + 8|0); //@line 383 "main.c"
 $58 = HEAP32[$57>>2]|0; //@line 383 "main.c"
 $59 = ($56>>>0)<($58>>>0); //@line 383 "main.c"
 do {
  if ($59) {
   $60 = $2; //@line 383 "main.c"
   $61 = HEAP32[$60>>2]|0; //@line 383 "main.c"
   $62 = HEAP32[$baserect>>2]|0; //@line 383 "main.c"
   $63 = ($61>>>0)>($62>>>0); //@line 383 "main.c"
   if ($63) {
    $64 = HEAP32[$baserect>>2]|0; //@line 385 "main.c"
    $65 = ((($baserect)) + 12|0); //@line 385 "main.c"
    $66 = HEAP32[$65>>2]|0; //@line 385 "main.c"
    $67 = $2; //@line 385 "main.c"
    $68 = HEAP32[$67>>2]|0; //@line 385 "main.c"
    $69 = (($68) - 1)|0; //@line 385 "main.c"
    $70 = ((($baserect)) + 4|0); //@line 385 "main.c"
    $71 = HEAP32[$70>>2]|0; //@line 385 "main.c"
    $72 = (_Rect_new($64,$66,$69,$71)|0); //@line 385 "main.c"
    $new_rect = $72; //@line 385 "main.c"
    $73 = $new_rect; //@line 387 "main.c"
    $74 = ($73|0)!=(0|0); //@line 387 "main.c"
    $75 = $outrect; //@line 393 "main.c"
    if (!($74)) {
     _List_delete($75,12); //@line 389 "main.c"
     $0 = 0; //@line 390 "main.c"
     $152 = $0; //@line 465 "main.c"
     STACKTOP = sp;return ($152|0); //@line 465 "main.c"
    }
    $76 = $new_rect; //@line 393 "main.c"
    $77 = (_List_add($75,$76)|0); //@line 393 "main.c"
    $78 = ($77|0)!=(0); //@line 393 "main.c"
    if ($78) {
     $81 = $2; //@line 400 "main.c"
     $82 = HEAP32[$81>>2]|0; //@line 400 "main.c"
     HEAP32[$baserect>>2] = $82; //@line 400 "main.c"
     break;
    }
    $79 = $new_rect; //@line 395 "main.c"
    _free($79); //@line 395 "main.c"
    $80 = $outrect; //@line 396 "main.c"
    _List_delete($80,12); //@line 396 "main.c"
    $0 = 0; //@line 397 "main.c"
    $152 = $0; //@line 465 "main.c"
    STACKTOP = sp;return ($152|0); //@line 465 "main.c"
   }
  }
 } while(0);
 $83 = $2; //@line 405 "main.c"
 $84 = ((($83)) + 4|0); //@line 405 "main.c"
 $85 = HEAP32[$84>>2]|0; //@line 405 "main.c"
 $86 = ((($baserect)) + 12|0); //@line 405 "main.c"
 $87 = HEAP32[$86>>2]|0; //@line 405 "main.c"
 $88 = ($85>>>0)>($87>>>0); //@line 405 "main.c"
 do {
  if ($88) {
   $89 = $2; //@line 405 "main.c"
   $90 = ((($89)) + 4|0); //@line 405 "main.c"
   $91 = HEAP32[$90>>2]|0; //@line 405 "main.c"
   $92 = ((($baserect)) + 4|0); //@line 405 "main.c"
   $93 = HEAP32[$92>>2]|0; //@line 405 "main.c"
   $94 = ($91>>>0)<($93>>>0); //@line 405 "main.c"
   if ($94) {
    $95 = HEAP32[$baserect>>2]|0; //@line 407 "main.c"
    $96 = $2; //@line 407 "main.c"
    $97 = ((($96)) + 4|0); //@line 407 "main.c"
    $98 = HEAP32[$97>>2]|0; //@line 407 "main.c"
    $99 = (($98) + 1)|0; //@line 407 "main.c"
    $100 = ((($baserect)) + 8|0); //@line 407 "main.c"
    $101 = HEAP32[$100>>2]|0; //@line 407 "main.c"
    $102 = ((($baserect)) + 4|0); //@line 407 "main.c"
    $103 = HEAP32[$102>>2]|0; //@line 407 "main.c"
    $104 = (_Rect_new($95,$99,$101,$103)|0); //@line 407 "main.c"
    $new_rect = $104; //@line 407 "main.c"
    $105 = $new_rect; //@line 409 "main.c"
    $106 = ($105|0)!=(0|0); //@line 409 "main.c"
    $107 = $outrect; //@line 415 "main.c"
    if (!($106)) {
     _List_delete($107,12); //@line 411 "main.c"
     $0 = 0; //@line 412 "main.c"
     $152 = $0; //@line 465 "main.c"
     STACKTOP = sp;return ($152|0); //@line 465 "main.c"
    }
    $108 = $new_rect; //@line 415 "main.c"
    $109 = (_List_add($107,$108)|0); //@line 415 "main.c"
    $110 = ($109|0)!=(0); //@line 415 "main.c"
    if ($110) {
     $113 = $2; //@line 422 "main.c"
     $114 = ((($113)) + 4|0); //@line 422 "main.c"
     $115 = HEAP32[$114>>2]|0; //@line 422 "main.c"
     $116 = ((($baserect)) + 4|0); //@line 422 "main.c"
     HEAP32[$116>>2] = $115; //@line 422 "main.c"
     break;
    }
    $111 = $new_rect; //@line 417 "main.c"
    _free($111); //@line 417 "main.c"
    $112 = $outrect; //@line 418 "main.c"
    _List_delete($112,12); //@line 418 "main.c"
    $0 = 0; //@line 419 "main.c"
    $152 = $0; //@line 465 "main.c"
    STACKTOP = sp;return ($152|0); //@line 465 "main.c"
   }
  }
 } while(0);
 $117 = $2; //@line 427 "main.c"
 $118 = ((($117)) + 8|0); //@line 427 "main.c"
 $119 = HEAP32[$118>>2]|0; //@line 427 "main.c"
 $120 = HEAP32[$baserect>>2]|0; //@line 427 "main.c"
 $121 = ($119>>>0)>($120>>>0); //@line 427 "main.c"
 do {
  if ($121) {
   $122 = $2; //@line 427 "main.c"
   $123 = ((($122)) + 8|0); //@line 427 "main.c"
   $124 = HEAP32[$123>>2]|0; //@line 427 "main.c"
   $125 = ((($baserect)) + 8|0); //@line 427 "main.c"
   $126 = HEAP32[$125>>2]|0; //@line 427 "main.c"
   $127 = ($124>>>0)<($126>>>0); //@line 427 "main.c"
   if ($127) {
    $128 = $2; //@line 429 "main.c"
    $129 = ((($128)) + 8|0); //@line 429 "main.c"
    $130 = HEAP32[$129>>2]|0; //@line 429 "main.c"
    $131 = (($130) + 1)|0; //@line 429 "main.c"
    $132 = ((($baserect)) + 12|0); //@line 429 "main.c"
    $133 = HEAP32[$132>>2]|0; //@line 429 "main.c"
    $134 = ((($baserect)) + 8|0); //@line 429 "main.c"
    $135 = HEAP32[$134>>2]|0; //@line 429 "main.c"
    $136 = ((($baserect)) + 4|0); //@line 429 "main.c"
    $137 = HEAP32[$136>>2]|0; //@line 429 "main.c"
    $138 = (_Rect_new($131,$133,$135,$137)|0); //@line 429 "main.c"
    $new_rect = $138; //@line 429 "main.c"
    $139 = $new_rect; //@line 431 "main.c"
    $140 = ($139|0)!=(0|0); //@line 431 "main.c"
    $141 = $outrect; //@line 437 "main.c"
    if (!($140)) {
     _List_delete($141,12); //@line 433 "main.c"
     $0 = 0; //@line 434 "main.c"
     $152 = $0; //@line 465 "main.c"
     STACKTOP = sp;return ($152|0); //@line 465 "main.c"
    }
    $142 = $new_rect; //@line 437 "main.c"
    $143 = (_List_add($141,$142)|0); //@line 437 "main.c"
    $144 = ($143|0)!=(0); //@line 437 "main.c"
    if ($144) {
     $147 = $2; //@line 444 "main.c"
     $148 = ((($147)) + 8|0); //@line 444 "main.c"
     $149 = HEAP32[$148>>2]|0; //@line 444 "main.c"
     $150 = ((($baserect)) + 8|0); //@line 444 "main.c"
     HEAP32[$150>>2] = $149; //@line 444 "main.c"
     break;
    }
    $145 = $new_rect; //@line 439 "main.c"
    _free($145); //@line 439 "main.c"
    $146 = $outrect; //@line 440 "main.c"
    _List_delete($146,12); //@line 440 "main.c"
    $0 = 0; //@line 441 "main.c"
    $152 = $0; //@line 465 "main.c"
    STACKTOP = sp;return ($152|0); //@line 465 "main.c"
   }
  }
 } while(0);
 $151 = $outrect; //@line 464 "main.c"
 $0 = $151; //@line 464 "main.c"
 $152 = $0; //@line 465 "main.c"
 STACKTOP = sp;return ($152|0); //@line 465 "main.c"
}
function _drawOccluded($win,$baserect,$splitrect_list) {
 $win = $win|0;
 $baserect = $baserect|0;
 $splitrect_list = $splitrect_list|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0;
 var $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0;
 var $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0;
 var $99 = 0, $clip_list = 0, $new_rect = 0, $out_rect = 0, $out_rects = 0, $rect = 0, $split_count = 0, $split_rect = 0, $total_count = 0, $working_rects = 0, $working_total = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $win;
 $1 = $baserect;
 $2 = $splitrect_list;
 $3 = $2; //@line 469 "main.c"
 $4 = ($3|0)!=(0|0); //@line 469 "main.c"
 if (!($4)) {
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 $split_count = 0; //@line 472 "main.c"
 $total_count = 1; //@line 473 "main.c"
 $working_total = 0; //@line 474 "main.c"
 $working_rects = 0; //@line 476 "main.c"
 $5 = $2; //@line 503 "main.c"
 $6 = ((($5)) + 8|0); //@line 503 "main.c"
 $7 = HEAP32[$6>>2]|0; //@line 503 "main.c"
 $8 = ($7|0)!=(0); //@line 503 "main.c"
 if (!($8)) {
  $9 = $0; //@line 505 "main.c"
  $10 = $1; //@line 505 "main.c"
  _drawBmpRect($9,$10); //@line 505 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 $11 = (_List_new()|0); //@line 510 "main.c"
 $out_rects = $11; //@line 510 "main.c"
 $12 = $out_rects; //@line 512 "main.c"
 $13 = ($12|0)!=(0|0); //@line 512 "main.c"
 if (!($13)) {
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 $14 = $1; //@line 518 "main.c"
 $15 = HEAP32[$14>>2]|0; //@line 518 "main.c"
 $16 = $1; //@line 518 "main.c"
 $17 = ((($16)) + 12|0); //@line 518 "main.c"
 $18 = HEAP32[$17>>2]|0; //@line 518 "main.c"
 $19 = $1; //@line 518 "main.c"
 $20 = ((($19)) + 8|0); //@line 518 "main.c"
 $21 = HEAP32[$20>>2]|0; //@line 518 "main.c"
 $22 = $1; //@line 518 "main.c"
 $23 = ((($22)) + 4|0); //@line 518 "main.c"
 $24 = HEAP32[$23>>2]|0; //@line 518 "main.c"
 $25 = (_Rect_new($15,$18,$21,$24)|0); //@line 518 "main.c"
 $rect = $25; //@line 518 "main.c"
 $26 = $rect; //@line 520 "main.c"
 $27 = ($26|0)!=(0|0); //@line 520 "main.c"
 $28 = $out_rects; //@line 527 "main.c"
 if (!($27)) {
  _List_delete($28,12); //@line 523 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 $29 = $rect; //@line 527 "main.c"
 $30 = (_List_add($28,$29)|0); //@line 527 "main.c"
 $31 = ($30|0)!=(0); //@line 527 "main.c"
 if (!($31)) {
  $32 = $rect; //@line 530 "main.c"
  _free($32); //@line 530 "main.c"
  $33 = $out_rects; //@line 531 "main.c"
  _List_delete($33,12); //@line 531 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 $34 = $2; //@line 536 "main.c"
 _List_rewind($34); //@line 536 "main.c"
 L19: while(1) {
  $35 = $2; //@line 536 "main.c"
  $36 = (_List_get_next($35)|0); //@line 536 "main.c"
  $split_rect = $36; //@line 536 "main.c"
  $37 = ($36|0)!=(0|0); //@line 536 "main.c"
  $38 = $out_rects; //@line 538 "main.c"
  _List_rewind($38); //@line 538 "main.c"
  if (!($37)) {
   label = 28;
   break;
  }
  while(1) {
   $39 = $out_rects; //@line 538 "main.c"
   $40 = (_List_get_next($39)|0); //@line 538 "main.c"
   $out_rect = $40; //@line 538 "main.c"
   $41 = ($40|0)!=(0|0); //@line 538 "main.c"
   if (!($41)) {
    continue L19;
   }
   $42 = $split_rect; //@line 540 "main.c"
   $43 = ((($42)) + 12|0); //@line 540 "main.c"
   $44 = HEAP32[$43>>2]|0; //@line 540 "main.c"
   $45 = $out_rect; //@line 540 "main.c"
   $46 = ((($45)) + 4|0); //@line 540 "main.c"
   $47 = HEAP32[$46>>2]|0; //@line 540 "main.c"
   $48 = ($44>>>0)<=($47>>>0); //@line 540 "main.c"
   if (!($48)) {
    continue;
   }
   $49 = $split_rect; //@line 541 "main.c"
   $50 = ((($49)) + 4|0); //@line 541 "main.c"
   $51 = HEAP32[$50>>2]|0; //@line 541 "main.c"
   $52 = $out_rect; //@line 541 "main.c"
   $53 = ((($52)) + 12|0); //@line 541 "main.c"
   $54 = HEAP32[$53>>2]|0; //@line 541 "main.c"
   $55 = ($51>>>0)>=($54>>>0); //@line 541 "main.c"
   if (!($55)) {
    continue;
   }
   $56 = $split_rect; //@line 542 "main.c"
   $57 = HEAP32[$56>>2]|0; //@line 542 "main.c"
   $58 = $out_rect; //@line 542 "main.c"
   $59 = ((($58)) + 8|0); //@line 542 "main.c"
   $60 = HEAP32[$59>>2]|0; //@line 542 "main.c"
   $61 = ($57>>>0)<=($60>>>0); //@line 542 "main.c"
   if (!($61)) {
    continue;
   }
   $62 = $split_rect; //@line 543 "main.c"
   $63 = ((($62)) + 8|0); //@line 543 "main.c"
   $64 = HEAP32[$63>>2]|0; //@line 543 "main.c"
   $65 = $out_rect; //@line 543 "main.c"
   $66 = HEAP32[$65>>2]|0; //@line 543 "main.c"
   $67 = ($64>>>0)>=($66>>>0); //@line 543 "main.c"
   if (!($67)) {
    continue;
   }
   $68 = $out_rect; //@line 545 "main.c"
   $69 = $split_rect; //@line 545 "main.c"
   $70 = (_splitRect($68,$69)|0); //@line 545 "main.c"
   $clip_list = $70; //@line 545 "main.c"
   $71 = $clip_list; //@line 554 "main.c"
   $72 = ($71|0)!=(0|0); //@line 554 "main.c"
   if (!($72)) {
    label = 17;
    break L19;
   }
   $74 = $clip_list; //@line 561 "main.c"
   $75 = ((($74)) + 8|0); //@line 561 "main.c"
   $76 = HEAP32[$75>>2]|0; //@line 561 "main.c"
   $77 = ($76|0)!=(0); //@line 561 "main.c"
   if (!($77)) {
    $78 = $out_rects; //@line 563 "main.c"
    $79 = $out_rect; //@line 563 "main.c"
    _List_remove($78,$79,12); //@line 563 "main.c"
    $80 = $out_rects; //@line 567 "main.c"
    $81 = ((($80)) + 8|0); //@line 567 "main.c"
    $82 = HEAP32[$81>>2]|0; //@line 567 "main.c"
    $83 = ($82|0)==(0); //@line 567 "main.c"
    if ($83) {
     label = 20;
     break L19;
    } else {
     continue;
    }
   }
   $86 = $clip_list; //@line 579 "main.c"
   $87 = (_List_get_at($86,0)|0); //@line 579 "main.c"
   $rect = $87; //@line 579 "main.c"
   $88 = $rect; //@line 580 "main.c"
   $89 = HEAP32[$88>>2]|0; //@line 580 "main.c"
   $90 = $out_rect; //@line 580 "main.c"
   HEAP32[$90>>2] = $89; //@line 580 "main.c"
   $91 = $rect; //@line 581 "main.c"
   $92 = ((($91)) + 12|0); //@line 581 "main.c"
   $93 = HEAP32[$92>>2]|0; //@line 581 "main.c"
   $94 = $out_rect; //@line 581 "main.c"
   $95 = ((($94)) + 12|0); //@line 581 "main.c"
   HEAP32[$95>>2] = $93; //@line 581 "main.c"
   $96 = $rect; //@line 582 "main.c"
   $97 = ((($96)) + 8|0); //@line 582 "main.c"
   $98 = HEAP32[$97>>2]|0; //@line 582 "main.c"
   $99 = $out_rect; //@line 582 "main.c"
   $100 = ((($99)) + 8|0); //@line 582 "main.c"
   HEAP32[$100>>2] = $98; //@line 582 "main.c"
   $101 = $rect; //@line 583 "main.c"
   $102 = ((($101)) + 4|0); //@line 583 "main.c"
   $103 = HEAP32[$102>>2]|0; //@line 583 "main.c"
   $104 = $out_rect; //@line 583 "main.c"
   $105 = ((($104)) + 4|0); //@line 583 "main.c"
   HEAP32[$105>>2] = $103; //@line 583 "main.c"
   $106 = $clip_list; //@line 586 "main.c"
   _List_seek_to($106,1); //@line 586 "main.c"
   while(1) {
    $107 = $clip_list; //@line 586 "main.c"
    $108 = (_List_get_next($107)|0); //@line 586 "main.c"
    $rect = $108; //@line 586 "main.c"
    $109 = ($108|0)!=(0|0); //@line 586 "main.c"
    if (!($109)) {
     break;
    }
    $110 = $rect; //@line 588 "main.c"
    $111 = HEAP32[$110>>2]|0; //@line 588 "main.c"
    $112 = $rect; //@line 588 "main.c"
    $113 = ((($112)) + 12|0); //@line 588 "main.c"
    $114 = HEAP32[$113>>2]|0; //@line 588 "main.c"
    $115 = $rect; //@line 588 "main.c"
    $116 = ((($115)) + 8|0); //@line 588 "main.c"
    $117 = HEAP32[$116>>2]|0; //@line 588 "main.c"
    $118 = $rect; //@line 588 "main.c"
    $119 = ((($118)) + 4|0); //@line 588 "main.c"
    $120 = HEAP32[$119>>2]|0; //@line 588 "main.c"
    $121 = (_Rect_new($111,$114,$117,$120)|0); //@line 588 "main.c"
    $new_rect = $121; //@line 588 "main.c"
    $122 = $new_rect; //@line 590 "main.c"
    $123 = ($122|0)!=(0|0); //@line 590 "main.c"
    if (!($123)) {
     label = 24;
     break L19;
    }
    $126 = $out_rects; //@line 596 "main.c"
    $127 = $new_rect; //@line 596 "main.c"
    $128 = (_List_add($126,$127)|0); //@line 596 "main.c"
    $129 = ($128|0)!=(0); //@line 596 "main.c"
    if (!($129)) {
     label = 26;
     break L19;
    }
   }
   $133 = $clip_list; //@line 606 "main.c"
   _List_delete($133,12); //@line 606 "main.c"
   $134 = $out_rects; //@line 609 "main.c"
   _List_rewind($134); //@line 609 "main.c"
  }
 }
 if ((label|0) == 17) {
  $73 = $out_rects; //@line 556 "main.c"
  _List_delete($73,12); //@line 556 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 else if ((label|0) == 20) {
  $84 = $clip_list; //@line 569 "main.c"
  _List_delete($84,12); //@line 569 "main.c"
  $85 = $out_rects; //@line 570 "main.c"
  _List_delete($85,12); //@line 570 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 else if ((label|0) == 24) {
  $124 = $clip_list; //@line 591 "main.c"
  _List_delete($124,12); //@line 591 "main.c"
  $125 = $out_rects; //@line 592 "main.c"
  _List_delete($125,12); //@line 592 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 else if ((label|0) == 26) {
  $130 = $new_rect; //@line 598 "main.c"
  _free($130); //@line 598 "main.c"
  $131 = $clip_list; //@line 599 "main.c"
  _List_delete($131,12); //@line 599 "main.c"
  $132 = $out_rects; //@line 600 "main.c"
  _List_delete($132,12); //@line 600 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
 else if ((label|0) == 28) {
  while(1) {
   label = 0;
   $135 = $out_rects; //@line 619 "main.c"
   $136 = (_List_get_next($135)|0); //@line 619 "main.c"
   $out_rect = $136; //@line 619 "main.c"
   $137 = ($136|0)!=(0|0); //@line 619 "main.c"
   if (!($137)) {
    break;
   }
   $138 = $0; //@line 637 "main.c"
   $139 = $out_rect; //@line 637 "main.c"
   _drawBmpRect($138,$139); //@line 637 "main.c"
   label = 28;
  }
  $140 = $out_rects; //@line 642 "main.c"
  _List_delete($140,12); //@line 642 "main.c"
  STACKTOP = sp;return; //@line 643 "main.c"
 }
}
function _newWindow($width,$height,$flags,$pid) {
 $width = $width|0;
 $height = $height|0;
 $flags = $flags|0;
 $pid = $pid|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $bufsz = 0, $i = 0, $new_window = 0, $temp_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $width;
 $2 = $height;
 $3 = $flags;
 $4 = $pid;
 $5 = (_malloc(44)|0); //@line 651 "main.c"
 $new_window = $5; //@line 651 "main.c"
 $6 = ($5|0)!=(0|0); //@line 651 "main.c"
 if (!($6)) {
  $0 = 0; //@line 653 "main.c"
  $91 = $0; //@line 712 "main.c"
  STACKTOP = sp;return ($91|0); //@line 712 "main.c"
 }
 $7 = $new_window; //@line 656 "main.c"
 HEAP8[$7>>0] = 1; //@line 656 "main.c"
 $8 = $4; //@line 657 "main.c"
 $9 = $new_window; //@line 657 "main.c"
 $10 = ((($9)) + 8|0); //@line 657 "main.c"
 HEAP32[$10>>2] = $8; //@line 657 "main.c"
 $11 = $3; //@line 658 "main.c"
 $12 = $new_window; //@line 658 "main.c"
 $13 = ((($12)) + 1|0); //@line 658 "main.c"
 HEAP8[$13>>0] = $11; //@line 658 "main.c"
 $14 = $new_window; //@line 659 "main.c"
 $15 = ((($14)) + 24|0); //@line 659 "main.c"
 HEAP32[$15>>2] = 0; //@line 659 "main.c"
 $16 = $new_window; //@line 660 "main.c"
 $17 = ((($16)) + 28|0); //@line 660 "main.c"
 HEAP32[$17>>2] = 0; //@line 660 "main.c"
 $18 = $1; //@line 661 "main.c"
 $19 = $new_window; //@line 661 "main.c"
 $20 = ((($19)) + 16|0); //@line 661 "main.c"
 HEAP32[$20>>2] = $18; //@line 661 "main.c"
 $21 = $2; //@line 662 "main.c"
 $22 = $new_window; //@line 662 "main.c"
 $23 = ((($22)) + 20|0); //@line 662 "main.c"
 HEAP32[$23>>2] = $21; //@line 662 "main.c"
 $24 = $new_window; //@line 663 "main.c"
 $25 = ((($24)) + 36|0); //@line 663 "main.c"
 HEAP32[$25>>2] = 0; //@line 663 "main.c"
 $26 = $new_window; //@line 664 "main.c"
 $27 = ((($26)) + 40|0); //@line 664 "main.c"
 HEAP8[$27>>0] = 1; //@line 664 "main.c"
 $28 = $new_window; //@line 667 "main.c"
 $29 = ((($28)) + 16|0); //@line 667 "main.c"
 $30 = HEAP32[$29>>2]|0; //@line 667 "main.c"
 $31 = $new_window; //@line 667 "main.c"
 $32 = ((($31)) + 20|0); //@line 667 "main.c"
 $33 = HEAP32[$32>>2]|0; //@line 667 "main.c"
 $34 = (_newBitmap($30,$33)|0); //@line 667 "main.c"
 $35 = $new_window; //@line 667 "main.c"
 $36 = ((($35)) + 12|0); //@line 667 "main.c"
 HEAP32[$36>>2] = $34; //@line 667 "main.c"
 $37 = ($34|0)!=(0|0); //@line 667 "main.c"
 $38 = $new_window; //@line 673 "main.c"
 if (!($37)) {
  _free($38); //@line 669 "main.c"
  $0 = 0; //@line 670 "main.c"
  $91 = $0; //@line 712 "main.c"
  STACKTOP = sp;return ($91|0); //@line 712 "main.c"
 }
 $39 = ((($38)) + 16|0); //@line 673 "main.c"
 $40 = HEAP32[$39>>2]|0; //@line 673 "main.c"
 $41 = $new_window; //@line 673 "main.c"
 $42 = ((($41)) + 20|0); //@line 673 "main.c"
 $43 = HEAP32[$42>>2]|0; //@line 673 "main.c"
 $44 = Math_imul($40, $43)|0; //@line 673 "main.c"
 $bufsz = $44; //@line 673 "main.c"
 $i = 0; //@line 676 "main.c"
 while(1) {
  $45 = $i; //@line 676 "main.c"
  $46 = $bufsz; //@line 676 "main.c"
  $47 = ($45>>>0)<($46>>>0); //@line 676 "main.c"
  if (!($47)) {
   break;
  }
  $48 = $i; //@line 677 "main.c"
  $49 = $new_window; //@line 677 "main.c"
  $50 = ((($49)) + 12|0); //@line 677 "main.c"
  $51 = HEAP32[$50>>2]|0; //@line 677 "main.c"
  $52 = ((($51)) + 8|0); //@line 677 "main.c"
  $53 = HEAP32[$52>>2]|0; //@line 677 "main.c"
  $54 = (($53) + ($48<<2)|0); //@line 677 "main.c"
  HEAP32[$54>>2] = 16777215; //@line 677 "main.c"
  $55 = $i; //@line 676 "main.c"
  $56 = (($55) + 1)|0; //@line 676 "main.c"
  $i = $56; //@line 676 "main.c"
 }
 $57 = HEAP32[2]|0; //@line 679 "main.c"
 $58 = (($57) + 1)|0; //@line 679 "main.c"
 HEAP32[2] = $58; //@line 679 "main.c"
 $59 = $new_window; //@line 679 "main.c"
 $60 = ((($59)) + 4|0); //@line 679 "main.c"
 HEAP32[$60>>2] = $57; //@line 679 "main.c"
 $61 = HEAP32[1829]|0; //@line 682 "main.c"
 $62 = HEAP32[1829]|0; //@line 682 "main.c"
 $63 = ((($62)) + 8|0); //@line 682 "main.c"
 $64 = HEAP32[$63>>2]|0; //@line 682 "main.c"
 $65 = (($64) - 1)|0; //@line 682 "main.c"
 $66 = (_List_get_at($61,$65)|0); //@line 682 "main.c"
 $temp_window = $66; //@line 682 "main.c"
 $67 = ($66|0)!=(0|0); //@line 682 "main.c"
 if ($67) {
  $68 = $temp_window; //@line 684 "main.c"
  HEAP8[$68>>0] = 0; //@line 684 "main.c"
 }
 $69 = HEAP32[1829]|0; //@line 687 "main.c"
 $70 = $new_window; //@line 687 "main.c"
 $71 = (_List_add($69,$70)|0); //@line 687 "main.c"
 $72 = ($71|0)!=(0); //@line 687 "main.c"
 $73 = $new_window; //@line 700 "main.c"
 if (!($72)) {
  $74 = ((($73)) + 12|0); //@line 689 "main.c"
  $75 = HEAP32[$74>>2]|0; //@line 689 "main.c"
  _freeBitmap($75); //@line 689 "main.c"
  $76 = $new_window; //@line 690 "main.c"
  _free($76); //@line 690 "main.c"
  $77 = $temp_window; //@line 693 "main.c"
  $78 = ($77|0)!=(0|0); //@line 693 "main.c"
  if ($78) {
   $79 = $temp_window; //@line 694 "main.c"
   HEAP8[$79>>0] = 1; //@line 694 "main.c"
  }
  $0 = 0; //@line 696 "main.c"
  $91 = $0; //@line 712 "main.c"
  STACKTOP = sp;return ($91|0); //@line 712 "main.c"
 }
 $80 = ((($73)) + 1|0); //@line 700 "main.c"
 $81 = HEAP8[$80>>0]|0; //@line 700 "main.c"
 $82 = $81&255; //@line 700 "main.c"
 $83 = $82 & 1; //@line 700 "main.c"
 $84 = ($83|0)!=(0); //@line 700 "main.c"
 if (!($84)) {
  $85 = $new_window; //@line 701 "main.c"
  _drawFrame($85); //@line 701 "main.c"
 }
 $86 = $new_window; //@line 703 "main.c"
 _drawWindow($86,0); //@line 703 "main.c"
 $87 = $temp_window; //@line 706 "main.c"
 $88 = ($87|0)!=(0|0); //@line 706 "main.c"
 if ($88) {
  $89 = $temp_window; //@line 707 "main.c"
  _drawTitlebar($89,0); //@line 707 "main.c"
 }
 $90 = $new_window; //@line 711 "main.c"
 $0 = $90; //@line 711 "main.c"
 $91 = $0; //@line 712 "main.c"
 STACKTOP = sp;return ($91|0); //@line 712 "main.c"
}
function _drawFrame($cur_window) {
 $cur_window = $cur_window|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $cur_window;
 $1 = $0; //@line 1103 "main.c"
 $2 = ((($1)) + 12|0); //@line 1103 "main.c"
 $3 = HEAP32[$2>>2]|0; //@line 1103 "main.c"
 $4 = $0; //@line 1103 "main.c"
 $5 = ((($4)) + 16|0); //@line 1103 "main.c"
 $6 = HEAP32[$5>>2]|0; //@line 1103 "main.c"
 $7 = $0; //@line 1103 "main.c"
 $8 = ((($7)) + 20|0); //@line 1103 "main.c"
 $9 = HEAP32[$8>>2]|0; //@line 1103 "main.c"
 _bmpDrawPanel($3,0,0,$6,$9,15649673,1,0); //@line 1103 "main.c"
 $10 = $0; //@line 1106 "main.c"
 $11 = ((($10)) + 12|0); //@line 1106 "main.c"
 $12 = HEAP32[$11>>2]|0; //@line 1106 "main.c"
 $13 = $0; //@line 1106 "main.c"
 $14 = ((($13)) + 16|0); //@line 1106 "main.c"
 $15 = HEAP32[$14>>2]|0; //@line 1106 "main.c"
 $16 = (($15) - 6)|0; //@line 1106 "main.c"
 _bmpDrawPanel($12,3,3,$16,22,15649673,1,1); //@line 1106 "main.c"
 $17 = $0; //@line 1109 "main.c"
 $18 = ((($17)) + 12|0); //@line 1109 "main.c"
 $19 = HEAP32[$18>>2]|0; //@line 1109 "main.c"
 $20 = $0; //@line 1109 "main.c"
 $21 = ((($20)) + 16|0); //@line 1109 "main.c"
 $22 = HEAP32[$21>>2]|0; //@line 1109 "main.c"
 $23 = (($22) - 6)|0; //@line 1109 "main.c"
 $24 = $0; //@line 1109 "main.c"
 $25 = ((($24)) + 20|0); //@line 1109 "main.c"
 $26 = HEAP32[$25>>2]|0; //@line 1109 "main.c"
 $27 = (($26) - 30)|0; //@line 1109 "main.c"
 _bmpDrawPanel($19,3,27,$23,$27,15649673,1,1); //@line 1109 "main.c"
 $28 = $0; //@line 1112 "main.c"
 $29 = ((($28)) + 12|0); //@line 1112 "main.c"
 $30 = HEAP32[$29>>2]|0; //@line 1112 "main.c"
 $31 = $0; //@line 1112 "main.c"
 $32 = ((($31)) + 20|0); //@line 1112 "main.c"
 $33 = HEAP32[$32>>2]|0; //@line 1112 "main.c"
 $34 = (($33) - 2)|0; //@line 1112 "main.c"
 _bmpFillRect($30,1,1,2,$34,15649673); //@line 1112 "main.c"
 $35 = $0; //@line 1115 "main.c"
 $36 = ((($35)) + 12|0); //@line 1115 "main.c"
 $37 = HEAP32[$36>>2]|0; //@line 1115 "main.c"
 $38 = $0; //@line 1115 "main.c"
 $39 = ((($38)) + 16|0); //@line 1115 "main.c"
 $40 = HEAP32[$39>>2]|0; //@line 1115 "main.c"
 $41 = (($40) - 3)|0; //@line 1115 "main.c"
 $42 = $0; //@line 1115 "main.c"
 $43 = ((($42)) + 20|0); //@line 1115 "main.c"
 $44 = HEAP32[$43>>2]|0; //@line 1115 "main.c"
 $45 = (($44) - 2)|0; //@line 1115 "main.c"
 _bmpFillRect($37,$41,1,2,$45,15649673); //@line 1115 "main.c"
 $46 = $0; //@line 1118 "main.c"
 $47 = ((($46)) + 12|0); //@line 1118 "main.c"
 $48 = HEAP32[$47>>2]|0; //@line 1118 "main.c"
 $49 = $0; //@line 1118 "main.c"
 $50 = ((($49)) + 16|0); //@line 1118 "main.c"
 $51 = HEAP32[$50>>2]|0; //@line 1118 "main.c"
 $52 = (($51) - 6)|0; //@line 1118 "main.c"
 _bmpFillRect($48,3,1,$52,2,15649673); //@line 1118 "main.c"
 $53 = $0; //@line 1121 "main.c"
 $54 = ((($53)) + 12|0); //@line 1121 "main.c"
 $55 = HEAP32[$54>>2]|0; //@line 1121 "main.c"
 $56 = $0; //@line 1121 "main.c"
 $57 = ((($56)) + 16|0); //@line 1121 "main.c"
 $58 = HEAP32[$57>>2]|0; //@line 1121 "main.c"
 $59 = (($58) - 6)|0; //@line 1121 "main.c"
 _bmpFillRect($55,3,25,$59,2,15649673); //@line 1121 "main.c"
 $60 = $0; //@line 1124 "main.c"
 $61 = ((($60)) + 12|0); //@line 1124 "main.c"
 $62 = HEAP32[$61>>2]|0; //@line 1124 "main.c"
 $63 = $0; //@line 1124 "main.c"
 $64 = ((($63)) + 20|0); //@line 1124 "main.c"
 $65 = HEAP32[$64>>2]|0; //@line 1124 "main.c"
 $66 = (($65) - 3)|0; //@line 1124 "main.c"
 $67 = $0; //@line 1124 "main.c"
 $68 = ((($67)) + 16|0); //@line 1124 "main.c"
 $69 = HEAP32[$68>>2]|0; //@line 1124 "main.c"
 $70 = (($69) - 6)|0; //@line 1124 "main.c"
 _bmpFillRect($62,3,$66,$70,2,15649673); //@line 1124 "main.c"
 $71 = $0; //@line 1127 "main.c"
 $72 = ((($71)) + 12|0); //@line 1127 "main.c"
 $73 = HEAP32[$72>>2]|0; //@line 1127 "main.c"
 $74 = $0; //@line 1127 "main.c"
 $75 = ((($74)) + 16|0); //@line 1127 "main.c"
 $76 = HEAP32[$75>>2]|0; //@line 1127 "main.c"
 $77 = (($76) - 24)|0; //@line 1127 "main.c"
 _bmpDrawPanel($73,$77,4,20,20,15649673,1,0); //@line 1127 "main.c"
 $78 = $0; //@line 1128 "main.c"
 $79 = ((($78)) + 12|0); //@line 1128 "main.c"
 $80 = HEAP32[$79>>2]|0; //@line 1128 "main.c"
 $81 = $0; //@line 1128 "main.c"
 $82 = ((($81)) + 16|0); //@line 1128 "main.c"
 $83 = HEAP32[$82>>2]|0; //@line 1128 "main.c"
 $84 = (($83) - 23)|0; //@line 1128 "main.c"
 _bmpFillRect($80,$84,5,18,18,15649673); //@line 1128 "main.c"
 $85 = $0; //@line 1130 "main.c"
 _drawTitlebar($85,0); //@line 1130 "main.c"
 $86 = $0; //@line 1132 "main.c"
 $87 = ((($86)) + 40|0); //@line 1132 "main.c"
 HEAP8[$87>>0] = 0; //@line 1132 "main.c"
 STACKTOP = sp;return; //@line 1133 "main.c"
}
function _drawWindow($cur_window,$use_current_blit) {
 $cur_window = $cur_window|0;
 $use_current_blit = $use_current_blit|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $9 = 0, $splitrect_list = 0, $winrect = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $winrect = sp;
 $0 = $cur_window;
 $1 = $use_current_blit;
 $2 = $0; //@line 1185 "main.c"
 $3 = ((($2)) + 1|0); //@line 1185 "main.c"
 $4 = HEAP8[$3>>0]|0; //@line 1185 "main.c"
 $5 = $4&255; //@line 1185 "main.c"
 $6 = $5 & 4; //@line 1185 "main.c"
 $7 = ($6|0)!=(0); //@line 1185 "main.c"
 if (!($7)) {
  STACKTOP = sp;return; //@line 1229 "main.c"
 }
 $8 = $0; //@line 1187 "main.c"
 $9 = ((($8)) + 32|0); //@line 1187 "main.c"
 HEAP8[$9>>0] = 0; //@line 1187 "main.c"
 $10 = $1; //@line 1193 "main.c"
 $11 = ($10<<24>>24)!=(0); //@line 1193 "main.c"
 $12 = $0; //@line 1197 "main.c"
 $13 = ((($12)) + 28|0); //@line 1197 "main.c"
 $14 = HEAP32[$13>>2]|0; //@line 1197 "main.c"
 if ($11) {
  $15 = $0; //@line 1197 "main.c"
  $16 = ((($15)) + 12|0); //@line 1197 "main.c"
  $17 = HEAP32[$16>>2]|0; //@line 1197 "main.c"
  $18 = ((($17)) + 12|0); //@line 1197 "main.c"
  $19 = HEAP32[$18>>2]|0; //@line 1197 "main.c"
  $20 = (($14) + ($19))|0; //@line 1197 "main.c"
  HEAP32[$winrect>>2] = $20; //@line 1197 "main.c"
  $21 = $0; //@line 1198 "main.c"
  $22 = ((($21)) + 24|0); //@line 1198 "main.c"
  $23 = HEAP32[$22>>2]|0; //@line 1198 "main.c"
  $24 = $0; //@line 1198 "main.c"
  $25 = ((($24)) + 12|0); //@line 1198 "main.c"
  $26 = HEAP32[$25>>2]|0; //@line 1198 "main.c"
  $27 = ((($26)) + 16|0); //@line 1198 "main.c"
  $28 = HEAP32[$27>>2]|0; //@line 1198 "main.c"
  $29 = (($23) + ($28))|0; //@line 1198 "main.c"
  $30 = ((($winrect)) + 12|0); //@line 1198 "main.c"
  HEAP32[$30>>2] = $29; //@line 1198 "main.c"
  $31 = $0; //@line 1199 "main.c"
  $32 = ((($31)) + 28|0); //@line 1199 "main.c"
  $33 = HEAP32[$32>>2]|0; //@line 1199 "main.c"
  $34 = $0; //@line 1199 "main.c"
  $35 = ((($34)) + 12|0); //@line 1199 "main.c"
  $36 = HEAP32[$35>>2]|0; //@line 1199 "main.c"
  $37 = ((($36)) + 20|0); //@line 1199 "main.c"
  $38 = HEAP32[$37>>2]|0; //@line 1199 "main.c"
  $39 = (($33) + ($38))|0; //@line 1199 "main.c"
  $40 = ((($winrect)) + 8|0); //@line 1199 "main.c"
  HEAP32[$40>>2] = $39; //@line 1199 "main.c"
  $41 = $0; //@line 1200 "main.c"
  $42 = ((($41)) + 24|0); //@line 1200 "main.c"
  $43 = HEAP32[$42>>2]|0; //@line 1200 "main.c"
  $44 = $0; //@line 1200 "main.c"
  $45 = ((($44)) + 12|0); //@line 1200 "main.c"
  $46 = HEAP32[$45>>2]|0; //@line 1200 "main.c"
  $47 = ((($46)) + 24|0); //@line 1200 "main.c"
  $48 = HEAP32[$47>>2]|0; //@line 1200 "main.c"
  $49 = (($43) + ($48))|0; //@line 1200 "main.c"
  $50 = ((($winrect)) + 4|0); //@line 1200 "main.c"
  HEAP32[$50>>2] = $49; //@line 1200 "main.c"
 } else {
  HEAP32[$winrect>>2] = $14; //@line 1204 "main.c"
  $51 = $0; //@line 1205 "main.c"
  $52 = ((($51)) + 24|0); //@line 1205 "main.c"
  $53 = HEAP32[$52>>2]|0; //@line 1205 "main.c"
  $54 = ((($winrect)) + 12|0); //@line 1205 "main.c"
  HEAP32[$54>>2] = $53; //@line 1205 "main.c"
  $55 = $0; //@line 1206 "main.c"
  $56 = ((($55)) + 28|0); //@line 1206 "main.c"
  $57 = HEAP32[$56>>2]|0; //@line 1206 "main.c"
  $58 = $0; //@line 1206 "main.c"
  $59 = ((($58)) + 12|0); //@line 1206 "main.c"
  $60 = HEAP32[$59>>2]|0; //@line 1206 "main.c"
  $61 = HEAP32[$60>>2]|0; //@line 1206 "main.c"
  $62 = (($57) + ($61))|0; //@line 1206 "main.c"
  $63 = (($62) - 1)|0; //@line 1206 "main.c"
  $64 = ((($winrect)) + 8|0); //@line 1206 "main.c"
  HEAP32[$64>>2] = $63; //@line 1206 "main.c"
  $65 = $0; //@line 1207 "main.c"
  $66 = ((($65)) + 24|0); //@line 1207 "main.c"
  $67 = HEAP32[$66>>2]|0; //@line 1207 "main.c"
  $68 = $0; //@line 1207 "main.c"
  $69 = ((($68)) + 12|0); //@line 1207 "main.c"
  $70 = HEAP32[$69>>2]|0; //@line 1207 "main.c"
  $71 = ((($70)) + 4|0); //@line 1207 "main.c"
  $72 = HEAP32[$71>>2]|0; //@line 1207 "main.c"
  $73 = (($67) + ($72))|0; //@line 1207 "main.c"
  $74 = (($73) - 1)|0; //@line 1207 "main.c"
  $75 = ((($winrect)) + 4|0); //@line 1207 "main.c"
  HEAP32[$75>>2] = $74; //@line 1207 "main.c"
 }
 $76 = HEAP32[1829]|0; //@line 1211 "main.c"
 $77 = $0; //@line 1211 "main.c"
 $78 = (_List_get_index($76,$77)|0); //@line 1211 "main.c"
 $79 = (($78) + 1)|0; //@line 1211 "main.c"
 $80 = (_getOverlappingWindows($79,$winrect)|0); //@line 1211 "main.c"
 $splitrect_list = $80; //@line 1211 "main.c"
 $81 = ($80|0)!=(0|0); //@line 1211 "main.c"
 if (!($81)) {
  STACKTOP = sp;return; //@line 1229 "main.c"
 }
 $82 = $0; //@line 1216 "main.c"
 $83 = $splitrect_list; //@line 1216 "main.c"
 _drawOccluded($82,$winrect,$83); //@line 1216 "main.c"
 $84 = $splitrect_list; //@line 1221 "main.c"
 _List_delete($84,12); //@line 1221 "main.c"
 STACKTOP = sp;return; //@line 1229 "main.c"
}
function _drawTitlebar($cur_window,$do_refresh) {
 $cur_window = $cur_window|0;
 $do_refresh = $do_refresh|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $base_x = 0, $base_y = 0, $off_x = 0, $old_ctx_rect = 0, $s = 0, $tb_color = 0, $text_color = 0, $titlebar_width = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $old_ctx_rect = sp + 16|0;
 $0 = $cur_window;
 $1 = $do_refresh;
 $2 = $0; //@line 1033 "main.c"
 $3 = ((($2)) + 1|0); //@line 1033 "main.c"
 $4 = HEAP8[$3>>0]|0; //@line 1033 "main.c"
 $5 = $4&255; //@line 1033 "main.c"
 $6 = $5 & 1; //@line 1033 "main.c"
 $7 = ($6|0)!=(0); //@line 1033 "main.c"
 if ($7) {
  STACKTOP = sp;return; //@line 1091 "main.c"
 }
 $8 = $0; //@line 1037 "main.c"
 $9 = HEAP8[$8>>0]|0; //@line 1037 "main.c"
 $10 = ($9<<24>>24)!=(0); //@line 1037 "main.c"
 if ($10) {
  $tb_color = 11927552; //@line 1038 "main.c"
 } else {
  $tb_color = 15649673; //@line 1040 "main.c"
 }
 $11 = $0; //@line 1042 "main.c"
 $12 = ((($11)) + 12|0); //@line 1042 "main.c"
 $13 = HEAP32[$12>>2]|0; //@line 1042 "main.c"
 $14 = $0; //@line 1042 "main.c"
 $15 = ((($14)) + 16|0); //@line 1042 "main.c"
 $16 = HEAP32[$15>>2]|0; //@line 1042 "main.c"
 $17 = (($16) - 28)|0; //@line 1042 "main.c"
 $18 = $tb_color; //@line 1042 "main.c"
 _bmpFillRect($13,4,4,$17,20,$18); //@line 1042 "main.c"
 $19 = $0; //@line 1045 "main.c"
 $20 = ((($19)) + 36|0); //@line 1045 "main.c"
 $21 = HEAP32[$20>>2]|0; //@line 1045 "main.c"
 $22 = ($21|0)!=(0|0); //@line 1045 "main.c"
 L8: do {
  if ($22) {
   $23 = $0; //@line 1051 "main.c"
   $24 = ((($23)) + 36|0); //@line 1051 "main.c"
   $25 = HEAP32[$24>>2]|0; //@line 1051 "main.c"
   $s = $25; //@line 1051 "main.c"
   $base_x = 7; //@line 1052 "main.c"
   $base_y = 9; //@line 1053 "main.c"
   $off_x = 0; //@line 1054 "main.c"
   $26 = $0; //@line 1055 "main.c"
   $27 = ((($26)) + 16|0); //@line 1055 "main.c"
   $28 = HEAP32[$27>>2]|0; //@line 1055 "main.c"
   $29 = (($28) - 28)|0; //@line 1055 "main.c"
   $titlebar_width = $29; //@line 1055 "main.c"
   $30 = $0; //@line 1057 "main.c"
   $31 = HEAP8[$30>>0]|0; //@line 1057 "main.c"
   $32 = ($31<<24>>24)!=(0); //@line 1057 "main.c"
   if ($32) {
    $text_color = 16777215; //@line 1058 "main.c"
   } else {
    $text_color = 9070373; //@line 1060 "main.c"
   }
   while(1) {
    $33 = $s; //@line 1062 "main.c"
    $34 = HEAP8[$33>>0]|0; //@line 1062 "main.c"
    $35 = ($34<<24>>24)!=(0); //@line 1062 "main.c"
    if (!($35)) {
     break L8;
    }
    $36 = $0; //@line 1063 "main.c"
    $37 = ((($36)) + 12|0); //@line 1063 "main.c"
    $38 = HEAP32[$37>>2]|0; //@line 1063 "main.c"
    $39 = $s; //@line 1063 "main.c"
    $40 = ((($39)) + 1|0); //@line 1063 "main.c"
    $s = $40; //@line 1063 "main.c"
    $41 = HEAP8[$39>>0]|0; //@line 1063 "main.c"
    $42 = $base_x; //@line 1063 "main.c"
    $43 = $off_x; //@line 1063 "main.c"
    $44 = (($42) + ($43))|0; //@line 1063 "main.c"
    $45 = $base_y; //@line 1063 "main.c"
    $46 = $text_color; //@line 1063 "main.c"
    _bmpDrawCharacter($38,$41,$44,$45,$46); //@line 1063 "main.c"
    $47 = $off_x; //@line 1064 "main.c"
    $48 = (($47) + 8)|0; //@line 1064 "main.c"
    $off_x = $48; //@line 1064 "main.c"
    $49 = $off_x; //@line 1067 "main.c"
    $50 = $titlebar_width; //@line 1067 "main.c"
    $51 = ($49|0)>=($50|0); //@line 1067 "main.c"
    if ($51) {
     break;
    }
   }
  }
 } while(0);
 $52 = $1; //@line 1072 "main.c"
 $53 = ($52|0)!=(0); //@line 1072 "main.c"
 if (!($53)) {
  STACKTOP = sp;return; //@line 1091 "main.c"
 }
 $54 = $0; //@line 1074 "main.c"
 $55 = ((($54)) + 12|0); //@line 1074 "main.c"
 $56 = HEAP32[$55>>2]|0; //@line 1074 "main.c"
 $57 = ((($56)) + 12|0); //@line 1074 "main.c"
 $58 = HEAP32[$57>>2]|0; //@line 1074 "main.c"
 HEAP32[$old_ctx_rect>>2] = $58; //@line 1074 "main.c"
 $59 = $0; //@line 1075 "main.c"
 $60 = ((($59)) + 12|0); //@line 1075 "main.c"
 $61 = HEAP32[$60>>2]|0; //@line 1075 "main.c"
 $62 = ((($61)) + 16|0); //@line 1075 "main.c"
 $63 = HEAP32[$62>>2]|0; //@line 1075 "main.c"
 $64 = ((($old_ctx_rect)) + 12|0); //@line 1075 "main.c"
 HEAP32[$64>>2] = $63; //@line 1075 "main.c"
 $65 = $0; //@line 1076 "main.c"
 $66 = ((($65)) + 12|0); //@line 1076 "main.c"
 $67 = HEAP32[$66>>2]|0; //@line 1076 "main.c"
 $68 = ((($67)) + 20|0); //@line 1076 "main.c"
 $69 = HEAP32[$68>>2]|0; //@line 1076 "main.c"
 $70 = ((($old_ctx_rect)) + 8|0); //@line 1076 "main.c"
 HEAP32[$70>>2] = $69; //@line 1076 "main.c"
 $71 = $0; //@line 1077 "main.c"
 $72 = ((($71)) + 12|0); //@line 1077 "main.c"
 $73 = HEAP32[$72>>2]|0; //@line 1077 "main.c"
 $74 = ((($73)) + 24|0); //@line 1077 "main.c"
 $75 = HEAP32[$74>>2]|0; //@line 1077 "main.c"
 $76 = ((($old_ctx_rect)) + 4|0); //@line 1077 "main.c"
 HEAP32[$76>>2] = $75; //@line 1077 "main.c"
 $77 = $0; //@line 1079 "main.c"
 $78 = ((($77)) + 12|0); //@line 1079 "main.c"
 $79 = HEAP32[$78>>2]|0; //@line 1079 "main.c"
 $80 = ((($79)) + 12|0); //@line 1079 "main.c"
 HEAP32[$80>>2] = 4; //@line 1079 "main.c"
 $81 = $0; //@line 1080 "main.c"
 $82 = ((($81)) + 12|0); //@line 1080 "main.c"
 $83 = HEAP32[$82>>2]|0; //@line 1080 "main.c"
 $84 = ((($83)) + 16|0); //@line 1080 "main.c"
 HEAP32[$84>>2] = 4; //@line 1080 "main.c"
 $85 = $0; //@line 1081 "main.c"
 $86 = ((($85)) + 12|0); //@line 1081 "main.c"
 $87 = HEAP32[$86>>2]|0; //@line 1081 "main.c"
 $88 = ((($87)) + 20|0); //@line 1081 "main.c"
 HEAP32[$88>>2] = 23; //@line 1081 "main.c"
 $89 = $0; //@line 1082 "main.c"
 $90 = ((($89)) + 12|0); //@line 1082 "main.c"
 $91 = HEAP32[$90>>2]|0; //@line 1082 "main.c"
 $92 = ((($91)) + 24|0); //@line 1082 "main.c"
 $93 = HEAP32[$92>>2]|0; //@line 1082 "main.c"
 $94 = (($93) - 25)|0; //@line 1082 "main.c"
 $95 = $0; //@line 1082 "main.c"
 $96 = ((($95)) + 12|0); //@line 1082 "main.c"
 $97 = HEAP32[$96>>2]|0; //@line 1082 "main.c"
 $98 = ((($97)) + 24|0); //@line 1082 "main.c"
 HEAP32[$98>>2] = $94; //@line 1082 "main.c"
 $99 = $0; //@line 1084 "main.c"
 _drawWindow($99,1); //@line 1084 "main.c"
 $100 = HEAP32[$old_ctx_rect>>2]|0; //@line 1086 "main.c"
 $101 = $0; //@line 1086 "main.c"
 $102 = ((($101)) + 12|0); //@line 1086 "main.c"
 $103 = HEAP32[$102>>2]|0; //@line 1086 "main.c"
 $104 = ((($103)) + 12|0); //@line 1086 "main.c"
 HEAP32[$104>>2] = $100; //@line 1086 "main.c"
 $105 = ((($old_ctx_rect)) + 12|0); //@line 1087 "main.c"
 $106 = HEAP32[$105>>2]|0; //@line 1087 "main.c"
 $107 = $0; //@line 1087 "main.c"
 $108 = ((($107)) + 12|0); //@line 1087 "main.c"
 $109 = HEAP32[$108>>2]|0; //@line 1087 "main.c"
 $110 = ((($109)) + 16|0); //@line 1087 "main.c"
 HEAP32[$110>>2] = $106; //@line 1087 "main.c"
 $111 = ((($old_ctx_rect)) + 8|0); //@line 1088 "main.c"
 $112 = HEAP32[$111>>2]|0; //@line 1088 "main.c"
 $113 = $0; //@line 1088 "main.c"
 $114 = ((($113)) + 12|0); //@line 1088 "main.c"
 $115 = HEAP32[$114>>2]|0; //@line 1088 "main.c"
 $116 = ((($115)) + 20|0); //@line 1088 "main.c"
 HEAP32[$116>>2] = $112; //@line 1088 "main.c"
 $117 = ((($old_ctx_rect)) + 4|0); //@line 1089 "main.c"
 $118 = HEAP32[$117>>2]|0; //@line 1089 "main.c"
 $119 = $0; //@line 1089 "main.c"
 $120 = ((($119)) + 12|0); //@line 1089 "main.c"
 $121 = HEAP32[$120>>2]|0; //@line 1089 "main.c"
 $122 = ((($121)) + 24|0); //@line 1089 "main.c"
 HEAP32[$122>>2] = $118; //@line 1089 "main.c"
 STACKTOP = sp;return; //@line 1091 "main.c"
}
function _newWindowHandle($width,$height,$flags,$pid) {
 $width = $width|0;
 $height = $height|0;
 $flags = $flags|0;
 $pid = $pid|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ret_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $width;
 $2 = $height;
 $3 = $flags;
 $4 = $pid;
 $5 = $1; //@line 716 "main.c"
 $6 = $2; //@line 716 "main.c"
 $7 = $3; //@line 716 "main.c"
 $8 = $4; //@line 716 "main.c"
 $9 = (_newWindow($5,$6,$7,$8)|0); //@line 716 "main.c"
 $ret_window = $9; //@line 716 "main.c"
 $10 = $ret_window; //@line 718 "main.c"
 $11 = ($10|0)!=(0|0); //@line 718 "main.c"
 if ($11) {
  $12 = $ret_window; //@line 719 "main.c"
  $13 = ((($12)) + 4|0); //@line 719 "main.c"
  $14 = HEAP32[$13>>2]|0; //@line 719 "main.c"
  $0 = $14; //@line 719 "main.c"
  $15 = $0; //@line 722 "main.c"
  STACKTOP = sp;return ($15|0); //@line 722 "main.c"
 } else {
  $0 = 0; //@line 721 "main.c"
  $15 = $0; //@line 722 "main.c"
  STACKTOP = sp;return ($15|0); //@line 722 "main.c"
 }
 return (0)|0;
}
function _getWindowByHandle($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $out_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $handle;
 $2 = HEAP32[1829]|0; //@line 728 "main.c"
 _List_rewind($2); //@line 728 "main.c"
 while(1) {
  $3 = HEAP32[1829]|0; //@line 728 "main.c"
  $4 = (_List_get_next($3)|0); //@line 728 "main.c"
  $out_window = $4; //@line 728 "main.c"
  $5 = ($4|0)!=(0|0); //@line 728 "main.c"
  if (!($5)) {
   label = 5;
   break;
  }
  $6 = $out_window; //@line 730 "main.c"
  $7 = ((($6)) + 4|0); //@line 730 "main.c"
  $8 = HEAP32[$7>>2]|0; //@line 730 "main.c"
  $9 = $1; //@line 730 "main.c"
  $10 = ($8|0)==($9|0); //@line 730 "main.c"
  if ($10) {
   label = 4;
   break;
  }
 }
 if ((label|0) == 4) {
  $11 = $out_window; //@line 731 "main.c"
  $0 = $11; //@line 731 "main.c"
  $12 = $0; //@line 735 "main.c"
  STACKTOP = sp;return ($12|0); //@line 735 "main.c"
 }
 else if ((label|0) == 5) {
  $0 = 0; //@line 734 "main.c"
  $12 = $0; //@line 735 "main.c"
  STACKTOP = sp;return ($12|0); //@line 735 "main.c"
 }
 return (0)|0;
}
function _getWindowContext($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $dest_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $handle;
 $2 = $1; //@line 771 "main.c"
 $3 = (_getWindowByHandle($2)|0); //@line 771 "main.c"
 $dest_window = $3; //@line 771 "main.c"
 $4 = $dest_window; //@line 773 "main.c"
 $5 = ($4|0)!=(0|0); //@line 773 "main.c"
 if ($5) {
  $6 = $dest_window; //@line 779 "main.c"
  $7 = ((($6)) + 12|0); //@line 779 "main.c"
  $8 = HEAP32[$7>>2]|0; //@line 779 "main.c"
  $0 = $8; //@line 779 "main.c"
  $9 = $0; //@line 780 "main.c"
  STACKTOP = sp;return ($9|0); //@line 780 "main.c"
 } else {
  $0 = 0; //@line 776 "main.c"
  $9 = $0; //@line 780 "main.c"
  STACKTOP = sp;return ($9|0); //@line 780 "main.c"
 }
 return (0)|0;
}
function _updateOverlapped($window_bounds,$avoid_window) {
 $window_bounds = $window_bounds|0;
 $avoid_window = $avoid_window|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0;
 var $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0;
 var $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0;
 var $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0;
 var $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $comp_rect = 0, $cur_window = 0, $draw_rect = 0, $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $comp_rect = sp + 24|0;
 $draw_rect = sp + 8|0;
 $0 = $window_bounds;
 $1 = $avoid_window;
 $i = 0; //@line 785 "main.c"
 $i = 0; //@line 791 "main.c"
 while(1) {
  $2 = $i; //@line 791 "main.c"
  $3 = HEAP32[1829]|0; //@line 791 "main.c"
  $4 = ((($3)) + 8|0); //@line 791 "main.c"
  $5 = HEAP32[$4>>2]|0; //@line 791 "main.c"
  $6 = ($2>>>0)<($5>>>0); //@line 791 "main.c"
  if (!($6)) {
   break;
  }
  $7 = HEAP32[1829]|0; //@line 793 "main.c"
  $8 = $i; //@line 793 "main.c"
  $9 = (_List_get_at($7,$8)|0); //@line 793 "main.c"
  $cur_window = $9; //@line 793 "main.c"
  $10 = $cur_window; //@line 795 "main.c"
  $11 = ($10|0)!=(0|0); //@line 795 "main.c"
  if ($11) {
   $12 = $cur_window; //@line 795 "main.c"
   $13 = $1; //@line 795 "main.c"
   $14 = ($12|0)==($13|0); //@line 795 "main.c"
   if (!($14)) {
    $15 = $cur_window; //@line 798 "main.c"
    $16 = ((($15)) + 28|0); //@line 798 "main.c"
    $17 = HEAP32[$16>>2]|0; //@line 798 "main.c"
    HEAP32[$comp_rect>>2] = $17; //@line 798 "main.c"
    $18 = $cur_window; //@line 799 "main.c"
    $19 = ((($18)) + 24|0); //@line 799 "main.c"
    $20 = HEAP32[$19>>2]|0; //@line 799 "main.c"
    $21 = ((($comp_rect)) + 12|0); //@line 799 "main.c"
    HEAP32[$21>>2] = $20; //@line 799 "main.c"
    $22 = HEAP32[$comp_rect>>2]|0; //@line 800 "main.c"
    $23 = $cur_window; //@line 800 "main.c"
    $24 = ((($23)) + 20|0); //@line 800 "main.c"
    $25 = HEAP32[$24>>2]|0; //@line 800 "main.c"
    $26 = (($22) + ($25))|0; //@line 800 "main.c"
    $27 = (($26) - 1)|0; //@line 800 "main.c"
    $28 = ((($comp_rect)) + 8|0); //@line 800 "main.c"
    HEAP32[$28>>2] = $27; //@line 800 "main.c"
    $29 = ((($comp_rect)) + 12|0); //@line 801 "main.c"
    $30 = HEAP32[$29>>2]|0; //@line 801 "main.c"
    $31 = $cur_window; //@line 801 "main.c"
    $32 = ((($31)) + 16|0); //@line 801 "main.c"
    $33 = HEAP32[$32>>2]|0; //@line 801 "main.c"
    $34 = (($30) + ($33))|0; //@line 801 "main.c"
    $35 = (($34) - 1)|0; //@line 801 "main.c"
    $36 = ((($comp_rect)) + 4|0); //@line 801 "main.c"
    HEAP32[$36>>2] = $35; //@line 801 "main.c"
    $37 = $cur_window; //@line 803 "main.c"
    $38 = ((($37)) + 1|0); //@line 803 "main.c"
    $39 = HEAP8[$38>>0]|0; //@line 803 "main.c"
    $40 = $39&255; //@line 803 "main.c"
    $41 = $40 & 4; //@line 803 "main.c"
    $42 = ($41|0)!=(0); //@line 803 "main.c"
    if ($42) {
     $43 = $0; //@line 804 "main.c"
     $44 = ((($43)) + 12|0); //@line 804 "main.c"
     $45 = HEAP32[$44>>2]|0; //@line 804 "main.c"
     $46 = ((($comp_rect)) + 4|0); //@line 804 "main.c"
     $47 = HEAP32[$46>>2]|0; //@line 804 "main.c"
     $48 = ($45>>>0)<=($47>>>0); //@line 804 "main.c"
     if ($48) {
      $49 = $0; //@line 805 "main.c"
      $50 = ((($49)) + 4|0); //@line 805 "main.c"
      $51 = HEAP32[$50>>2]|0; //@line 805 "main.c"
      $52 = ((($comp_rect)) + 12|0); //@line 805 "main.c"
      $53 = HEAP32[$52>>2]|0; //@line 805 "main.c"
      $54 = ($51>>>0)>=($53>>>0); //@line 805 "main.c"
      if ($54) {
       $55 = $0; //@line 806 "main.c"
       $56 = HEAP32[$55>>2]|0; //@line 806 "main.c"
       $57 = ((($comp_rect)) + 8|0); //@line 806 "main.c"
       $58 = HEAP32[$57>>2]|0; //@line 806 "main.c"
       $59 = ($56>>>0)<=($58>>>0); //@line 806 "main.c"
       if ($59) {
        $60 = $0; //@line 807 "main.c"
        $61 = ((($60)) + 8|0); //@line 807 "main.c"
        $62 = HEAP32[$61>>2]|0; //@line 807 "main.c"
        $63 = HEAP32[$comp_rect>>2]|0; //@line 807 "main.c"
        $64 = ($62>>>0)>=($63>>>0); //@line 807 "main.c"
        if ($64) {
         $65 = $0; //@line 809 "main.c"
         $66 = HEAP32[$65>>2]|0; //@line 809 "main.c"
         $67 = HEAP32[$comp_rect>>2]|0; //@line 809 "main.c"
         $68 = ($66>>>0)<($67>>>0); //@line 809 "main.c"
         if ($68) {
          $69 = HEAP32[$comp_rect>>2]|0; //@line 810 "main.c"
          HEAP32[$draw_rect>>2] = $69; //@line 810 "main.c"
         } else {
          $70 = $0; //@line 812 "main.c"
          $71 = HEAP32[$70>>2]|0; //@line 812 "main.c"
          HEAP32[$draw_rect>>2] = $71; //@line 812 "main.c"
         }
         $72 = $0; //@line 814 "main.c"
         $73 = ((($72)) + 12|0); //@line 814 "main.c"
         $74 = HEAP32[$73>>2]|0; //@line 814 "main.c"
         $75 = ((($comp_rect)) + 12|0); //@line 814 "main.c"
         $76 = HEAP32[$75>>2]|0; //@line 814 "main.c"
         $77 = ($74>>>0)<($76>>>0); //@line 814 "main.c"
         if ($77) {
          $78 = ((($comp_rect)) + 12|0); //@line 815 "main.c"
          $79 = HEAP32[$78>>2]|0; //@line 815 "main.c"
          $80 = ((($draw_rect)) + 12|0); //@line 815 "main.c"
          HEAP32[$80>>2] = $79; //@line 815 "main.c"
         } else {
          $81 = $0; //@line 817 "main.c"
          $82 = ((($81)) + 12|0); //@line 817 "main.c"
          $83 = HEAP32[$82>>2]|0; //@line 817 "main.c"
          $84 = ((($draw_rect)) + 12|0); //@line 817 "main.c"
          HEAP32[$84>>2] = $83; //@line 817 "main.c"
         }
         $85 = $0; //@line 819 "main.c"
         $86 = ((($85)) + 8|0); //@line 819 "main.c"
         $87 = HEAP32[$86>>2]|0; //@line 819 "main.c"
         $88 = ((($comp_rect)) + 8|0); //@line 819 "main.c"
         $89 = HEAP32[$88>>2]|0; //@line 819 "main.c"
         $90 = ($87>>>0)>($89>>>0); //@line 819 "main.c"
         if ($90) {
          $91 = ((($comp_rect)) + 8|0); //@line 820 "main.c"
          $92 = HEAP32[$91>>2]|0; //@line 820 "main.c"
          $93 = ((($draw_rect)) + 8|0); //@line 820 "main.c"
          HEAP32[$93>>2] = $92; //@line 820 "main.c"
         } else {
          $94 = $0; //@line 822 "main.c"
          $95 = ((($94)) + 8|0); //@line 822 "main.c"
          $96 = HEAP32[$95>>2]|0; //@line 822 "main.c"
          $97 = ((($draw_rect)) + 8|0); //@line 822 "main.c"
          HEAP32[$97>>2] = $96; //@line 822 "main.c"
         }
         $98 = $0; //@line 824 "main.c"
         $99 = ((($98)) + 4|0); //@line 824 "main.c"
         $100 = HEAP32[$99>>2]|0; //@line 824 "main.c"
         $101 = ((($comp_rect)) + 4|0); //@line 824 "main.c"
         $102 = HEAP32[$101>>2]|0; //@line 824 "main.c"
         $103 = ($100>>>0)>($102>>>0); //@line 824 "main.c"
         if ($103) {
          $104 = ((($comp_rect)) + 4|0); //@line 825 "main.c"
          $105 = HEAP32[$104>>2]|0; //@line 825 "main.c"
          $106 = ((($draw_rect)) + 4|0); //@line 825 "main.c"
          HEAP32[$106>>2] = $105; //@line 825 "main.c"
         } else {
          $107 = $0; //@line 827 "main.c"
          $108 = ((($107)) + 4|0); //@line 827 "main.c"
          $109 = HEAP32[$108>>2]|0; //@line 827 "main.c"
          $110 = ((($draw_rect)) + 4|0); //@line 827 "main.c"
          HEAP32[$110>>2] = $109; //@line 827 "main.c"
         }
         $111 = HEAP32[$draw_rect>>2]|0; //@line 829 "main.c"
         $112 = $cur_window; //@line 829 "main.c"
         $113 = ((($112)) + 28|0); //@line 829 "main.c"
         $114 = HEAP32[$113>>2]|0; //@line 829 "main.c"
         $115 = (($111) - ($114))|0; //@line 829 "main.c"
         $116 = $cur_window; //@line 829 "main.c"
         $117 = ((($116)) + 12|0); //@line 829 "main.c"
         $118 = HEAP32[$117>>2]|0; //@line 829 "main.c"
         $119 = ((($118)) + 12|0); //@line 829 "main.c"
         HEAP32[$119>>2] = $115; //@line 829 "main.c"
         $120 = ((($draw_rect)) + 12|0); //@line 830 "main.c"
         $121 = HEAP32[$120>>2]|0; //@line 830 "main.c"
         $122 = $cur_window; //@line 830 "main.c"
         $123 = ((($122)) + 24|0); //@line 830 "main.c"
         $124 = HEAP32[$123>>2]|0; //@line 830 "main.c"
         $125 = (($121) - ($124))|0; //@line 830 "main.c"
         $126 = $cur_window; //@line 830 "main.c"
         $127 = ((($126)) + 12|0); //@line 830 "main.c"
         $128 = HEAP32[$127>>2]|0; //@line 830 "main.c"
         $129 = ((($128)) + 16|0); //@line 830 "main.c"
         HEAP32[$129>>2] = $125; //@line 830 "main.c"
         $130 = ((($draw_rect)) + 8|0); //@line 831 "main.c"
         $131 = HEAP32[$130>>2]|0; //@line 831 "main.c"
         $132 = $cur_window; //@line 831 "main.c"
         $133 = ((($132)) + 28|0); //@line 831 "main.c"
         $134 = HEAP32[$133>>2]|0; //@line 831 "main.c"
         $135 = (($131) - ($134))|0; //@line 831 "main.c"
         $136 = $cur_window; //@line 831 "main.c"
         $137 = ((($136)) + 12|0); //@line 831 "main.c"
         $138 = HEAP32[$137>>2]|0; //@line 831 "main.c"
         $139 = ((($138)) + 20|0); //@line 831 "main.c"
         HEAP32[$139>>2] = $135; //@line 831 "main.c"
         $140 = ((($draw_rect)) + 4|0); //@line 832 "main.c"
         $141 = HEAP32[$140>>2]|0; //@line 832 "main.c"
         $142 = $cur_window; //@line 832 "main.c"
         $143 = ((($142)) + 24|0); //@line 832 "main.c"
         $144 = HEAP32[$143>>2]|0; //@line 832 "main.c"
         $145 = (($141) - ($144))|0; //@line 832 "main.c"
         $146 = $cur_window; //@line 832 "main.c"
         $147 = ((($146)) + 12|0); //@line 832 "main.c"
         $148 = HEAP32[$147>>2]|0; //@line 832 "main.c"
         $149 = ((($148)) + 24|0); //@line 832 "main.c"
         HEAP32[$149>>2] = $145; //@line 832 "main.c"
         $150 = $cur_window; //@line 833 "main.c"
         _drawWindow($150,1); //@line 833 "main.c"
        }
       }
      }
     }
    }
   }
  }
  $151 = $i; //@line 791 "main.c"
  $152 = (($151) + 1)|0; //@line 791 "main.c"
  $i = $152; //@line 791 "main.c"
 }
 STACKTOP = sp;return; //@line 836 "main.c"
}
function _changeWindowPosition($dest_window,$new_x,$new_y) {
 $dest_window = $dest_window|0;
 $new_x = $new_x|0;
 $new_y = $new_y|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $overlap_rect = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $overlap_rect = sp;
 $0 = $dest_window;
 $1 = $new_x;
 $2 = $new_y;
 $3 = $0; //@line 845 "main.c"
 _markWindowVisible($3,1); //@line 845 "main.c"
 $4 = $0; //@line 846 "main.c"
 _raiseWindow($4); //@line 846 "main.c"
 $5 = $0; //@line 849 "main.c"
 $6 = ((($5)) + 28|0); //@line 849 "main.c"
 $7 = HEAP32[$6>>2]|0; //@line 849 "main.c"
 HEAP32[$overlap_rect>>2] = $7; //@line 849 "main.c"
 $8 = $0; //@line 850 "main.c"
 $9 = ((($8)) + 24|0); //@line 850 "main.c"
 $10 = HEAP32[$9>>2]|0; //@line 850 "main.c"
 $11 = ((($overlap_rect)) + 12|0); //@line 850 "main.c"
 HEAP32[$11>>2] = $10; //@line 850 "main.c"
 $12 = HEAP32[$overlap_rect>>2]|0; //@line 851 "main.c"
 $13 = $0; //@line 851 "main.c"
 $14 = ((($13)) + 20|0); //@line 851 "main.c"
 $15 = HEAP32[$14>>2]|0; //@line 851 "main.c"
 $16 = (($12) + ($15))|0; //@line 851 "main.c"
 $17 = (($16) - 1)|0; //@line 851 "main.c"
 $18 = ((($overlap_rect)) + 8|0); //@line 851 "main.c"
 HEAP32[$18>>2] = $17; //@line 851 "main.c"
 $19 = ((($overlap_rect)) + 12|0); //@line 852 "main.c"
 $20 = HEAP32[$19>>2]|0; //@line 852 "main.c"
 $21 = $0; //@line 852 "main.c"
 $22 = ((($21)) + 16|0); //@line 852 "main.c"
 $23 = HEAP32[$22>>2]|0; //@line 852 "main.c"
 $24 = (($20) + ($23))|0; //@line 852 "main.c"
 $25 = (($24) - 1)|0; //@line 852 "main.c"
 $26 = ((($overlap_rect)) + 4|0); //@line 852 "main.c"
 HEAP32[$26>>2] = $25; //@line 852 "main.c"
 $27 = $1; //@line 854 "main.c"
 $28 = $27&65535; //@line 854 "main.c"
 $29 = $0; //@line 854 "main.c"
 $30 = ((($29)) + 24|0); //@line 854 "main.c"
 HEAP32[$30>>2] = $28; //@line 854 "main.c"
 $31 = $2; //@line 855 "main.c"
 $32 = $31&65535; //@line 855 "main.c"
 $33 = $0; //@line 855 "main.c"
 $34 = ((($33)) + 28|0); //@line 855 "main.c"
 HEAP32[$34>>2] = $32; //@line 855 "main.c"
 $35 = $0; //@line 858 "main.c"
 $36 = ((($35)) + 1|0); //@line 858 "main.c"
 $37 = HEAP8[$36>>0]|0; //@line 858 "main.c"
 $38 = $37&255; //@line 858 "main.c"
 $39 = $38 & 4; //@line 858 "main.c"
 $40 = ($39|0)!=(0); //@line 858 "main.c"
 if (!($40)) {
  STACKTOP = sp;return; //@line 870 "main.c"
 }
 $41 = $0; //@line 863 "main.c"
 _updateOverlapped($overlap_rect,$41); //@line 863 "main.c"
 $42 = $0; //@line 866 "main.c"
 $43 = ((($42)) + 40|0); //@line 866 "main.c"
 HEAP8[$43>>0] = 1; //@line 866 "main.c"
 $44 = $0; //@line 867 "main.c"
 _drawWindow($44,0); //@line 867 "main.c"
 STACKTOP = sp;return; //@line 870 "main.c"
}
function _markWindowVisible($dest_window,$is_visible) {
 $dest_window = $dest_window|0;
 $is_visible = $is_visible|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $overlap_rect = 0, $was_visible = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $overlap_rect = sp;
 $0 = $dest_window;
 $1 = $is_visible;
 $2 = $0; //@line 926 "main.c"
 $3 = ((($2)) + 1|0); //@line 926 "main.c"
 $4 = HEAP8[$3>>0]|0; //@line 926 "main.c"
 $5 = $4&255; //@line 926 "main.c"
 $6 = $5 & 4; //@line 926 "main.c"
 $7 = $6&255; //@line 926 "main.c"
 $was_visible = $7; //@line 926 "main.c"
 $8 = $was_visible; //@line 928 "main.c"
 $9 = ($8<<24>>24)!=(0); //@line 928 "main.c"
 $10 = $1; //@line 928 "main.c"
 $11 = ($10<<24>>24)!=(0); //@line 928 "main.c"
 $or$cond = $9 & $11; //@line 928 "main.c"
 if ($or$cond) {
  STACKTOP = sp;return; //@line 946 "main.c"
 }
 $12 = $1; //@line 931 "main.c"
 $13 = ($12<<24>>24)!=(0); //@line 931 "main.c"
 $14 = $0; //@line 933 "main.c"
 $15 = ((($14)) + 1|0); //@line 933 "main.c"
 $16 = HEAP8[$15>>0]|0; //@line 933 "main.c"
 $17 = $16&255; //@line 933 "main.c"
 if ($13) {
  $18 = $17 | 4; //@line 933 "main.c"
  $19 = $18&255; //@line 933 "main.c"
  HEAP8[$15>>0] = $19; //@line 933 "main.c"
  $20 = $0; //@line 934 "main.c"
  _drawWindow($20,0); //@line 934 "main.c"
  STACKTOP = sp;return; //@line 946 "main.c"
 } else {
  $21 = $17 & -5; //@line 937 "main.c"
  $22 = $21&255; //@line 937 "main.c"
  HEAP8[$15>>0] = $22; //@line 937 "main.c"
  $23 = $0; //@line 938 "main.c"
  $24 = ((($23)) + 28|0); //@line 938 "main.c"
  $25 = HEAP32[$24>>2]|0; //@line 938 "main.c"
  HEAP32[$overlap_rect>>2] = $25; //@line 938 "main.c"
  $26 = $0; //@line 939 "main.c"
  $27 = ((($26)) + 24|0); //@line 939 "main.c"
  $28 = HEAP32[$27>>2]|0; //@line 939 "main.c"
  $29 = ((($overlap_rect)) + 12|0); //@line 939 "main.c"
  HEAP32[$29>>2] = $28; //@line 939 "main.c"
  $30 = HEAP32[$overlap_rect>>2]|0; //@line 940 "main.c"
  $31 = $0; //@line 940 "main.c"
  $32 = ((($31)) + 20|0); //@line 940 "main.c"
  $33 = HEAP32[$32>>2]|0; //@line 940 "main.c"
  $34 = (($30) + ($33))|0; //@line 940 "main.c"
  $35 = (($34) - 1)|0; //@line 940 "main.c"
  $36 = ((($overlap_rect)) + 8|0); //@line 940 "main.c"
  HEAP32[$36>>2] = $35; //@line 940 "main.c"
  $37 = ((($overlap_rect)) + 12|0); //@line 941 "main.c"
  $38 = HEAP32[$37>>2]|0; //@line 941 "main.c"
  $39 = $0; //@line 941 "main.c"
  $40 = ((($39)) + 16|0); //@line 941 "main.c"
  $41 = HEAP32[$40>>2]|0; //@line 941 "main.c"
  $42 = (($38) + ($41))|0; //@line 941 "main.c"
  $43 = (($42) - 1)|0; //@line 941 "main.c"
  $44 = ((($overlap_rect)) + 4|0); //@line 941 "main.c"
  HEAP32[$44>>2] = $43; //@line 941 "main.c"
  $45 = $0; //@line 942 "main.c"
  _updateOverlapped($overlap_rect,$45); //@line 942 "main.c"
  STACKTOP = sp;return; //@line 946 "main.c"
 }
}
function _raiseWindow($dest_window) {
 $dest_window = $dest_window|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $old_active = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $dest_window;
 $1 = $0; //@line 1251 "main.c"
 $2 = HEAP32[1830]|0; //@line 1251 "main.c"
 $3 = ($1|0)==($2|0); //@line 1251 "main.c"
 if ($3) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $4 = $0; //@line 1251 "main.c"
 $5 = HEAP32[1831]|0; //@line 1251 "main.c"
 $6 = ($4|0)!=($5|0); //@line 1251 "main.c"
 $7 = $0; //@line 1251 "main.c"
 $8 = ($7|0)!=(0|0); //@line 1251 "main.c"
 $or$cond = $6 & $8; //@line 1251 "main.c"
 if (!($or$cond)) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $9 = HEAP32[1829]|0; //@line 1251 "main.c"
 $10 = ((($9)) + 8|0); //@line 1251 "main.c"
 $11 = HEAP32[$10>>2]|0; //@line 1251 "main.c"
 $12 = ($11|0)==(2); //@line 1251 "main.c"
 if ($12) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $13 = HEAP32[1829]|0; //@line 1255 "main.c"
 $14 = HEAP32[1829]|0; //@line 1255 "main.c"
 $15 = ((($14)) + 8|0); //@line 1255 "main.c"
 $16 = HEAP32[$15>>2]|0; //@line 1255 "main.c"
 $17 = (($16) - 2)|0; //@line 1255 "main.c"
 $18 = (_List_get_at($13,$17)|0); //@line 1255 "main.c"
 $old_active = $18; //@line 1255 "main.c"
 $19 = $old_active; //@line 1258 "main.c"
 $20 = $0; //@line 1258 "main.c"
 $21 = ($19|0)==($20|0); //@line 1258 "main.c"
 if ($21) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $22 = HEAP32[1829]|0; //@line 1264 "main.c"
 $23 = HEAP32[1831]|0; //@line 1264 "main.c"
 $24 = (_List_pop($22,$23)|0); //@line 1264 "main.c"
 $25 = ($24|0)!=(0|0); //@line 1264 "main.c"
 if (!($25)) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $26 = HEAP32[1829]|0; //@line 1267 "main.c"
 $27 = $0; //@line 1267 "main.c"
 $28 = (_List_pop($26,$27)|0); //@line 1267 "main.c"
 $29 = ($28|0)!=(0|0); //@line 1267 "main.c"
 if (!($29)) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $30 = HEAP32[1829]|0; //@line 1270 "main.c"
 $31 = $0; //@line 1270 "main.c"
 $32 = (_List_add($30,$31)|0); //@line 1270 "main.c"
 $33 = ($32|0)!=(0); //@line 1270 "main.c"
 if (!($33)) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $34 = HEAP32[1829]|0; //@line 1273 "main.c"
 $35 = HEAP32[1831]|0; //@line 1273 "main.c"
 $36 = (_List_add($34,$35)|0); //@line 1273 "main.c"
 $37 = ($36|0)!=(0); //@line 1273 "main.c"
 if (!($37)) {
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
 $38 = $old_active; //@line 1277 "main.c"
 HEAP8[$38>>0] = 0; //@line 1277 "main.c"
 $39 = $0; //@line 1278 "main.c"
 HEAP8[$39>>0] = 1; //@line 1278 "main.c"
 $40 = $old_active; //@line 1279 "main.c"
 _drawTitlebar($40,1); //@line 1279 "main.c"
 $41 = $0; //@line 1280 "main.c"
 _drawTitlebar($41,0); //@line 1280 "main.c"
 $42 = $0; //@line 1286 "main.c"
 $43 = ((($42)) + 1|0); //@line 1286 "main.c"
 $44 = HEAP8[$43>>0]|0; //@line 1286 "main.c"
 $45 = $44&255; //@line 1286 "main.c"
 $46 = $45 & 4; //@line 1286 "main.c"
 $47 = $46&255; //@line 1286 "main.c"
 HEAP8[$43>>0] = $47; //@line 1286 "main.c"
 $48 = ($47<<24>>24)!=(0); //@line 1286 "main.c"
 $49 = $0; //@line 1289 "main.c"
 if ($48) {
  _drawWindow($49,0); //@line 1289 "main.c"
  STACKTOP = sp;return; //@line 1290 "main.c"
 } else {
  _markWindowVisible($49,1); //@line 1287 "main.c"
  STACKTOP = sp;return; //@line 1290 "main.c"
 }
}
function _moveHandle($handle,$new_x,$new_y) {
 $handle = $handle|0;
 $new_x = $new_x|0;
 $new_y = $new_y|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $dest_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $new_x;
 $2 = $new_y;
 $3 = $0; //@line 875 "main.c"
 $4 = (_getWindowByHandle($3)|0); //@line 875 "main.c"
 $dest_window = $4; //@line 875 "main.c"
 $5 = $dest_window; //@line 877 "main.c"
 $6 = ($5|0)!=(0|0); //@line 877 "main.c"
 if (!($6)) {
  STACKTOP = sp;return; //@line 884 "main.c"
 }
 $7 = $dest_window; //@line 883 "main.c"
 $8 = $1; //@line 883 "main.c"
 $9 = $2; //@line 883 "main.c"
 _changeWindowPosition($7,$8,$9); //@line 883 "main.c"
 STACKTOP = sp;return; //@line 884 "main.c"
}
function _installWindow($child_handle,$parent_handle) {
 $child_handle = $child_handle|0;
 $parent_handle = $parent_handle|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $child_handle;
 $1 = $parent_handle;
 STACKTOP = sp;return; //@line 919 "main.c"
}
function _markHandleVisible($handle,$is_visible) {
 $handle = $handle|0;
 $is_visible = $is_visible|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $dest_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $is_visible;
 $2 = $0; //@line 950 "main.c"
 $3 = (_getWindowByHandle($2)|0); //@line 950 "main.c"
 $dest_window = $3; //@line 950 "main.c"
 $4 = $dest_window; //@line 952 "main.c"
 $5 = ($4|0)!=(0|0); //@line 952 "main.c"
 if (!($5)) {
  STACKTOP = sp;return; //@line 959 "main.c"
 }
 $6 = $dest_window; //@line 958 "main.c"
 $7 = $1; //@line 958 "main.c"
 _markWindowVisible($6,$7); //@line 958 "main.c"
 STACKTOP = sp;return; //@line 959 "main.c"
}
function _setWindowTitle($handle,$newstr) {
 $handle = $handle|0;
 $newstr = $newstr|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $dest_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $newstr;
 $2 = $0; //@line 978 "main.c"
 $3 = (_getWindowByHandle($2)|0); //@line 978 "main.c"
 $dest_window = $3; //@line 978 "main.c"
 $4 = $dest_window; //@line 980 "main.c"
 $5 = ($4|0)!=(0|0); //@line 980 "main.c"
 if (!($5)) {
  STACKTOP = sp;return; //@line 992 "main.c"
 }
 $6 = $dest_window; //@line 986 "main.c"
 $7 = ((($6)) + 36|0); //@line 986 "main.c"
 $8 = HEAP32[$7>>2]|0; //@line 986 "main.c"
 $9 = ($8|0)!=(0|0); //@line 986 "main.c"
 if ($9) {
  $10 = $dest_window; //@line 987 "main.c"
  $11 = ((($10)) + 36|0); //@line 987 "main.c"
  $12 = HEAP32[$11>>2]|0; //@line 987 "main.c"
  _free($12); //@line 987 "main.c"
 }
 $13 = $1; //@line 989 "main.c"
 $14 = $dest_window; //@line 989 "main.c"
 $15 = ((($14)) + 36|0); //@line 989 "main.c"
 HEAP32[$15>>2] = $13; //@line 989 "main.c"
 $16 = $dest_window; //@line 991 "main.c"
 _drawTitlebar($16,1); //@line 991 "main.c"
 STACKTOP = sp;return; //@line 992 "main.c"
}
function _bmpDrawPanel($bmp,$x,$y,$width,$height,$color,$border_width,$invert) {
 $bmp = $bmp|0;
 $x = $x|0;
 $y = $y|0;
 $width = $width|0;
 $height = $height|0;
 $color = $color|0;
 $border_width = $border_width|0;
 $invert = $invert|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0;
 var $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0;
 var $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0;
 var $97 = 0, $98 = 0, $99 = 0, $b = 0, $g = 0, $i = 0, $light_color = 0, $r = 0, $shade_color = 0, $temp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 64|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $x;
 $2 = $y;
 $3 = $width;
 $4 = $height;
 $5 = $color;
 $6 = $border_width;
 $7 = $invert;
 $8 = $5; //@line 996 "main.c"
 $9 = $8 & 16711680; //@line 996 "main.c"
 $10 = $9 >>> 16; //@line 996 "main.c"
 $11 = $10&255; //@line 996 "main.c"
 $r = $11; //@line 996 "main.c"
 $12 = $5; //@line 997 "main.c"
 $13 = $12 & 65280; //@line 997 "main.c"
 $14 = $13 >>> 8; //@line 997 "main.c"
 $15 = $14&255; //@line 997 "main.c"
 $g = $15; //@line 997 "main.c"
 $16 = $5; //@line 998 "main.c"
 $17 = $16 & 255; //@line 998 "main.c"
 $18 = $17&255; //@line 998 "main.c"
 $b = $18; //@line 998 "main.c"
 $19 = $r; //@line 999 "main.c"
 $20 = $19&255; //@line 999 "main.c"
 $21 = ($20|0)>(155); //@line 999 "main.c"
 if ($21) {
  $27 = 255;
 } else {
  $22 = $r; //@line 999 "main.c"
  $23 = $22&255; //@line 999 "main.c"
  $24 = (($23) + 100)|0; //@line 999 "main.c"
  $25 = $24 & 255; //@line 999 "main.c"
  $27 = $25;
 }
 $26 = $27 << 16; //@line 999 "main.c"
 $28 = $g; //@line 999 "main.c"
 $29 = $28&255; //@line 999 "main.c"
 $30 = ($29|0)>(155); //@line 999 "main.c"
 if ($30) {
  $36 = 255;
 } else {
  $31 = $g; //@line 999 "main.c"
  $32 = $31&255; //@line 999 "main.c"
  $33 = (($32) + 100)|0; //@line 999 "main.c"
  $34 = $33 & 255; //@line 999 "main.c"
  $36 = $34;
 }
 $35 = $36 << 8; //@line 999 "main.c"
 $37 = (($26) + ($35))|0; //@line 999 "main.c"
 $38 = $b; //@line 999 "main.c"
 $39 = $38&255; //@line 999 "main.c"
 $40 = ($39|0)>(155); //@line 999 "main.c"
 if ($40) {
  $46 = 255;
 } else {
  $41 = $b; //@line 999 "main.c"
  $42 = $41&255; //@line 999 "main.c"
  $43 = (($42) + 100)|0; //@line 999 "main.c"
  $44 = $43 & 255; //@line 999 "main.c"
  $46 = $44;
 }
 $45 = (($37) + ($46))|0; //@line 999 "main.c"
 $light_color = $45; //@line 999 "main.c"
 $47 = $r; //@line 1000 "main.c"
 $48 = $47&255; //@line 1000 "main.c"
 $49 = ($48|0)<(100); //@line 1000 "main.c"
 if ($49) {
  $55 = 0;
 } else {
  $50 = $r; //@line 1000 "main.c"
  $51 = $50&255; //@line 1000 "main.c"
  $52 = (($51) - 100)|0; //@line 1000 "main.c"
  $53 = $52 & 255; //@line 1000 "main.c"
  $55 = $53;
 }
 $54 = $55 << 16; //@line 1000 "main.c"
 $56 = $g; //@line 1000 "main.c"
 $57 = $56&255; //@line 1000 "main.c"
 $58 = ($57|0)<(100); //@line 1000 "main.c"
 if ($58) {
  $64 = 0;
 } else {
  $59 = $g; //@line 1000 "main.c"
  $60 = $59&255; //@line 1000 "main.c"
  $61 = (($60) - 100)|0; //@line 1000 "main.c"
  $62 = $61 & 255; //@line 1000 "main.c"
  $64 = $62;
 }
 $63 = $64 << 8; //@line 1000 "main.c"
 $65 = (($54) + ($63))|0; //@line 1000 "main.c"
 $66 = $b; //@line 1000 "main.c"
 $67 = $66&255; //@line 1000 "main.c"
 $68 = ($67|0)<(100); //@line 1000 "main.c"
 if ($68) {
  $74 = 0;
 } else {
  $69 = $b; //@line 1000 "main.c"
  $70 = $69&255; //@line 1000 "main.c"
  $71 = (($70) - 100)|0; //@line 1000 "main.c"
  $72 = $71 & 255; //@line 1000 "main.c"
  $74 = $72;
 }
 $73 = (($65) + ($74))|0; //@line 1000 "main.c"
 $shade_color = $73; //@line 1000 "main.c"
 $75 = $7; //@line 1004 "main.c"
 $76 = ($75|0)!=(0); //@line 1004 "main.c"
 if ($76) {
  $77 = $shade_color; //@line 1006 "main.c"
  $temp = $77; //@line 1006 "main.c"
  $78 = $light_color; //@line 1007 "main.c"
  $shade_color = $78; //@line 1007 "main.c"
  $79 = $temp; //@line 1008 "main.c"
  $light_color = $79; //@line 1008 "main.c"
 }
 $i = 0; //@line 1011 "main.c"
 while(1) {
  $80 = $i; //@line 1011 "main.c"
  $81 = $6; //@line 1011 "main.c"
  $82 = ($80|0)<($81|0); //@line 1011 "main.c"
  if (!($82)) {
   break;
  }
  $83 = $0; //@line 1014 "main.c"
  $84 = $1; //@line 1014 "main.c"
  $85 = $i; //@line 1014 "main.c"
  $86 = (($84) + ($85))|0; //@line 1014 "main.c"
  $87 = $2; //@line 1014 "main.c"
  $88 = $i; //@line 1014 "main.c"
  $89 = (($87) + ($88))|0; //@line 1014 "main.c"
  $90 = $3; //@line 1014 "main.c"
  $91 = $i; //@line 1014 "main.c"
  $92 = $91<<1; //@line 1014 "main.c"
  $93 = (($90) - ($92))|0; //@line 1014 "main.c"
  $94 = $light_color; //@line 1014 "main.c"
  _bmpDrawHLine($83,$86,$89,$93,$94); //@line 1014 "main.c"
  $95 = $0; //@line 1017 "main.c"
  $96 = $1; //@line 1017 "main.c"
  $97 = $i; //@line 1017 "main.c"
  $98 = (($96) + ($97))|0; //@line 1017 "main.c"
  $99 = $2; //@line 1017 "main.c"
  $100 = $i; //@line 1017 "main.c"
  $101 = (($99) + ($100))|0; //@line 1017 "main.c"
  $102 = (($101) + 1)|0; //@line 1017 "main.c"
  $103 = $4; //@line 1017 "main.c"
  $104 = $i; //@line 1017 "main.c"
  $105 = (($104) + 1)|0; //@line 1017 "main.c"
  $106 = $105<<1; //@line 1017 "main.c"
  $107 = (($103) - ($106))|0; //@line 1017 "main.c"
  $108 = $light_color; //@line 1017 "main.c"
  _bmpDrawVLine($95,$98,$102,$107,$108); //@line 1017 "main.c"
  $109 = $0; //@line 1020 "main.c"
  $110 = $1; //@line 1020 "main.c"
  $111 = $i; //@line 1020 "main.c"
  $112 = (($110) + ($111))|0; //@line 1020 "main.c"
  $113 = $2; //@line 1020 "main.c"
  $114 = $4; //@line 1020 "main.c"
  $115 = (($113) + ($114))|0; //@line 1020 "main.c"
  $116 = $i; //@line 1020 "main.c"
  $117 = (($116) + 1)|0; //@line 1020 "main.c"
  $118 = (($115) - ($117))|0; //@line 1020 "main.c"
  $119 = $3; //@line 1020 "main.c"
  $120 = $i; //@line 1020 "main.c"
  $121 = $120<<1; //@line 1020 "main.c"
  $122 = (($119) - ($121))|0; //@line 1020 "main.c"
  $123 = $shade_color; //@line 1020 "main.c"
  _bmpDrawHLine($109,$112,$118,$122,$123); //@line 1020 "main.c"
  $124 = $0; //@line 1023 "main.c"
  $125 = $1; //@line 1023 "main.c"
  $126 = $3; //@line 1023 "main.c"
  $127 = (($125) + ($126))|0; //@line 1023 "main.c"
  $128 = $i; //@line 1023 "main.c"
  $129 = (($127) - ($128))|0; //@line 1023 "main.c"
  $130 = (($129) - 1)|0; //@line 1023 "main.c"
  $131 = $2; //@line 1023 "main.c"
  $132 = $i; //@line 1023 "main.c"
  $133 = (($131) + ($132))|0; //@line 1023 "main.c"
  $134 = (($133) + 1)|0; //@line 1023 "main.c"
  $135 = $4; //@line 1023 "main.c"
  $136 = $i; //@line 1023 "main.c"
  $137 = (($136) + 1)|0; //@line 1023 "main.c"
  $138 = $137<<1; //@line 1023 "main.c"
  $139 = (($135) - ($138))|0; //@line 1023 "main.c"
  $140 = $shade_color; //@line 1023 "main.c"
  _bmpDrawVLine($124,$130,$134,$139,$140); //@line 1023 "main.c"
  $141 = $i; //@line 1011 "main.c"
  $142 = (($141) + 1)|0; //@line 1011 "main.c"
  $i = $142; //@line 1011 "main.c"
 }
 STACKTOP = sp;return; //@line 1025 "main.c"
}
function _getOverlappingWindows($lowest_z_level,$baserect) {
 $lowest_z_level = $lowest_z_level|0;
 $baserect = $baserect|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $cur_window = 0, $new_rect = 0, $rect_list = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $lowest_z_level;
 $2 = $baserect;
 $3 = (_List_new()|0); //@line 1137 "main.c"
 $rect_list = $3; //@line 1137 "main.c"
 $4 = $rect_list; //@line 1139 "main.c"
 $5 = ($4|0)!=(0|0); //@line 1139 "main.c"
 if (!($5)) {
  $0 = 0; //@line 1141 "main.c"
  $91 = $0; //@line 1172 "main.c"
  STACKTOP = sp;return ($91|0); //@line 1172 "main.c"
 }
 $6 = HEAP32[1829]|0; //@line 1147 "main.c"
 $7 = $1; //@line 1147 "main.c"
 _List_seek_to($6,$7); //@line 1147 "main.c"
 while(1) {
  $8 = HEAP32[1829]|0; //@line 1147 "main.c"
  $9 = (_List_get_next($8)|0); //@line 1147 "main.c"
  $cur_window = $9; //@line 1147 "main.c"
  $10 = ($9|0)!=(0|0); //@line 1147 "main.c"
  if (!($10)) {
   label = 14;
   break;
  }
  $11 = $cur_window; //@line 1150 "main.c"
  $12 = ((($11)) + 12|0); //@line 1150 "main.c"
  $13 = HEAP32[$12>>2]|0; //@line 1150 "main.c"
  $14 = ((($13)) + 28|0); //@line 1150 "main.c"
  $15 = HEAP32[$14>>2]|0; //@line 1150 "main.c"
  $16 = ($15|0)==(0); //@line 1150 "main.c"
  if (!($16)) {
   continue;
  }
  $17 = $cur_window; //@line 1151 "main.c"
  $18 = ((($17)) + 24|0); //@line 1151 "main.c"
  $19 = HEAP32[$18>>2]|0; //@line 1151 "main.c"
  $20 = $2; //@line 1151 "main.c"
  $21 = ((($20)) + 4|0); //@line 1151 "main.c"
  $22 = HEAP32[$21>>2]|0; //@line 1151 "main.c"
  $23 = ($19>>>0)<=($22>>>0); //@line 1151 "main.c"
  if (!($23)) {
   continue;
  }
  $24 = $cur_window; //@line 1152 "main.c"
  $25 = ((($24)) + 24|0); //@line 1152 "main.c"
  $26 = HEAP32[$25>>2]|0; //@line 1152 "main.c"
  $27 = $cur_window; //@line 1152 "main.c"
  $28 = ((($27)) + 12|0); //@line 1152 "main.c"
  $29 = HEAP32[$28>>2]|0; //@line 1152 "main.c"
  $30 = ((($29)) + 4|0); //@line 1152 "main.c"
  $31 = HEAP32[$30>>2]|0; //@line 1152 "main.c"
  $32 = (($26) + ($31))|0; //@line 1152 "main.c"
  $33 = (($32) - 1)|0; //@line 1152 "main.c"
  $34 = $2; //@line 1152 "main.c"
  $35 = ((($34)) + 12|0); //@line 1152 "main.c"
  $36 = HEAP32[$35>>2]|0; //@line 1152 "main.c"
  $37 = ($33>>>0)>=($36>>>0); //@line 1152 "main.c"
  if (!($37)) {
   continue;
  }
  $38 = $cur_window; //@line 1153 "main.c"
  $39 = ((($38)) + 28|0); //@line 1153 "main.c"
  $40 = HEAP32[$39>>2]|0; //@line 1153 "main.c"
  $41 = $2; //@line 1153 "main.c"
  $42 = ((($41)) + 8|0); //@line 1153 "main.c"
  $43 = HEAP32[$42>>2]|0; //@line 1153 "main.c"
  $44 = ($40>>>0)<=($43>>>0); //@line 1153 "main.c"
  if (!($44)) {
   continue;
  }
  $45 = $cur_window; //@line 1154 "main.c"
  $46 = ((($45)) + 28|0); //@line 1154 "main.c"
  $47 = HEAP32[$46>>2]|0; //@line 1154 "main.c"
  $48 = $cur_window; //@line 1154 "main.c"
  $49 = ((($48)) + 12|0); //@line 1154 "main.c"
  $50 = HEAP32[$49>>2]|0; //@line 1154 "main.c"
  $51 = HEAP32[$50>>2]|0; //@line 1154 "main.c"
  $52 = (($47) + ($51))|0; //@line 1154 "main.c"
  $53 = (($52) - 1)|0; //@line 1154 "main.c"
  $54 = $2; //@line 1154 "main.c"
  $55 = HEAP32[$54>>2]|0; //@line 1154 "main.c"
  $56 = ($53>>>0)>=($55>>>0); //@line 1154 "main.c"
  if (!($56)) {
   continue;
  }
  $57 = $cur_window; //@line 1156 "main.c"
  $58 = ((($57)) + 28|0); //@line 1156 "main.c"
  $59 = HEAP32[$58>>2]|0; //@line 1156 "main.c"
  $60 = $cur_window; //@line 1156 "main.c"
  $61 = ((($60)) + 24|0); //@line 1156 "main.c"
  $62 = HEAP32[$61>>2]|0; //@line 1156 "main.c"
  $63 = $cur_window; //@line 1156 "main.c"
  $64 = ((($63)) + 28|0); //@line 1156 "main.c"
  $65 = HEAP32[$64>>2]|0; //@line 1156 "main.c"
  $66 = $cur_window; //@line 1156 "main.c"
  $67 = ((($66)) + 12|0); //@line 1156 "main.c"
  $68 = HEAP32[$67>>2]|0; //@line 1156 "main.c"
  $69 = HEAP32[$68>>2]|0; //@line 1156 "main.c"
  $70 = (($65) + ($69))|0; //@line 1156 "main.c"
  $71 = (($70) - 1)|0; //@line 1156 "main.c"
  $72 = $cur_window; //@line 1156 "main.c"
  $73 = ((($72)) + 24|0); //@line 1156 "main.c"
  $74 = HEAP32[$73>>2]|0; //@line 1156 "main.c"
  $75 = $cur_window; //@line 1156 "main.c"
  $76 = ((($75)) + 12|0); //@line 1156 "main.c"
  $77 = HEAP32[$76>>2]|0; //@line 1156 "main.c"
  $78 = ((($77)) + 4|0); //@line 1156 "main.c"
  $79 = HEAP32[$78>>2]|0; //@line 1156 "main.c"
  $80 = (($74) + ($79))|0; //@line 1156 "main.c"
  $81 = (($80) - 1)|0; //@line 1156 "main.c"
  $82 = (_Rect_new($59,$62,$71,$81)|0); //@line 1156 "main.c"
  $new_rect = $82; //@line 1156 "main.c"
  $83 = ($82|0)!=(0|0); //@line 1156 "main.c"
  $84 = $rect_list; //@line 1162 "main.c"
  if (!($83)) {
   label = 11;
   break;
  }
  $85 = $new_rect; //@line 1162 "main.c"
  $86 = (_List_add($84,$85)|0); //@line 1162 "main.c"
  $87 = ($86|0)!=(0); //@line 1162 "main.c"
  if (!($87)) {
   label = 13;
   break;
  }
 }
 if ((label|0) == 11) {
  _List_delete($84,12); //@line 1158 "main.c"
  $0 = 0; //@line 1159 "main.c"
  $91 = $0; //@line 1172 "main.c"
  STACKTOP = sp;return ($91|0); //@line 1172 "main.c"
 }
 else if ((label|0) == 13) {
  $88 = $new_rect; //@line 1164 "main.c"
  _free($88); //@line 1164 "main.c"
  $89 = $rect_list; //@line 1165 "main.c"
  _List_delete($89,12); //@line 1165 "main.c"
  $0 = 0; //@line 1166 "main.c"
  $91 = $0; //@line 1172 "main.c"
  STACKTOP = sp;return ($91|0); //@line 1172 "main.c"
 }
 else if ((label|0) == 14) {
  $90 = $rect_list; //@line 1171 "main.c"
  $0 = $90; //@line 1171 "main.c"
  $91 = $0; //@line 1172 "main.c"
  STACKTOP = sp;return ($91|0); //@line 1172 "main.c"
 }
 return (0)|0;
}
function _drawHandle($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $dest_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 1233 "main.c"
 $2 = (_getWindowByHandle($1)|0); //@line 1233 "main.c"
 $dest_window = $2; //@line 1233 "main.c"
 $3 = $dest_window; //@line 1235 "main.c"
 $4 = ($3|0)!=(0|0); //@line 1235 "main.c"
 if (!($4)) {
  STACKTOP = sp;return; //@line 1243 "main.c"
 }
 $5 = $dest_window; //@line 1242 "main.c"
 _drawWindow($5,1); //@line 1242 "main.c"
 STACKTOP = sp;return; //@line 1243 "main.c"
}
function _raiseHandle($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $dest_window = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 1295 "main.c"
 $2 = ($1|0)==(1); //@line 1295 "main.c"
 $3 = $0; //@line 1295 "main.c"
 $4 = ($3|0)==(2); //@line 1295 "main.c"
 $or$cond = $2 | $4; //@line 1295 "main.c"
 if ($or$cond) {
  STACKTOP = sp;return; //@line 1307 "main.c"
 }
 $5 = $0; //@line 1298 "main.c"
 $6 = (_getWindowByHandle($5)|0); //@line 1298 "main.c"
 $dest_window = $6; //@line 1298 "main.c"
 $7 = $dest_window; //@line 1300 "main.c"
 $8 = ($7|0)!=(0|0); //@line 1300 "main.c"
 if (!($8)) {
  STACKTOP = sp;return; //@line 1307 "main.c"
 }
 $9 = $dest_window; //@line 1306 "main.c"
 _raiseWindow($9); //@line 1306 "main.c"
 STACKTOP = sp;return; //@line 1307 "main.c"
}
function _window_deleter($item) {
 $item = $item|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $win = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $item;
 $1 = $0; //@line 1311 "main.c"
 $win = $1; //@line 1311 "main.c"
 $2 = $win; //@line 1314 "main.c"
 $3 = ((($2)) + 12|0); //@line 1314 "main.c"
 $4 = HEAP32[$3>>2]|0; //@line 1314 "main.c"
 _freeBitmap($4); //@line 1314 "main.c"
 $5 = $win; //@line 1323 "main.c"
 _free($5); //@line 1323 "main.c"
 STACKTOP = sp;return; //@line 1324 "main.c"
}
function _destroy($dest_window) {
 $dest_window = $dest_window|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $active_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $dest_window;
 $1 = $0; //@line 1332 "main.c"
 _markWindowVisible($1,0); //@line 1332 "main.c"
 $2 = HEAP32[1829]|0; //@line 1333 "main.c"
 $3 = $0; //@line 1333 "main.c"
 _List_remove($2,$3,13); //@line 1333 "main.c"
 $4 = HEAP32[1829]|0; //@line 1334 "main.c"
 $5 = HEAP32[1829]|0; //@line 1334 "main.c"
 $6 = ((($5)) + 8|0); //@line 1334 "main.c"
 $7 = HEAP32[$6>>2]|0; //@line 1334 "main.c"
 $8 = (($7) - 1)|0; //@line 1334 "main.c"
 $9 = (_List_get_at($4,$8)|0); //@line 1334 "main.c"
 $active_window = $9; //@line 1334 "main.c"
 $10 = $active_window; //@line 1336 "main.c"
 $11 = ($10|0)!=(0|0); //@line 1336 "main.c"
 if (!($11)) {
  STACKTOP = sp;return; //@line 1344 "main.c"
 }
 $12 = $active_window; //@line 1339 "main.c"
 $13 = HEAP8[$12>>0]|0; //@line 1339 "main.c"
 $14 = ($13<<24>>24)!=(0); //@line 1339 "main.c"
 if ($14) {
  STACKTOP = sp;return; //@line 1344 "main.c"
 }
 $15 = $active_window; //@line 1342 "main.c"
 _drawTitlebar($15,1); //@line 1342 "main.c"
 STACKTOP = sp;return; //@line 1344 "main.c"
}
function _destroyHandle($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $dest_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 1348 "main.c"
 $2 = (_getWindowByHandle($1)|0); //@line 1348 "main.c"
 $dest_window = $2; //@line 1348 "main.c"
 $3 = $dest_window; //@line 1350 "main.c"
 $4 = ($3|0)!=(0|0); //@line 1350 "main.c"
 if (!($4)) {
  STACKTOP = sp;return; //@line 1354 "main.c"
 }
 $5 = $dest_window; //@line 1353 "main.c"
 _destroy($5); //@line 1353 "main.c"
 STACKTOP = sp;return; //@line 1354 "main.c"
}
function _putMouse($x,$y,$buttons) {
 $x = $x|0;
 $y = $y|0;
 $buttons = $buttons|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $9 = 0, $cur_window = 0, $i = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $x;
 $1 = $y;
 $2 = $buttons;
 $3 = HEAP32[1831]|0; //@line 1483 "main.c"
 $4 = $0; //@line 1483 "main.c"
 $5 = $4&65535; //@line 1483 "main.c"
 $6 = $1; //@line 1483 "main.c"
 $7 = $6&65535; //@line 1483 "main.c"
 _changeWindowPosition($3,$5,$7); //@line 1483 "main.c"
 $8 = $2; //@line 1485 "main.c"
 $9 = ($8<<24>>24)!=(0); //@line 1485 "main.c"
 L1: do {
  if ($9) {
   $10 = HEAP8[7974]|0; //@line 1487 "main.c"
   $11 = ($10<<24>>24)!=(0); //@line 1487 "main.c"
   if (!($11)) {
    HEAP8[7974] = 1; //@line 1489 "main.c"
    $12 = HEAP32[1829]|0; //@line 1491 "main.c"
    $13 = ((($12)) + 8|0); //@line 1491 "main.c"
    $14 = HEAP32[$13>>2]|0; //@line 1491 "main.c"
    $15 = (($14) - 2)|0; //@line 1491 "main.c"
    $i = $15; //@line 1491 "main.c"
    while(1) {
     $16 = $i; //@line 1491 "main.c"
     $17 = ($16|0)>(0); //@line 1491 "main.c"
     if (!($17)) {
      break L1;
     }
     $18 = HEAP32[1829]|0; //@line 1493 "main.c"
     $19 = $i; //@line 1493 "main.c"
     $20 = (_List_get_at($18,$19)|0); //@line 1493 "main.c"
     $cur_window = $20; //@line 1493 "main.c"
     $21 = $cur_window; //@line 1495 "main.c"
     $22 = ($21|0)!=(0|0); //@line 1495 "main.c"
     if ($22) {
      $23 = $cur_window; //@line 1495 "main.c"
      $24 = HEAP32[1830]|0; //@line 1495 "main.c"
      $25 = ($23|0)==($24|0); //@line 1495 "main.c"
      if (!($25)) {
       $26 = $cur_window; //@line 1495 "main.c"
       $27 = HEAP32[1831]|0; //@line 1495 "main.c"
       $28 = ($26|0)==($27|0); //@line 1495 "main.c"
       if (!($28)) {
        $29 = $0; //@line 1498 "main.c"
        $30 = $cur_window; //@line 1498 "main.c"
        $31 = ((($30)) + 24|0); //@line 1498 "main.c"
        $32 = HEAP32[$31>>2]|0; //@line 1498 "main.c"
        $33 = ($29>>>0)>=($32>>>0); //@line 1498 "main.c"
        if ($33) {
         $34 = $0; //@line 1499 "main.c"
         $35 = $cur_window; //@line 1499 "main.c"
         $36 = ((($35)) + 24|0); //@line 1499 "main.c"
         $37 = HEAP32[$36>>2]|0; //@line 1499 "main.c"
         $38 = $cur_window; //@line 1499 "main.c"
         $39 = ((($38)) + 16|0); //@line 1499 "main.c"
         $40 = HEAP32[$39>>2]|0; //@line 1499 "main.c"
         $41 = (($37) + ($40))|0; //@line 1499 "main.c"
         $42 = ($34>>>0)<($41>>>0); //@line 1499 "main.c"
         if ($42) {
          $43 = $1; //@line 1500 "main.c"
          $44 = $cur_window; //@line 1500 "main.c"
          $45 = ((($44)) + 28|0); //@line 1500 "main.c"
          $46 = HEAP32[$45>>2]|0; //@line 1500 "main.c"
          $47 = ($43>>>0)>=($46>>>0); //@line 1500 "main.c"
          if ($47) {
           $48 = $1; //@line 1501 "main.c"
           $49 = $cur_window; //@line 1501 "main.c"
           $50 = ((($49)) + 28|0); //@line 1501 "main.c"
           $51 = HEAP32[$50>>2]|0; //@line 1501 "main.c"
           $52 = $cur_window; //@line 1501 "main.c"
           $53 = ((($52)) + 20|0); //@line 1501 "main.c"
           $54 = HEAP32[$53>>2]|0; //@line 1501 "main.c"
           $55 = (($51) + ($54))|0; //@line 1501 "main.c"
           $56 = ($48>>>0)<($55>>>0); //@line 1501 "main.c"
           if ($56) {
            break;
           }
          }
         }
        }
       }
      }
     }
     $68 = $i; //@line 1491 "main.c"
     $69 = (($68) + -1)|0; //@line 1491 "main.c"
     $i = $69; //@line 1491 "main.c"
    }
    $57 = $0; //@line 1503 "main.c"
    $58 = $cur_window; //@line 1503 "main.c"
    $59 = ((($58)) + 24|0); //@line 1503 "main.c"
    $60 = HEAP32[$59>>2]|0; //@line 1503 "main.c"
    $61 = (($57) - ($60))|0; //@line 1503 "main.c"
    HEAP32[1833] = $61; //@line 1503 "main.c"
    $62 = $1; //@line 1504 "main.c"
    $63 = $cur_window; //@line 1504 "main.c"
    $64 = ((($63)) + 28|0); //@line 1504 "main.c"
    $65 = HEAP32[$64>>2]|0; //@line 1504 "main.c"
    $66 = (($62) - ($65))|0; //@line 1504 "main.c"
    HEAP32[1834] = $66; //@line 1504 "main.c"
    $67 = $cur_window; //@line 1505 "main.c"
    HEAP32[1832] = $67; //@line 1505 "main.c"
   }
  } else {
   HEAP8[7974] = 0; //@line 1512 "main.c"
   HEAP32[1832] = 0; //@line 1513 "main.c"
  }
 } while(0);
 $70 = HEAP8[7974]|0; //@line 1516 "main.c"
 $71 = $70&255; //@line 1516 "main.c"
 $72 = ($71|0)!=(0); //@line 1516 "main.c"
 $73 = HEAP32[1832]|0; //@line 1516 "main.c"
 $74 = ($73|0)!=(0|0); //@line 1516 "main.c"
 $or$cond = $72 & $74; //@line 1516 "main.c"
 if (!($or$cond)) {
  STACKTOP = sp;return; //@line 1520 "main.c"
 }
 $75 = HEAP32[1832]|0; //@line 1518 "main.c"
 $76 = $0; //@line 1518 "main.c"
 $77 = HEAP32[1833]|0; //@line 1518 "main.c"
 $78 = (($76) - ($77))|0; //@line 1518 "main.c"
 $79 = $78&65535; //@line 1518 "main.c"
 $80 = $1; //@line 1518 "main.c"
 $81 = HEAP32[1834]|0; //@line 1518 "main.c"
 $82 = (($80) - ($81))|0; //@line 1518 "main.c"
 $83 = $82&65535; //@line 1518 "main.c"
 _changeWindowPosition($75,$79,$83); //@line 1518 "main.c"
 STACKTOP = sp;return; //@line 1520 "main.c"
}
function _WYG_main() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $9 = 0, $i = 0, $mode = 0, $num = 0, $parent_pid = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = (_initGfx()|0); //@line 1619 "main.c"
 $1 = ($0<<24>>24)!=(0); //@line 1619 "main.c"
 if (!($1)) {
  _postMessage(0,0,0); //@line 1622 "main.c"
  $2 = $parent_pid; //@line 1623 "main.c"
  _postMessage($2,0,0); //@line 1623 "main.c"
  _terminate(); //@line 1624 "main.c"
 }
 $num = 1; //@line 1629 "main.c"
 $3 = $num; //@line 1641 "main.c"
 $4 = (_setScreenMode($3)|0); //@line 1641 "main.c"
 $5 = ($4<<24>>24)!=(0); //@line 1641 "main.c"
 if (!($5)) {
  _postMessage(0,0,0); //@line 1644 "main.c"
  $6 = $parent_pid; //@line 1645 "main.c"
  _postMessage($6,0,0); //@line 1645 "main.c"
  _terminate(); //@line 1646 "main.c"
 }
 $7 = $num; //@line 1651 "main.c"
 $8 = ($7<<16>>16)!=(0); //@line 1651 "main.c"
 if ($8) {
  $9 = $num; //@line 1653 "main.c"
  $10 = (_getModeDetails($9)|0); //@line 1653 "main.c"
  $mode = $10; //@line 1653 "main.c"
 } else {
  _postMessage(0,0,0); //@line 1657 "main.c"
  $11 = $parent_pid; //@line 1658 "main.c"
  _postMessage($11,0,0); //@line 1658 "main.c"
  _terminate(); //@line 1659 "main.c"
 }
 $12 = (_List_new()|0); //@line 1664 "main.c"
 HEAP32[1829] = $12; //@line 1664 "main.c"
 $13 = ($12|0)!=(0|0); //@line 1664 "main.c"
 if (!($13)) {
  _prints(1018); //@line 1666 "main.c"
  _postMessage(0,0,0); //@line 1667 "main.c"
  $14 = $parent_pid; //@line 1668 "main.c"
  _postMessage($14,0,0); //@line 1668 "main.c"
  _terminate(); //@line 1669 "main.c"
 }
 $15 = $mode; //@line 1673 "main.c"
 $16 = HEAP16[$15>>1]|0; //@line 1673 "main.c"
 $17 = $16&65535; //@line 1673 "main.c"
 $18 = $mode; //@line 1673 "main.c"
 $19 = ((($18)) + 2|0); //@line 1673 "main.c"
 $20 = HEAP16[$19>>1]|0; //@line 1673 "main.c"
 $21 = $20&65535; //@line 1673 "main.c"
 $22 = (_newWindow($17,$21,7,0)|0); //@line 1673 "main.c"
 HEAP32[1830] = $22; //@line 1673 "main.c"
 $23 = HEAP32[1830]|0; //@line 1676 "main.c"
 $24 = ($23|0)!=(0|0); //@line 1676 "main.c"
 if (!($24)) {
  _postMessage(0,0,0); //@line 1680 "main.c"
  $25 = $parent_pid; //@line 1681 "main.c"
  _postMessage($25,0,0); //@line 1681 "main.c"
  _terminate(); //@line 1682 "main.c"
 }
 $26 = HEAP32[1830]|0; //@line 1686 "main.c"
 $27 = ((($26)) + 16|0); //@line 1686 "main.c"
 $28 = HEAP32[$27>>2]|0; //@line 1686 "main.c"
 $29 = (($28>>>0) / 2)&-1; //@line 1686 "main.c"
 $30 = (($29) - 1)|0; //@line 1686 "main.c"
 $31 = $30&65535; //@line 1686 "main.c"
 HEAP16[3980] = $31; //@line 1686 "main.c"
 $32 = HEAP32[1830]|0; //@line 1687 "main.c"
 $33 = ((($32)) + 20|0); //@line 1687 "main.c"
 $34 = HEAP32[$33>>2]|0; //@line 1687 "main.c"
 $35 = (($34>>>0) / 2)&-1; //@line 1687 "main.c"
 $36 = (($35) - 1)|0; //@line 1687 "main.c"
 $37 = $36&65535; //@line 1687 "main.c"
 HEAP16[3981] = $37; //@line 1687 "main.c"
 $38 = (_newWindow(11,18,7,0)|0); //@line 1690 "main.c"
 HEAP32[1831] = $38; //@line 1690 "main.c"
 $39 = HEAP32[1831]|0; //@line 1693 "main.c"
 $40 = ($39|0)!=(0|0); //@line 1693 "main.c"
 if (!($40)) {
  _postMessage(0,0,0); //@line 1695 "main.c"
  $41 = $parent_pid; //@line 1696 "main.c"
  _postMessage($41,0,0); //@line 1696 "main.c"
  _terminate(); //@line 1697 "main.c"
 }
 $42 = HEAP32[1831]|0; //@line 1700 "main.c"
 $43 = HEAP16[3980]|0; //@line 1700 "main.c"
 $44 = HEAP16[3981]|0; //@line 1700 "main.c"
 _changeWindowPosition($42,$43,$44); //@line 1700 "main.c"
 $45 = $parent_pid; //@line 1702 "main.c"
 _postMessage($45,0,1); //@line 1702 "main.c"
 $i = 0; //@line 1705 "main.c"
 while(1) {
  $46 = $i; //@line 1705 "main.c"
  $47 = HEAP32[1830]|0; //@line 1705 "main.c"
  $48 = ((($47)) + 16|0); //@line 1705 "main.c"
  $49 = HEAP32[$48>>2]|0; //@line 1705 "main.c"
  $50 = HEAP32[1830]|0; //@line 1705 "main.c"
  $51 = ((($50)) + 20|0); //@line 1705 "main.c"
  $52 = HEAP32[$51>>2]|0; //@line 1705 "main.c"
  $53 = Math_imul($49, $52)|0; //@line 1705 "main.c"
  $54 = ($46>>>0)<($53>>>0); //@line 1705 "main.c"
  if (!($54)) {
   break;
  }
  $55 = $i; //@line 1706 "main.c"
  $56 = HEAP32[1830]|0; //@line 1706 "main.c"
  $57 = ((($56)) + 12|0); //@line 1706 "main.c"
  $58 = HEAP32[$57>>2]|0; //@line 1706 "main.c"
  $59 = ((($58)) + 8|0); //@line 1706 "main.c"
  $60 = HEAP32[$59>>2]|0; //@line 1706 "main.c"
  $61 = (($60) + ($55<<2)|0); //@line 1706 "main.c"
  HEAP32[$61>>2] = 762561; //@line 1706 "main.c"
  $62 = $i; //@line 1705 "main.c"
  $63 = (($62) + 1)|0; //@line 1705 "main.c"
  $i = $63; //@line 1705 "main.c"
 }
 $64 = HEAP32[1831]|0; //@line 1709 "main.c"
 $65 = ((($64)) + 12|0); //@line 1709 "main.c"
 $66 = HEAP32[$65>>2]|0; //@line 1709 "main.c"
 $67 = ((($66)) + 28|0); //@line 1709 "main.c"
 HEAP32[$67>>2] = -16777216; //@line 1709 "main.c"
 $i = 0; //@line 1711 "main.c"
 while(1) {
  $68 = $i; //@line 1711 "main.c"
  $69 = ($68|0)<(198); //@line 1711 "main.c"
  if (!($69)) {
   break;
  }
  $70 = $i; //@line 1712 "main.c"
  $71 = (12 + ($70<<2)|0); //@line 1712 "main.c"
  $72 = HEAP32[$71>>2]|0; //@line 1712 "main.c"
  $73 = $i; //@line 1712 "main.c"
  $74 = HEAP32[1831]|0; //@line 1712 "main.c"
  $75 = ((($74)) + 12|0); //@line 1712 "main.c"
  $76 = HEAP32[$75>>2]|0; //@line 1712 "main.c"
  $77 = ((($76)) + 8|0); //@line 1712 "main.c"
  $78 = HEAP32[$77>>2]|0; //@line 1712 "main.c"
  $79 = (($78) + ($73<<2)|0); //@line 1712 "main.c"
  HEAP32[$79>>2] = $72; //@line 1712 "main.c"
  $80 = $i; //@line 1711 "main.c"
  $81 = (($80) + 1)|0; //@line 1711 "main.c"
  $i = $81; //@line 1711 "main.c"
 }
 $82 = HEAP32[1830]|0; //@line 1714 "main.c"
 _drawWindow($82,0); //@line 1714 "main.c"
 $83 = HEAP32[1831]|0; //@line 1715 "main.c"
 _drawWindow($83,0); //@line 1715 "main.c"
 _testMain(); //@line 1723 "main.c"
 _endGfx(); //@line 1724 "main.c"
 STACKTOP = sp;return; //@line 1725 "main.c"
}
function _createWindow($width,$height,$flags) {
 $width = $width|0;
 $height = $height|0;
 $flags = $flags|0;
 var $0 = 0, $1 = 0, $10 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $width;
 $1 = $height;
 $2 = $flags;
 $3 = $0; //@line 30 "wygwrap.c"
 $4 = $3&65535; //@line 30 "wygwrap.c"
 $5 = $1; //@line 30 "wygwrap.c"
 $6 = $5&65535; //@line 30 "wygwrap.c"
 $7 = $2; //@line 30 "wygwrap.c"
 $8 = $7&255; //@line 30 "wygwrap.c"
 $9 = $8&255; //@line 30 "wygwrap.c"
 $10 = (_newWindowHandle($4,$6,$9,0)|0); //@line 30 "wygwrap.c"
 STACKTOP = sp;return ($10|0); //@line 30 "wygwrap.c"
}
function _getWindowDimensions($handle,$w,$h) {
 $handle = $handle|0;
 $w = $w|0;
 $h = $h|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $temp_window = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $w;
 $2 = $h;
 $3 = $0; //@line 45 "wygwrap.c"
 $4 = (_getWindowByHandle($3)|0); //@line 45 "wygwrap.c"
 $temp_window = $4; //@line 45 "wygwrap.c"
 $5 = $temp_window; //@line 46 "wygwrap.c"
 $6 = ((($5)) + 16|0); //@line 46 "wygwrap.c"
 $7 = HEAP32[$6>>2]|0; //@line 46 "wygwrap.c"
 $8 = $7 & 65535; //@line 46 "wygwrap.c"
 $9 = $8&65535; //@line 46 "wygwrap.c"
 $10 = $1; //@line 46 "wygwrap.c"
 HEAP16[$10>>1] = $9; //@line 46 "wygwrap.c"
 $11 = $temp_window; //@line 47 "wygwrap.c"
 $12 = ((($11)) + 20|0); //@line 47 "wygwrap.c"
 $13 = HEAP32[$12>>2]|0; //@line 47 "wygwrap.c"
 $14 = $13 & 65535; //@line 47 "wygwrap.c"
 $15 = $14&65535; //@line 47 "wygwrap.c"
 $16 = $2; //@line 47 "wygwrap.c"
 HEAP16[$16>>1] = $15; //@line 47 "wygwrap.c"
 STACKTOP = sp;return; //@line 48 "wygwrap.c"
}
function _showWindow($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 57 "wygwrap.c"
 _markHandleVisible($1,1); //@line 57 "wygwrap.c"
 STACKTOP = sp;return; //@line 58 "wygwrap.c"
}
function _repaintWindow($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 62 "wygwrap.c"
 _drawHandle($1); //@line 62 "wygwrap.c"
 STACKTOP = sp;return; //@line 63 "wygwrap.c"
}
function _focus($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 67 "wygwrap.c"
 _raiseHandle($1); //@line 67 "wygwrap.c"
 STACKTOP = sp;return; //@line 68 "wygwrap.c"
}
function _setTitle($handle,$string) {
 $handle = $handle|0;
 $string = $string|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $string;
 $2 = $0; //@line 72 "wygwrap.c"
 $3 = $1; //@line 72 "wygwrap.c"
 _setWindowTitle($2,$3); //@line 72 "wygwrap.c"
 STACKTOP = sp;return; //@line 73 "wygwrap.c"
}
function _destroyWindow($handle) {
 $handle = $handle|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $0; //@line 84 "wygwrap.c"
 _destroyHandle($1); //@line 84 "wygwrap.c"
 STACKTOP = sp;return; //@line 85 "wygwrap.c"
}
function _getFrameDims($top,$left,$bottom,$right) {
 $top = $top|0;
 $left = $left|0;
 $bottom = $bottom|0;
 $right = $right|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $top;
 $1 = $left;
 $2 = $bottom;
 $3 = $right;
 $4 = $0; //@line 89 "wygwrap.c"
 HEAP8[$4>>0] = 28; //@line 89 "wygwrap.c"
 $5 = $1; //@line 90 "wygwrap.c"
 HEAP8[$5>>0] = 4; //@line 90 "wygwrap.c"
 $6 = $2; //@line 91 "wygwrap.c"
 HEAP8[$6>>0] = 4; //@line 91 "wygwrap.c"
 $7 = $3; //@line 92 "wygwrap.c"
 HEAP8[$7>>0] = 4; //@line 92 "wygwrap.c"
 STACKTOP = sp;return; //@line 93 "wygwrap.c"
}
function _List_new() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ret_list = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = (_malloc(12)|0); //@line 6 "list.c"
 $ret_list = $1; //@line 6 "list.c"
 $2 = $ret_list; //@line 8 "list.c"
 $3 = ($2|0)!=(0|0); //@line 8 "list.c"
 $4 = $ret_list; //@line 11 "list.c"
 if ($3) {
  HEAP32[$4>>2] = 0; //@line 11 "list.c"
  $5 = $ret_list; //@line 12 "list.c"
  $6 = ((($5)) + 8|0); //@line 12 "list.c"
  HEAP32[$6>>2] = 0; //@line 12 "list.c"
  $7 = $ret_list; //@line 13 "list.c"
  _List_rewind($7); //@line 13 "list.c"
  $8 = $ret_list; //@line 15 "list.c"
  $0 = $8; //@line 15 "list.c"
  $9 = $0; //@line 16 "list.c"
  STACKTOP = sp;return ($9|0); //@line 16 "list.c"
 } else {
  $0 = $4; //@line 9 "list.c"
  $9 = $0; //@line 16 "list.c"
  STACKTOP = sp;return ($9|0); //@line 16 "list.c"
 }
 return (0)|0;
}
function _List_rewind($list) {
 $list = $list|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $list;
 $1 = $0; //@line 117 "list.c"
 $2 = HEAP32[$1>>2]|0; //@line 117 "list.c"
 $3 = $0; //@line 117 "list.c"
 $4 = ((($3)) + 4|0); //@line 117 "list.c"
 HEAP32[$4>>2] = $2; //@line 117 "list.c"
 STACKTOP = sp;return; //@line 118 "list.c"
}
function _List_delete($list,$del_func) {
 $list = $list|0;
 $del_func = $del_func|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $current_item = 0, $prev_item = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $list;
 $1 = $del_func;
 $2 = $0; //@line 23 "list.c"
 $3 = HEAP32[$2>>2]|0; //@line 23 "list.c"
 $current_item = $3; //@line 23 "list.c"
 $4 = $current_item; //@line 27 "list.c"
 $5 = ($4|0)!=(0|0); //@line 27 "list.c"
 if (!($5)) {
  $35 = $0; //@line 59 "list.c"
  _free($35); //@line 59 "list.c"
  STACKTOP = sp;return; //@line 60 "list.c"
 }
 $6 = $0; //@line 27 "list.c"
 $7 = ((($6)) + 8|0); //@line 27 "list.c"
 $8 = HEAP32[$7>>2]|0; //@line 27 "list.c"
 $9 = ($8|0)!=(0); //@line 27 "list.c"
 if (!($9)) {
  $35 = $0; //@line 59 "list.c"
  _free($35); //@line 59 "list.c"
  STACKTOP = sp;return; //@line 60 "list.c"
 }
 while(1) {
  $10 = $current_item; //@line 31 "list.c"
  $11 = ((($10)) + 4|0); //@line 31 "list.c"
  $12 = HEAP32[$11>>2]|0; //@line 31 "list.c"
  $13 = ($12|0)!=(0|0); //@line 31 "list.c"
  if (!($13)) {
   break;
  }
  $14 = $current_item; //@line 32 "list.c"
  $15 = ((($14)) + 4|0); //@line 32 "list.c"
  $16 = HEAP32[$15>>2]|0; //@line 32 "list.c"
  $current_item = $16; //@line 32 "list.c"
 }
 while(1) {
  $17 = $current_item; //@line 36 "list.c"
  $18 = ($17|0)!=(0|0); //@line 36 "list.c"
  if (!($18)) {
   label = 8;
   break;
  }
  $19 = $0; //@line 36 "list.c"
  $20 = ((($19)) + 8|0); //@line 36 "list.c"
  $21 = HEAP32[$20>>2]|0; //@line 36 "list.c"
  $22 = ($21|0)!=(0); //@line 36 "list.c"
  if (!($22)) {
   label = 8;
   break;
  }
  $23 = $current_item; //@line 40 "list.c"
  $24 = HEAP32[$23>>2]|0; //@line 40 "list.c"
  $prev_item = $24; //@line 40 "list.c"
  $25 = $1; //@line 44 "list.c"
  $26 = $current_item; //@line 44 "list.c"
  $27 = ((($26)) + 8|0); //@line 44 "list.c"
  $28 = HEAP32[$27>>2]|0; //@line 44 "list.c"
  FUNCTION_TABLE_vi[$25 & 31]($28); //@line 44 "list.c"
  $29 = $current_item; //@line 48 "list.c"
  _free($29); //@line 48 "list.c"
  $30 = $prev_item; //@line 51 "list.c"
  $current_item = $30; //@line 51 "list.c"
  $31 = $0; //@line 53 "list.c"
  $32 = ((($31)) + 8|0); //@line 53 "list.c"
  $33 = HEAP32[$32>>2]|0; //@line 53 "list.c"
  $34 = (($33) + -1)|0; //@line 53 "list.c"
  HEAP32[$32>>2] = $34; //@line 53 "list.c"
 }
 if ((label|0) == 8) {
  $35 = $0; //@line 59 "list.c"
  _free($35); //@line 59 "list.c"
  STACKTOP = sp;return; //@line 60 "list.c"
 }
}
function _List_pop($list,$value) {
 $list = $list|0;
 $value = $value|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $8 = 0, $9 = 0, $cur_item = 0, $ret_val = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $list;
 $2 = $value;
 $3 = $1; //@line 64 "list.c"
 $4 = HEAP32[$3>>2]|0; //@line 64 "list.c"
 $cur_item = $4; //@line 64 "list.c"
 $5 = $2; //@line 67 "list.c"
 $6 = ($5|0)!=(0|0); //@line 67 "list.c"
 if ($6) {
  $7 = $1; //@line 67 "list.c"
  $8 = ((($7)) + 8|0); //@line 67 "list.c"
  $9 = HEAP32[$8>>2]|0; //@line 67 "list.c"
  $10 = ($9|0)==(0); //@line 67 "list.c"
  if (!($10)) {
   while(1) {
    $11 = $cur_item; //@line 70 "list.c"
    $12 = ($11|0)!=(0|0); //@line 70 "list.c"
    if ($12) {
     $13 = $cur_item; //@line 70 "list.c"
     $14 = ((($13)) + 8|0); //@line 70 "list.c"
     $15 = HEAP32[$14>>2]|0; //@line 70 "list.c"
     $16 = $2; //@line 70 "list.c"
     $17 = ($15|0)!=($16|0); //@line 70 "list.c"
     $74 = $17;
    } else {
     $74 = 0;
    }
    $18 = $cur_item; //@line 71 "list.c"
    if (!($74)) {
     break;
    }
    $19 = ((($18)) + 4|0); //@line 71 "list.c"
    $20 = HEAP32[$19>>2]|0; //@line 71 "list.c"
    $cur_item = $20; //@line 71 "list.c"
   }
   $21 = ($18|0)!=(0|0); //@line 73 "list.c"
   if (!($21)) {
    $0 = 0; //@line 74 "list.c"
    $73 = $0; //@line 105 "list.c"
    STACKTOP = sp;return ($73|0); //@line 105 "list.c"
   }
   $22 = $cur_item; //@line 76 "list.c"
   $23 = $1; //@line 76 "list.c"
   $24 = ((($23)) + 4|0); //@line 76 "list.c"
   $25 = HEAP32[$24>>2]|0; //@line 76 "list.c"
   $26 = ($22|0)==($25|0); //@line 76 "list.c"
   do {
    if ($26) {
     $27 = $cur_item; //@line 78 "list.c"
     $28 = HEAP32[$27>>2]|0; //@line 78 "list.c"
     $29 = ($28|0)!=(0|0); //@line 78 "list.c"
     $30 = $cur_item; //@line 80 "list.c"
     if ($29) {
      $31 = HEAP32[$30>>2]|0; //@line 80 "list.c"
      $32 = $1; //@line 80 "list.c"
      $33 = ((($32)) + 4|0); //@line 80 "list.c"
      HEAP32[$33>>2] = $31; //@line 80 "list.c"
      break;
     }
     $34 = ((($30)) + 4|0); //@line 81 "list.c"
     $35 = HEAP32[$34>>2]|0; //@line 81 "list.c"
     $36 = ($35|0)!=(0|0); //@line 81 "list.c"
     if ($36) {
      $37 = $cur_item; //@line 83 "list.c"
      $38 = ((($37)) + 4|0); //@line 83 "list.c"
      $39 = HEAP32[$38>>2]|0; //@line 83 "list.c"
      $40 = $1; //@line 83 "list.c"
      $41 = ((($40)) + 4|0); //@line 83 "list.c"
      HEAP32[$41>>2] = $39; //@line 83 "list.c"
      break;
     } else {
      $42 = $1; //@line 86 "list.c"
      $43 = ((($42)) + 4|0); //@line 86 "list.c"
      HEAP32[$43>>2] = 0; //@line 86 "list.c"
      $44 = $1; //@line 87 "list.c"
      HEAP32[$44>>2] = 0; //@line 87 "list.c"
      break;
     }
    }
   } while(0);
   $45 = $cur_item; //@line 93 "list.c"
   $46 = HEAP32[$45>>2]|0; //@line 93 "list.c"
   $47 = ($46|0)!=(0|0); //@line 93 "list.c"
   $48 = $cur_item; //@line 94 "list.c"
   $49 = ((($48)) + 4|0); //@line 94 "list.c"
   $50 = HEAP32[$49>>2]|0; //@line 94 "list.c"
   if ($47) {
    $51 = $cur_item; //@line 94 "list.c"
    $52 = HEAP32[$51>>2]|0; //@line 94 "list.c"
    $53 = ((($52)) + 4|0); //@line 94 "list.c"
    HEAP32[$53>>2] = $50; //@line 94 "list.c"
   } else {
    $54 = $1; //@line 96 "list.c"
    HEAP32[$54>>2] = $50; //@line 96 "list.c"
   }
   $55 = $cur_item; //@line 98 "list.c"
   $56 = ((($55)) + 4|0); //@line 98 "list.c"
   $57 = HEAP32[$56>>2]|0; //@line 98 "list.c"
   $58 = ($57|0)!=(0|0); //@line 98 "list.c"
   if ($58) {
    $59 = $cur_item; //@line 99 "list.c"
    $60 = HEAP32[$59>>2]|0; //@line 99 "list.c"
    $61 = $cur_item; //@line 99 "list.c"
    $62 = ((($61)) + 4|0); //@line 99 "list.c"
    $63 = HEAP32[$62>>2]|0; //@line 99 "list.c"
    HEAP32[$63>>2] = $60; //@line 99 "list.c"
   }
   $64 = $1; //@line 101 "list.c"
   $65 = ((($64)) + 8|0); //@line 101 "list.c"
   $66 = HEAP32[$65>>2]|0; //@line 101 "list.c"
   $67 = (($66) + -1)|0; //@line 101 "list.c"
   HEAP32[$65>>2] = $67; //@line 101 "list.c"
   $68 = $cur_item; //@line 102 "list.c"
   $69 = ((($68)) + 8|0); //@line 102 "list.c"
   $70 = HEAP32[$69>>2]|0; //@line 102 "list.c"
   $ret_val = $70; //@line 102 "list.c"
   $71 = $cur_item; //@line 103 "list.c"
   _free($71); //@line 103 "list.c"
   $72 = $ret_val; //@line 104 "list.c"
   $0 = $72; //@line 104 "list.c"
   $73 = $0; //@line 105 "list.c"
   STACKTOP = sp;return ($73|0); //@line 105 "list.c"
  }
 }
 $0 = 0; //@line 68 "list.c"
 $73 = $0; //@line 105 "list.c"
 STACKTOP = sp;return ($73|0); //@line 105 "list.c"
}
function _List_remove($list,$value,$del_func) {
 $list = $list|0;
 $value = $value|0;
 $del_func = $del_func|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $popval = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $list;
 $1 = $value;
 $2 = $del_func;
 $3 = $0; //@line 109 "list.c"
 $4 = $1; //@line 109 "list.c"
 $5 = (_List_pop($3,$4)|0); //@line 109 "list.c"
 $popval = $5; //@line 109 "list.c"
 $6 = $popval; //@line 111 "list.c"
 $7 = ($6|0)!=(0|0); //@line 111 "list.c"
 if (!($7)) {
  STACKTOP = sp;return; //@line 113 "list.c"
 }
 $8 = $2; //@line 112 "list.c"
 $9 = $1; //@line 112 "list.c"
 FUNCTION_TABLE_vi[$8 & 31]($9); //@line 112 "list.c"
 STACKTOP = sp;return; //@line 113 "list.c"
}
function _List_add($list,$value) {
 $list = $list|0;
 $value = $value|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $current_item = 0, $new_item = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $list;
 $2 = $value;
 $3 = (_malloc(12)|0); //@line 123 "list.c"
 $new_item = $3; //@line 123 "list.c"
 $4 = $new_item; //@line 125 "list.c"
 $5 = ($4|0)!=(0|0); //@line 125 "list.c"
 if (!($5)) {
  $0 = 0; //@line 126 "list.c"
  $37 = $0; //@line 150 "list.c"
  STACKTOP = sp;return ($37|0); //@line 150 "list.c"
 }
 $6 = $2; //@line 128 "list.c"
 $7 = $new_item; //@line 128 "list.c"
 $8 = ((($7)) + 8|0); //@line 128 "list.c"
 HEAP32[$8>>2] = $6; //@line 128 "list.c"
 $9 = $new_item; //@line 129 "list.c"
 $10 = ((($9)) + 4|0); //@line 129 "list.c"
 HEAP32[$10>>2] = 0; //@line 129 "list.c"
 $11 = $new_item; //@line 130 "list.c"
 HEAP32[$11>>2] = 0; //@line 130 "list.c"
 $12 = $1; //@line 132 "list.c"
 $13 = HEAP32[$12>>2]|0; //@line 132 "list.c"
 $14 = ($13|0)!=(0|0); //@line 132 "list.c"
 if ($14) {
  $20 = $1; //@line 138 "list.c"
  $21 = HEAP32[$20>>2]|0; //@line 138 "list.c"
  $current_item = $21; //@line 138 "list.c"
  while(1) {
   $22 = $current_item; //@line 140 "list.c"
   $23 = ((($22)) + 4|0); //@line 140 "list.c"
   $24 = HEAP32[$23>>2]|0; //@line 140 "list.c"
   $25 = ($24|0)!=(0|0); //@line 140 "list.c"
   $26 = $current_item; //@line 141 "list.c"
   if (!($25)) {
    break;
   }
   $27 = ((($26)) + 4|0); //@line 141 "list.c"
   $28 = HEAP32[$27>>2]|0; //@line 141 "list.c"
   $current_item = $28; //@line 141 "list.c"
  }
  $29 = $new_item; //@line 143 "list.c"
  HEAP32[$29>>2] = $26; //@line 143 "list.c"
  $30 = $new_item; //@line 144 "list.c"
  $31 = $current_item; //@line 144 "list.c"
  $32 = ((($31)) + 4|0); //@line 144 "list.c"
  HEAP32[$32>>2] = $30; //@line 144 "list.c"
 } else {
  $15 = $new_item; //@line 134 "list.c"
  $16 = $1; //@line 134 "list.c"
  HEAP32[$16>>2] = $15; //@line 134 "list.c"
  $17 = $new_item; //@line 135 "list.c"
  $18 = $1; //@line 135 "list.c"
  $19 = ((($18)) + 4|0); //@line 135 "list.c"
  HEAP32[$19>>2] = $17; //@line 135 "list.c"
 }
 $33 = $1; //@line 147 "list.c"
 $34 = ((($33)) + 8|0); //@line 147 "list.c"
 $35 = HEAP32[$34>>2]|0; //@line 147 "list.c"
 $36 = (($35) + 1)|0; //@line 147 "list.c"
 HEAP32[$34>>2] = $36; //@line 147 "list.c"
 $0 = 1; //@line 149 "list.c"
 $37 = $0; //@line 150 "list.c"
 STACKTOP = sp;return ($37|0); //@line 150 "list.c"
}
function _List_get_next($list) {
 $list = $list|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ret_val = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $list;
 $2 = $1; //@line 156 "list.c"
 $3 = ((($2)) + 4|0); //@line 156 "list.c"
 $4 = HEAP32[$3>>2]|0; //@line 156 "list.c"
 $5 = ($4|0)!=(0|0); //@line 156 "list.c"
 if (!($5)) {
  $0 = 0; //@line 157 "list.c"
  $23 = $0; //@line 165 "list.c"
  STACKTOP = sp;return ($23|0); //@line 165 "list.c"
 }
 $6 = $1; //@line 159 "list.c"
 $7 = ((($6)) + 4|0); //@line 159 "list.c"
 $8 = HEAP32[$7>>2]|0; //@line 159 "list.c"
 $9 = ((($8)) + 8|0); //@line 159 "list.c"
 $10 = HEAP32[$9>>2]|0; //@line 159 "list.c"
 $ret_val = $10; //@line 159 "list.c"
 $11 = $1; //@line 161 "list.c"
 $12 = ((($11)) + 4|0); //@line 161 "list.c"
 $13 = HEAP32[$12>>2]|0; //@line 161 "list.c"
 $14 = ($13|0)!=(0|0); //@line 161 "list.c"
 if ($14) {
  $15 = $1; //@line 162 "list.c"
  $16 = ((($15)) + 4|0); //@line 162 "list.c"
  $17 = HEAP32[$16>>2]|0; //@line 162 "list.c"
  $18 = ((($17)) + 4|0); //@line 162 "list.c"
  $19 = HEAP32[$18>>2]|0; //@line 162 "list.c"
  $20 = $1; //@line 162 "list.c"
  $21 = ((($20)) + 4|0); //@line 162 "list.c"
  HEAP32[$21>>2] = $19; //@line 162 "list.c"
 }
 $22 = $ret_val; //@line 164 "list.c"
 $0 = $22; //@line 164 "list.c"
 $23 = $0; //@line 165 "list.c"
 STACKTOP = sp;return ($23|0); //@line 165 "list.c"
}
function _List_seek_to($list,$index) {
 $list = $list|0;
 $index = $index|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $cur_item = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $list;
 $1 = $index;
 $2 = $0; //@line 169 "list.c"
 $3 = HEAP32[$2>>2]|0; //@line 169 "list.c"
 $cur_item = $3; //@line 169 "list.c"
 $4 = $1; //@line 171 "list.c"
 $5 = $0; //@line 171 "list.c"
 $6 = ((($5)) + 8|0); //@line 171 "list.c"
 $7 = HEAP32[$6>>2]|0; //@line 171 "list.c"
 $8 = ($4>>>0)>=($7>>>0); //@line 171 "list.c"
 if ($8) {
  $9 = $0; //@line 173 "list.c"
  $10 = ((($9)) + 4|0); //@line 173 "list.c"
  HEAP32[$10>>2] = 0; //@line 173 "list.c"
  STACKTOP = sp;return; //@line 187 "list.c"
 }
 $11 = $1; //@line 177 "list.c"
 $12 = ($11|0)<(0); //@line 177 "list.c"
 if ($12) {
  $1 = 0; //@line 178 "list.c"
 }
 while(1) {
  $13 = $1; //@line 180 "list.c"
  $14 = ($13|0)!=(0); //@line 180 "list.c"
  $15 = $cur_item; //@line 182 "list.c"
  if (!($14)) {
   break;
  }
  $16 = ((($15)) + 4|0); //@line 182 "list.c"
  $17 = HEAP32[$16>>2]|0; //@line 182 "list.c"
  $cur_item = $17; //@line 182 "list.c"
  $18 = $1; //@line 183 "list.c"
  $19 = (($18) + -1)|0; //@line 183 "list.c"
  $1 = $19; //@line 183 "list.c"
 }
 $20 = $0; //@line 186 "list.c"
 $21 = ((($20)) + 4|0); //@line 186 "list.c"
 HEAP32[$21>>2] = $15; //@line 186 "list.c"
 STACKTOP = sp;return; //@line 187 "list.c"
}
function _List_get_at($list,$index) {
 $list = $list|0;
 $index = $index|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cur_item = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $list;
 $1 = $index;
 $2 = $0; //@line 191 "list.c"
 $3 = HEAP32[$2>>2]|0; //@line 191 "list.c"
 $cur_item = $3; //@line 191 "list.c"
 $4 = $1; //@line 193 "list.c"
 $5 = $0; //@line 193 "list.c"
 $6 = ((($5)) + 8|0); //@line 193 "list.c"
 $7 = HEAP32[$6>>2]|0; //@line 193 "list.c"
 $8 = ($4>>>0)>=($7>>>0); //@line 193 "list.c"
 if ($8) {
  $9 = $0; //@line 194 "list.c"
  $10 = ((($9)) + 8|0); //@line 194 "list.c"
  $11 = HEAP32[$10>>2]|0; //@line 194 "list.c"
  $12 = (($11) - 1)|0; //@line 194 "list.c"
  $1 = $12; //@line 194 "list.c"
 }
 $13 = $1; //@line 196 "list.c"
 $14 = ($13|0)<(0); //@line 196 "list.c"
 if ($14) {
  $1 = 0; //@line 197 "list.c"
 }
 while(1) {
  $15 = $1; //@line 199 "list.c"
  $16 = ($15|0)!=(0); //@line 199 "list.c"
  $17 = $cur_item; //@line 201 "list.c"
  if (!($16)) {
   break;
  }
  $18 = ((($17)) + 4|0); //@line 201 "list.c"
  $19 = HEAP32[$18>>2]|0; //@line 201 "list.c"
  $cur_item = $19; //@line 201 "list.c"
  $20 = $1; //@line 202 "list.c"
  $21 = (($20) + -1)|0; //@line 202 "list.c"
  $1 = $21; //@line 202 "list.c"
 }
 $22 = ($17|0)!=(0|0); //@line 205 "list.c"
 if (!($22)) {
  $26 = 0;
  STACKTOP = sp;return ($26|0); //@line 205 "list.c"
 }
 $23 = $cur_item; //@line 205 "list.c"
 $24 = ((($23)) + 8|0); //@line 205 "list.c"
 $25 = HEAP32[$24>>2]|0; //@line 205 "list.c"
 $26 = $25;
 STACKTOP = sp;return ($26|0); //@line 205 "list.c"
}
function _List_get_index($list,$value) {
 $list = $list|0;
 $value = $value|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cmp_value = 0;
 var $i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $list;
 $2 = $value;
 $i = 0; //@line 212 "list.c"
 $3 = $1; //@line 214 "list.c"
 _List_rewind($3); //@line 214 "list.c"
 while(1) {
  $4 = $1; //@line 214 "list.c"
  $5 = (_List_get_next($4)|0); //@line 214 "list.c"
  $cmp_value = $5; //@line 214 "list.c"
  $6 = ($5|0)!=(0|0); //@line 214 "list.c"
  if (!($6)) {
   break;
  }
  $7 = $cmp_value; //@line 216 "list.c"
  $8 = $2; //@line 216 "list.c"
  $9 = ($7|0)==($8|0); //@line 216 "list.c"
  if ($9) {
   break;
  }
  $10 = $i; //@line 219 "list.c"
  $11 = (($10) + 1)|0; //@line 219 "list.c"
  $i = $11; //@line 219 "list.c"
 }
 $12 = $i; //@line 222 "list.c"
 $13 = $1; //@line 222 "list.c"
 $14 = ((($13)) + 8|0); //@line 222 "list.c"
 $15 = HEAP32[$14>>2]|0; //@line 222 "list.c"
 $16 = ($12|0)==($15|0); //@line 222 "list.c"
 if ($16) {
  $0 = -1; //@line 223 "list.c"
  $18 = $0; //@line 226 "list.c"
  STACKTOP = sp;return ($18|0); //@line 226 "list.c"
 } else {
  $17 = $i; //@line 225 "list.c"
  $0 = $17; //@line 225 "list.c"
  $18 = $0; //@line 226 "list.c"
  STACKTOP = sp;return ($18|0); //@line 226 "list.c"
 }
 return (0)|0;
}
function _Rect_deleter($item) {
 $item = $item|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $item;
 $1 = $0; //@line 7 "rect.c"
 _free($1); //@line 7 "rect.c"
 STACKTOP = sp;return; //@line 8 "rect.c"
}
function _Rect_new($top,$left,$bottom,$right) {
 $top = $top|0;
 $left = $left|0;
 $bottom = $bottom|0;
 $right = $right|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $rect = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $top;
 $2 = $left;
 $3 = $bottom;
 $4 = $right;
 $5 = (_malloc(16)|0); //@line 12 "rect.c"
 $rect = $5; //@line 12 "rect.c"
 $6 = $rect; //@line 14 "rect.c"
 $7 = ($6|0)!=(0|0); //@line 14 "rect.c"
 if ($7) {
  $9 = $1; //@line 17 "rect.c"
  $10 = $rect; //@line 17 "rect.c"
  HEAP32[$10>>2] = $9; //@line 17 "rect.c"
  $11 = $2; //@line 18 "rect.c"
  $12 = $rect; //@line 18 "rect.c"
  $13 = ((($12)) + 12|0); //@line 18 "rect.c"
  HEAP32[$13>>2] = $11; //@line 18 "rect.c"
  $14 = $3; //@line 19 "rect.c"
  $15 = $rect; //@line 19 "rect.c"
  $16 = ((($15)) + 8|0); //@line 19 "rect.c"
  HEAP32[$16>>2] = $14; //@line 19 "rect.c"
  $17 = $4; //@line 20 "rect.c"
  $18 = $rect; //@line 20 "rect.c"
  $19 = ((($18)) + 4|0); //@line 20 "rect.c"
  HEAP32[$19>>2] = $17; //@line 20 "rect.c"
  $20 = $rect; //@line 22 "rect.c"
  $0 = $20; //@line 22 "rect.c"
  $21 = $0; //@line 23 "rect.c"
  STACKTOP = sp;return ($21|0); //@line 23 "rect.c"
 } else {
  $8 = $rect; //@line 15 "rect.c"
  $0 = $8; //@line 15 "rect.c"
  $21 = $0; //@line 23 "rect.c"
  STACKTOP = sp;return ($21|0); //@line 23 "rect.c"
 }
 return (0)|0;
}
function _initGfx() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _emscripten_asm_const_v(0); //@line 16 "gfx.c"
 return 1; //@line 32 "gfx.c"
}
function _endGfx() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 38 "gfx.c"
}
function _getModeDetails($modenum) {
 $modenum = $modenum|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $modenum;
 $2 = $1; //@line 48 "gfx.c"
 $3 = ($2<<16>>16)!=(0); //@line 48 "gfx.c"
 if ($3) {
  $4 = _emscripten_asm_const_ii(1, 0)|0; //@line 52 "gfx.c"
  $5 = $4&65535; //@line 52 "gfx.c"
  HEAP16[3982] = $5; //@line 52 "gfx.c"
  $6 = _emscripten_asm_const_ii(2, 0)|0; //@line 53 "gfx.c"
  $7 = $6&65535; //@line 53 "gfx.c"
  HEAP16[(7966)>>1] = $7; //@line 53 "gfx.c"
  HEAP16[(7968)>>1] = 32; //@line 57 "gfx.c"
  HEAP8[(7972)>>0] = 1; //@line 58 "gfx.c"
  HEAP16[(7970)>>1] = 0; //@line 59 "gfx.c"
  $0 = 7964; //@line 61 "gfx.c"
  $8 = $0; //@line 62 "gfx.c"
  STACKTOP = sp;return ($8|0); //@line 62 "gfx.c"
 } else {
  $0 = 0; //@line 49 "gfx.c"
  $8 = $0; //@line 62 "gfx.c"
  STACKTOP = sp;return ($8|0); //@line 62 "gfx.c"
 }
 return (0)|0;
}
function _setScreenMode($modenum) {
 $modenum = $modenum|0;
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $modenum;
 STACKTOP = sp;return 1; //@line 67 "gfx.c"
}
function _setCursor($x,$y) {
 $x = $x|0;
 $y = $y|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $x;
 $1 = $y;
 $2 = $0; //@line 82 "gfx.c"
 $3 = $2&65535; //@line 82 "gfx.c"
 HEAP32[1835] = $3; //@line 82 "gfx.c"
 $4 = $1; //@line 83 "gfx.c"
 $5 = $4&65535; //@line 83 "gfx.c"
 HEAP32[1836] = $5; //@line 83 "gfx.c"
 STACKTOP = sp;return; //@line 84 "gfx.c"
}
function _newBitmap($width,$height) {
 $width = $width|0;
 $height = $height|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $bmp_size = 0, $bufsz = 0, $i = 0, $return_bmp = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $width;
 $2 = $height;
 $3 = $1; //@line 169 "gfx.c"
 $4 = $2; //@line 169 "gfx.c"
 $5 = Math_imul($3, $4)|0; //@line 169 "gfx.c"
 $bmp_size = $5; //@line 169 "gfx.c"
 $6 = $bmp_size; //@line 170 "gfx.c"
 $7 = $6<<2; //@line 170 "gfx.c"
 $8 = (($7) + 32)|0; //@line 170 "gfx.c"
 $bufsz = $8; //@line 170 "gfx.c"
 $9 = $bufsz; //@line 174 "gfx.c"
 $10 = (_malloc($9)|0); //@line 174 "gfx.c"
 $return_bmp = $10; //@line 174 "gfx.c"
 $11 = ($10|0)!=(0|0); //@line 174 "gfx.c"
 if (!($11)) {
  $0 = 0; //@line 175 "gfx.c"
  $47 = $0; //@line 199 "gfx.c"
  STACKTOP = sp;return ($47|0); //@line 199 "gfx.c"
 }
 $12 = $2; //@line 178 "gfx.c"
 $13 = $return_bmp; //@line 178 "gfx.c"
 HEAP32[$13>>2] = $12; //@line 178 "gfx.c"
 $14 = $1; //@line 179 "gfx.c"
 $15 = $return_bmp; //@line 179 "gfx.c"
 $16 = ((($15)) + 4|0); //@line 179 "gfx.c"
 HEAP32[$16>>2] = $14; //@line 179 "gfx.c"
 $17 = $return_bmp; //@line 182 "gfx.c"
 $18 = ((($17)) + 12|0); //@line 182 "gfx.c"
 HEAP32[$18>>2] = 0; //@line 182 "gfx.c"
 $19 = $return_bmp; //@line 183 "gfx.c"
 $20 = ((($19)) + 16|0); //@line 183 "gfx.c"
 HEAP32[$20>>2] = 0; //@line 183 "gfx.c"
 $21 = $return_bmp; //@line 184 "gfx.c"
 $22 = HEAP32[$21>>2]|0; //@line 184 "gfx.c"
 $23 = $return_bmp; //@line 184 "gfx.c"
 $24 = ((($23)) + 20|0); //@line 184 "gfx.c"
 HEAP32[$24>>2] = $22; //@line 184 "gfx.c"
 $25 = $return_bmp; //@line 185 "gfx.c"
 $26 = ((($25)) + 4|0); //@line 185 "gfx.c"
 $27 = HEAP32[$26>>2]|0; //@line 185 "gfx.c"
 $28 = $return_bmp; //@line 185 "gfx.c"
 $29 = ((($28)) + 24|0); //@line 185 "gfx.c"
 HEAP32[$29>>2] = $27; //@line 185 "gfx.c"
 $30 = $return_bmp; //@line 188 "gfx.c"
 $31 = ((($30)) + 32|0); //@line 188 "gfx.c"
 $32 = $return_bmp; //@line 188 "gfx.c"
 $33 = ((($32)) + 8|0); //@line 188 "gfx.c"
 HEAP32[$33>>2] = $31; //@line 188 "gfx.c"
 $i = 0; //@line 191 "gfx.c"
 while(1) {
  $34 = $i; //@line 191 "gfx.c"
  $35 = $bmp_size; //@line 191 "gfx.c"
  $36 = ($34>>>0)<($35>>>0); //@line 191 "gfx.c"
  if (!($36)) {
   break;
  }
  $37 = $i; //@line 193 "gfx.c"
  $38 = $return_bmp; //@line 193 "gfx.c"
  $39 = ((($38)) + 8|0); //@line 193 "gfx.c"
  $40 = HEAP32[$39>>2]|0; //@line 193 "gfx.c"
  $41 = (($40) + ($37<<2)|0); //@line 193 "gfx.c"
  HEAP32[$41>>2] = 0; //@line 193 "gfx.c"
  $42 = $i; //@line 191 "gfx.c"
  $43 = (($42) + 1)|0; //@line 191 "gfx.c"
  $i = $43; //@line 191 "gfx.c"
 }
 $44 = $return_bmp; //@line 196 "gfx.c"
 $45 = ((($44)) + 28|0); //@line 196 "gfx.c"
 HEAP32[$45>>2] = 0; //@line 196 "gfx.c"
 $46 = $return_bmp; //@line 198 "gfx.c"
 $0 = $46; //@line 198 "gfx.c"
 $47 = $0; //@line 199 "gfx.c"
 STACKTOP = sp;return ($47|0); //@line 199 "gfx.c"
}
function _freeBitmap($bmp) {
 $bmp = $bmp|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $0; //@line 203 "gfx.c"
 _free($1); //@line 203 "gfx.c"
 STACKTOP = sp;return; //@line 204 "gfx.c"
}
function _drawBitmap($bmp) {
 $bmp = $bmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0;
 var $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0;
 var $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $color = 0, $height = 0;
 var $or$cond = 0, $srcx = 0, $srcy = 0, $width = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $bmp;
 $1 = $0; //@line 208 "gfx.c"
 $2 = ((($1)) + 24|0); //@line 208 "gfx.c"
 $3 = HEAP32[$2>>2]|0; //@line 208 "gfx.c"
 $4 = $0; //@line 208 "gfx.c"
 $5 = ((($4)) + 16|0); //@line 208 "gfx.c"
 $6 = HEAP32[$5>>2]|0; //@line 208 "gfx.c"
 $7 = (($3) - ($6))|0; //@line 208 "gfx.c"
 $8 = (($7) + 1)|0; //@line 208 "gfx.c"
 $width = $8; //@line 208 "gfx.c"
 $9 = $0; //@line 209 "gfx.c"
 $10 = ((($9)) + 20|0); //@line 209 "gfx.c"
 $11 = HEAP32[$10>>2]|0; //@line 209 "gfx.c"
 $12 = $0; //@line 209 "gfx.c"
 $13 = ((($12)) + 12|0); //@line 209 "gfx.c"
 $14 = HEAP32[$13>>2]|0; //@line 209 "gfx.c"
 $15 = (($11) - ($14))|0; //@line 209 "gfx.c"
 $16 = (($15) + 1)|0; //@line 209 "gfx.c"
 $height = $16; //@line 209 "gfx.c"
 $17 = $width; //@line 211 "gfx.c"
 $18 = ($17|0)<=(0); //@line 211 "gfx.c"
 $19 = $height; //@line 211 "gfx.c"
 $20 = ($19|0)<=(0); //@line 211 "gfx.c"
 $or$cond = $18 | $20; //@line 211 "gfx.c"
 if ($or$cond) {
  STACKTOP = sp;return; //@line 243 "gfx.c"
 }
 $21 = HEAP32[1835]|0; //@line 214 "gfx.c"
 $22 = $0; //@line 214 "gfx.c"
 $23 = ((($22)) + 16|0); //@line 214 "gfx.c"
 $24 = HEAP32[$23>>2]|0; //@line 214 "gfx.c"
 $25 = (($21) + ($24))|0; //@line 214 "gfx.c"
 $26 = HEAP32[1836]|0; //@line 214 "gfx.c"
 $27 = $0; //@line 214 "gfx.c"
 $28 = ((($27)) + 12|0); //@line 214 "gfx.c"
 $29 = HEAP32[$28>>2]|0; //@line 214 "gfx.c"
 $30 = (($26) + ($29))|0; //@line 214 "gfx.c"
 $31 = $width; //@line 214 "gfx.c"
 $32 = $height; //@line 214 "gfx.c"
 $33 = _emscripten_asm_const_iiiii(3, ($25|0), ($30|0), ($31|0), ($32|0))|0; //@line 214 "gfx.c"
 $srcy = 0; //@line 221 "gfx.c"
 while(1) {
  $34 = $srcy; //@line 221 "gfx.c"
  $35 = $height; //@line 221 "gfx.c"
  $36 = ($34|0)<($35|0); //@line 221 "gfx.c"
  if (!($36)) {
   break;
  }
  $srcx = 0; //@line 222 "gfx.c"
  while(1) {
   $37 = $srcx; //@line 222 "gfx.c"
   $38 = $width; //@line 222 "gfx.c"
   $39 = ($37|0)<($38|0); //@line 222 "gfx.c"
   if (!($39)) {
    break;
   }
   $40 = $srcx; //@line 224 "gfx.c"
   $41 = $0; //@line 224 "gfx.c"
   $42 = ((($41)) + 16|0); //@line 224 "gfx.c"
   $43 = HEAP32[$42>>2]|0; //@line 224 "gfx.c"
   $44 = (($40) + ($43))|0; //@line 224 "gfx.c"
   $45 = $srcy; //@line 224 "gfx.c"
   $46 = $0; //@line 224 "gfx.c"
   $47 = ((($46)) + 12|0); //@line 224 "gfx.c"
   $48 = HEAP32[$47>>2]|0; //@line 224 "gfx.c"
   $49 = (($45) + ($48))|0; //@line 224 "gfx.c"
   $50 = $0; //@line 224 "gfx.c"
   $51 = ((($50)) + 4|0); //@line 224 "gfx.c"
   $52 = HEAP32[$51>>2]|0; //@line 224 "gfx.c"
   $53 = Math_imul($49, $52)|0; //@line 224 "gfx.c"
   $54 = (($44) + ($53))|0; //@line 224 "gfx.c"
   $55 = $0; //@line 224 "gfx.c"
   $56 = ((($55)) + 8|0); //@line 224 "gfx.c"
   $57 = HEAP32[$56>>2]|0; //@line 224 "gfx.c"
   $58 = (($57) + ($54<<2)|0); //@line 224 "gfx.c"
   $59 = HEAP32[$58>>2]|0; //@line 224 "gfx.c"
   $color = $59; //@line 224 "gfx.c"
   $60 = $width; //@line 226 "gfx.c"
   $61 = $srcx; //@line 226 "gfx.c"
   $62 = $srcy; //@line 226 "gfx.c"
   $63 = $color; //@line 226 "gfx.c"
   $64 = $63 & 16711680; //@line 226 "gfx.c"
   $65 = $64 >>> 16; //@line 226 "gfx.c"
   $66 = $color; //@line 226 "gfx.c"
   $67 = $66 & 65280; //@line 226 "gfx.c"
   $68 = $67 >>> 8; //@line 226 "gfx.c"
   $69 = $color; //@line 226 "gfx.c"
   $70 = $69 & 255; //@line 226 "gfx.c"
   $71 = $0; //@line 226 "gfx.c"
   $72 = ((($71)) + 28|0); //@line 226 "gfx.c"
   $73 = HEAP32[$72>>2]|0; //@line 226 "gfx.c"
   $74 = ($73|0)!=(0); //@line 226 "gfx.c"
   if ($74) {
    $75 = $color; //@line 226 "gfx.c"
    $76 = $0; //@line 226 "gfx.c"
    $77 = ((($76)) + 28|0); //@line 226 "gfx.c"
    $78 = HEAP32[$77>>2]|0; //@line 226 "gfx.c"
    $79 = ($75|0)==($78|0); //@line 226 "gfx.c"
    $80 = $79 ? 1 : 0; //@line 226 "gfx.c"
    $81 = $80;
   } else {
    $81 = 0;
   }
   $82 = _emscripten_asm_const_iiiiiiii(4, ($60|0), ($61|0), ($62|0), ($65|0), ($68|0), ($70|0), ($81|0))|0; //@line 226 "gfx.c"
   $83 = $srcx; //@line 222 "gfx.c"
   $84 = (($83) + 1)|0; //@line 222 "gfx.c"
   $srcx = $84; //@line 222 "gfx.c"
  }
  $85 = $srcy; //@line 221 "gfx.c"
  $86 = (($85) + 1)|0; //@line 221 "gfx.c"
  $srcy = $86; //@line 221 "gfx.c"
 }
 $87 = HEAP32[1835]|0; //@line 239 "gfx.c"
 $88 = $0; //@line 239 "gfx.c"
 $89 = ((($88)) + 16|0); //@line 239 "gfx.c"
 $90 = HEAP32[$89>>2]|0; //@line 239 "gfx.c"
 $91 = (($87) + ($90))|0; //@line 239 "gfx.c"
 $92 = HEAP32[1836]|0; //@line 239 "gfx.c"
 $93 = $0; //@line 239 "gfx.c"
 $94 = ((($93)) + 12|0); //@line 239 "gfx.c"
 $95 = HEAP32[$94>>2]|0; //@line 239 "gfx.c"
 $96 = (($92) + ($95))|0; //@line 239 "gfx.c"
 $97 = _emscripten_asm_const_iii(5, ($91|0), ($96|0))|0; //@line 239 "gfx.c"
 STACKTOP = sp;return; //@line 243 "gfx.c"
}
function _postMessage($ldest,$lcommand,$lpayload) {
 $ldest = $ldest|0;
 $lcommand = $lcommand|0;
 $lpayload = $lpayload|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $ldest;
 $1 = $lcommand;
 $2 = $lpayload;
 STACKTOP = sp;return; //@line 24 "p5.c"
}
function _terminate() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 return; //@line 65 "p5.c"
}
function _initMouse() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _emscripten_asm_const_v(6); //@line 72 "p5.c"
 return 1; //@line 101 "p5.c"
}
function _checkMouse($x,$y,$buttons) {
 $x = $x|0;
 $y = $y|0;
 $buttons = $buttons|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $x;
 $2 = $y;
 $3 = $buttons;
 $4 = _emscripten_asm_const_ii(7, 0)|0; //@line 106 "p5.c"
 $5 = ($4|0)!=(0); //@line 106 "p5.c"
 if ($5) {
  $6 = _emscripten_asm_const_ii(8, 0)|0; //@line 109 "p5.c"
  $7 = $1; //@line 109 "p5.c"
  HEAP32[$7>>2] = $6; //@line 109 "p5.c"
  $8 = _emscripten_asm_const_ii(9, 0)|0; //@line 110 "p5.c"
  $9 = $2; //@line 110 "p5.c"
  HEAP32[$9>>2] = $8; //@line 110 "p5.c"
  $10 = _emscripten_asm_const_ii(10, 0)|0; //@line 111 "p5.c"
  $11 = $10&255; //@line 111 "p5.c"
  $12 = $3; //@line 111 "p5.c"
  HEAP8[$12>>0] = $11; //@line 111 "p5.c"
  _emscripten_asm_const_v(11); //@line 113 "p5.c"
  $0 = 1; //@line 115 "p5.c"
  $13 = $0; //@line 116 "p5.c"
  STACKTOP = sp;return ($13|0); //@line 116 "p5.c"
 } else {
  $0 = 0; //@line 107 "p5.c"
  $13 = $0; //@line 116 "p5.c"
  STACKTOP = sp;return ($13|0); //@line 116 "p5.c"
 }
 return (0)|0;
}
function _initKey() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _emscripten_asm_const_v(12); //@line 122 "p5.c"
 return 1; //@line 132 "p5.c"
}
function _getch() {
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = _emscripten_asm_const_ii(13, 0)|0; //@line 139 "p5.c"
 $1 = $0&255; //@line 139 "p5.c"
 return ($1|0); //@line 139 "p5.c"
}
function _prints($s) {
 $s = $s|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $s;
 $1 = $0; //@line 172 "p5.c"
 $2 = _emscripten_asm_const_ii(14, ($1|0))|0; //@line 172 "p5.c"
 STACKTOP = sp;return; //@line 182 "p5.c"
}
function _usrClear() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _cmd_clear(); //@line 321 "entry.c"
 return 0; //@line 322 "entry.c"
}
function _cmd_clear() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $x = 0, $y = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $y = 0; //@line 460 "entry.c"
 while(1) {
  $0 = $y; //@line 460 "entry.c"
  $1 = HEAP32[1837]|0; //@line 460 "entry.c"
  $2 = ($0>>>0)<($1>>>0); //@line 460 "entry.c"
  if (!($2)) {
   break;
  }
  $x = 0; //@line 461 "entry.c"
  while(1) {
   $3 = $x; //@line 461 "entry.c"
   $4 = HEAP32[1838]|0; //@line 461 "entry.c"
   $5 = ($3>>>0)<($4>>>0); //@line 461 "entry.c"
   $6 = $y; //@line 462 "entry.c"
   if (!($5)) {
    break;
   }
   $7 = HEAP32[1839]|0; //@line 462 "entry.c"
   $8 = (($6) + ($7))|0; //@line 462 "entry.c"
   $9 = HEAP32[1840]|0; //@line 462 "entry.c"
   $10 = ((($9)) + 4|0); //@line 462 "entry.c"
   $11 = HEAP32[$10>>2]|0; //@line 462 "entry.c"
   $12 = Math_imul($8, $11)|0; //@line 462 "entry.c"
   $13 = $x; //@line 462 "entry.c"
   $14 = HEAP32[1841]|0; //@line 462 "entry.c"
   $15 = (($13) + ($14))|0; //@line 462 "entry.c"
   $16 = (($12) + ($15))|0; //@line 462 "entry.c"
   $17 = HEAP32[1840]|0; //@line 462 "entry.c"
   $18 = ((($17)) + 8|0); //@line 462 "entry.c"
   $19 = HEAP32[$18>>2]|0; //@line 462 "entry.c"
   $20 = (($19) + ($16<<2)|0); //@line 462 "entry.c"
   HEAP32[$20>>2] = 16777215; //@line 462 "entry.c"
   $21 = $x; //@line 461 "entry.c"
   $22 = (($21) + 1)|0; //@line 461 "entry.c"
   $x = $22; //@line 461 "entry.c"
  }
  $23 = (($6) + 1)|0; //@line 460 "entry.c"
  $y = $23; //@line 460 "entry.c"
 }
 HEAP8[7975] = 0; //@line 464 "entry.c"
 HEAP8[7976] = 0; //@line 465 "entry.c"
 $24 = HEAP32[1842]|0; //@line 467 "entry.c"
 $25 = HEAP32[1840]|0; //@line 467 "entry.c"
 _repaintAll($24,$25); //@line 467 "entry.c"
 $y = 0; //@line 470 "entry.c"
 while(1) {
  $26 = $y; //@line 470 "entry.c"
  $27 = HEAP32[1837]|0; //@line 470 "entry.c"
  $28 = ($26>>>0)<($27>>>0); //@line 470 "entry.c"
  if (!($28)) {
   break;
  }
  $x = 0; //@line 471 "entry.c"
  while(1) {
   $29 = $x; //@line 471 "entry.c"
   $30 = HEAP32[1838]|0; //@line 471 "entry.c"
   $31 = ($29>>>0)<($30>>>0); //@line 471 "entry.c"
   $32 = $y; //@line 472 "entry.c"
   if (!($31)) {
    break;
   }
   $33 = HEAP32[1839]|0; //@line 472 "entry.c"
   $34 = (($32) + ($33))|0; //@line 472 "entry.c"
   $35 = HEAP32[1840]|0; //@line 472 "entry.c"
   $36 = ((($35)) + 4|0); //@line 472 "entry.c"
   $37 = HEAP32[$36>>2]|0; //@line 472 "entry.c"
   $38 = Math_imul($34, $37)|0; //@line 472 "entry.c"
   $39 = $x; //@line 472 "entry.c"
   $40 = HEAP32[1841]|0; //@line 472 "entry.c"
   $41 = (($39) + ($40))|0; //@line 472 "entry.c"
   $42 = (($38) + ($41))|0; //@line 472 "entry.c"
   $43 = HEAP32[1840]|0; //@line 472 "entry.c"
   $44 = ((($43)) + 8|0); //@line 472 "entry.c"
   $45 = HEAP32[$44>>2]|0; //@line 472 "entry.c"
   $46 = (($45) + ($42<<2)|0); //@line 472 "entry.c"
   HEAP32[$46>>2] = 65280; //@line 472 "entry.c"
   $47 = $x; //@line 471 "entry.c"
   $48 = (($47) + 1)|0; //@line 471 "entry.c"
   $x = $48; //@line 471 "entry.c"
  }
  $49 = (($32) + 1)|0; //@line 470 "entry.c"
  $y = $49; //@line 470 "entry.c"
 }
 STACKTOP = sp;return; //@line 473 "entry.c"
}
function _repaintAll($handle,$h_bmp) {
 $handle = $handle|0;
 $h_bmp = $h_bmp|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $h_bmp;
 $2 = $1; //@line 344 "entry.c"
 $3 = ((($2)) + 12|0); //@line 344 "entry.c"
 HEAP32[$3>>2] = 0; //@line 344 "entry.c"
 $4 = $1; //@line 345 "entry.c"
 $5 = ((($4)) + 16|0); //@line 345 "entry.c"
 HEAP32[$5>>2] = 0; //@line 345 "entry.c"
 $6 = $1; //@line 346 "entry.c"
 $7 = HEAP32[$6>>2]|0; //@line 346 "entry.c"
 $8 = $1; //@line 346 "entry.c"
 $9 = ((($8)) + 20|0); //@line 346 "entry.c"
 HEAP32[$9>>2] = $7; //@line 346 "entry.c"
 $10 = $1; //@line 347 "entry.c"
 $11 = ((($10)) + 4|0); //@line 347 "entry.c"
 $12 = HEAP32[$11>>2]|0; //@line 347 "entry.c"
 $13 = $1; //@line 347 "entry.c"
 $14 = ((($13)) + 24|0); //@line 347 "entry.c"
 HEAP32[$14>>2] = $12; //@line 347 "entry.c"
 $15 = $0; //@line 350 "entry.c"
 _repaintWindow($15); //@line 350 "entry.c"
 STACKTOP = sp;return; //@line 351 "entry.c"
}
function _consVer() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _cmd_prints(4585); //@line 328 "entry.c"
 _cmd_prints(4614); //@line 329 "entry.c"
 return 0; //@line 330 "entry.c"
}
function _cmd_prints($s) {
 $s = $s|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $s;
 while(1) {
  $1 = $0; //@line 452 "entry.c"
  $2 = HEAP8[$1>>0]|0; //@line 452 "entry.c"
  $3 = ($2<<24>>24)!=(0); //@line 452 "entry.c"
  if (!($3)) {
   break;
  }
  $4 = $0; //@line 453 "entry.c"
  $5 = ((($4)) + 1|0); //@line 453 "entry.c"
  $0 = $5; //@line 453 "entry.c"
  $6 = HEAP8[$4>>0]|0; //@line 453 "entry.c"
  _cmd_pchar($6); //@line 453 "entry.c"
 }
 STACKTOP = sp;return; //@line 454 "entry.c"
}
function _cmd_pchar($c) {
 $c = $c|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $c;
 $1 = $0; //@line 427 "entry.c"
 $2 = $1&255; //@line 427 "entry.c"
 $3 = ($2|0)==(10); //@line 427 "entry.c"
 if ($3) {
  HEAP8[7975] = 0; //@line 429 "entry.c"
  $4 = HEAP8[7976]|0; //@line 430 "entry.c"
  $5 = (($4) + 1)<<24>>24; //@line 430 "entry.c"
  HEAP8[7976] = $5; //@line 430 "entry.c"
 } else {
  $6 = $0; //@line 433 "entry.c"
  $7 = $6&255; //@line 433 "entry.c"
  (_putchar($7)|0); //@line 433 "entry.c"
  $8 = HEAP32[1840]|0; //@line 434 "entry.c"
  $9 = $0; //@line 434 "entry.c"
  $10 = HEAP8[7975]|0; //@line 434 "entry.c"
  $11 = $10&255; //@line 434 "entry.c"
  $12 = $11<<3; //@line 434 "entry.c"
  $13 = HEAP32[1841]|0; //@line 434 "entry.c"
  $14 = (($12) + ($13))|0; //@line 434 "entry.c"
  $15 = HEAP8[7976]|0; //@line 434 "entry.c"
  $16 = $15&255; //@line 434 "entry.c"
  $17 = ($16*12)|0; //@line 434 "entry.c"
  $18 = HEAP32[1839]|0; //@line 434 "entry.c"
  $19 = (($17) + ($18))|0; //@line 434 "entry.c"
  _drawCharacter($8,$9,$14,$19,0); //@line 434 "entry.c"
  $20 = HEAP8[7975]|0; //@line 435 "entry.c"
  $21 = (($20) + 1)<<24>>24; //@line 435 "entry.c"
  HEAP8[7975] = $21; //@line 435 "entry.c"
  $22 = HEAP8[7975]|0; //@line 437 "entry.c"
  $23 = $22&255; //@line 437 "entry.c"
  $24 = HEAP32[1843]|0; //@line 437 "entry.c"
  $25 = ($23|0)>($24|0); //@line 437 "entry.c"
  if ($25) {
   HEAP8[7975] = 0; //@line 439 "entry.c"
   $26 = HEAP8[7976]|0; //@line 440 "entry.c"
   $27 = (($26) + 1)<<24>>24; //@line 440 "entry.c"
   HEAP8[7976] = $27; //@line 440 "entry.c"
  }
 }
 $28 = HEAP8[7976]|0; //@line 446 "entry.c"
 $29 = $28&255; //@line 446 "entry.c"
 $30 = HEAP32[1844]|0; //@line 446 "entry.c"
 $31 = ($29|0)>($30|0); //@line 446 "entry.c"
 if (!($31)) {
  STACKTOP = sp;return; //@line 448 "entry.c"
 }
 _cmd_clear(); //@line 447 "entry.c"
 STACKTOP = sp;return; //@line 448 "entry.c"
}
function _drawCharacter($b,$c,$x,$y,$color) {
 $b = $b|0;
 $c = $c|0;
 $x = $x|0;
 $y = $y|0;
 $color = $color|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i = 0, $j = 0, $line = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $b;
 $1 = $c;
 $2 = $x;
 $3 = $y;
 $4 = $color;
 $5 = $1; //@line 380 "entry.c"
 $6 = $5 << 24 >> 24; //@line 380 "entry.c"
 $7 = $6 & 127; //@line 380 "entry.c"
 $8 = $7&255; //@line 380 "entry.c"
 $1 = $8; //@line 380 "entry.c"
 $i = 0; //@line 382 "entry.c"
 while(1) {
  $9 = $i; //@line 382 "entry.c"
  $10 = ($9|0)<(12); //@line 382 "entry.c"
  if (!($10)) {
   break;
  }
  $11 = $i; //@line 384 "entry.c"
  $12 = $11<<7; //@line 384 "entry.c"
  $13 = $1; //@line 384 "entry.c"
  $14 = $13 << 24 >> 24; //@line 384 "entry.c"
  $15 = (($12) + ($14))|0; //@line 384 "entry.c"
  $16 = (1056 + ($15)|0); //@line 384 "entry.c"
  $17 = HEAP8[$16>>0]|0; //@line 384 "entry.c"
  $line = $17; //@line 384 "entry.c"
  $j = 0; //@line 385 "entry.c"
  while(1) {
   $18 = $j; //@line 385 "entry.c"
   $19 = ($18|0)<(8); //@line 385 "entry.c"
   if (!($19)) {
    break;
   }
   $20 = $line; //@line 387 "entry.c"
   $21 = $20&255; //@line 387 "entry.c"
   $22 = $21 & 128; //@line 387 "entry.c"
   $23 = ($22|0)!=(0); //@line 387 "entry.c"
   if ($23) {
    $24 = $4; //@line 387 "entry.c"
    $25 = $3; //@line 387 "entry.c"
    $26 = $i; //@line 387 "entry.c"
    $27 = (($25) + ($26))|0; //@line 387 "entry.c"
    $28 = $0; //@line 387 "entry.c"
    $29 = ((($28)) + 4|0); //@line 387 "entry.c"
    $30 = HEAP32[$29>>2]|0; //@line 387 "entry.c"
    $31 = Math_imul($27, $30)|0; //@line 387 "entry.c"
    $32 = $2; //@line 387 "entry.c"
    $33 = $j; //@line 387 "entry.c"
    $34 = (($32) + ($33))|0; //@line 387 "entry.c"
    $35 = (($31) + ($34))|0; //@line 387 "entry.c"
    $36 = $0; //@line 387 "entry.c"
    $37 = ((($36)) + 8|0); //@line 387 "entry.c"
    $38 = HEAP32[$37>>2]|0; //@line 387 "entry.c"
    $39 = (($38) + ($35<<2)|0); //@line 387 "entry.c"
    HEAP32[$39>>2] = $24; //@line 387 "entry.c"
   }
   $40 = $line; //@line 388 "entry.c"
   $41 = $40&255; //@line 388 "entry.c"
   $42 = $41 << 1; //@line 388 "entry.c"
   $43 = $42&255; //@line 388 "entry.c"
   $line = $43; //@line 388 "entry.c"
   $44 = $j; //@line 385 "entry.c"
   $45 = (($44) + 1)|0; //@line 385 "entry.c"
   $j = $45; //@line 385 "entry.c"
  }
  $46 = $i; //@line 382 "entry.c"
  $47 = (($46) + 1)|0; //@line 382 "entry.c"
  $i = $47; //@line 382 "entry.c"
 }
 $48 = HEAP32[1842]|0; //@line 392 "entry.c"
 $49 = HEAP32[1840]|0; //@line 392 "entry.c"
 $50 = $2; //@line 392 "entry.c"
 $51 = $3; //@line 392 "entry.c"
 _repaintRegion($48,$49,$50,$51,8,12); //@line 392 "entry.c"
 STACKTOP = sp;return; //@line 393 "entry.c"
}
function _repaintRegion($handle,$h_bmp,$x,$y,$w,$h) {
 $handle = $handle|0;
 $h_bmp = $h_bmp|0;
 $x = $x|0;
 $y = $y|0;
 $w = $w|0;
 $h = $h|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $handle;
 $1 = $h_bmp;
 $2 = $x;
 $3 = $y;
 $4 = $w;
 $5 = $h;
 $6 = $3; //@line 357 "entry.c"
 $7 = $1; //@line 357 "entry.c"
 $8 = ((($7)) + 12|0); //@line 357 "entry.c"
 HEAP32[$8>>2] = $6; //@line 357 "entry.c"
 $9 = $2; //@line 358 "entry.c"
 $10 = $1; //@line 358 "entry.c"
 $11 = ((($10)) + 16|0); //@line 358 "entry.c"
 HEAP32[$11>>2] = $9; //@line 358 "entry.c"
 $12 = $3; //@line 359 "entry.c"
 $13 = $5; //@line 359 "entry.c"
 $14 = (($12) + ($13))|0; //@line 359 "entry.c"
 $15 = $1; //@line 359 "entry.c"
 $16 = ((($15)) + 20|0); //@line 359 "entry.c"
 HEAP32[$16>>2] = $14; //@line 359 "entry.c"
 $17 = $2; //@line 360 "entry.c"
 $18 = $4; //@line 360 "entry.c"
 $19 = (($17) + ($18))|0; //@line 360 "entry.c"
 $20 = $1; //@line 360 "entry.c"
 $21 = ((($20)) + 24|0); //@line 360 "entry.c"
 HEAP32[$21>>2] = $19; //@line 360 "entry.c"
 $22 = $0; //@line 363 "entry.c"
 _repaintWindow($22); //@line 363 "entry.c"
 STACKTOP = sp;return; //@line 364 "entry.c"
}
function _usrExit() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1845]|0; //@line 336 "entry.c"
 _destroyWindow($0); //@line 336 "entry.c"
 return 1; //@line 337 "entry.c"
}
function _makeChild() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0;
 var $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ctx_b = 0, $tile_data = 0, $tile_height = 0, $tile_width = 0, $x = 0;
 var $y = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 96|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $tile_data = sp;
 $tile_width = 4; //@line 156 "entry.c"
 $tile_height = 4; //@line 157 "entry.c"
 dest=$tile_data; stop=dest+64|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0)); //@line 158 "entry.c"
 $1 = ((($tile_data)) + 12|0); //@line 158 "entry.c"
 HEAP32[$1>>2] = -1; //@line 158 "entry.c"
 $2 = ((($tile_data)) + 20|0); //@line 158 "entry.c"
 HEAP32[$2>>2] = -1; //@line 158 "entry.c"
 $3 = ((($tile_data)) + 40|0); //@line 158 "entry.c"
 HEAP32[$3>>2] = -1; //@line 158 "entry.c"
 $4 = ((($tile_data)) + 48|0); //@line 158 "entry.c"
 HEAP32[$4>>2] = -1; //@line 158 "entry.c"
 HEAP32[1846] = 100; //@line 165 "entry.c"
 HEAP32[1847] = 20; //@line 166 "entry.c"
 $5 = HEAP32[1848]|0; //@line 168 "entry.c"
 $6 = ($5|0)!=(0); //@line 168 "entry.c"
 if ($6) {
  _cmd_prints(4666); //@line 170 "entry.c"
  $7 = HEAP32[1848]|0; //@line 171 "entry.c"
  _focus($7); //@line 171 "entry.c"
  $0 = 0; //@line 172 "entry.c"
  $54 = $0; //@line 202 "entry.c"
  STACKTOP = sp;return ($54|0); //@line 202 "entry.c"
 }
 _cmd_prints(4682); //@line 175 "entry.c"
 $8 = (_createWindow(400,400,2)|0); //@line 177 "entry.c"
 HEAP32[1848] = $8; //@line 177 "entry.c"
 $9 = HEAP32[1848]|0; //@line 180 "entry.c"
 _setTitle($9,4699); //@line 180 "entry.c"
 $10 = HEAP32[1848]|0; //@line 183 "entry.c"
 _installWindow($10,1); //@line 183 "entry.c"
 $11 = HEAP32[1848]|0; //@line 188 "entry.c"
 $12 = (_getWindowContext($11)|0); //@line 188 "entry.c"
 $ctx_b = $12; //@line 188 "entry.c"
 $x = 0; //@line 191 "entry.c"
 while(1) {
  $13 = $x; //@line 191 "entry.c"
  $14 = HEAP32[1841]|0; //@line 191 "entry.c"
  $15 = (400 - ($14))|0; //@line 191 "entry.c"
  $16 = HEAP32[1849]|0; //@line 191 "entry.c"
  $17 = (($15) - ($16))|0; //@line 191 "entry.c"
  $18 = ($13|0)<($17|0); //@line 191 "entry.c"
  if (!($18)) {
   break;
  }
  $y = 0; //@line 192 "entry.c"
  while(1) {
   $19 = $y; //@line 192 "entry.c"
   $20 = HEAP32[1839]|0; //@line 192 "entry.c"
   $21 = (400 - ($20))|0; //@line 192 "entry.c"
   $22 = HEAP32[1850]|0; //@line 192 "entry.c"
   $23 = (($21) - ($22))|0; //@line 192 "entry.c"
   $24 = ($19|0)<($23|0); //@line 192 "entry.c"
   if (!($24)) {
    break;
   }
   $25 = $y; //@line 193 "entry.c"
   $26 = $tile_height; //@line 193 "entry.c"
   $27 = (($25>>>0) % ($26>>>0))&-1; //@line 193 "entry.c"
   $28 = $tile_width; //@line 193 "entry.c"
   $29 = Math_imul($27, $28)|0; //@line 193 "entry.c"
   $30 = $x; //@line 193 "entry.c"
   $31 = $tile_width; //@line 193 "entry.c"
   $32 = (($30>>>0) % ($31>>>0))&-1; //@line 193 "entry.c"
   $33 = (($29) + ($32))|0; //@line 193 "entry.c"
   $34 = (($tile_data) + ($33<<2)|0); //@line 193 "entry.c"
   $35 = HEAP32[$34>>2]|0; //@line 193 "entry.c"
   $36 = $y; //@line 193 "entry.c"
   $37 = HEAP32[1839]|0; //@line 193 "entry.c"
   $38 = (($36) + ($37))|0; //@line 193 "entry.c"
   $39 = ($38*400)|0; //@line 193 "entry.c"
   $40 = $x; //@line 193 "entry.c"
   $41 = HEAP32[1841]|0; //@line 193 "entry.c"
   $42 = (($40) + ($41))|0; //@line 193 "entry.c"
   $43 = (($39) + ($42))|0; //@line 193 "entry.c"
   $44 = $ctx_b; //@line 193 "entry.c"
   $45 = ((($44)) + 8|0); //@line 193 "entry.c"
   $46 = HEAP32[$45>>2]|0; //@line 193 "entry.c"
   $47 = (($46) + ($43<<2)|0); //@line 193 "entry.c"
   HEAP32[$47>>2] = $35; //@line 193 "entry.c"
   $48 = $y; //@line 192 "entry.c"
   $49 = (($48) + 1)|0; //@line 192 "entry.c"
   $y = $49; //@line 192 "entry.c"
  }
  $50 = $x; //@line 191 "entry.c"
  $51 = (($50) + 1)|0; //@line 191 "entry.c"
  $x = $51; //@line 191 "entry.c"
 }
 $52 = HEAP32[1848]|0; //@line 196 "entry.c"
 _moveHandle($52,100,20); //@line 196 "entry.c"
 $53 = HEAP32[1848]|0; //@line 199 "entry.c"
 _showWindow($53); //@line 199 "entry.c"
 $0 = 0; //@line 201 "entry.c"
 $54 = $0; //@line 202 "entry.c"
 STACKTOP = sp;return ($54|0); //@line 202 "entry.c"
}
function _closeChild() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = HEAP32[1848]|0; //@line 206 "entry.c"
 $2 = ($1|0)!=(0); //@line 206 "entry.c"
 if ($2) {
  _cmd_prints(4708); //@line 208 "entry.c"
  $3 = HEAP32[1848]|0; //@line 209 "entry.c"
  _destroyWindow($3); //@line 209 "entry.c"
  HEAP32[1848] = 0; //@line 210 "entry.c"
  $0 = 0; //@line 211 "entry.c"
  $4 = $0; //@line 217 "entry.c"
  STACKTOP = sp;return ($4|0); //@line 217 "entry.c"
 } else {
  _cmd_prints(4727); //@line 214 "entry.c"
  $0 = 0; //@line 216 "entry.c"
  $4 = $0; //@line 217 "entry.c"
  STACKTOP = sp;return ($4|0); //@line 217 "entry.c"
 }
 return (0)|0;
}
function _focusCmd() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1845]|0; //@line 119 "entry.c"
 _focus($0); //@line 119 "entry.c"
 return 0; //@line 120 "entry.c"
}
function _moveChild() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = HEAP32[1848]|0; //@line 127 "entry.c"
 $2 = ($1|0)!=(0); //@line 127 "entry.c"
 if ($2) {
  $3 = HEAP32[1846]|0; //@line 133 "entry.c"
  $4 = (($3) + 20)|0; //@line 133 "entry.c"
  HEAP32[1846] = $4; //@line 133 "entry.c"
  $5 = HEAP32[1847]|0; //@line 134 "entry.c"
  $6 = (($5) + 20)|0; //@line 134 "entry.c"
  HEAP32[1847] = $6; //@line 134 "entry.c"
  $7 = HEAP32[1848]|0; //@line 135 "entry.c"
  $8 = HEAP32[1846]|0; //@line 135 "entry.c"
  $9 = $8&65535; //@line 135 "entry.c"
  $10 = HEAP32[1847]|0; //@line 135 "entry.c"
  $11 = $10&65535; //@line 135 "entry.c"
  _moveHandle($7,$9,$11); //@line 135 "entry.c"
  $0 = 0; //@line 137 "entry.c"
  $12 = $0; //@line 138 "entry.c"
  STACKTOP = sp;return ($12|0); //@line 138 "entry.c"
 } else {
  _cmd_prints(4749); //@line 129 "entry.c"
  $0 = 0; //@line 130 "entry.c"
  $12 = $0; //@line 138 "entry.c"
  STACKTOP = sp;return ($12|0); //@line 138 "entry.c"
 }
 return (0)|0;
}
function _moveMe() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = HEAP32[1851]|0; //@line 144 "entry.c"
 $2 = ($1|0)!=(0); //@line 144 "entry.c"
 $3 = HEAP32[1845]|0; //@line 147 "entry.c"
 if ($2) {
  _moveHandle($3,54,66); //@line 147 "entry.c"
 } else {
  _moveHandle($3,0,0); //@line 145 "entry.c"
 }
 $4 = HEAP32[1851]|0; //@line 149 "entry.c"
 $5 = ($4|0)!=(0); //@line 149 "entry.c"
 $6 = $5 ^ 1; //@line 149 "entry.c"
 $7 = $6&1; //@line 149 "entry.c"
 HEAP32[1851] = $7; //@line 149 "entry.c"
 $8 = $0; //@line 150 "entry.c"
 STACKTOP = sp;return ($8|0); //@line 150 "entry.c"
}
function _main($argc,$argv) {
 $argc = $argc|0;
 $argv = $argv|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = 0;
 $1 = $argc;
 $2 = $argv;
 _WYG_main(); //@line 39 "entry.c"
 STACKTOP = sp;return 0; //@line 41 "entry.c"
}
function _parse($cmdbuf) {
 $cmdbuf = $cmdbuf|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $found = 0, $i = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $1 = $cmdbuf;
 $found = 0; //@line 99 "entry.c"
 $i = 0; //@line 100 "entry.c"
 while(1) {
  $2 = $i; //@line 100 "entry.c"
  $3 = ($2|0)<(8); //@line 100 "entry.c"
  if (!($3)) {
   label = 6;
   break;
  }
  $4 = $i; //@line 102 "entry.c"
  $5 = (804 + ($4<<2)|0); //@line 102 "entry.c"
  $6 = HEAP32[$5>>2]|0; //@line 102 "entry.c"
  $7 = $1; //@line 102 "entry.c"
  $8 = (_strcmp($6,$7)|0); //@line 102 "entry.c"
  $9 = ($8|0)!=(0); //@line 102 "entry.c"
  $10 = $i; //@line 100 "entry.c"
  if (!($9)) {
   label = 4;
   break;
  }
  $14 = (($10) + 1)|0; //@line 100 "entry.c"
  $i = $14; //@line 100 "entry.c"
 }
 if ((label|0) == 4) {
  $11 = (836 + ($10<<2)|0); //@line 104 "entry.c"
  $12 = HEAP32[$11>>2]|0; //@line 104 "entry.c"
  $13 = (FUNCTION_TABLE_i[$12 & 15]()|0); //@line 104 "entry.c"
  $0 = $13; //@line 104 "entry.c"
  $16 = $0; //@line 113 "entry.c"
  STACKTOP = sp;return ($16|0); //@line 113 "entry.c"
 }
 else if ((label|0) == 6) {
  _cmd_prints(4760); //@line 108 "entry.c"
  $15 = $1; //@line 109 "entry.c"
  _cmd_prints($15); //@line 109 "entry.c"
  _cmd_prints(4777); //@line 110 "entry.c"
  $0 = 0; //@line 112 "entry.c"
  $16 = $0; //@line 113 "entry.c"
  STACKTOP = sp;return ($16|0); //@line 113 "entry.c"
 }
 return (0)|0;
}
function _makeWindows() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $h = 0, $vararg_buffer = 0, $vararg_buffer1 = 0, $vararg_buffer3 = 0, $vararg_buffer5 = 0, $vararg_buffer7 = 0;
 var $vararg_buffer9 = 0, $w = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer9 = sp + 40|0;
 $vararg_buffer7 = sp + 32|0;
 $vararg_buffer5 = sp + 24|0;
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer1 = sp + 8|0;
 $vararg_buffer = sp;
 $w = sp + 46|0;
 $h = sp + 44|0;
 _getFrameDims(7356,7364,7400,7396); //@line 225 "entry.c"
 _getWindowDimensions(1,$w,$h); //@line 228 "entry.c"
 (_printf(4682,$vararg_buffer)|0); //@line 230 "entry.c"
 $0 = HEAP16[$w>>1]|0; //@line 231 "entry.c"
 $1 = $0&65535; //@line 231 "entry.c"
 $2 = (($1) - 108)|0; //@line 231 "entry.c"
 $3 = $2&65535; //@line 231 "entry.c"
 $4 = HEAP16[$h>>1]|0; //@line 231 "entry.c"
 $5 = $4&65535; //@line 231 "entry.c"
 $6 = (($5) - 132)|0; //@line 231 "entry.c"
 $7 = $6&65535; //@line 231 "entry.c"
 $8 = (_createWindow($3,$7,2)|0); //@line 231 "entry.c"
 HEAP32[1845] = $8; //@line 231 "entry.c"
 (_printf(4779,$vararg_buffer1)|0); //@line 234 "entry.c"
 $9 = HEAP32[1845]|0; //@line 235 "entry.c"
 _setTitle($9,4797); //@line 235 "entry.c"
 (_printf(4803,$vararg_buffer3)|0); //@line 238 "entry.c"
 $10 = HEAP32[1845]|0; //@line 239 "entry.c"
 _installWindow($10,1); //@line 239 "entry.c"
 (_printf(4832,$vararg_buffer5)|0); //@line 242 "entry.c"
 $11 = HEAP32[1845]|0; //@line 243 "entry.c"
 _moveHandle($11,54,66); //@line 243 "entry.c"
 (_printf(4850,$vararg_buffer7)|0); //@line 246 "entry.c"
 $12 = HEAP32[1845]|0; //@line 247 "entry.c"
 _showWindow($12); //@line 247 "entry.c"
 (_printf(4866,$vararg_buffer9)|0); //@line 250 "entry.c"
 $13 = HEAP32[1845]|0; //@line 251 "entry.c"
 _cmd_init($13); //@line 251 "entry.c"
 (_initKey()|0); //@line 253 "entry.c"
 (_initMouse()|0); //@line 254 "entry.c"
 _cmd_prints(4886); //@line 255 "entry.c"
 _emscripten_set_main_loop((14|0),0,1); //@line 258 "entry.c"
 STACKTOP = sp;return; //@line 272 "entry.c"
}
function _cmd_init($win) {
 $win = $win|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0;
 var $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $0 = $win;
 $1 = $0; //@line 549 "entry.c"
 HEAP32[1842] = $1; //@line 549 "entry.c"
 $2 = HEAP32[1842]|0; //@line 550 "entry.c"
 $3 = (_getWindowContext($2)|0); //@line 550 "entry.c"
 HEAP32[1840] = $3; //@line 550 "entry.c"
 HEAP8[7975] = 0; //@line 551 "entry.c"
 HEAP8[7976] = 0; //@line 552 "entry.c"
 $4 = HEAP32[1840]|0; //@line 554 "entry.c"
 $5 = ((($4)) + 4|0); //@line 554 "entry.c"
 $6 = HEAP32[$5>>2]|0; //@line 554 "entry.c"
 $7 = HEAP32[1841]|0; //@line 554 "entry.c"
 $8 = HEAP32[1849]|0; //@line 554 "entry.c"
 $9 = (($7) + ($8))|0; //@line 554 "entry.c"
 $10 = (($6) - ($9))|0; //@line 554 "entry.c"
 HEAP32[1838] = $10; //@line 554 "entry.c"
 $11 = HEAP32[1840]|0; //@line 555 "entry.c"
 $12 = HEAP32[$11>>2]|0; //@line 555 "entry.c"
 $13 = HEAP32[1839]|0; //@line 555 "entry.c"
 $14 = HEAP32[1850]|0; //@line 555 "entry.c"
 $15 = (($13) + ($14))|0; //@line 555 "entry.c"
 $16 = (($12) - ($15))|0; //@line 555 "entry.c"
 HEAP32[1837] = $16; //@line 555 "entry.c"
 $17 = HEAP32[1838]|0; //@line 556 "entry.c"
 $18 = (($17|0) / 8)&-1; //@line 556 "entry.c"
 $19 = (($18) - 1)|0; //@line 556 "entry.c"
 HEAP32[1843] = $19; //@line 556 "entry.c"
 $20 = HEAP32[1837]|0; //@line 557 "entry.c"
 $21 = (($20|0) / 12)&-1; //@line 557 "entry.c"
 $22 = (($21) - 1)|0; //@line 557 "entry.c"
 HEAP32[1844] = $22; //@line 557 "entry.c"
 _cmd_clear(); //@line 558 "entry.c"
 STACKTOP = sp;return; //@line 559 "entry.c"
}
function _input_loop() {
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $buttons = 0, $mouse_x = 0, $mouse_y = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $mouse_x = sp + 4|0;
 $mouse_y = sp;
 $buttons = sp + 8|0;
 $0 = (_checkMouse($mouse_x,$mouse_y,$buttons)|0); //@line 287 "entry.c"
 $1 = ($0|0)!=(0); //@line 287 "entry.c"
 if ($1) {
  $2 = HEAP32[$mouse_x>>2]|0; //@line 289 "entry.c"
  $3 = HEAP32[$mouse_y>>2]|0; //@line 289 "entry.c"
  $4 = HEAP8[$buttons>>0]|0; //@line 289 "entry.c"
  _putMouse($2,$3,$4); //@line 289 "entry.c"
 }
 $5 = (_getch()|0); //@line 292 "entry.c"
 HEAP8[7977] = $5; //@line 292 "entry.c"
 $6 = HEAP8[7977]|0; //@line 294 "entry.c"
 $7 = ($6<<24>>24)!=(0); //@line 294 "entry.c"
 if (!($7)) {
  STACKTOP = sp;return; //@line 317 "entry.c"
 }
 $8 = HEAP8[7977]|0; //@line 297 "entry.c"
 _cmd_pchar($8); //@line 297 "entry.c"
 $9 = HEAP8[7977]|0; //@line 299 "entry.c"
 $10 = $9&255; //@line 299 "entry.c"
 $11 = ($10|0)==(10); //@line 299 "entry.c"
 if (!($11)) {
  $12 = HEAP8[7977]|0; //@line 299 "entry.c"
  $13 = $12&255; //@line 299 "entry.c"
  $14 = ($13|0)==(13); //@line 299 "entry.c"
  $15 = HEAP32[1852]|0; //@line 299 "entry.c"
  $16 = ($15|0)==(49); //@line 299 "entry.c"
  $or$cond = $14 | $16; //@line 299 "entry.c"
  if (!($or$cond)) {
   $23 = HEAP8[7977]|0; //@line 315 "entry.c"
   $24 = HEAP32[1852]|0; //@line 315 "entry.c"
   $25 = (($24) + 1)|0; //@line 315 "entry.c"
   HEAP32[1852] = $25; //@line 315 "entry.c"
   $26 = (7978 + ($24)|0); //@line 315 "entry.c"
   HEAP8[$26>>0] = $23; //@line 315 "entry.c"
   STACKTOP = sp;return; //@line 317 "entry.c"
  }
 }
 $17 = HEAP32[1852]|0; //@line 301 "entry.c"
 $18 = (7978 + ($17)|0); //@line 301 "entry.c"
 HEAP8[$18>>0] = 0; //@line 301 "entry.c"
 $19 = (_parse(7978)|0); //@line 304 "entry.c"
 $20 = ($19|0)!=(0); //@line 304 "entry.c"
 if ($20) {
  HEAP32[1853] = 1; //@line 305 "entry.c"
 }
 HEAP8[7978] = 0; //@line 307 "entry.c"
 HEAP32[1852] = 0; //@line 308 "entry.c"
 _cmd_prints(4886); //@line 309 "entry.c"
 $21 = HEAP32[1853]|0; //@line 311 "entry.c"
 $22 = ($21|0)!=(0); //@line 311 "entry.c"
 if (!($22)) {
  STACKTOP = sp;return; //@line 317 "entry.c"
 }
 _emscripten_cancel_main_loop(); //@line 312 "entry.c"
 STACKTOP = sp;return; //@line 317 "entry.c"
}
function _testMain() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 _makeWindows(); //@line 563 "entry.c"
 return; //@line 564 "entry.c"
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $2 = (___syscall6(6,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 STACKTOP = sp;return ($3|0);
}
function ___syscall_ret($r) {
 $r = $r|0;
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($r>>>0)>(4294963200);
 if ($0) {
  $1 = (0 - ($r))|0;
  $2 = (___errno_location()|0);
  HEAP32[$2>>2] = $1;
  $$0 = -1;
 } else {
  $$0 = $r;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[1854]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 7460;
 } else {
  $2 = (_pthread_self()|0);
  $3 = ((($2)) + 64|0);
  $4 = HEAP32[$3>>2]|0;
  $$0 = $4;
 }
 return ($$0|0);
}
function ___unlockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $ret;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $2 = (___syscall140(140,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 $4 = ($3|0)<(0);
 if ($4) {
  HEAP32[$ret>>2] = -1;
  $5 = -1;
 } else {
  $$pre = HEAP32[$ret>>2]|0;
  $5 = $$pre;
 }
 STACKTOP = sp;return ($5|0);
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tio = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $tio = sp + 12|0;
 $0 = ((($f)) + 36|0);
 HEAP32[$0>>2] = 15;
 $1 = HEAP32[$f>>2]|0;
 $2 = $1 & 64;
 $3 = ($2|0)==(0);
 if ($3) {
  $4 = ((($f)) + 60|0);
  $5 = HEAP32[$4>>2]|0;
  HEAP32[$vararg_buffer>>2] = $5;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $tio;
  $6 = (___syscall54(54,($vararg_buffer|0))|0);
  $7 = ($6|0)==(0);
  if (!($7)) {
   $8 = ((($f)) + 75|0);
   HEAP8[$8>>0] = -1;
  }
 }
 $9 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($9|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$0 = 0, $$phi$trans$insert = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cnt$0 = 0, $cnt$1 = 0, $iov$0 = 0, $iov$0$lcssa11 = 0, $iov$1 = 0, $iovcnt$0 = 0, $iovcnt$0$lcssa12 = 0;
 var $iovcnt$1 = 0, $iovs = 0, $rem$0 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $0 = ((($f)) + 28|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$iovs>>2] = $1;
 $2 = ((($iovs)) + 4|0);
 $3 = ((($f)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) - ($1))|0;
 HEAP32[$2>>2] = $5;
 $6 = ((($iovs)) + 8|0);
 HEAP32[$6>>2] = $buf;
 $7 = ((($iovs)) + 12|0);
 HEAP32[$7>>2] = $len;
 $8 = (($5) + ($len))|0;
 $9 = ((($f)) + 60|0);
 $10 = ((($f)) + 44|0);
 $iov$0 = $iovs;$iovcnt$0 = 2;$rem$0 = $8;
 while(1) {
  $11 = HEAP32[1854]|0;
  $12 = ($11|0)==(0|0);
  if ($12) {
   $16 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $16;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $iov$0;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $iovcnt$0;
   $17 = (___syscall146(146,($vararg_buffer3|0))|0);
   $18 = (___syscall_ret($17)|0);
   $cnt$0 = $18;
  } else {
   _pthread_cleanup_push((16|0),($f|0));
   $13 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer>>2] = $13;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $iov$0;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $iovcnt$0;
   $14 = (___syscall146(146,($vararg_buffer|0))|0);
   $15 = (___syscall_ret($14)|0);
   _pthread_cleanup_pop(0);
   $cnt$0 = $15;
  }
  $19 = ($rem$0|0)==($cnt$0|0);
  if ($19) {
   label = 6;
   break;
  }
  $26 = ($cnt$0|0)<(0);
  if ($26) {
   $iov$0$lcssa11 = $iov$0;$iovcnt$0$lcssa12 = $iovcnt$0;
   label = 8;
   break;
  }
  $34 = (($rem$0) - ($cnt$0))|0;
  $35 = ((($iov$0)) + 4|0);
  $36 = HEAP32[$35>>2]|0;
  $37 = ($cnt$0>>>0)>($36>>>0);
  if ($37) {
   $38 = HEAP32[$10>>2]|0;
   HEAP32[$0>>2] = $38;
   HEAP32[$3>>2] = $38;
   $39 = (($cnt$0) - ($36))|0;
   $40 = ((($iov$0)) + 8|0);
   $41 = (($iovcnt$0) + -1)|0;
   $$phi$trans$insert = ((($iov$0)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $49 = $$pre;$cnt$1 = $39;$iov$1 = $40;$iovcnt$1 = $41;
  } else {
   $42 = ($iovcnt$0|0)==(2);
   if ($42) {
    $43 = HEAP32[$0>>2]|0;
    $44 = (($43) + ($cnt$0)|0);
    HEAP32[$0>>2] = $44;
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = 2;
   } else {
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = $iovcnt$0;
   }
  }
  $45 = HEAP32[$iov$1>>2]|0;
  $46 = (($45) + ($cnt$1)|0);
  HEAP32[$iov$1>>2] = $46;
  $47 = ((($iov$1)) + 4|0);
  $48 = (($49) - ($cnt$1))|0;
  HEAP32[$47>>2] = $48;
  $iov$0 = $iov$1;$iovcnt$0 = $iovcnt$1;$rem$0 = $34;
 }
 if ((label|0) == 6) {
  $20 = HEAP32[$10>>2]|0;
  $21 = ((($f)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($f)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$0>>2] = $25;
  HEAP32[$3>>2] = $25;
  $$0 = $len;
 }
 else if ((label|0) == 8) {
  $27 = ((($f)) + 16|0);
  HEAP32[$27>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$3>>2] = 0;
  $28 = HEAP32[$f>>2]|0;
  $29 = $28 | 32;
  HEAP32[$f>>2] = $29;
  $30 = ($iovcnt$0$lcssa12|0)==(2);
  if ($30) {
   $$0 = 0;
  } else {
   $31 = ((($iov$0$lcssa11)) + 4|0);
   $32 = HEAP32[$31>>2]|0;
   $33 = (($len) - ($32))|0;
   $$0 = $33;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _cleanup_282($p) {
 $p = $p|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($p)) + 68|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0);
 if ($2) {
  ___unlockfile($p);
 }
 return;
}
function _strcmp($l,$r) {
 $l = $l|0;
 $r = $r|0;
 var $$014 = 0, $$05 = 0, $$lcssa = 0, $$lcssa2 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond3 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[$l>>0]|0;
 $1 = HEAP8[$r>>0]|0;
 $2 = ($0<<24>>24)!=($1<<24>>24);
 $3 = ($0<<24>>24)==(0);
 $or$cond3 = $3 | $2;
 if ($or$cond3) {
  $$lcssa = $0;$$lcssa2 = $1;
 } else {
  $$014 = $l;$$05 = $r;
  while(1) {
   $4 = ((($$014)) + 1|0);
   $5 = ((($$05)) + 1|0);
   $6 = HEAP8[$4>>0]|0;
   $7 = HEAP8[$5>>0]|0;
   $8 = ($6<<24>>24)!=($7<<24>>24);
   $9 = ($6<<24>>24)==(0);
   $or$cond = $9 | $8;
   if ($or$cond) {
    $$lcssa = $6;$$lcssa2 = $7;
    break;
   } else {
    $$014 = $4;$$05 = $5;
   }
  }
 }
 $10 = $$lcssa&255;
 $11 = $$lcssa2&255;
 $12 = (($10) - ($11))|0;
 return ($12|0);
}
function _memchr($src,$c,$n) {
 $src = $src|0;
 $c = $c|0;
 $n = $n|0;
 var $$0$lcssa = 0, $$0$lcssa30 = 0, $$019 = 0, $$1$lcssa = 0, $$110 = 0, $$110$lcssa = 0, $$24 = 0, $$3 = 0, $$lcssa = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0;
 var $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0;
 var $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, $or$cond18 = 0, $s$0$lcssa = 0, $s$0$lcssa29 = 0, $s$020 = 0, $s$15 = 0, $s$2 = 0, $w$0$lcssa = 0, $w$011 = 0, $w$011$lcssa = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = $c & 255;
 $1 = $src;
 $2 = $1 & 3;
 $3 = ($2|0)!=(0);
 $4 = ($n|0)!=(0);
 $or$cond18 = $4 & $3;
 L1: do {
  if ($or$cond18) {
   $5 = $c&255;
   $$019 = $n;$s$020 = $src;
   while(1) {
    $6 = HEAP8[$s$020>>0]|0;
    $7 = ($6<<24>>24)==($5<<24>>24);
    if ($7) {
     $$0$lcssa30 = $$019;$s$0$lcssa29 = $s$020;
     label = 6;
     break L1;
    }
    $8 = ((($s$020)) + 1|0);
    $9 = (($$019) + -1)|0;
    $10 = $8;
    $11 = $10 & 3;
    $12 = ($11|0)!=(0);
    $13 = ($9|0)!=(0);
    $or$cond = $13 & $12;
    if ($or$cond) {
     $$019 = $9;$s$020 = $8;
    } else {
     $$0$lcssa = $9;$$lcssa = $13;$s$0$lcssa = $8;
     label = 5;
     break;
    }
   }
  } else {
   $$0$lcssa = $n;$$lcssa = $4;$s$0$lcssa = $src;
   label = 5;
  }
 } while(0);
 if ((label|0) == 5) {
  if ($$lcssa) {
   $$0$lcssa30 = $$0$lcssa;$s$0$lcssa29 = $s$0$lcssa;
   label = 6;
  } else {
   $$3 = 0;$s$2 = $s$0$lcssa;
  }
 }
 L8: do {
  if ((label|0) == 6) {
   $14 = HEAP8[$s$0$lcssa29>>0]|0;
   $15 = $c&255;
   $16 = ($14<<24>>24)==($15<<24>>24);
   if ($16) {
    $$3 = $$0$lcssa30;$s$2 = $s$0$lcssa29;
   } else {
    $17 = Math_imul($0, 16843009)|0;
    $18 = ($$0$lcssa30>>>0)>(3);
    L11: do {
     if ($18) {
      $$110 = $$0$lcssa30;$w$011 = $s$0$lcssa29;
      while(1) {
       $19 = HEAP32[$w$011>>2]|0;
       $20 = $19 ^ $17;
       $21 = (($20) + -16843009)|0;
       $22 = $20 & -2139062144;
       $23 = $22 ^ -2139062144;
       $24 = $23 & $21;
       $25 = ($24|0)==(0);
       if (!($25)) {
        $$110$lcssa = $$110;$w$011$lcssa = $w$011;
        break;
       }
       $26 = ((($w$011)) + 4|0);
       $27 = (($$110) + -4)|0;
       $28 = ($27>>>0)>(3);
       if ($28) {
        $$110 = $27;$w$011 = $26;
       } else {
        $$1$lcssa = $27;$w$0$lcssa = $26;
        label = 11;
        break L11;
       }
      }
      $$24 = $$110$lcssa;$s$15 = $w$011$lcssa;
     } else {
      $$1$lcssa = $$0$lcssa30;$w$0$lcssa = $s$0$lcssa29;
      label = 11;
     }
    } while(0);
    if ((label|0) == 11) {
     $29 = ($$1$lcssa|0)==(0);
     if ($29) {
      $$3 = 0;$s$2 = $w$0$lcssa;
      break;
     } else {
      $$24 = $$1$lcssa;$s$15 = $w$0$lcssa;
     }
    }
    while(1) {
     $30 = HEAP8[$s$15>>0]|0;
     $31 = ($30<<24>>24)==($15<<24>>24);
     if ($31) {
      $$3 = $$24;$s$2 = $s$15;
      break L8;
     }
     $32 = ((($s$15)) + 1|0);
     $33 = (($$24) + -1)|0;
     $34 = ($33|0)==(0);
     if ($34) {
      $$3 = 0;$s$2 = $32;
      break;
     } else {
      $$24 = $33;$s$15 = $32;
     }
    }
   }
  }
 } while(0);
 $35 = ($$3|0)!=(0);
 $36 = $35 ? $s$2 : 0;
 return ($36|0);
}
function _vfprintf($f,$fmt,$ap) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 var $$ = 0, $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $ap2 = 0, $internal_buf = 0, $nl_arg = 0, $nl_type = 0;
 var $ret$1 = 0, $ret$1$ = 0, $vacopy_currentptr = 0, dest = 0, label = 0, sp = 0, stop = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 224|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap2 = sp + 120|0;
 $nl_type = sp + 80|0;
 $nl_arg = sp;
 $internal_buf = sp + 136|0;
 dest=$nl_type; stop=dest+40|0; do { HEAP32[dest>>2]=0|0; dest=dest+4|0; } while ((dest|0) < (stop|0));
 $vacopy_currentptr = HEAP32[$ap>>2]|0;
 HEAP32[$ap2>>2] = $vacopy_currentptr;
 $0 = (_printf_core(0,$fmt,$ap2,$nl_arg,$nl_type)|0);
 $1 = ($0|0)<(0);
 if ($1) {
  $$0 = -1;
 } else {
  $2 = ((($f)) + 76|0);
  $3 = HEAP32[$2>>2]|0;
  $4 = ($3|0)>(-1);
  if ($4) {
   $5 = (___lockfile($f)|0);
   $32 = $5;
  } else {
   $32 = 0;
  }
  $6 = HEAP32[$f>>2]|0;
  $7 = $6 & 32;
  $8 = ((($f)) + 74|0);
  $9 = HEAP8[$8>>0]|0;
  $10 = ($9<<24>>24)<(1);
  if ($10) {
   $11 = $6 & -33;
   HEAP32[$f>>2] = $11;
  }
  $12 = ((($f)) + 48|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($13|0)==(0);
  if ($14) {
   $16 = ((($f)) + 44|0);
   $17 = HEAP32[$16>>2]|0;
   HEAP32[$16>>2] = $internal_buf;
   $18 = ((($f)) + 28|0);
   HEAP32[$18>>2] = $internal_buf;
   $19 = ((($f)) + 20|0);
   HEAP32[$19>>2] = $internal_buf;
   HEAP32[$12>>2] = 80;
   $20 = ((($internal_buf)) + 80|0);
   $21 = ((($f)) + 16|0);
   HEAP32[$21>>2] = $20;
   $22 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $23 = ($17|0)==(0|0);
   if ($23) {
    $ret$1 = $22;
   } else {
    $24 = ((($f)) + 36|0);
    $25 = HEAP32[$24>>2]|0;
    (FUNCTION_TABLE_iiii[$25 & 15]($f,0,0)|0);
    $26 = HEAP32[$19>>2]|0;
    $27 = ($26|0)==(0|0);
    $$ = $27 ? -1 : $22;
    HEAP32[$16>>2] = $17;
    HEAP32[$12>>2] = 0;
    HEAP32[$21>>2] = 0;
    HEAP32[$18>>2] = 0;
    HEAP32[$19>>2] = 0;
    $ret$1 = $$;
   }
  } else {
   $15 = (_printf_core($f,$fmt,$ap2,$nl_arg,$nl_type)|0);
   $ret$1 = $15;
  }
  $28 = HEAP32[$f>>2]|0;
  $29 = $28 & 32;
  $30 = ($29|0)==(0);
  $ret$1$ = $30 ? $ret$1 : -1;
  $31 = $28 | $7;
  HEAP32[$f>>2] = $31;
  $33 = ($32|0)==(0);
  if (!($33)) {
   ___unlockfile($f);
  }
  $$0 = $ret$1$;
 }
 STACKTOP = sp;return ($$0|0);
}
function _printf_core($f,$fmt,$ap,$nl_arg,$nl_type) {
 $f = $f|0;
 $fmt = $fmt|0;
 $ap = $ap|0;
 $nl_arg = $nl_arg|0;
 $nl_type = $nl_type|0;
 var $$ = 0, $$$i = 0, $$0 = 0, $$0$i = 0, $$0$lcssa$i = 0, $$012$i = 0, $$013$i = 0, $$03$i33 = 0, $$07$i = 0.0, $$1$i = 0.0, $$114$i = 0, $$2$i = 0.0, $$20$i = 0.0, $$210$$24$i = 0, $$210$$26$i = 0, $$210$i = 0, $$23$i = 0, $$25$i = 0, $$3$i = 0.0, $$311$i = 0;
 var $$33$i = 0, $$36$i = 0.0, $$4$i = 0.0, $$412$lcssa$i = 0, $$41278$i = 0, $$43 = 0, $$5$lcssa$i = 0, $$589$i = 0, $$a$3$i = 0, $$a$3191$i = 0, $$a$3192$i = 0, $$fl$4 = 0, $$l10n$0 = 0, $$lcssa = 0, $$lcssa162$i = 0, $$lcssa295 = 0, $$lcssa300 = 0, $$lcssa301 = 0, $$lcssa302 = 0, $$lcssa303 = 0;
 var $$lcssa304 = 0, $$lcssa306 = 0, $$lcssa316 = 0, $$lcssa319 = 0.0, $$lcssa321 = 0, $$neg55$i = 0, $$neg56$i = 0, $$p$$i = 0, $$p$5 = 0, $$p$i = 0, $$pn$i = 0, $$pr$i = 0, $$pr50$i = 0, $$pre = 0, $$pre$i = 0, $$pre$phi190$iZ2D = 0, $$pre170 = 0, $$pre171 = 0, $$pre185$i = 0, $$pre188$i = 0;
 var $$pre189$i = 0, $$z$3$i = 0, $$z$4$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0;
 var $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0;
 var $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0;
 var $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0;
 var $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0;
 var $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0;
 var $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0;
 var $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0;
 var $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0;
 var $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0;
 var $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0;
 var $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0;
 var $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0, $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0;
 var $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0, $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0;
 var $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0, $358 = 0.0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0.0, $363 = 0, $364 = 0, $365 = 0;
 var $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0, $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0;
 var $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0.0, $391 = 0.0, $392 = 0, $393 = 0, $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0;
 var $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0.0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0.0, $411 = 0.0, $412 = 0.0, $413 = 0.0, $414 = 0.0, $415 = 0.0, $416 = 0, $417 = 0, $418 = 0, $419 = 0;
 var $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0, $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0;
 var $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0.0, $442 = 0.0, $443 = 0.0, $444 = 0, $445 = 0, $446 = 0, $447 = 0, $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0;
 var $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0, $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0;
 var $474 = 0.0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0.0, $483 = 0.0, $484 = 0.0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0;
 var $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0, $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0;
 var $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0, $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0;
 var $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0, $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0;
 var $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0, $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0;
 var $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0, $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0;
 var $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0, $592 = 0, $593 = 0.0, $594 = 0.0, $595 = 0, $596 = 0.0, $597 = 0, $598 = 0, $599 = 0, $6 = 0;
 var $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0, $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0;
 var $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0, $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0;
 var $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0, $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0;
 var $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0, $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0;
 var $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0, $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0;
 var $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0, $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0;
 var $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0, $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0;
 var $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0, $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0;
 var $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0, $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0;
 var $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0, $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0;
 var $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0, $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $a$0 = 0, $a$1 = 0, $a$1$lcssa$i = 0, $a$1149$i = 0, $a$2 = 0, $a$2$ph$i = 0, $a$3$lcssa$i = 0, $a$3136$i = 0, $a$5$lcssa$i = 0, $a$5111$i = 0, $a$6$i = 0, $a$8$i = 0, $a$9$ph$i = 0, $arg = 0, $arglist_current = 0, $arglist_current2 = 0, $arglist_next = 0, $arglist_next3 = 0;
 var $argpos$0 = 0, $big$i = 0, $buf = 0, $buf$i = 0, $carry$0142$i = 0, $carry3$0130$i = 0, $cnt$0 = 0, $cnt$1 = 0, $cnt$1$lcssa = 0, $d$0$i = 0, $d$0141$i = 0, $d$0143$i = 0, $d$1129$i = 0, $d$2$lcssa$i = 0, $d$2110$i = 0, $d$4$i = 0, $d$584$i = 0, $d$677$i = 0, $d$788$i = 0, $e$0125$i = 0;
 var $e$1$i = 0, $e$2106$i = 0, $e$4$i = 0, $e$5$ph$i = 0, $e2$i = 0, $ebuf0$i = 0, $estr$0$i = 0, $estr$1$lcssa$i = 0, $estr$195$i = 0, $estr$2$i = 0, $exitcond$i = 0, $expanded = 0, $expanded10 = 0, $expanded11 = 0, $expanded13 = 0, $expanded14 = 0, $expanded15 = 0, $expanded4 = 0, $expanded6 = 0, $expanded7 = 0;
 var $expanded8 = 0, $fl$0100 = 0, $fl$053 = 0, $fl$1 = 0, $fl$1$ = 0, $fl$3 = 0, $fl$4 = 0, $fl$6 = 0, $i$0$lcssa = 0, $i$0$lcssa178 = 0, $i$0105 = 0, $i$0124$i = 0, $i$03$i = 0, $i$03$i25 = 0, $i$1$lcssa$i = 0, $i$1116 = 0, $i$1118$i = 0, $i$2105$i = 0, $i$291 = 0, $i$291$lcssa = 0;
 var $i$3101$i = 0, $i$389 = 0, $isdigit = 0, $isdigit$i = 0, $isdigit$i27 = 0, $isdigit10 = 0, $isdigit12 = 0, $isdigit2$i = 0, $isdigit2$i23 = 0, $isdigittmp = 0, $isdigittmp$ = 0, $isdigittmp$i = 0, $isdigittmp$i26 = 0, $isdigittmp1$i = 0, $isdigittmp1$i22 = 0, $isdigittmp11 = 0, $isdigittmp4$i = 0, $isdigittmp4$i24 = 0, $isdigittmp9 = 0, $j$0$i = 0;
 var $j$0117$i = 0, $j$0119$i = 0, $j$1102$i = 0, $j$2$i = 0, $l$0 = 0, $l$0$i = 0, $l$1$i = 0, $l$1104 = 0, $l$2 = 0, $l10n$0 = 0, $l10n$0$lcssa = 0, $l10n$0$phi = 0, $l10n$1 = 0, $l10n$2 = 0, $l10n$3 = 0, $mb = 0, $notlhs$i = 0, $notrhs$i = 0, $or$cond = 0, $or$cond$i = 0;
 var $or$cond122 = 0, $or$cond15 = 0, $or$cond17 = 0, $or$cond18$i = 0, $or$cond20 = 0, $or$cond22$i = 0, $or$cond3$not$i = 0, $or$cond31$i = 0, $or$cond6$i = 0, $p$0 = 0, $p$0$ = 0, $p$1 = 0, $p$2 = 0, $p$2$ = 0, $p$3 = 0, $p$4176 = 0, $p$5 = 0, $pl$0 = 0, $pl$0$i = 0, $pl$1 = 0;
 var $pl$1$i = 0, $pl$2 = 0, $prefix$0 = 0, $prefix$0$$i = 0, $prefix$0$i = 0, $prefix$1 = 0, $prefix$2 = 0, $r$0$a$9$i = 0, $re$171$i = 0, $round$070$i = 0.0, $round6$1$i = 0.0, $s$0 = 0, $s$0$i = 0, $s$1 = 0, $s$1$i = 0, $s$1$i$lcssa = 0, $s$2$lcssa = 0, $s$292 = 0, $s$4 = 0, $s$6 = 0;
 var $s$7 = 0, $s$7$lcssa298 = 0, $s1$0$i = 0, $s7$081$i = 0, $s7$1$i = 0, $s8$0$lcssa$i = 0, $s8$072$i = 0, $s9$0$i = 0, $s9$185$i = 0, $s9$2$i = 0, $scevgep182$i = 0, $scevgep182183$i = 0, $small$0$i = 0.0, $small$1$i = 0.0, $st$0 = 0, $st$0$lcssa299 = 0, $storemerge = 0, $storemerge13 = 0, $storemerge851 = 0, $storemerge899 = 0;
 var $sum = 0, $t$0 = 0, $t$1 = 0, $w$$i = 0, $w$0 = 0, $w$1 = 0, $w$2 = 0, $w$32$i = 0, $wc = 0, $ws$0106 = 0, $ws$1117 = 0, $z$0$i = 0, $z$0$lcssa = 0, $z$093 = 0, $z$1 = 0, $z$1$lcssa$i = 0, $z$1148$i = 0, $z$2 = 0, $z$2$i = 0, $z$2$i$lcssa = 0;
 var $z$3$lcssa$i = 0, $z$3135$i = 0, $z$4$i = 0, $z$7$$i = 0, $z$7$i = 0, $z$7$i$lcssa = 0, $z$7$ph$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 624|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $big$i = sp + 24|0;
 $e2$i = sp + 16|0;
 $buf$i = sp + 588|0;
 $ebuf0$i = sp + 576|0;
 $arg = sp;
 $buf = sp + 536|0;
 $wc = sp + 8|0;
 $mb = sp + 528|0;
 $0 = ($f|0)!=(0|0);
 $1 = ((($buf)) + 40|0);
 $2 = $1;
 $3 = ((($buf)) + 39|0);
 $4 = ((($wc)) + 4|0);
 $5 = $buf$i;
 $6 = (0 - ($5))|0;
 $7 = ((($ebuf0$i)) + 12|0);
 $8 = ((($ebuf0$i)) + 11|0);
 $9 = $7;
 $10 = (($9) - ($5))|0;
 $11 = (-2 - ($5))|0;
 $12 = (($9) + 2)|0;
 $13 = ((($big$i)) + 288|0);
 $14 = ((($buf$i)) + 9|0);
 $15 = $14;
 $16 = ((($buf$i)) + 8|0);
 $cnt$0 = 0;$l$0 = 0;$l10n$0 = 0;$s$0 = $fmt;
 L1: while(1) {
  $17 = ($cnt$0|0)>(-1);
  do {
   if ($17) {
    $18 = (2147483647 - ($cnt$0))|0;
    $19 = ($l$0|0)>($18|0);
    if ($19) {
     $20 = (___errno_location()|0);
     HEAP32[$20>>2] = 75;
     $cnt$1 = -1;
     break;
    } else {
     $21 = (($l$0) + ($cnt$0))|0;
     $cnt$1 = $21;
     break;
    }
   } else {
    $cnt$1 = $cnt$0;
   }
  } while(0);
  $22 = HEAP8[$s$0>>0]|0;
  $23 = ($22<<24>>24)==(0);
  if ($23) {
   $cnt$1$lcssa = $cnt$1;$l10n$0$lcssa = $l10n$0;
   label = 244;
   break;
  } else {
   $24 = $22;$s$1 = $s$0;
  }
  L9: while(1) {
   switch ($24<<24>>24) {
   case 37:  {
    $s$292 = $s$1;$z$093 = $s$1;
    label = 9;
    break L9;
    break;
   }
   case 0:  {
    $s$2$lcssa = $s$1;$z$0$lcssa = $s$1;
    break L9;
    break;
   }
   default: {
   }
   }
   $25 = ((($s$1)) + 1|0);
   $$pre = HEAP8[$25>>0]|0;
   $24 = $$pre;$s$1 = $25;
  }
  L12: do {
   if ((label|0) == 9) {
    while(1) {
     label = 0;
     $26 = ((($s$292)) + 1|0);
     $27 = HEAP8[$26>>0]|0;
     $28 = ($27<<24>>24)==(37);
     if (!($28)) {
      $s$2$lcssa = $s$292;$z$0$lcssa = $z$093;
      break L12;
     }
     $29 = ((($z$093)) + 1|0);
     $30 = ((($s$292)) + 2|0);
     $31 = HEAP8[$30>>0]|0;
     $32 = ($31<<24>>24)==(37);
     if ($32) {
      $s$292 = $30;$z$093 = $29;
      label = 9;
     } else {
      $s$2$lcssa = $30;$z$0$lcssa = $29;
      break;
     }
    }
   }
  } while(0);
  $33 = $z$0$lcssa;
  $34 = $s$0;
  $35 = (($33) - ($34))|0;
  if ($0) {
   $36 = HEAP32[$f>>2]|0;
   $37 = $36 & 32;
   $38 = ($37|0)==(0);
   if ($38) {
    (___fwritex($s$0,$35,$f)|0);
   }
  }
  $39 = ($z$0$lcssa|0)==($s$0|0);
  if (!($39)) {
   $l10n$0$phi = $l10n$0;$cnt$0 = $cnt$1;$l$0 = $35;$s$0 = $s$2$lcssa;$l10n$0 = $l10n$0$phi;
   continue;
  }
  $40 = ((($s$2$lcssa)) + 1|0);
  $41 = HEAP8[$40>>0]|0;
  $42 = $41 << 24 >> 24;
  $isdigittmp = (($42) + -48)|0;
  $isdigit = ($isdigittmp>>>0)<(10);
  if ($isdigit) {
   $43 = ((($s$2$lcssa)) + 2|0);
   $44 = HEAP8[$43>>0]|0;
   $45 = ($44<<24>>24)==(36);
   $46 = ((($s$2$lcssa)) + 3|0);
   $$43 = $45 ? $46 : $40;
   $$l10n$0 = $45 ? 1 : $l10n$0;
   $isdigittmp$ = $45 ? $isdigittmp : -1;
   $$pre170 = HEAP8[$$43>>0]|0;
   $48 = $$pre170;$argpos$0 = $isdigittmp$;$l10n$1 = $$l10n$0;$storemerge = $$43;
  } else {
   $48 = $41;$argpos$0 = -1;$l10n$1 = $l10n$0;$storemerge = $40;
  }
  $47 = $48 << 24 >> 24;
  $49 = $47 & -32;
  $50 = ($49|0)==(32);
  L25: do {
   if ($50) {
    $52 = $47;$57 = $48;$fl$0100 = 0;$storemerge899 = $storemerge;
    while(1) {
     $51 = (($52) + -32)|0;
     $53 = 1 << $51;
     $54 = $53 & 75913;
     $55 = ($54|0)==(0);
     if ($55) {
      $66 = $57;$fl$053 = $fl$0100;$storemerge851 = $storemerge899;
      break L25;
     }
     $56 = $57 << 24 >> 24;
     $58 = (($56) + -32)|0;
     $59 = 1 << $58;
     $60 = $59 | $fl$0100;
     $61 = ((($storemerge899)) + 1|0);
     $62 = HEAP8[$61>>0]|0;
     $63 = $62 << 24 >> 24;
     $64 = $63 & -32;
     $65 = ($64|0)==(32);
     if ($65) {
      $52 = $63;$57 = $62;$fl$0100 = $60;$storemerge899 = $61;
     } else {
      $66 = $62;$fl$053 = $60;$storemerge851 = $61;
      break;
     }
    }
   } else {
    $66 = $48;$fl$053 = 0;$storemerge851 = $storemerge;
   }
  } while(0);
  $67 = ($66<<24>>24)==(42);
  do {
   if ($67) {
    $68 = ((($storemerge851)) + 1|0);
    $69 = HEAP8[$68>>0]|0;
    $70 = $69 << 24 >> 24;
    $isdigittmp11 = (($70) + -48)|0;
    $isdigit12 = ($isdigittmp11>>>0)<(10);
    if ($isdigit12) {
     $71 = ((($storemerge851)) + 2|0);
     $72 = HEAP8[$71>>0]|0;
     $73 = ($72<<24>>24)==(36);
     if ($73) {
      $74 = (($nl_type) + ($isdigittmp11<<2)|0);
      HEAP32[$74>>2] = 10;
      $75 = HEAP8[$68>>0]|0;
      $76 = $75 << 24 >> 24;
      $77 = (($76) + -48)|0;
      $78 = (($nl_arg) + ($77<<3)|0);
      $79 = $78;
      $80 = $79;
      $81 = HEAP32[$80>>2]|0;
      $82 = (($79) + 4)|0;
      $83 = $82;
      $84 = HEAP32[$83>>2]|0;
      $85 = ((($storemerge851)) + 3|0);
      $l10n$2 = 1;$storemerge13 = $85;$w$0 = $81;
     } else {
      label = 24;
     }
    } else {
     label = 24;
    }
    if ((label|0) == 24) {
     label = 0;
     $86 = ($l10n$1|0)==(0);
     if (!($86)) {
      $$0 = -1;
      break L1;
     }
     if (!($0)) {
      $fl$1 = $fl$053;$l10n$3 = 0;$s$4 = $68;$w$1 = 0;
      break;
     }
     $arglist_current = HEAP32[$ap>>2]|0;
     $87 = $arglist_current;
     $88 = ((0) + 4|0);
     $expanded4 = $88;
     $expanded = (($expanded4) - 1)|0;
     $89 = (($87) + ($expanded))|0;
     $90 = ((0) + 4|0);
     $expanded8 = $90;
     $expanded7 = (($expanded8) - 1)|0;
     $expanded6 = $expanded7 ^ -1;
     $91 = $89 & $expanded6;
     $92 = $91;
     $93 = HEAP32[$92>>2]|0;
     $arglist_next = ((($92)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     $l10n$2 = 0;$storemerge13 = $68;$w$0 = $93;
    }
    $94 = ($w$0|0)<(0);
    if ($94) {
     $95 = $fl$053 | 8192;
     $96 = (0 - ($w$0))|0;
     $fl$1 = $95;$l10n$3 = $l10n$2;$s$4 = $storemerge13;$w$1 = $96;
    } else {
     $fl$1 = $fl$053;$l10n$3 = $l10n$2;$s$4 = $storemerge13;$w$1 = $w$0;
    }
   } else {
    $97 = $66 << 24 >> 24;
    $isdigittmp1$i = (($97) + -48)|0;
    $isdigit2$i = ($isdigittmp1$i>>>0)<(10);
    if ($isdigit2$i) {
     $101 = $storemerge851;$i$03$i = 0;$isdigittmp4$i = $isdigittmp1$i;
     while(1) {
      $98 = ($i$03$i*10)|0;
      $99 = (($98) + ($isdigittmp4$i))|0;
      $100 = ((($101)) + 1|0);
      $102 = HEAP8[$100>>0]|0;
      $103 = $102 << 24 >> 24;
      $isdigittmp$i = (($103) + -48)|0;
      $isdigit$i = ($isdigittmp$i>>>0)<(10);
      if ($isdigit$i) {
       $101 = $100;$i$03$i = $99;$isdigittmp4$i = $isdigittmp$i;
      } else {
       $$lcssa = $99;$$lcssa295 = $100;
       break;
      }
     }
     $104 = ($$lcssa|0)<(0);
     if ($104) {
      $$0 = -1;
      break L1;
     } else {
      $fl$1 = $fl$053;$l10n$3 = $l10n$1;$s$4 = $$lcssa295;$w$1 = $$lcssa;
     }
    } else {
     $fl$1 = $fl$053;$l10n$3 = $l10n$1;$s$4 = $storemerge851;$w$1 = 0;
    }
   }
  } while(0);
  $105 = HEAP8[$s$4>>0]|0;
  $106 = ($105<<24>>24)==(46);
  L46: do {
   if ($106) {
    $107 = ((($s$4)) + 1|0);
    $108 = HEAP8[$107>>0]|0;
    $109 = ($108<<24>>24)==(42);
    if (!($109)) {
     $136 = $108 << 24 >> 24;
     $isdigittmp1$i22 = (($136) + -48)|0;
     $isdigit2$i23 = ($isdigittmp1$i22>>>0)<(10);
     if ($isdigit2$i23) {
      $140 = $107;$i$03$i25 = 0;$isdigittmp4$i24 = $isdigittmp1$i22;
     } else {
      $p$0 = 0;$s$6 = $107;
      break;
     }
     while(1) {
      $137 = ($i$03$i25*10)|0;
      $138 = (($137) + ($isdigittmp4$i24))|0;
      $139 = ((($140)) + 1|0);
      $141 = HEAP8[$139>>0]|0;
      $142 = $141 << 24 >> 24;
      $isdigittmp$i26 = (($142) + -48)|0;
      $isdigit$i27 = ($isdigittmp$i26>>>0)<(10);
      if ($isdigit$i27) {
       $140 = $139;$i$03$i25 = $138;$isdigittmp4$i24 = $isdigittmp$i26;
      } else {
       $p$0 = $138;$s$6 = $139;
       break L46;
      }
     }
    }
    $110 = ((($s$4)) + 2|0);
    $111 = HEAP8[$110>>0]|0;
    $112 = $111 << 24 >> 24;
    $isdigittmp9 = (($112) + -48)|0;
    $isdigit10 = ($isdigittmp9>>>0)<(10);
    if ($isdigit10) {
     $113 = ((($s$4)) + 3|0);
     $114 = HEAP8[$113>>0]|0;
     $115 = ($114<<24>>24)==(36);
     if ($115) {
      $116 = (($nl_type) + ($isdigittmp9<<2)|0);
      HEAP32[$116>>2] = 10;
      $117 = HEAP8[$110>>0]|0;
      $118 = $117 << 24 >> 24;
      $119 = (($118) + -48)|0;
      $120 = (($nl_arg) + ($119<<3)|0);
      $121 = $120;
      $122 = $121;
      $123 = HEAP32[$122>>2]|0;
      $124 = (($121) + 4)|0;
      $125 = $124;
      $126 = HEAP32[$125>>2]|0;
      $127 = ((($s$4)) + 4|0);
      $p$0 = $123;$s$6 = $127;
      break;
     }
    }
    $128 = ($l10n$3|0)==(0);
    if (!($128)) {
     $$0 = -1;
     break L1;
    }
    if ($0) {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $129 = $arglist_current2;
     $130 = ((0) + 4|0);
     $expanded11 = $130;
     $expanded10 = (($expanded11) - 1)|0;
     $131 = (($129) + ($expanded10))|0;
     $132 = ((0) + 4|0);
     $expanded15 = $132;
     $expanded14 = (($expanded15) - 1)|0;
     $expanded13 = $expanded14 ^ -1;
     $133 = $131 & $expanded13;
     $134 = $133;
     $135 = HEAP32[$134>>2]|0;
     $arglist_next3 = ((($134)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $p$0 = $135;$s$6 = $110;
    } else {
     $p$0 = 0;$s$6 = $110;
    }
   } else {
    $p$0 = -1;$s$6 = $s$4;
   }
  } while(0);
  $s$7 = $s$6;$st$0 = 0;
  while(1) {
   $143 = HEAP8[$s$7>>0]|0;
   $144 = $143 << 24 >> 24;
   $145 = (($144) + -65)|0;
   $146 = ($145>>>0)>(57);
   if ($146) {
    $$0 = -1;
    break L1;
   }
   $147 = ((($s$7)) + 1|0);
   $148 = ((4889 + (($st$0*58)|0)|0) + ($145)|0);
   $149 = HEAP8[$148>>0]|0;
   $150 = $149&255;
   $151 = (($150) + -1)|0;
   $152 = ($151>>>0)<(8);
   if ($152) {
    $s$7 = $147;$st$0 = $150;
   } else {
    $$lcssa300 = $147;$$lcssa301 = $149;$$lcssa302 = $150;$s$7$lcssa298 = $s$7;$st$0$lcssa299 = $st$0;
    break;
   }
  }
  $153 = ($$lcssa301<<24>>24)==(0);
  if ($153) {
   $$0 = -1;
   break;
  }
  $154 = ($$lcssa301<<24>>24)==(19);
  $155 = ($argpos$0|0)>(-1);
  do {
   if ($154) {
    if ($155) {
     $$0 = -1;
     break L1;
    } else {
     label = 52;
    }
   } else {
    if ($155) {
     $156 = (($nl_type) + ($argpos$0<<2)|0);
     HEAP32[$156>>2] = $$lcssa302;
     $157 = (($nl_arg) + ($argpos$0<<3)|0);
     $158 = $157;
     $159 = $158;
     $160 = HEAP32[$159>>2]|0;
     $161 = (($158) + 4)|0;
     $162 = $161;
     $163 = HEAP32[$162>>2]|0;
     $164 = $arg;
     $165 = $164;
     HEAP32[$165>>2] = $160;
     $166 = (($164) + 4)|0;
     $167 = $166;
     HEAP32[$167>>2] = $163;
     label = 52;
     break;
    }
    if (!($0)) {
     $$0 = 0;
     break L1;
    }
    _pop_arg_345($arg,$$lcssa302,$ap);
   }
  } while(0);
  if ((label|0) == 52) {
   label = 0;
   if (!($0)) {
    $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
    continue;
   }
  }
  $168 = HEAP8[$s$7$lcssa298>>0]|0;
  $169 = $168 << 24 >> 24;
  $170 = ($st$0$lcssa299|0)!=(0);
  $171 = $169 & 15;
  $172 = ($171|0)==(3);
  $or$cond15 = $170 & $172;
  $173 = $169 & -33;
  $t$0 = $or$cond15 ? $173 : $169;
  $174 = $fl$1 & 8192;
  $175 = ($174|0)==(0);
  $176 = $fl$1 & -65537;
  $fl$1$ = $175 ? $fl$1 : $176;
  L75: do {
   switch ($t$0|0) {
   case 110:  {
    switch ($st$0$lcssa299|0) {
    case 0:  {
     $183 = HEAP32[$arg>>2]|0;
     HEAP32[$183>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 1:  {
     $184 = HEAP32[$arg>>2]|0;
     HEAP32[$184>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 2:  {
     $185 = ($cnt$1|0)<(0);
     $186 = $185 << 31 >> 31;
     $187 = HEAP32[$arg>>2]|0;
     $188 = $187;
     $189 = $188;
     HEAP32[$189>>2] = $cnt$1;
     $190 = (($188) + 4)|0;
     $191 = $190;
     HEAP32[$191>>2] = $186;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 3:  {
     $192 = $cnt$1&65535;
     $193 = HEAP32[$arg>>2]|0;
     HEAP16[$193>>1] = $192;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 4:  {
     $194 = $cnt$1&255;
     $195 = HEAP32[$arg>>2]|0;
     HEAP8[$195>>0] = $194;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 6:  {
     $196 = HEAP32[$arg>>2]|0;
     HEAP32[$196>>2] = $cnt$1;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    case 7:  {
     $197 = ($cnt$1|0)<(0);
     $198 = $197 << 31 >> 31;
     $199 = HEAP32[$arg>>2]|0;
     $200 = $199;
     $201 = $200;
     HEAP32[$201>>2] = $cnt$1;
     $202 = (($200) + 4)|0;
     $203 = $202;
     HEAP32[$203>>2] = $198;
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
     break;
    }
    default: {
     $cnt$0 = $cnt$1;$l$0 = $35;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
     continue L1;
    }
    }
    break;
   }
   case 112:  {
    $204 = ($p$0>>>0)>(8);
    $205 = $204 ? $p$0 : 8;
    $206 = $fl$1$ | 8;
    $fl$3 = $206;$p$1 = $205;$t$1 = 120;
    label = 64;
    break;
   }
   case 88: case 120:  {
    $fl$3 = $fl$1$;$p$1 = $p$0;$t$1 = $t$0;
    label = 64;
    break;
   }
   case 111:  {
    $244 = $arg;
    $245 = $244;
    $246 = HEAP32[$245>>2]|0;
    $247 = (($244) + 4)|0;
    $248 = $247;
    $249 = HEAP32[$248>>2]|0;
    $250 = ($246|0)==(0);
    $251 = ($249|0)==(0);
    $252 = $250 & $251;
    if ($252) {
     $$0$lcssa$i = $1;
    } else {
     $$03$i33 = $1;$254 = $246;$258 = $249;
     while(1) {
      $253 = $254 & 7;
      $255 = $253 | 48;
      $256 = $255&255;
      $257 = ((($$03$i33)) + -1|0);
      HEAP8[$257>>0] = $256;
      $259 = (_bitshift64Lshr(($254|0),($258|0),3)|0);
      $260 = tempRet0;
      $261 = ($259|0)==(0);
      $262 = ($260|0)==(0);
      $263 = $261 & $262;
      if ($263) {
       $$0$lcssa$i = $257;
       break;
      } else {
       $$03$i33 = $257;$254 = $259;$258 = $260;
      }
     }
    }
    $264 = $fl$1$ & 8;
    $265 = ($264|0)==(0);
    if ($265) {
     $a$0 = $$0$lcssa$i;$fl$4 = $fl$1$;$p$2 = $p$0;$pl$1 = 0;$prefix$1 = 5369;
     label = 77;
    } else {
     $266 = $$0$lcssa$i;
     $267 = (($2) - ($266))|0;
     $268 = ($p$0|0)>($267|0);
     $269 = (($267) + 1)|0;
     $p$0$ = $268 ? $p$0 : $269;
     $a$0 = $$0$lcssa$i;$fl$4 = $fl$1$;$p$2 = $p$0$;$pl$1 = 0;$prefix$1 = 5369;
     label = 77;
    }
    break;
   }
   case 105: case 100:  {
    $270 = $arg;
    $271 = $270;
    $272 = HEAP32[$271>>2]|0;
    $273 = (($270) + 4)|0;
    $274 = $273;
    $275 = HEAP32[$274>>2]|0;
    $276 = ($275|0)<(0);
    if ($276) {
     $277 = (_i64Subtract(0,0,($272|0),($275|0))|0);
     $278 = tempRet0;
     $279 = $arg;
     $280 = $279;
     HEAP32[$280>>2] = $277;
     $281 = (($279) + 4)|0;
     $282 = $281;
     HEAP32[$282>>2] = $278;
     $287 = $277;$288 = $278;$pl$0 = 1;$prefix$0 = 5369;
     label = 76;
     break L75;
    }
    $283 = $fl$1$ & 2048;
    $284 = ($283|0)==(0);
    if ($284) {
     $285 = $fl$1$ & 1;
     $286 = ($285|0)==(0);
     $$ = $286 ? 5369 : (5371);
     $287 = $272;$288 = $275;$pl$0 = $285;$prefix$0 = $$;
     label = 76;
    } else {
     $287 = $272;$288 = $275;$pl$0 = 1;$prefix$0 = (5370);
     label = 76;
    }
    break;
   }
   case 117:  {
    $177 = $arg;
    $178 = $177;
    $179 = HEAP32[$178>>2]|0;
    $180 = (($177) + 4)|0;
    $181 = $180;
    $182 = HEAP32[$181>>2]|0;
    $287 = $179;$288 = $182;$pl$0 = 0;$prefix$0 = 5369;
    label = 76;
    break;
   }
   case 99:  {
    $308 = $arg;
    $309 = $308;
    $310 = HEAP32[$309>>2]|0;
    $311 = (($308) + 4)|0;
    $312 = $311;
    $313 = HEAP32[$312>>2]|0;
    $314 = $310&255;
    HEAP8[$3>>0] = $314;
    $a$2 = $3;$fl$6 = $176;$p$5 = 1;$pl$2 = 0;$prefix$2 = 5369;$z$2 = $1;
    break;
   }
   case 109:  {
    $315 = (___errno_location()|0);
    $316 = HEAP32[$315>>2]|0;
    $317 = (_strerror($316)|0);
    $a$1 = $317;
    label = 82;
    break;
   }
   case 115:  {
    $318 = HEAP32[$arg>>2]|0;
    $319 = ($318|0)!=(0|0);
    $320 = $319 ? $318 : 7271;
    $a$1 = $320;
    label = 82;
    break;
   }
   case 67:  {
    $327 = $arg;
    $328 = $327;
    $329 = HEAP32[$328>>2]|0;
    $330 = (($327) + 4)|0;
    $331 = $330;
    $332 = HEAP32[$331>>2]|0;
    HEAP32[$wc>>2] = $329;
    HEAP32[$4>>2] = 0;
    HEAP32[$arg>>2] = $wc;
    $798 = $wc;$p$4176 = -1;
    label = 86;
    break;
   }
   case 83:  {
    $$pre171 = HEAP32[$arg>>2]|0;
    $333 = ($p$0|0)==(0);
    if ($333) {
     _pad($f,32,$w$1,0,$fl$1$);
     $i$0$lcssa178 = 0;
     label = 97;
    } else {
     $798 = $$pre171;$p$4176 = $p$0;
     label = 86;
    }
    break;
   }
   case 65: case 71: case 70: case 69: case 97: case 103: case 102: case 101:  {
    $358 = +HEAPF64[$arg>>3];
    HEAP32[$e2$i>>2] = 0;
    HEAPF64[tempDoublePtr>>3] = $358;$359 = HEAP32[tempDoublePtr>>2]|0;
    $360 = HEAP32[tempDoublePtr+4>>2]|0;
    $361 = ($360|0)<(0);
    if ($361) {
     $362 = -$358;
     $$07$i = $362;$pl$0$i = 1;$prefix$0$i = 7278;
    } else {
     $363 = $fl$1$ & 2048;
     $364 = ($363|0)==(0);
     if ($364) {
      $365 = $fl$1$ & 1;
      $366 = ($365|0)==(0);
      $$$i = $366 ? (7279) : (7284);
      $$07$i = $358;$pl$0$i = $365;$prefix$0$i = $$$i;
     } else {
      $$07$i = $358;$pl$0$i = 1;$prefix$0$i = (7281);
     }
    }
    HEAPF64[tempDoublePtr>>3] = $$07$i;$367 = HEAP32[tempDoublePtr>>2]|0;
    $368 = HEAP32[tempDoublePtr+4>>2]|0;
    $369 = $368 & 2146435072;
    $370 = ($369>>>0)<(2146435072);
    $371 = (0)<(0);
    $372 = ($369|0)==(2146435072);
    $373 = $372 & $371;
    $374 = $370 | $373;
    do {
     if ($374) {
      $390 = (+_frexpl($$07$i,$e2$i));
      $391 = $390 * 2.0;
      $392 = $391 != 0.0;
      if ($392) {
       $393 = HEAP32[$e2$i>>2]|0;
       $394 = (($393) + -1)|0;
       HEAP32[$e2$i>>2] = $394;
      }
      $395 = $t$0 | 32;
      $396 = ($395|0)==(97);
      if ($396) {
       $397 = $t$0 & 32;
       $398 = ($397|0)==(0);
       $399 = ((($prefix$0$i)) + 9|0);
       $prefix$0$$i = $398 ? $prefix$0$i : $399;
       $400 = $pl$0$i | 2;
       $401 = ($p$0>>>0)>(11);
       $402 = (12 - ($p$0))|0;
       $403 = ($402|0)==(0);
       $404 = $401 | $403;
       do {
        if ($404) {
         $$1$i = $391;
        } else {
         $re$171$i = $402;$round$070$i = 8.0;
         while(1) {
          $405 = (($re$171$i) + -1)|0;
          $406 = $round$070$i * 16.0;
          $407 = ($405|0)==(0);
          if ($407) {
           $$lcssa319 = $406;
           break;
          } else {
           $re$171$i = $405;$round$070$i = $406;
          }
         }
         $408 = HEAP8[$prefix$0$$i>>0]|0;
         $409 = ($408<<24>>24)==(45);
         if ($409) {
          $410 = -$391;
          $411 = $410 - $$lcssa319;
          $412 = $$lcssa319 + $411;
          $413 = -$412;
          $$1$i = $413;
          break;
         } else {
          $414 = $391 + $$lcssa319;
          $415 = $414 - $$lcssa319;
          $$1$i = $415;
          break;
         }
        }
       } while(0);
       $416 = HEAP32[$e2$i>>2]|0;
       $417 = ($416|0)<(0);
       $418 = (0 - ($416))|0;
       $419 = $417 ? $418 : $416;
       $420 = ($419|0)<(0);
       $421 = $420 << 31 >> 31;
       $422 = (_fmt_u($419,$421,$7)|0);
       $423 = ($422|0)==($7|0);
       if ($423) {
        HEAP8[$8>>0] = 48;
        $estr$0$i = $8;
       } else {
        $estr$0$i = $422;
       }
       $424 = $416 >> 31;
       $425 = $424 & 2;
       $426 = (($425) + 43)|0;
       $427 = $426&255;
       $428 = ((($estr$0$i)) + -1|0);
       HEAP8[$428>>0] = $427;
       $429 = (($t$0) + 15)|0;
       $430 = $429&255;
       $431 = ((($estr$0$i)) + -2|0);
       HEAP8[$431>>0] = $430;
       $notrhs$i = ($p$0|0)<(1);
       $432 = $fl$1$ & 8;
       $433 = ($432|0)==(0);
       $$2$i = $$1$i;$s$0$i = $buf$i;
       while(1) {
        $434 = (~~(($$2$i)));
        $435 = (5353 + ($434)|0);
        $436 = HEAP8[$435>>0]|0;
        $437 = $436&255;
        $438 = $437 | $397;
        $439 = $438&255;
        $440 = ((($s$0$i)) + 1|0);
        HEAP8[$s$0$i>>0] = $439;
        $441 = (+($434|0));
        $442 = $$2$i - $441;
        $443 = $442 * 16.0;
        $444 = $440;
        $445 = (($444) - ($5))|0;
        $446 = ($445|0)==(1);
        do {
         if ($446) {
          $notlhs$i = $443 == 0.0;
          $or$cond3$not$i = $notrhs$i & $notlhs$i;
          $or$cond$i = $433 & $or$cond3$not$i;
          if ($or$cond$i) {
           $s$1$i = $440;
           break;
          }
          $447 = ((($s$0$i)) + 2|0);
          HEAP8[$440>>0] = 46;
          $s$1$i = $447;
         } else {
          $s$1$i = $440;
         }
        } while(0);
        $448 = $443 != 0.0;
        if ($448) {
         $$2$i = $443;$s$0$i = $s$1$i;
        } else {
         $s$1$i$lcssa = $s$1$i;
         break;
        }
       }
       $449 = ($p$0|0)!=(0);
       $$pre188$i = $s$1$i$lcssa;
       $450 = (($11) + ($$pre188$i))|0;
       $451 = ($450|0)<($p$0|0);
       $or$cond122 = $449 & $451;
       $452 = $431;
       $453 = (($12) + ($p$0))|0;
       $454 = (($453) - ($452))|0;
       $455 = (($10) - ($452))|0;
       $456 = (($455) + ($$pre188$i))|0;
       $l$0$i = $or$cond122 ? $454 : $456;
       $457 = (($l$0$i) + ($400))|0;
       _pad($f,32,$w$1,$457,$fl$1$);
       $458 = HEAP32[$f>>2]|0;
       $459 = $458 & 32;
       $460 = ($459|0)==(0);
       if ($460) {
        (___fwritex($prefix$0$$i,$400,$f)|0);
       }
       $461 = $fl$1$ ^ 65536;
       _pad($f,48,$w$1,$457,$461);
       $462 = (($$pre188$i) - ($5))|0;
       $463 = HEAP32[$f>>2]|0;
       $464 = $463 & 32;
       $465 = ($464|0)==(0);
       if ($465) {
        (___fwritex($buf$i,$462,$f)|0);
       }
       $466 = (($9) - ($452))|0;
       $sum = (($462) + ($466))|0;
       $467 = (($l$0$i) - ($sum))|0;
       _pad($f,48,$467,0,0);
       $468 = HEAP32[$f>>2]|0;
       $469 = $468 & 32;
       $470 = ($469|0)==(0);
       if ($470) {
        (___fwritex($431,$466,$f)|0);
       }
       $471 = $fl$1$ ^ 8192;
       _pad($f,32,$w$1,$457,$471);
       $472 = ($457|0)<($w$1|0);
       $w$$i = $472 ? $w$1 : $457;
       $$0$i = $w$$i;
       break;
      }
      $473 = ($p$0|0)<(0);
      $$p$i = $473 ? 6 : $p$0;
      if ($392) {
       $474 = $391 * 268435456.0;
       $475 = HEAP32[$e2$i>>2]|0;
       $476 = (($475) + -28)|0;
       HEAP32[$e2$i>>2] = $476;
       $$3$i = $474;$477 = $476;
      } else {
       $$pre185$i = HEAP32[$e2$i>>2]|0;
       $$3$i = $391;$477 = $$pre185$i;
      }
      $478 = ($477|0)<(0);
      $$33$i = $478 ? $big$i : $13;
      $479 = $$33$i;
      $$4$i = $$3$i;$z$0$i = $$33$i;
      while(1) {
       $480 = (~~(($$4$i))>>>0);
       HEAP32[$z$0$i>>2] = $480;
       $481 = ((($z$0$i)) + 4|0);
       $482 = (+($480>>>0));
       $483 = $$4$i - $482;
       $484 = $483 * 1.0E+9;
       $485 = $484 != 0.0;
       if ($485) {
        $$4$i = $484;$z$0$i = $481;
       } else {
        $$lcssa303 = $481;
        break;
       }
      }
      $$pr$i = HEAP32[$e2$i>>2]|0;
      $486 = ($$pr$i|0)>(0);
      if ($486) {
       $487 = $$pr$i;$a$1149$i = $$33$i;$z$1148$i = $$lcssa303;
       while(1) {
        $488 = ($487|0)>(29);
        $489 = $488 ? 29 : $487;
        $d$0141$i = ((($z$1148$i)) + -4|0);
        $490 = ($d$0141$i>>>0)<($a$1149$i>>>0);
        do {
         if ($490) {
          $a$2$ph$i = $a$1149$i;
         } else {
          $carry$0142$i = 0;$d$0143$i = $d$0141$i;
          while(1) {
           $491 = HEAP32[$d$0143$i>>2]|0;
           $492 = (_bitshift64Shl(($491|0),0,($489|0))|0);
           $493 = tempRet0;
           $494 = (_i64Add(($492|0),($493|0),($carry$0142$i|0),0)|0);
           $495 = tempRet0;
           $496 = (___uremdi3(($494|0),($495|0),1000000000,0)|0);
           $497 = tempRet0;
           HEAP32[$d$0143$i>>2] = $496;
           $498 = (___udivdi3(($494|0),($495|0),1000000000,0)|0);
           $499 = tempRet0;
           $d$0$i = ((($d$0143$i)) + -4|0);
           $500 = ($d$0$i>>>0)<($a$1149$i>>>0);
           if ($500) {
            $$lcssa304 = $498;
            break;
           } else {
            $carry$0142$i = $498;$d$0143$i = $d$0$i;
           }
          }
          $501 = ($$lcssa304|0)==(0);
          if ($501) {
           $a$2$ph$i = $a$1149$i;
           break;
          }
          $502 = ((($a$1149$i)) + -4|0);
          HEAP32[$502>>2] = $$lcssa304;
          $a$2$ph$i = $502;
         }
        } while(0);
        $z$2$i = $z$1148$i;
        while(1) {
         $503 = ($z$2$i>>>0)>($a$2$ph$i>>>0);
         if (!($503)) {
          $z$2$i$lcssa = $z$2$i;
          break;
         }
         $504 = ((($z$2$i)) + -4|0);
         $505 = HEAP32[$504>>2]|0;
         $506 = ($505|0)==(0);
         if ($506) {
          $z$2$i = $504;
         } else {
          $z$2$i$lcssa = $z$2$i;
          break;
         }
        }
        $507 = HEAP32[$e2$i>>2]|0;
        $508 = (($507) - ($489))|0;
        HEAP32[$e2$i>>2] = $508;
        $509 = ($508|0)>(0);
        if ($509) {
         $487 = $508;$a$1149$i = $a$2$ph$i;$z$1148$i = $z$2$i$lcssa;
        } else {
         $$pr50$i = $508;$a$1$lcssa$i = $a$2$ph$i;$z$1$lcssa$i = $z$2$i$lcssa;
         break;
        }
       }
      } else {
       $$pr50$i = $$pr$i;$a$1$lcssa$i = $$33$i;$z$1$lcssa$i = $$lcssa303;
      }
      $510 = ($$pr50$i|0)<(0);
      if ($510) {
       $511 = (($$p$i) + 25)|0;
       $512 = (($511|0) / 9)&-1;
       $513 = (($512) + 1)|0;
       $514 = ($395|0)==(102);
       $516 = $$pr50$i;$a$3136$i = $a$1$lcssa$i;$z$3135$i = $z$1$lcssa$i;
       while(1) {
        $515 = (0 - ($516))|0;
        $517 = ($515|0)>(9);
        $518 = $517 ? 9 : $515;
        $519 = ($a$3136$i>>>0)<($z$3135$i>>>0);
        do {
         if ($519) {
          $523 = 1 << $518;
          $524 = (($523) + -1)|0;
          $525 = 1000000000 >>> $518;
          $carry3$0130$i = 0;$d$1129$i = $a$3136$i;
          while(1) {
           $526 = HEAP32[$d$1129$i>>2]|0;
           $527 = $526 & $524;
           $528 = $526 >>> $518;
           $529 = (($528) + ($carry3$0130$i))|0;
           HEAP32[$d$1129$i>>2] = $529;
           $530 = Math_imul($527, $525)|0;
           $531 = ((($d$1129$i)) + 4|0);
           $532 = ($531>>>0)<($z$3135$i>>>0);
           if ($532) {
            $carry3$0130$i = $530;$d$1129$i = $531;
           } else {
            $$lcssa306 = $530;
            break;
           }
          }
          $533 = HEAP32[$a$3136$i>>2]|0;
          $534 = ($533|0)==(0);
          $535 = ((($a$3136$i)) + 4|0);
          $$a$3$i = $534 ? $535 : $a$3136$i;
          $536 = ($$lcssa306|0)==(0);
          if ($536) {
           $$a$3192$i = $$a$3$i;$z$4$i = $z$3135$i;
           break;
          }
          $537 = ((($z$3135$i)) + 4|0);
          HEAP32[$z$3135$i>>2] = $$lcssa306;
          $$a$3192$i = $$a$3$i;$z$4$i = $537;
         } else {
          $520 = HEAP32[$a$3136$i>>2]|0;
          $521 = ($520|0)==(0);
          $522 = ((($a$3136$i)) + 4|0);
          $$a$3191$i = $521 ? $522 : $a$3136$i;
          $$a$3192$i = $$a$3191$i;$z$4$i = $z$3135$i;
         }
        } while(0);
        $538 = $514 ? $$33$i : $$a$3192$i;
        $539 = $z$4$i;
        $540 = $538;
        $541 = (($539) - ($540))|0;
        $542 = $541 >> 2;
        $543 = ($542|0)>($513|0);
        $544 = (($538) + ($513<<2)|0);
        $$z$4$i = $543 ? $544 : $z$4$i;
        $545 = HEAP32[$e2$i>>2]|0;
        $546 = (($545) + ($518))|0;
        HEAP32[$e2$i>>2] = $546;
        $547 = ($546|0)<(0);
        if ($547) {
         $516 = $546;$a$3136$i = $$a$3192$i;$z$3135$i = $$z$4$i;
        } else {
         $a$3$lcssa$i = $$a$3192$i;$z$3$lcssa$i = $$z$4$i;
         break;
        }
       }
      } else {
       $a$3$lcssa$i = $a$1$lcssa$i;$z$3$lcssa$i = $z$1$lcssa$i;
      }
      $548 = ($a$3$lcssa$i>>>0)<($z$3$lcssa$i>>>0);
      do {
       if ($548) {
        $549 = $a$3$lcssa$i;
        $550 = (($479) - ($549))|0;
        $551 = $550 >> 2;
        $552 = ($551*9)|0;
        $553 = HEAP32[$a$3$lcssa$i>>2]|0;
        $554 = ($553>>>0)<(10);
        if ($554) {
         $e$1$i = $552;
         break;
        } else {
         $e$0125$i = $552;$i$0124$i = 10;
        }
        while(1) {
         $555 = ($i$0124$i*10)|0;
         $556 = (($e$0125$i) + 1)|0;
         $557 = ($553>>>0)<($555>>>0);
         if ($557) {
          $e$1$i = $556;
          break;
         } else {
          $e$0125$i = $556;$i$0124$i = $555;
         }
        }
       } else {
        $e$1$i = 0;
       }
      } while(0);
      $558 = ($395|0)!=(102);
      $559 = $558 ? $e$1$i : 0;
      $560 = (($$p$i) - ($559))|0;
      $561 = ($395|0)==(103);
      $562 = ($$p$i|0)!=(0);
      $563 = $562 & $561;
      $$neg55$i = $563 << 31 >> 31;
      $564 = (($560) + ($$neg55$i))|0;
      $565 = $z$3$lcssa$i;
      $566 = (($565) - ($479))|0;
      $567 = $566 >> 2;
      $568 = ($567*9)|0;
      $569 = (($568) + -9)|0;
      $570 = ($564|0)<($569|0);
      if ($570) {
       $571 = ((($$33$i)) + 4|0);
       $572 = (($564) + 9216)|0;
       $573 = (($572|0) / 9)&-1;
       $574 = (($573) + -1024)|0;
       $575 = (($571) + ($574<<2)|0);
       $576 = (($572|0) % 9)&-1;
       $j$0117$i = (($576) + 1)|0;
       $577 = ($j$0117$i|0)<(9);
       if ($577) {
        $i$1118$i = 10;$j$0119$i = $j$0117$i;
        while(1) {
         $578 = ($i$1118$i*10)|0;
         $j$0$i = (($j$0119$i) + 1)|0;
         $exitcond$i = ($j$0$i|0)==(9);
         if ($exitcond$i) {
          $i$1$lcssa$i = $578;
          break;
         } else {
          $i$1118$i = $578;$j$0119$i = $j$0$i;
         }
        }
       } else {
        $i$1$lcssa$i = 10;
       }
       $579 = HEAP32[$575>>2]|0;
       $580 = (($579>>>0) % ($i$1$lcssa$i>>>0))&-1;
       $581 = ($580|0)==(0);
       $582 = ((($575)) + 4|0);
       $583 = ($582|0)==($z$3$lcssa$i|0);
       $or$cond18$i = $583 & $581;
       do {
        if ($or$cond18$i) {
         $a$8$i = $a$3$lcssa$i;$d$4$i = $575;$e$4$i = $e$1$i;
        } else {
         $584 = (($579>>>0) / ($i$1$lcssa$i>>>0))&-1;
         $585 = $584 & 1;
         $586 = ($585|0)==(0);
         $$20$i = $586 ? 9007199254740992.0 : 9007199254740994.0;
         $587 = (($i$1$lcssa$i|0) / 2)&-1;
         $588 = ($580>>>0)<($587>>>0);
         if ($588) {
          $small$0$i = 0.5;
         } else {
          $589 = ($580|0)==($587|0);
          $or$cond22$i = $583 & $589;
          $$36$i = $or$cond22$i ? 1.0 : 1.5;
          $small$0$i = $$36$i;
         }
         $590 = ($pl$0$i|0)==(0);
         do {
          if ($590) {
           $round6$1$i = $$20$i;$small$1$i = $small$0$i;
          } else {
           $591 = HEAP8[$prefix$0$i>>0]|0;
           $592 = ($591<<24>>24)==(45);
           if (!($592)) {
            $round6$1$i = $$20$i;$small$1$i = $small$0$i;
            break;
           }
           $593 = -$$20$i;
           $594 = -$small$0$i;
           $round6$1$i = $593;$small$1$i = $594;
          }
         } while(0);
         $595 = (($579) - ($580))|0;
         HEAP32[$575>>2] = $595;
         $596 = $round6$1$i + $small$1$i;
         $597 = $596 != $round6$1$i;
         if (!($597)) {
          $a$8$i = $a$3$lcssa$i;$d$4$i = $575;$e$4$i = $e$1$i;
          break;
         }
         $598 = (($595) + ($i$1$lcssa$i))|0;
         HEAP32[$575>>2] = $598;
         $599 = ($598>>>0)>(999999999);
         if ($599) {
          $a$5111$i = $a$3$lcssa$i;$d$2110$i = $575;
          while(1) {
           $600 = ((($d$2110$i)) + -4|0);
           HEAP32[$d$2110$i>>2] = 0;
           $601 = ($600>>>0)<($a$5111$i>>>0);
           if ($601) {
            $602 = ((($a$5111$i)) + -4|0);
            HEAP32[$602>>2] = 0;
            $a$6$i = $602;
           } else {
            $a$6$i = $a$5111$i;
           }
           $603 = HEAP32[$600>>2]|0;
           $604 = (($603) + 1)|0;
           HEAP32[$600>>2] = $604;
           $605 = ($604>>>0)>(999999999);
           if ($605) {
            $a$5111$i = $a$6$i;$d$2110$i = $600;
           } else {
            $a$5$lcssa$i = $a$6$i;$d$2$lcssa$i = $600;
            break;
           }
          }
         } else {
          $a$5$lcssa$i = $a$3$lcssa$i;$d$2$lcssa$i = $575;
         }
         $606 = $a$5$lcssa$i;
         $607 = (($479) - ($606))|0;
         $608 = $607 >> 2;
         $609 = ($608*9)|0;
         $610 = HEAP32[$a$5$lcssa$i>>2]|0;
         $611 = ($610>>>0)<(10);
         if ($611) {
          $a$8$i = $a$5$lcssa$i;$d$4$i = $d$2$lcssa$i;$e$4$i = $609;
          break;
         } else {
          $e$2106$i = $609;$i$2105$i = 10;
         }
         while(1) {
          $612 = ($i$2105$i*10)|0;
          $613 = (($e$2106$i) + 1)|0;
          $614 = ($610>>>0)<($612>>>0);
          if ($614) {
           $a$8$i = $a$5$lcssa$i;$d$4$i = $d$2$lcssa$i;$e$4$i = $613;
           break;
          } else {
           $e$2106$i = $613;$i$2105$i = $612;
          }
         }
        }
       } while(0);
       $615 = ((($d$4$i)) + 4|0);
       $616 = ($z$3$lcssa$i>>>0)>($615>>>0);
       $$z$3$i = $616 ? $615 : $z$3$lcssa$i;
       $a$9$ph$i = $a$8$i;$e$5$ph$i = $e$4$i;$z$7$ph$i = $$z$3$i;
      } else {
       $a$9$ph$i = $a$3$lcssa$i;$e$5$ph$i = $e$1$i;$z$7$ph$i = $z$3$lcssa$i;
      }
      $617 = (0 - ($e$5$ph$i))|0;
      $z$7$i = $z$7$ph$i;
      while(1) {
       $618 = ($z$7$i>>>0)>($a$9$ph$i>>>0);
       if (!($618)) {
        $$lcssa162$i = 0;$z$7$i$lcssa = $z$7$i;
        break;
       }
       $619 = ((($z$7$i)) + -4|0);
       $620 = HEAP32[$619>>2]|0;
       $621 = ($620|0)==(0);
       if ($621) {
        $z$7$i = $619;
       } else {
        $$lcssa162$i = 1;$z$7$i$lcssa = $z$7$i;
        break;
       }
      }
      do {
       if ($561) {
        $622 = $562&1;
        $623 = $622 ^ 1;
        $$p$$i = (($623) + ($$p$i))|0;
        $624 = ($$p$$i|0)>($e$5$ph$i|0);
        $625 = ($e$5$ph$i|0)>(-5);
        $or$cond6$i = $624 & $625;
        if ($or$cond6$i) {
         $626 = (($t$0) + -1)|0;
         $$neg56$i = (($$p$$i) + -1)|0;
         $627 = (($$neg56$i) - ($e$5$ph$i))|0;
         $$013$i = $626;$$210$i = $627;
        } else {
         $628 = (($t$0) + -2)|0;
         $629 = (($$p$$i) + -1)|0;
         $$013$i = $628;$$210$i = $629;
        }
        $630 = $fl$1$ & 8;
        $631 = ($630|0)==(0);
        if (!($631)) {
         $$114$i = $$013$i;$$311$i = $$210$i;$$pre$phi190$iZ2D = $630;
         break;
        }
        do {
         if ($$lcssa162$i) {
          $632 = ((($z$7$i$lcssa)) + -4|0);
          $633 = HEAP32[$632>>2]|0;
          $634 = ($633|0)==(0);
          if ($634) {
           $j$2$i = 9;
           break;
          }
          $635 = (($633>>>0) % 10)&-1;
          $636 = ($635|0)==(0);
          if ($636) {
           $i$3101$i = 10;$j$1102$i = 0;
          } else {
           $j$2$i = 0;
           break;
          }
          while(1) {
           $637 = ($i$3101$i*10)|0;
           $638 = (($j$1102$i) + 1)|0;
           $639 = (($633>>>0) % ($637>>>0))&-1;
           $640 = ($639|0)==(0);
           if ($640) {
            $i$3101$i = $637;$j$1102$i = $638;
           } else {
            $j$2$i = $638;
            break;
           }
          }
         } else {
          $j$2$i = 9;
         }
        } while(0);
        $641 = $$013$i | 32;
        $642 = ($641|0)==(102);
        $643 = $z$7$i$lcssa;
        $644 = (($643) - ($479))|0;
        $645 = $644 >> 2;
        $646 = ($645*9)|0;
        $647 = (($646) + -9)|0;
        if ($642) {
         $648 = (($647) - ($j$2$i))|0;
         $649 = ($648|0)<(0);
         $$23$i = $649 ? 0 : $648;
         $650 = ($$210$i|0)<($$23$i|0);
         $$210$$24$i = $650 ? $$210$i : $$23$i;
         $$114$i = $$013$i;$$311$i = $$210$$24$i;$$pre$phi190$iZ2D = 0;
         break;
        } else {
         $651 = (($647) + ($e$5$ph$i))|0;
         $652 = (($651) - ($j$2$i))|0;
         $653 = ($652|0)<(0);
         $$25$i = $653 ? 0 : $652;
         $654 = ($$210$i|0)<($$25$i|0);
         $$210$$26$i = $654 ? $$210$i : $$25$i;
         $$114$i = $$013$i;$$311$i = $$210$$26$i;$$pre$phi190$iZ2D = 0;
         break;
        }
       } else {
        $$pre189$i = $fl$1$ & 8;
        $$114$i = $t$0;$$311$i = $$p$i;$$pre$phi190$iZ2D = $$pre189$i;
       }
      } while(0);
      $655 = $$311$i | $$pre$phi190$iZ2D;
      $656 = ($655|0)!=(0);
      $657 = $656&1;
      $658 = $$114$i | 32;
      $659 = ($658|0)==(102);
      if ($659) {
       $660 = ($e$5$ph$i|0)>(0);
       $661 = $660 ? $e$5$ph$i : 0;
       $$pn$i = $661;$estr$2$i = 0;
      } else {
       $662 = ($e$5$ph$i|0)<(0);
       $663 = $662 ? $617 : $e$5$ph$i;
       $664 = ($663|0)<(0);
       $665 = $664 << 31 >> 31;
       $666 = (_fmt_u($663,$665,$7)|0);
       $667 = $666;
       $668 = (($9) - ($667))|0;
       $669 = ($668|0)<(2);
       if ($669) {
        $estr$195$i = $666;
        while(1) {
         $670 = ((($estr$195$i)) + -1|0);
         HEAP8[$670>>0] = 48;
         $671 = $670;
         $672 = (($9) - ($671))|0;
         $673 = ($672|0)<(2);
         if ($673) {
          $estr$195$i = $670;
         } else {
          $estr$1$lcssa$i = $670;
          break;
         }
        }
       } else {
        $estr$1$lcssa$i = $666;
       }
       $674 = $e$5$ph$i >> 31;
       $675 = $674 & 2;
       $676 = (($675) + 43)|0;
       $677 = $676&255;
       $678 = ((($estr$1$lcssa$i)) + -1|0);
       HEAP8[$678>>0] = $677;
       $679 = $$114$i&255;
       $680 = ((($estr$1$lcssa$i)) + -2|0);
       HEAP8[$680>>0] = $679;
       $681 = $680;
       $682 = (($9) - ($681))|0;
       $$pn$i = $682;$estr$2$i = $680;
      }
      $683 = (($pl$0$i) + 1)|0;
      $684 = (($683) + ($$311$i))|0;
      $l$1$i = (($684) + ($657))|0;
      $685 = (($l$1$i) + ($$pn$i))|0;
      _pad($f,32,$w$1,$685,$fl$1$);
      $686 = HEAP32[$f>>2]|0;
      $687 = $686 & 32;
      $688 = ($687|0)==(0);
      if ($688) {
       (___fwritex($prefix$0$i,$pl$0$i,$f)|0);
      }
      $689 = $fl$1$ ^ 65536;
      _pad($f,48,$w$1,$685,$689);
      do {
       if ($659) {
        $690 = ($a$9$ph$i>>>0)>($$33$i>>>0);
        $r$0$a$9$i = $690 ? $$33$i : $a$9$ph$i;
        $d$584$i = $r$0$a$9$i;
        while(1) {
         $691 = HEAP32[$d$584$i>>2]|0;
         $692 = (_fmt_u($691,0,$14)|0);
         $693 = ($d$584$i|0)==($r$0$a$9$i|0);
         do {
          if ($693) {
           $699 = ($692|0)==($14|0);
           if (!($699)) {
            $s7$1$i = $692;
            break;
           }
           HEAP8[$16>>0] = 48;
           $s7$1$i = $16;
          } else {
           $694 = ($692>>>0)>($buf$i>>>0);
           if (!($694)) {
            $s7$1$i = $692;
            break;
           }
           $695 = $692;
           $696 = (($695) - ($5))|0;
           _memset(($buf$i|0),48,($696|0))|0;
           $s7$081$i = $692;
           while(1) {
            $697 = ((($s7$081$i)) + -1|0);
            $698 = ($697>>>0)>($buf$i>>>0);
            if ($698) {
             $s7$081$i = $697;
            } else {
             $s7$1$i = $697;
             break;
            }
           }
          }
         } while(0);
         $700 = HEAP32[$f>>2]|0;
         $701 = $700 & 32;
         $702 = ($701|0)==(0);
         if ($702) {
          $703 = $s7$1$i;
          $704 = (($15) - ($703))|0;
          (___fwritex($s7$1$i,$704,$f)|0);
         }
         $705 = ((($d$584$i)) + 4|0);
         $706 = ($705>>>0)>($$33$i>>>0);
         if ($706) {
          $$lcssa316 = $705;
          break;
         } else {
          $d$584$i = $705;
         }
        }
        $707 = ($655|0)==(0);
        do {
         if (!($707)) {
          $708 = HEAP32[$f>>2]|0;
          $709 = $708 & 32;
          $710 = ($709|0)==(0);
          if (!($710)) {
           break;
          }
          (___fwritex(7313,1,$f)|0);
         }
        } while(0);
        $711 = ($$lcssa316>>>0)<($z$7$i$lcssa>>>0);
        $712 = ($$311$i|0)>(0);
        $713 = $712 & $711;
        if ($713) {
         $$41278$i = $$311$i;$d$677$i = $$lcssa316;
         while(1) {
          $714 = HEAP32[$d$677$i>>2]|0;
          $715 = (_fmt_u($714,0,$14)|0);
          $716 = ($715>>>0)>($buf$i>>>0);
          if ($716) {
           $717 = $715;
           $718 = (($717) - ($5))|0;
           _memset(($buf$i|0),48,($718|0))|0;
           $s8$072$i = $715;
           while(1) {
            $719 = ((($s8$072$i)) + -1|0);
            $720 = ($719>>>0)>($buf$i>>>0);
            if ($720) {
             $s8$072$i = $719;
            } else {
             $s8$0$lcssa$i = $719;
             break;
            }
           }
          } else {
           $s8$0$lcssa$i = $715;
          }
          $721 = HEAP32[$f>>2]|0;
          $722 = $721 & 32;
          $723 = ($722|0)==(0);
          if ($723) {
           $724 = ($$41278$i|0)>(9);
           $725 = $724 ? 9 : $$41278$i;
           (___fwritex($s8$0$lcssa$i,$725,$f)|0);
          }
          $726 = ((($d$677$i)) + 4|0);
          $727 = (($$41278$i) + -9)|0;
          $728 = ($726>>>0)<($z$7$i$lcssa>>>0);
          $729 = ($$41278$i|0)>(9);
          $730 = $729 & $728;
          if ($730) {
           $$41278$i = $727;$d$677$i = $726;
          } else {
           $$412$lcssa$i = $727;
           break;
          }
         }
        } else {
         $$412$lcssa$i = $$311$i;
        }
        $731 = (($$412$lcssa$i) + 9)|0;
        _pad($f,48,$731,9,0);
       } else {
        $732 = ((($a$9$ph$i)) + 4|0);
        $z$7$$i = $$lcssa162$i ? $z$7$i$lcssa : $732;
        $733 = ($$311$i|0)>(-1);
        if ($733) {
         $734 = ($$pre$phi190$iZ2D|0)==(0);
         $$589$i = $$311$i;$d$788$i = $a$9$ph$i;
         while(1) {
          $735 = HEAP32[$d$788$i>>2]|0;
          $736 = (_fmt_u($735,0,$14)|0);
          $737 = ($736|0)==($14|0);
          if ($737) {
           HEAP8[$16>>0] = 48;
           $s9$0$i = $16;
          } else {
           $s9$0$i = $736;
          }
          $738 = ($d$788$i|0)==($a$9$ph$i|0);
          do {
           if ($738) {
            $742 = ((($s9$0$i)) + 1|0);
            $743 = HEAP32[$f>>2]|0;
            $744 = $743 & 32;
            $745 = ($744|0)==(0);
            if ($745) {
             (___fwritex($s9$0$i,1,$f)|0);
            }
            $746 = ($$589$i|0)<(1);
            $or$cond31$i = $734 & $746;
            if ($or$cond31$i) {
             $s9$2$i = $742;
             break;
            }
            $747 = HEAP32[$f>>2]|0;
            $748 = $747 & 32;
            $749 = ($748|0)==(0);
            if (!($749)) {
             $s9$2$i = $742;
             break;
            }
            (___fwritex(7313,1,$f)|0);
            $s9$2$i = $742;
           } else {
            $739 = ($s9$0$i>>>0)>($buf$i>>>0);
            if (!($739)) {
             $s9$2$i = $s9$0$i;
             break;
            }
            $scevgep182$i = (($s9$0$i) + ($6)|0);
            $scevgep182183$i = $scevgep182$i;
            _memset(($buf$i|0),48,($scevgep182183$i|0))|0;
            $s9$185$i = $s9$0$i;
            while(1) {
             $740 = ((($s9$185$i)) + -1|0);
             $741 = ($740>>>0)>($buf$i>>>0);
             if ($741) {
              $s9$185$i = $740;
             } else {
              $s9$2$i = $740;
              break;
             }
            }
           }
          } while(0);
          $750 = $s9$2$i;
          $751 = (($15) - ($750))|0;
          $752 = HEAP32[$f>>2]|0;
          $753 = $752 & 32;
          $754 = ($753|0)==(0);
          if ($754) {
           $755 = ($$589$i|0)>($751|0);
           $756 = $755 ? $751 : $$589$i;
           (___fwritex($s9$2$i,$756,$f)|0);
          }
          $757 = (($$589$i) - ($751))|0;
          $758 = ((($d$788$i)) + 4|0);
          $759 = ($758>>>0)<($z$7$$i>>>0);
          $760 = ($757|0)>(-1);
          $761 = $759 & $760;
          if ($761) {
           $$589$i = $757;$d$788$i = $758;
          } else {
           $$5$lcssa$i = $757;
           break;
          }
         }
        } else {
         $$5$lcssa$i = $$311$i;
        }
        $762 = (($$5$lcssa$i) + 18)|0;
        _pad($f,48,$762,18,0);
        $763 = HEAP32[$f>>2]|0;
        $764 = $763 & 32;
        $765 = ($764|0)==(0);
        if (!($765)) {
         break;
        }
        $766 = $estr$2$i;
        $767 = (($9) - ($766))|0;
        (___fwritex($estr$2$i,$767,$f)|0);
       }
      } while(0);
      $768 = $fl$1$ ^ 8192;
      _pad($f,32,$w$1,$685,$768);
      $769 = ($685|0)<($w$1|0);
      $w$32$i = $769 ? $w$1 : $685;
      $$0$i = $w$32$i;
     } else {
      $375 = $t$0 & 32;
      $376 = ($375|0)!=(0);
      $377 = $376 ? 7297 : 7301;
      $378 = ($$07$i != $$07$i) | (0.0 != 0.0);
      $379 = $376 ? 7305 : 7309;
      $pl$1$i = $378 ? 0 : $pl$0$i;
      $s1$0$i = $378 ? $379 : $377;
      $380 = (($pl$1$i) + 3)|0;
      _pad($f,32,$w$1,$380,$176);
      $381 = HEAP32[$f>>2]|0;
      $382 = $381 & 32;
      $383 = ($382|0)==(0);
      if ($383) {
       (___fwritex($prefix$0$i,$pl$1$i,$f)|0);
       $$pre$i = HEAP32[$f>>2]|0;
       $385 = $$pre$i;
      } else {
       $385 = $381;
      }
      $384 = $385 & 32;
      $386 = ($384|0)==(0);
      if ($386) {
       (___fwritex($s1$0$i,3,$f)|0);
      }
      $387 = $fl$1$ ^ 8192;
      _pad($f,32,$w$1,$380,$387);
      $388 = ($380|0)<($w$1|0);
      $389 = $388 ? $w$1 : $380;
      $$0$i = $389;
     }
    } while(0);
    $cnt$0 = $cnt$1;$l$0 = $$0$i;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
    continue L1;
    break;
   }
   default: {
    $a$2 = $s$0;$fl$6 = $fl$1$;$p$5 = $p$0;$pl$2 = 0;$prefix$2 = 5369;$z$2 = $1;
   }
   }
  } while(0);
  L311: do {
   if ((label|0) == 64) {
    label = 0;
    $207 = $arg;
    $208 = $207;
    $209 = HEAP32[$208>>2]|0;
    $210 = (($207) + 4)|0;
    $211 = $210;
    $212 = HEAP32[$211>>2]|0;
    $213 = $t$1 & 32;
    $214 = ($209|0)==(0);
    $215 = ($212|0)==(0);
    $216 = $214 & $215;
    if ($216) {
     $a$0 = $1;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 0;$prefix$1 = 5369;
     label = 77;
    } else {
     $$012$i = $1;$218 = $209;$225 = $212;
     while(1) {
      $217 = $218 & 15;
      $219 = (5353 + ($217)|0);
      $220 = HEAP8[$219>>0]|0;
      $221 = $220&255;
      $222 = $221 | $213;
      $223 = $222&255;
      $224 = ((($$012$i)) + -1|0);
      HEAP8[$224>>0] = $223;
      $226 = (_bitshift64Lshr(($218|0),($225|0),4)|0);
      $227 = tempRet0;
      $228 = ($226|0)==(0);
      $229 = ($227|0)==(0);
      $230 = $228 & $229;
      if ($230) {
       $$lcssa321 = $224;
       break;
      } else {
       $$012$i = $224;$218 = $226;$225 = $227;
      }
     }
     $231 = $arg;
     $232 = $231;
     $233 = HEAP32[$232>>2]|0;
     $234 = (($231) + 4)|0;
     $235 = $234;
     $236 = HEAP32[$235>>2]|0;
     $237 = ($233|0)==(0);
     $238 = ($236|0)==(0);
     $239 = $237 & $238;
     $240 = $fl$3 & 8;
     $241 = ($240|0)==(0);
     $or$cond17 = $241 | $239;
     if ($or$cond17) {
      $a$0 = $$lcssa321;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 0;$prefix$1 = 5369;
      label = 77;
     } else {
      $242 = $t$1 >> 4;
      $243 = (5369 + ($242)|0);
      $a$0 = $$lcssa321;$fl$4 = $fl$3;$p$2 = $p$1;$pl$1 = 2;$prefix$1 = $243;
      label = 77;
     }
    }
   }
   else if ((label|0) == 76) {
    label = 0;
    $289 = (_fmt_u($287,$288,$1)|0);
    $a$0 = $289;$fl$4 = $fl$1$;$p$2 = $p$0;$pl$1 = $pl$0;$prefix$1 = $prefix$0;
    label = 77;
   }
   else if ((label|0) == 82) {
    label = 0;
    $321 = (_memchr($a$1,0,$p$0)|0);
    $322 = ($321|0)==(0|0);
    $323 = $321;
    $324 = $a$1;
    $325 = (($323) - ($324))|0;
    $326 = (($a$1) + ($p$0)|0);
    $z$1 = $322 ? $326 : $321;
    $p$3 = $322 ? $p$0 : $325;
    $a$2 = $a$1;$fl$6 = $176;$p$5 = $p$3;$pl$2 = 0;$prefix$2 = 5369;$z$2 = $z$1;
   }
   else if ((label|0) == 86) {
    label = 0;
    $i$0105 = 0;$l$1104 = 0;$ws$0106 = $798;
    while(1) {
     $334 = HEAP32[$ws$0106>>2]|0;
     $335 = ($334|0)==(0);
     if ($335) {
      $i$0$lcssa = $i$0105;$l$2 = $l$1104;
      break;
     }
     $336 = (_wctomb($mb,$334)|0);
     $337 = ($336|0)<(0);
     $338 = (($p$4176) - ($i$0105))|0;
     $339 = ($336>>>0)>($338>>>0);
     $or$cond20 = $337 | $339;
     if ($or$cond20) {
      $i$0$lcssa = $i$0105;$l$2 = $336;
      break;
     }
     $340 = ((($ws$0106)) + 4|0);
     $341 = (($336) + ($i$0105))|0;
     $342 = ($p$4176>>>0)>($341>>>0);
     if ($342) {
      $i$0105 = $341;$l$1104 = $336;$ws$0106 = $340;
     } else {
      $i$0$lcssa = $341;$l$2 = $336;
      break;
     }
    }
    $343 = ($l$2|0)<(0);
    if ($343) {
     $$0 = -1;
     break L1;
    }
    _pad($f,32,$w$1,$i$0$lcssa,$fl$1$);
    $344 = ($i$0$lcssa|0)==(0);
    if ($344) {
     $i$0$lcssa178 = 0;
     label = 97;
    } else {
     $i$1116 = 0;$ws$1117 = $798;
     while(1) {
      $345 = HEAP32[$ws$1117>>2]|0;
      $346 = ($345|0)==(0);
      if ($346) {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 97;
       break L311;
      }
      $347 = ((($ws$1117)) + 4|0);
      $348 = (_wctomb($mb,$345)|0);
      $349 = (($348) + ($i$1116))|0;
      $350 = ($349|0)>($i$0$lcssa|0);
      if ($350) {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 97;
       break L311;
      }
      $351 = HEAP32[$f>>2]|0;
      $352 = $351 & 32;
      $353 = ($352|0)==(0);
      if ($353) {
       (___fwritex($mb,$348,$f)|0);
      }
      $354 = ($349>>>0)<($i$0$lcssa>>>0);
      if ($354) {
       $i$1116 = $349;$ws$1117 = $347;
      } else {
       $i$0$lcssa178 = $i$0$lcssa;
       label = 97;
       break;
      }
     }
    }
   }
  } while(0);
  if ((label|0) == 97) {
   label = 0;
   $355 = $fl$1$ ^ 8192;
   _pad($f,32,$w$1,$i$0$lcssa178,$355);
   $356 = ($w$1|0)>($i$0$lcssa178|0);
   $357 = $356 ? $w$1 : $i$0$lcssa178;
   $cnt$0 = $cnt$1;$l$0 = $357;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
   continue;
  }
  if ((label|0) == 77) {
   label = 0;
   $290 = ($p$2|0)>(-1);
   $291 = $fl$4 & -65537;
   $$fl$4 = $290 ? $291 : $fl$4;
   $292 = $arg;
   $293 = $292;
   $294 = HEAP32[$293>>2]|0;
   $295 = (($292) + 4)|0;
   $296 = $295;
   $297 = HEAP32[$296>>2]|0;
   $298 = ($294|0)!=(0);
   $299 = ($297|0)!=(0);
   $300 = $298 | $299;
   $301 = ($p$2|0)!=(0);
   $or$cond = $301 | $300;
   if ($or$cond) {
    $302 = $a$0;
    $303 = (($2) - ($302))|0;
    $304 = $300&1;
    $305 = $304 ^ 1;
    $306 = (($305) + ($303))|0;
    $307 = ($p$2|0)>($306|0);
    $p$2$ = $307 ? $p$2 : $306;
    $a$2 = $a$0;$fl$6 = $$fl$4;$p$5 = $p$2$;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $1;
   } else {
    $a$2 = $1;$fl$6 = $$fl$4;$p$5 = 0;$pl$2 = $pl$1;$prefix$2 = $prefix$1;$z$2 = $1;
   }
  }
  $770 = $z$2;
  $771 = $a$2;
  $772 = (($770) - ($771))|0;
  $773 = ($p$5|0)<($772|0);
  $$p$5 = $773 ? $772 : $p$5;
  $774 = (($pl$2) + ($$p$5))|0;
  $775 = ($w$1|0)<($774|0);
  $w$2 = $775 ? $774 : $w$1;
  _pad($f,32,$w$2,$774,$fl$6);
  $776 = HEAP32[$f>>2]|0;
  $777 = $776 & 32;
  $778 = ($777|0)==(0);
  if ($778) {
   (___fwritex($prefix$2,$pl$2,$f)|0);
  }
  $779 = $fl$6 ^ 65536;
  _pad($f,48,$w$2,$774,$779);
  _pad($f,48,$$p$5,$772,0);
  $780 = HEAP32[$f>>2]|0;
  $781 = $780 & 32;
  $782 = ($781|0)==(0);
  if ($782) {
   (___fwritex($a$2,$772,$f)|0);
  }
  $783 = $fl$6 ^ 8192;
  _pad($f,32,$w$2,$774,$783);
  $cnt$0 = $cnt$1;$l$0 = $w$2;$l10n$0 = $l10n$3;$s$0 = $$lcssa300;
 }
 L345: do {
  if ((label|0) == 244) {
   $784 = ($f|0)==(0|0);
   if ($784) {
    $785 = ($l10n$0$lcssa|0)==(0);
    if ($785) {
     $$0 = 0;
    } else {
     $i$291 = 1;
     while(1) {
      $786 = (($nl_type) + ($i$291<<2)|0);
      $787 = HEAP32[$786>>2]|0;
      $788 = ($787|0)==(0);
      if ($788) {
       $i$291$lcssa = $i$291;
       break;
      }
      $790 = (($nl_arg) + ($i$291<<3)|0);
      _pop_arg_345($790,$787,$ap);
      $791 = (($i$291) + 1)|0;
      $792 = ($791|0)<(10);
      if ($792) {
       $i$291 = $791;
      } else {
       $$0 = 1;
       break L345;
      }
     }
     $789 = ($i$291$lcssa|0)<(10);
     if ($789) {
      $i$389 = $i$291$lcssa;
      while(1) {
       $795 = (($nl_type) + ($i$389<<2)|0);
       $796 = HEAP32[$795>>2]|0;
       $797 = ($796|0)==(0);
       $793 = (($i$389) + 1)|0;
       if (!($797)) {
        $$0 = -1;
        break L345;
       }
       $794 = ($793|0)<(10);
       if ($794) {
        $i$389 = $793;
       } else {
        $$0 = 1;
        break;
       }
      }
     } else {
      $$0 = 1;
     }
    }
   } else {
    $$0 = $cnt$1$lcssa;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function ___fwritex($s,$l,$f) {
 $s = $s|0;
 $l = $l|0;
 $f = $f|0;
 var $$0 = 0, $$01 = 0, $$02 = 0, $$pre = 0, $$pre6 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$0 = 0, $i$0$lcssa12 = 0;
 var $i$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 16|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  $4 = (___towrite($f)|0);
  $5 = ($4|0)==(0);
  if ($5) {
   $$pre = HEAP32[$0>>2]|0;
   $9 = $$pre;
   label = 5;
  } else {
   $$0 = 0;
  }
 } else {
  $3 = $1;
  $9 = $3;
  label = 5;
 }
 L5: do {
  if ((label|0) == 5) {
   $6 = ((($f)) + 20|0);
   $7 = HEAP32[$6>>2]|0;
   $8 = (($9) - ($7))|0;
   $10 = ($8>>>0)<($l>>>0);
   $11 = $7;
   if ($10) {
    $12 = ((($f)) + 36|0);
    $13 = HEAP32[$12>>2]|0;
    $14 = (FUNCTION_TABLE_iiii[$13 & 15]($f,$s,$l)|0);
    $$0 = $14;
    break;
   }
   $15 = ((($f)) + 75|0);
   $16 = HEAP8[$15>>0]|0;
   $17 = ($16<<24>>24)>(-1);
   L10: do {
    if ($17) {
     $i$0 = $l;
     while(1) {
      $18 = ($i$0|0)==(0);
      if ($18) {
       $$01 = $l;$$02 = $s;$29 = $11;$i$1 = 0;
       break L10;
      }
      $19 = (($i$0) + -1)|0;
      $20 = (($s) + ($19)|0);
      $21 = HEAP8[$20>>0]|0;
      $22 = ($21<<24>>24)==(10);
      if ($22) {
       $i$0$lcssa12 = $i$0;
       break;
      } else {
       $i$0 = $19;
      }
     }
     $23 = ((($f)) + 36|0);
     $24 = HEAP32[$23>>2]|0;
     $25 = (FUNCTION_TABLE_iiii[$24 & 15]($f,$s,$i$0$lcssa12)|0);
     $26 = ($25>>>0)<($i$0$lcssa12>>>0);
     if ($26) {
      $$0 = $i$0$lcssa12;
      break L5;
     }
     $27 = (($s) + ($i$0$lcssa12)|0);
     $28 = (($l) - ($i$0$lcssa12))|0;
     $$pre6 = HEAP32[$6>>2]|0;
     $$01 = $28;$$02 = $27;$29 = $$pre6;$i$1 = $i$0$lcssa12;
    } else {
     $$01 = $l;$$02 = $s;$29 = $11;$i$1 = 0;
    }
   } while(0);
   _memcpy(($29|0),($$02|0),($$01|0))|0;
   $30 = HEAP32[$6>>2]|0;
   $31 = (($30) + ($$01)|0);
   HEAP32[$6>>2] = $31;
   $32 = (($i$1) + ($$01))|0;
   $$0 = $32;
  }
 } while(0);
 return ($$0|0);
}
function ___towrite($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 74|0);
 $1 = HEAP8[$0>>0]|0;
 $2 = $1 << 24 >> 24;
 $3 = (($2) + 255)|0;
 $4 = $3 | $2;
 $5 = $4&255;
 HEAP8[$0>>0] = $5;
 $6 = HEAP32[$f>>2]|0;
 $7 = $6 & 8;
 $8 = ($7|0)==(0);
 if ($8) {
  $10 = ((($f)) + 8|0);
  HEAP32[$10>>2] = 0;
  $11 = ((($f)) + 4|0);
  HEAP32[$11>>2] = 0;
  $12 = ((($f)) + 44|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ((($f)) + 28|0);
  HEAP32[$14>>2] = $13;
  $15 = ((($f)) + 20|0);
  HEAP32[$15>>2] = $13;
  $16 = $13;
  $17 = ((($f)) + 48|0);
  $18 = HEAP32[$17>>2]|0;
  $19 = (($16) + ($18)|0);
  $20 = ((($f)) + 16|0);
  HEAP32[$20>>2] = $19;
  $$0 = 0;
 } else {
  $9 = $6 | 32;
  HEAP32[$f>>2] = $9;
  $$0 = -1;
 }
 return ($$0|0);
}
function _pop_arg_345($arg,$type,$ap) {
 $arg = $arg|0;
 $type = $type|0;
 $ap = $ap|0;
 var $$mask = 0, $$mask1 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0.0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0.0;
 var $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0;
 var $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0;
 var $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0;
 var $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0;
 var $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $arglist_current = 0, $arglist_current11 = 0, $arglist_current14 = 0, $arglist_current17 = 0;
 var $arglist_current2 = 0, $arglist_current20 = 0, $arglist_current23 = 0, $arglist_current26 = 0, $arglist_current5 = 0, $arglist_current8 = 0, $arglist_next = 0, $arglist_next12 = 0, $arglist_next15 = 0, $arglist_next18 = 0, $arglist_next21 = 0, $arglist_next24 = 0, $arglist_next27 = 0, $arglist_next3 = 0, $arglist_next6 = 0, $arglist_next9 = 0, $expanded = 0, $expanded28 = 0, $expanded30 = 0, $expanded31 = 0;
 var $expanded32 = 0, $expanded34 = 0, $expanded35 = 0, $expanded37 = 0, $expanded38 = 0, $expanded39 = 0, $expanded41 = 0, $expanded42 = 0, $expanded44 = 0, $expanded45 = 0, $expanded46 = 0, $expanded48 = 0, $expanded49 = 0, $expanded51 = 0, $expanded52 = 0, $expanded53 = 0, $expanded55 = 0, $expanded56 = 0, $expanded58 = 0, $expanded59 = 0;
 var $expanded60 = 0, $expanded62 = 0, $expanded63 = 0, $expanded65 = 0, $expanded66 = 0, $expanded67 = 0, $expanded69 = 0, $expanded70 = 0, $expanded72 = 0, $expanded73 = 0, $expanded74 = 0, $expanded76 = 0, $expanded77 = 0, $expanded79 = 0, $expanded80 = 0, $expanded81 = 0, $expanded83 = 0, $expanded84 = 0, $expanded86 = 0, $expanded87 = 0;
 var $expanded88 = 0, $expanded90 = 0, $expanded91 = 0, $expanded93 = 0, $expanded94 = 0, $expanded95 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($type>>>0)>(20);
 L1: do {
  if (!($0)) {
   do {
    switch ($type|0) {
    case 9:  {
     $arglist_current = HEAP32[$ap>>2]|0;
     $1 = $arglist_current;
     $2 = ((0) + 4|0);
     $expanded28 = $2;
     $expanded = (($expanded28) - 1)|0;
     $3 = (($1) + ($expanded))|0;
     $4 = ((0) + 4|0);
     $expanded32 = $4;
     $expanded31 = (($expanded32) - 1)|0;
     $expanded30 = $expanded31 ^ -1;
     $5 = $3 & $expanded30;
     $6 = $5;
     $7 = HEAP32[$6>>2]|0;
     $arglist_next = ((($6)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next;
     HEAP32[$arg>>2] = $7;
     break L1;
     break;
    }
    case 10:  {
     $arglist_current2 = HEAP32[$ap>>2]|0;
     $8 = $arglist_current2;
     $9 = ((0) + 4|0);
     $expanded35 = $9;
     $expanded34 = (($expanded35) - 1)|0;
     $10 = (($8) + ($expanded34))|0;
     $11 = ((0) + 4|0);
     $expanded39 = $11;
     $expanded38 = (($expanded39) - 1)|0;
     $expanded37 = $expanded38 ^ -1;
     $12 = $10 & $expanded37;
     $13 = $12;
     $14 = HEAP32[$13>>2]|0;
     $arglist_next3 = ((($13)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next3;
     $15 = ($14|0)<(0);
     $16 = $15 << 31 >> 31;
     $17 = $arg;
     $18 = $17;
     HEAP32[$18>>2] = $14;
     $19 = (($17) + 4)|0;
     $20 = $19;
     HEAP32[$20>>2] = $16;
     break L1;
     break;
    }
    case 11:  {
     $arglist_current5 = HEAP32[$ap>>2]|0;
     $21 = $arglist_current5;
     $22 = ((0) + 4|0);
     $expanded42 = $22;
     $expanded41 = (($expanded42) - 1)|0;
     $23 = (($21) + ($expanded41))|0;
     $24 = ((0) + 4|0);
     $expanded46 = $24;
     $expanded45 = (($expanded46) - 1)|0;
     $expanded44 = $expanded45 ^ -1;
     $25 = $23 & $expanded44;
     $26 = $25;
     $27 = HEAP32[$26>>2]|0;
     $arglist_next6 = ((($26)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next6;
     $28 = $arg;
     $29 = $28;
     HEAP32[$29>>2] = $27;
     $30 = (($28) + 4)|0;
     $31 = $30;
     HEAP32[$31>>2] = 0;
     break L1;
     break;
    }
    case 12:  {
     $arglist_current8 = HEAP32[$ap>>2]|0;
     $32 = $arglist_current8;
     $33 = ((0) + 8|0);
     $expanded49 = $33;
     $expanded48 = (($expanded49) - 1)|0;
     $34 = (($32) + ($expanded48))|0;
     $35 = ((0) + 8|0);
     $expanded53 = $35;
     $expanded52 = (($expanded53) - 1)|0;
     $expanded51 = $expanded52 ^ -1;
     $36 = $34 & $expanded51;
     $37 = $36;
     $38 = $37;
     $39 = $38;
     $40 = HEAP32[$39>>2]|0;
     $41 = (($38) + 4)|0;
     $42 = $41;
     $43 = HEAP32[$42>>2]|0;
     $arglist_next9 = ((($37)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next9;
     $44 = $arg;
     $45 = $44;
     HEAP32[$45>>2] = $40;
     $46 = (($44) + 4)|0;
     $47 = $46;
     HEAP32[$47>>2] = $43;
     break L1;
     break;
    }
    case 13:  {
     $arglist_current11 = HEAP32[$ap>>2]|0;
     $48 = $arglist_current11;
     $49 = ((0) + 4|0);
     $expanded56 = $49;
     $expanded55 = (($expanded56) - 1)|0;
     $50 = (($48) + ($expanded55))|0;
     $51 = ((0) + 4|0);
     $expanded60 = $51;
     $expanded59 = (($expanded60) - 1)|0;
     $expanded58 = $expanded59 ^ -1;
     $52 = $50 & $expanded58;
     $53 = $52;
     $54 = HEAP32[$53>>2]|0;
     $arglist_next12 = ((($53)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next12;
     $55 = $54&65535;
     $56 = $55 << 16 >> 16;
     $57 = ($56|0)<(0);
     $58 = $57 << 31 >> 31;
     $59 = $arg;
     $60 = $59;
     HEAP32[$60>>2] = $56;
     $61 = (($59) + 4)|0;
     $62 = $61;
     HEAP32[$62>>2] = $58;
     break L1;
     break;
    }
    case 14:  {
     $arglist_current14 = HEAP32[$ap>>2]|0;
     $63 = $arglist_current14;
     $64 = ((0) + 4|0);
     $expanded63 = $64;
     $expanded62 = (($expanded63) - 1)|0;
     $65 = (($63) + ($expanded62))|0;
     $66 = ((0) + 4|0);
     $expanded67 = $66;
     $expanded66 = (($expanded67) - 1)|0;
     $expanded65 = $expanded66 ^ -1;
     $67 = $65 & $expanded65;
     $68 = $67;
     $69 = HEAP32[$68>>2]|0;
     $arglist_next15 = ((($68)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next15;
     $$mask1 = $69 & 65535;
     $70 = $arg;
     $71 = $70;
     HEAP32[$71>>2] = $$mask1;
     $72 = (($70) + 4)|0;
     $73 = $72;
     HEAP32[$73>>2] = 0;
     break L1;
     break;
    }
    case 15:  {
     $arglist_current17 = HEAP32[$ap>>2]|0;
     $74 = $arglist_current17;
     $75 = ((0) + 4|0);
     $expanded70 = $75;
     $expanded69 = (($expanded70) - 1)|0;
     $76 = (($74) + ($expanded69))|0;
     $77 = ((0) + 4|0);
     $expanded74 = $77;
     $expanded73 = (($expanded74) - 1)|0;
     $expanded72 = $expanded73 ^ -1;
     $78 = $76 & $expanded72;
     $79 = $78;
     $80 = HEAP32[$79>>2]|0;
     $arglist_next18 = ((($79)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next18;
     $81 = $80&255;
     $82 = $81 << 24 >> 24;
     $83 = ($82|0)<(0);
     $84 = $83 << 31 >> 31;
     $85 = $arg;
     $86 = $85;
     HEAP32[$86>>2] = $82;
     $87 = (($85) + 4)|0;
     $88 = $87;
     HEAP32[$88>>2] = $84;
     break L1;
     break;
    }
    case 16:  {
     $arglist_current20 = HEAP32[$ap>>2]|0;
     $89 = $arglist_current20;
     $90 = ((0) + 4|0);
     $expanded77 = $90;
     $expanded76 = (($expanded77) - 1)|0;
     $91 = (($89) + ($expanded76))|0;
     $92 = ((0) + 4|0);
     $expanded81 = $92;
     $expanded80 = (($expanded81) - 1)|0;
     $expanded79 = $expanded80 ^ -1;
     $93 = $91 & $expanded79;
     $94 = $93;
     $95 = HEAP32[$94>>2]|0;
     $arglist_next21 = ((($94)) + 4|0);
     HEAP32[$ap>>2] = $arglist_next21;
     $$mask = $95 & 255;
     $96 = $arg;
     $97 = $96;
     HEAP32[$97>>2] = $$mask;
     $98 = (($96) + 4)|0;
     $99 = $98;
     HEAP32[$99>>2] = 0;
     break L1;
     break;
    }
    case 17:  {
     $arglist_current23 = HEAP32[$ap>>2]|0;
     $100 = $arglist_current23;
     $101 = ((0) + 8|0);
     $expanded84 = $101;
     $expanded83 = (($expanded84) - 1)|0;
     $102 = (($100) + ($expanded83))|0;
     $103 = ((0) + 8|0);
     $expanded88 = $103;
     $expanded87 = (($expanded88) - 1)|0;
     $expanded86 = $expanded87 ^ -1;
     $104 = $102 & $expanded86;
     $105 = $104;
     $106 = +HEAPF64[$105>>3];
     $arglist_next24 = ((($105)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next24;
     HEAPF64[$arg>>3] = $106;
     break L1;
     break;
    }
    case 18:  {
     $arglist_current26 = HEAP32[$ap>>2]|0;
     $107 = $arglist_current26;
     $108 = ((0) + 8|0);
     $expanded91 = $108;
     $expanded90 = (($expanded91) - 1)|0;
     $109 = (($107) + ($expanded90))|0;
     $110 = ((0) + 8|0);
     $expanded95 = $110;
     $expanded94 = (($expanded95) - 1)|0;
     $expanded93 = $expanded94 ^ -1;
     $111 = $109 & $expanded93;
     $112 = $111;
     $113 = +HEAPF64[$112>>3];
     $arglist_next27 = ((($112)) + 8|0);
     HEAP32[$ap>>2] = $arglist_next27;
     HEAPF64[$arg>>3] = $113;
     break L1;
     break;
    }
    default: {
     break L1;
    }
    }
   } while(0);
  }
 } while(0);
 return;
}
function _fmt_u($0,$1,$s) {
 $0 = $0|0;
 $1 = $1|0;
 $s = $s|0;
 var $$0$lcssa = 0, $$01$lcssa$off0 = 0, $$05 = 0, $$1$lcssa = 0, $$12 = 0, $$lcssa19 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $y$03 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $2 = ($1>>>0)>(0);
 $3 = ($0>>>0)>(4294967295);
 $4 = ($1|0)==(0);
 $5 = $4 & $3;
 $6 = $2 | $5;
 if ($6) {
  $$05 = $s;$7 = $0;$8 = $1;
  while(1) {
   $9 = (___uremdi3(($7|0),($8|0),10,0)|0);
   $10 = tempRet0;
   $11 = $9 | 48;
   $12 = $11&255;
   $13 = ((($$05)) + -1|0);
   HEAP8[$13>>0] = $12;
   $14 = (___udivdi3(($7|0),($8|0),10,0)|0);
   $15 = tempRet0;
   $16 = ($8>>>0)>(9);
   $17 = ($7>>>0)>(4294967295);
   $18 = ($8|0)==(9);
   $19 = $18 & $17;
   $20 = $16 | $19;
   if ($20) {
    $$05 = $13;$7 = $14;$8 = $15;
   } else {
    $$lcssa19 = $13;$28 = $14;$29 = $15;
    break;
   }
  }
  $$0$lcssa = $$lcssa19;$$01$lcssa$off0 = $28;
 } else {
  $$0$lcssa = $s;$$01$lcssa$off0 = $0;
 }
 $21 = ($$01$lcssa$off0|0)==(0);
 if ($21) {
  $$1$lcssa = $$0$lcssa;
 } else {
  $$12 = $$0$lcssa;$y$03 = $$01$lcssa$off0;
  while(1) {
   $22 = (($y$03>>>0) % 10)&-1;
   $23 = $22 | 48;
   $24 = $23&255;
   $25 = ((($$12)) + -1|0);
   HEAP8[$25>>0] = $24;
   $26 = (($y$03>>>0) / 10)&-1;
   $27 = ($y$03>>>0)<(10);
   if ($27) {
    $$1$lcssa = $25;
    break;
   } else {
    $$12 = $25;$y$03 = $26;
   }
  }
 }
 return ($$1$lcssa|0);
}
function _strerror($e) {
 $e = $e|0;
 var $$lcssa = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$03 = 0, $i$03$lcssa = 0, $i$12 = 0, $s$0$lcssa = 0, $s$01 = 0, $s$1 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $i$03 = 0;
 while(1) {
  $1 = (5379 + ($i$03)|0);
  $2 = HEAP8[$1>>0]|0;
  $3 = $2&255;
  $4 = ($3|0)==($e|0);
  if ($4) {
   $i$03$lcssa = $i$03;
   label = 2;
   break;
  }
  $5 = (($i$03) + 1)|0;
  $6 = ($5|0)==(87);
  if ($6) {
   $i$12 = 87;$s$01 = 5467;
   label = 5;
   break;
  } else {
   $i$03 = $5;
  }
 }
 if ((label|0) == 2) {
  $0 = ($i$03$lcssa|0)==(0);
  if ($0) {
   $s$0$lcssa = 5467;
  } else {
   $i$12 = $i$03$lcssa;$s$01 = 5467;
   label = 5;
  }
 }
 if ((label|0) == 5) {
  while(1) {
   label = 0;
   $s$1 = $s$01;
   while(1) {
    $7 = HEAP8[$s$1>>0]|0;
    $8 = ($7<<24>>24)==(0);
    $9 = ((($s$1)) + 1|0);
    if ($8) {
     $$lcssa = $9;
     break;
    } else {
     $s$1 = $9;
    }
   }
   $10 = (($i$12) + -1)|0;
   $11 = ($10|0)==(0);
   if ($11) {
    $s$0$lcssa = $$lcssa;
    break;
   } else {
    $i$12 = $10;$s$01 = $$lcssa;
    label = 5;
   }
  }
 }
 return ($s$0$lcssa|0);
}
function _pad($f,$c,$w,$l,$fl) {
 $f = $f|0;
 $c = $c|0;
 $w = $w|0;
 $l = $l|0;
 $fl = $fl|0;
 var $$0$lcssa6 = 0, $$02 = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $or$cond = 0, $pad = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 256|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $pad = sp;
 $0 = $fl & 73728;
 $1 = ($0|0)==(0);
 $2 = ($w|0)>($l|0);
 $or$cond = $2 & $1;
 do {
  if ($or$cond) {
   $3 = (($w) - ($l))|0;
   $4 = ($3>>>0)>(256);
   $5 = $4 ? 256 : $3;
   _memset(($pad|0),($c|0),($5|0))|0;
   $6 = ($3>>>0)>(255);
   $7 = HEAP32[$f>>2]|0;
   $8 = $7 & 32;
   $9 = ($8|0)==(0);
   if ($6) {
    $10 = (($w) - ($l))|0;
    $$02 = $3;$17 = $7;$18 = $9;
    while(1) {
     if ($18) {
      (___fwritex($pad,256,$f)|0);
      $$pre = HEAP32[$f>>2]|0;
      $14 = $$pre;
     } else {
      $14 = $17;
     }
     $11 = (($$02) + -256)|0;
     $12 = ($11>>>0)>(255);
     $13 = $14 & 32;
     $15 = ($13|0)==(0);
     if ($12) {
      $$02 = $11;$17 = $14;$18 = $15;
     } else {
      break;
     }
    }
    $16 = $10 & 255;
    if ($15) {
     $$0$lcssa6 = $16;
    } else {
     break;
    }
   } else {
    if ($9) {
     $$0$lcssa6 = $3;
    } else {
     break;
    }
   }
   (___fwritex($pad,$$0$lcssa6,$f)|0);
  }
 } while(0);
 STACKTOP = sp;return;
}
function _wctomb($s,$wc) {
 $s = $s|0;
 $wc = $wc|0;
 var $$0 = 0, $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($s|0)==(0|0);
 if ($0) {
  $$0 = 0;
 } else {
  $1 = (_wcrtomb($s,$wc,0)|0);
  $$0 = $1;
 }
 return ($$0|0);
}
function _wcrtomb($s,$wc,$st) {
 $s = $s|0;
 $wc = $wc|0;
 $st = $st|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0;
 var $44 = 0, $45 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $or$cond = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($s|0)==(0|0);
 do {
  if ($0) {
   $$0 = 1;
  } else {
   $1 = ($wc>>>0)<(128);
   if ($1) {
    $2 = $wc&255;
    HEAP8[$s>>0] = $2;
    $$0 = 1;
    break;
   }
   $3 = ($wc>>>0)<(2048);
   if ($3) {
    $4 = $wc >>> 6;
    $5 = $4 | 192;
    $6 = $5&255;
    $7 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $6;
    $8 = $wc & 63;
    $9 = $8 | 128;
    $10 = $9&255;
    HEAP8[$7>>0] = $10;
    $$0 = 2;
    break;
   }
   $11 = ($wc>>>0)<(55296);
   $12 = $wc & -8192;
   $13 = ($12|0)==(57344);
   $or$cond = $11 | $13;
   if ($or$cond) {
    $14 = $wc >>> 12;
    $15 = $14 | 224;
    $16 = $15&255;
    $17 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $16;
    $18 = $wc >>> 6;
    $19 = $18 & 63;
    $20 = $19 | 128;
    $21 = $20&255;
    $22 = ((($s)) + 2|0);
    HEAP8[$17>>0] = $21;
    $23 = $wc & 63;
    $24 = $23 | 128;
    $25 = $24&255;
    HEAP8[$22>>0] = $25;
    $$0 = 3;
    break;
   }
   $26 = (($wc) + -65536)|0;
   $27 = ($26>>>0)<(1048576);
   if ($27) {
    $28 = $wc >>> 18;
    $29 = $28 | 240;
    $30 = $29&255;
    $31 = ((($s)) + 1|0);
    HEAP8[$s>>0] = $30;
    $32 = $wc >>> 12;
    $33 = $32 & 63;
    $34 = $33 | 128;
    $35 = $34&255;
    $36 = ((($s)) + 2|0);
    HEAP8[$31>>0] = $35;
    $37 = $wc >>> 6;
    $38 = $37 & 63;
    $39 = $38 | 128;
    $40 = $39&255;
    $41 = ((($s)) + 3|0);
    HEAP8[$36>>0] = $40;
    $42 = $wc & 63;
    $43 = $42 | 128;
    $44 = $43&255;
    HEAP8[$41>>0] = $44;
    $$0 = 4;
    break;
   } else {
    $45 = (___errno_location()|0);
    HEAP32[$45>>2] = 84;
    $$0 = -1;
    break;
   }
  }
 } while(0);
 return ($$0|0);
}
function _frexpl($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $0 = 0.0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (+_frexp($x,$e));
 return (+$0);
}
function _frexp($x,$e) {
 $x = +$x;
 $e = $e|0;
 var $$0 = 0.0, $$01 = 0.0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0.0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0.0, $7 = 0.0, $8 = 0, $9 = 0, $storemerge = 0, label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF64[tempDoublePtr>>3] = $x;$0 = HEAP32[tempDoublePtr>>2]|0;
 $1 = HEAP32[tempDoublePtr+4>>2]|0;
 $2 = (_bitshift64Lshr(($0|0),($1|0),52)|0);
 $3 = tempRet0;
 $4 = $2 & 2047;
 switch ($4|0) {
 case 0:  {
  $5 = $x != 0.0;
  if ($5) {
   $6 = $x * 1.8446744073709552E+19;
   $7 = (+_frexp($6,$e));
   $8 = HEAP32[$e>>2]|0;
   $9 = (($8) + -64)|0;
   $$01 = $7;$storemerge = $9;
  } else {
   $$01 = $x;$storemerge = 0;
  }
  HEAP32[$e>>2] = $storemerge;
  $$0 = $$01;
  break;
 }
 case 2047:  {
  $$0 = $x;
  break;
 }
 default: {
  $10 = (($4) + -1022)|0;
  HEAP32[$e>>2] = $10;
  $11 = $1 & -2146435073;
  $12 = $11 | 1071644672;
  HEAP32[tempDoublePtr>>2] = $0;HEAP32[tempDoublePtr+4>>2] = $12;$13 = +HEAPF64[tempDoublePtr>>3];
  $$0 = $13;
 }
 }
 return (+$$0);
}
function ___lockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function _fflush($f) {
 $f = $f|0;
 var $$0 = 0, $$01 = 0, $$012 = 0, $$014 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, $r$0$lcssa = 0, $r$03 = 0, $r$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($f|0)==(0|0);
 do {
  if ($0) {
   $7 = HEAP32[246]|0;
   $8 = ($7|0)==(0|0);
   if ($8) {
    $27 = 0;
   } else {
    $9 = HEAP32[246]|0;
    $10 = (_fflush($9)|0);
    $27 = $10;
   }
   ___lock(((7444)|0));
   $$012 = HEAP32[(7440)>>2]|0;
   $11 = ($$012|0)==(0|0);
   if ($11) {
    $r$0$lcssa = $27;
   } else {
    $$014 = $$012;$r$03 = $27;
    while(1) {
     $12 = ((($$014)) + 76|0);
     $13 = HEAP32[$12>>2]|0;
     $14 = ($13|0)>(-1);
     if ($14) {
      $15 = (___lockfile($$014)|0);
      $23 = $15;
     } else {
      $23 = 0;
     }
     $16 = ((($$014)) + 20|0);
     $17 = HEAP32[$16>>2]|0;
     $18 = ((($$014)) + 28|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ($17>>>0)>($19>>>0);
     if ($20) {
      $21 = (___fflush_unlocked($$014)|0);
      $22 = $21 | $r$03;
      $r$1 = $22;
     } else {
      $r$1 = $r$03;
     }
     $24 = ($23|0)==(0);
     if (!($24)) {
      ___unlockfile($$014);
     }
     $25 = ((($$014)) + 56|0);
     $$01 = HEAP32[$25>>2]|0;
     $26 = ($$01|0)==(0|0);
     if ($26) {
      $r$0$lcssa = $r$1;
      break;
     } else {
      $$014 = $$01;$r$03 = $r$1;
     }
    }
   }
   ___unlock(((7444)|0));
   $$0 = $r$0$lcssa;
  } else {
   $1 = ((($f)) + 76|0);
   $2 = HEAP32[$1>>2]|0;
   $3 = ($2|0)>(-1);
   if (!($3)) {
    $4 = (___fflush_unlocked($f)|0);
    $$0 = $4;
    break;
   }
   $5 = (___lockfile($f)|0);
   $phitmp = ($5|0)==(0);
   $6 = (___fflush_unlocked($f)|0);
   if ($phitmp) {
    $$0 = $6;
   } else {
    ___unlockfile($f);
    $$0 = $6;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 20|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($f)) + 28|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($1>>>0)>($3>>>0);
 if ($4) {
  $5 = ((($f)) + 36|0);
  $6 = HEAP32[$5>>2]|0;
  (FUNCTION_TABLE_iiii[$6 & 15]($f,0,0)|0);
  $7 = HEAP32[$0>>2]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $9 = ((($f)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ((($f)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($10>>>0)<($12>>>0);
  if ($13) {
   $14 = ((($f)) + 40|0);
   $15 = HEAP32[$14>>2]|0;
   $16 = $10;
   $17 = $12;
   $18 = (($16) - ($17))|0;
   (FUNCTION_TABLE_iiii[$15 & 15]($f,$18,1)|0);
  }
  $19 = ((($f)) + 16|0);
  HEAP32[$19>>2] = 0;
  HEAP32[$2>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$11>>2] = 0;
  HEAP32[$9>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function ___overflow($f,$_c) {
 $f = $f|0;
 $_c = $_c|0;
 var $$0 = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $3 = 0, $4 = 0, $5 = 0;
 var $6 = 0, $7 = 0, $8 = 0, $9 = 0, $c = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $c = sp;
 $0 = $_c&255;
 HEAP8[$c>>0] = $0;
 $1 = ((($f)) + 16|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==(0|0);
 if ($3) {
  $4 = (___towrite($f)|0);
  $5 = ($4|0)==(0);
  if ($5) {
   $$pre = HEAP32[$1>>2]|0;
   $9 = $$pre;
   label = 4;
  } else {
   $$0 = -1;
  }
 } else {
  $9 = $2;
  label = 4;
 }
 do {
  if ((label|0) == 4) {
   $6 = ((($f)) + 20|0);
   $7 = HEAP32[$6>>2]|0;
   $8 = ($7>>>0)<($9>>>0);
   if ($8) {
    $10 = $_c & 255;
    $11 = ((($f)) + 75|0);
    $12 = HEAP8[$11>>0]|0;
    $13 = $12 << 24 >> 24;
    $14 = ($10|0)==($13|0);
    if (!($14)) {
     $15 = ((($7)) + 1|0);
     HEAP32[$6>>2] = $15;
     HEAP8[$7>>0] = $0;
     $$0 = $10;
     break;
    }
   }
   $16 = ((($f)) + 36|0);
   $17 = HEAP32[$16>>2]|0;
   $18 = (FUNCTION_TABLE_iiii[$17 & 15]($f,$c,1)|0);
   $19 = ($18|0)==(1);
   if ($19) {
    $20 = HEAP8[$c>>0]|0;
    $21 = $20&255;
    $$0 = $21;
   } else {
    $$0 = -1;
   }
  }
 } while(0);
 STACKTOP = sp;return ($$0|0);
}
function _printf($fmt,$varargs) {
 $fmt = $fmt|0;
 $varargs = $varargs|0;
 var $0 = 0, $1 = 0, $ap = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $ap = sp;
 HEAP32[$ap>>2] = $varargs;
 $0 = HEAP32[217]|0;
 $1 = (_vfprintf($0,$fmt,$ap)|0);
 STACKTOP = sp;return ($1|0);
}
function _putchar($c) {
 $c = $c|0;
 var $0 = 0, $1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[217]|0;
 $1 = (_fputc($c,$0)|0);
 return ($1|0);
}
function _fputc($c,$f) {
 $c = $c|0;
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 76|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)<(0);
 if ($2) {
  label = 3;
 } else {
  $3 = (___lockfile($f)|0);
  $4 = ($3|0)==(0);
  if ($4) {
   label = 3;
  } else {
   $18 = ((($f)) + 75|0);
   $19 = HEAP8[$18>>0]|0;
   $20 = $19 << 24 >> 24;
   $21 = ($20|0)==($c|0);
   if ($21) {
    label = 10;
   } else {
    $22 = ((($f)) + 20|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ((($f)) + 16|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = ($23>>>0)<($25>>>0);
    if ($26) {
     $27 = $c&255;
     $28 = ((($23)) + 1|0);
     HEAP32[$22>>2] = $28;
     HEAP8[$23>>0] = $27;
     $29 = $c & 255;
     $31 = $29;
    } else {
     label = 10;
    }
   }
   if ((label|0) == 10) {
    $30 = (___overflow($f,$c)|0);
    $31 = $30;
   }
   ___unlockfile($f);
   $$0 = $31;
  }
 }
 do {
  if ((label|0) == 3) {
   $5 = ((($f)) + 75|0);
   $6 = HEAP8[$5>>0]|0;
   $7 = $6 << 24 >> 24;
   $8 = ($7|0)==($c|0);
   if (!($8)) {
    $9 = ((($f)) + 20|0);
    $10 = HEAP32[$9>>2]|0;
    $11 = ((($f)) + 16|0);
    $12 = HEAP32[$11>>2]|0;
    $13 = ($10>>>0)<($12>>>0);
    if ($13) {
     $14 = $c&255;
     $15 = ((($10)) + 1|0);
     HEAP32[$9>>2] = $15;
     HEAP8[$10>>0] = $14;
     $16 = $c & 255;
     $$0 = $16;
     break;
    }
   }
   $17 = (___overflow($f,$c)|0);
   $$0 = $17;
  }
 } while(0);
 return ($$0|0);
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$0 = 0, $$lcssa = 0, $$lcssa141 = 0, $$lcssa142 = 0, $$lcssa144 = 0, $$lcssa147 = 0, $$lcssa149 = 0, $$lcssa151 = 0, $$lcssa153 = 0, $$lcssa155 = 0, $$lcssa157 = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i13 = 0, $$pre$i16$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i14Z2D = 0, $$pre$phi$i17$iZ2D = 0;
 var $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre71 = 0, $$pre9$i$i = 0, $$rsize$0$i = 0, $$rsize$4$i = 0, $$v$0$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0;
 var $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0;
 var $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0;
 var $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0;
 var $1062 = 0, $1063 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0;
 var $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0;
 var $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0;
 var $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0;
 var $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0;
 var $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0;
 var $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0;
 var $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0;
 var $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0;
 var $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0;
 var $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0;
 var $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0;
 var $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0;
 var $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0;
 var $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0;
 var $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0;
 var $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0;
 var $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0;
 var $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0;
 var $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0;
 var $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0;
 var $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0;
 var $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0;
 var $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0;
 var $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0;
 var $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0;
 var $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0;
 var $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0;
 var $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0;
 var $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0;
 var $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0;
 var $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0;
 var $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0;
 var $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0;
 var $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0;
 var $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0;
 var $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0;
 var $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0;
 var $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0;
 var $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0;
 var $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0;
 var $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0;
 var $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $F$0$i$i = 0, $F1$0$i = 0, $F4$0 = 0, $F4$0$i$i = 0, $F5$0$i = 0, $I1$0$i$i = 0, $I7$0$i = 0, $I7$0$i$i = 0;
 var $K12$0$i = 0, $K2$0$i$i = 0, $K8$0$i$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i$i$lcssa = 0, $R$1$i$lcssa = 0, $R$1$i9 = 0, $R$1$i9$lcssa = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i11 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i$i$lcssa = 0, $RP$1$i$lcssa = 0, $RP$1$i8 = 0, $RP$1$i8$lcssa = 0, $T$0$i = 0, $T$0$i$i = 0;
 var $T$0$i$i$lcssa = 0, $T$0$i$i$lcssa140 = 0, $T$0$i$lcssa = 0, $T$0$i$lcssa156 = 0, $T$0$i18$i = 0, $T$0$i18$i$lcssa = 0, $T$0$i18$i$lcssa139 = 0, $br$2$ph$i = 0, $cond$i = 0, $cond$i$i = 0, $cond$i12 = 0, $exitcond$i$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $nb$0 = 0, $not$$i$i = 0, $not$$i20$i = 0, $not$7$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0;
 var $or$cond$i17 = 0, $or$cond1$i = 0, $or$cond1$i16 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond2$i = 0, $or$cond48$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $p$0$i$i = 0, $qsize$0$i$i = 0, $rsize$0$i = 0, $rsize$0$i$lcssa = 0, $rsize$0$i5 = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$412$i = 0, $rst$0$i = 0;
 var $rst$1$i = 0, $sizebits$0$$i = 0, $sizebits$0$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$068$i = 0, $sp$068$i$lcssa = 0, $sp$167$i = 0, $sp$167$i$lcssa = 0, $ssize$0$i = 0, $ssize$2$ph$i = 0, $ssize$5$i = 0, $t$0$i = 0, $t$0$i4 = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$411$i = 0, $tbase$746$i = 0, $tsize$745$i = 0;
 var $v$0$i = 0, $v$0$i$lcssa = 0, $v$0$i6 = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$413$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($bytes>>>0)<(245);
 do {
  if ($0) {
   $1 = ($bytes>>>0)<(11);
   $2 = (($bytes) + 11)|0;
   $3 = $2 & -8;
   $4 = $1 ? 16 : $3;
   $5 = $4 >>> 3;
   $6 = HEAP32[1866]|0;
   $7 = $6 >>> $5;
   $8 = $7 & 3;
   $9 = ($8|0)==(0);
   if (!($9)) {
    $10 = $7 & 1;
    $11 = $10 ^ 1;
    $12 = (($11) + ($5))|0;
    $13 = $12 << 1;
    $14 = (7504 + ($13<<2)|0);
    $15 = ((($14)) + 8|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ($14|0)==($18|0);
    do {
     if ($19) {
      $20 = 1 << $12;
      $21 = $20 ^ -1;
      $22 = $6 & $21;
      HEAP32[1866] = $22;
     } else {
      $23 = HEAP32[(7480)>>2]|0;
      $24 = ($18>>>0)<($23>>>0);
      if ($24) {
       _abort();
       // unreachable;
      }
      $25 = ((($18)) + 12|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = ($26|0)==($16|0);
      if ($27) {
       HEAP32[$25>>2] = $14;
       HEAP32[$15>>2] = $18;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $28 = $12 << 3;
    $29 = $28 | 3;
    $30 = ((($16)) + 4|0);
    HEAP32[$30>>2] = $29;
    $31 = (($16) + ($28)|0);
    $32 = ((($31)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = $33 | 1;
    HEAP32[$32>>2] = $34;
    $$0 = $17;
    return ($$0|0);
   }
   $35 = HEAP32[(7472)>>2]|0;
   $36 = ($4>>>0)>($35>>>0);
   if ($36) {
    $37 = ($7|0)==(0);
    if (!($37)) {
     $38 = $7 << $5;
     $39 = 2 << $5;
     $40 = (0 - ($39))|0;
     $41 = $39 | $40;
     $42 = $38 & $41;
     $43 = (0 - ($42))|0;
     $44 = $42 & $43;
     $45 = (($44) + -1)|0;
     $46 = $45 >>> 12;
     $47 = $46 & 16;
     $48 = $45 >>> $47;
     $49 = $48 >>> 5;
     $50 = $49 & 8;
     $51 = $50 | $47;
     $52 = $48 >>> $50;
     $53 = $52 >>> 2;
     $54 = $53 & 4;
     $55 = $51 | $54;
     $56 = $52 >>> $54;
     $57 = $56 >>> 1;
     $58 = $57 & 2;
     $59 = $55 | $58;
     $60 = $56 >>> $58;
     $61 = $60 >>> 1;
     $62 = $61 & 1;
     $63 = $59 | $62;
     $64 = $60 >>> $62;
     $65 = (($63) + ($64))|0;
     $66 = $65 << 1;
     $67 = (7504 + ($66<<2)|0);
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ($67|0)==($71|0);
     do {
      if ($72) {
       $73 = 1 << $65;
       $74 = $73 ^ -1;
       $75 = $6 & $74;
       HEAP32[1866] = $75;
       $89 = $35;
      } else {
       $76 = HEAP32[(7480)>>2]|0;
       $77 = ($71>>>0)<($76>>>0);
       if ($77) {
        _abort();
        // unreachable;
       }
       $78 = ((($71)) + 12|0);
       $79 = HEAP32[$78>>2]|0;
       $80 = ($79|0)==($69|0);
       if ($80) {
        HEAP32[$78>>2] = $67;
        HEAP32[$68>>2] = $71;
        $$pre = HEAP32[(7472)>>2]|0;
        $89 = $$pre;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $81 = $65 << 3;
     $82 = (($81) - ($4))|0;
     $83 = $4 | 3;
     $84 = ((($69)) + 4|0);
     HEAP32[$84>>2] = $83;
     $85 = (($69) + ($4)|0);
     $86 = $82 | 1;
     $87 = ((($85)) + 4|0);
     HEAP32[$87>>2] = $86;
     $88 = (($85) + ($82)|0);
     HEAP32[$88>>2] = $82;
     $90 = ($89|0)==(0);
     if (!($90)) {
      $91 = HEAP32[(7484)>>2]|0;
      $92 = $89 >>> 3;
      $93 = $92 << 1;
      $94 = (7504 + ($93<<2)|0);
      $95 = HEAP32[1866]|0;
      $96 = 1 << $92;
      $97 = $95 & $96;
      $98 = ($97|0)==(0);
      if ($98) {
       $99 = $95 | $96;
       HEAP32[1866] = $99;
       $$pre71 = ((($94)) + 8|0);
       $$pre$phiZ2D = $$pre71;$F4$0 = $94;
      } else {
       $100 = ((($94)) + 8|0);
       $101 = HEAP32[$100>>2]|0;
       $102 = HEAP32[(7480)>>2]|0;
       $103 = ($101>>>0)<($102>>>0);
       if ($103) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $100;$F4$0 = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $91;
      $104 = ((($F4$0)) + 12|0);
      HEAP32[$104>>2] = $91;
      $105 = ((($91)) + 8|0);
      HEAP32[$105>>2] = $F4$0;
      $106 = ((($91)) + 12|0);
      HEAP32[$106>>2] = $94;
     }
     HEAP32[(7472)>>2] = $82;
     HEAP32[(7484)>>2] = $85;
     $$0 = $70;
     return ($$0|0);
    }
    $107 = HEAP32[(7468)>>2]|0;
    $108 = ($107|0)==(0);
    if ($108) {
     $nb$0 = $4;
    } else {
     $109 = (0 - ($107))|0;
     $110 = $107 & $109;
     $111 = (($110) + -1)|0;
     $112 = $111 >>> 12;
     $113 = $112 & 16;
     $114 = $111 >>> $113;
     $115 = $114 >>> 5;
     $116 = $115 & 8;
     $117 = $116 | $113;
     $118 = $114 >>> $116;
     $119 = $118 >>> 2;
     $120 = $119 & 4;
     $121 = $117 | $120;
     $122 = $118 >>> $120;
     $123 = $122 >>> 1;
     $124 = $123 & 2;
     $125 = $121 | $124;
     $126 = $122 >>> $124;
     $127 = $126 >>> 1;
     $128 = $127 & 1;
     $129 = $125 | $128;
     $130 = $126 >>> $128;
     $131 = (($129) + ($130))|0;
     $132 = (7768 + ($131<<2)|0);
     $133 = HEAP32[$132>>2]|0;
     $134 = ((($133)) + 4|0);
     $135 = HEAP32[$134>>2]|0;
     $136 = $135 & -8;
     $137 = (($136) - ($4))|0;
     $rsize$0$i = $137;$t$0$i = $133;$v$0$i = $133;
     while(1) {
      $138 = ((($t$0$i)) + 16|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0|0);
      if ($140) {
       $141 = ((($t$0$i)) + 20|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        $rsize$0$i$lcssa = $rsize$0$i;$v$0$i$lcssa = $v$0$i;
        break;
       } else {
        $145 = $142;
       }
      } else {
       $145 = $139;
      }
      $144 = ((($145)) + 4|0);
      $146 = HEAP32[$144>>2]|0;
      $147 = $146 & -8;
      $148 = (($147) - ($4))|0;
      $149 = ($148>>>0)<($rsize$0$i>>>0);
      $$rsize$0$i = $149 ? $148 : $rsize$0$i;
      $$v$0$i = $149 ? $145 : $v$0$i;
      $rsize$0$i = $$rsize$0$i;$t$0$i = $145;$v$0$i = $$v$0$i;
     }
     $150 = HEAP32[(7480)>>2]|0;
     $151 = ($v$0$i$lcssa>>>0)<($150>>>0);
     if ($151) {
      _abort();
      // unreachable;
     }
     $152 = (($v$0$i$lcssa) + ($4)|0);
     $153 = ($v$0$i$lcssa>>>0)<($152>>>0);
     if (!($153)) {
      _abort();
      // unreachable;
     }
     $154 = ((($v$0$i$lcssa)) + 24|0);
     $155 = HEAP32[$154>>2]|0;
     $156 = ((($v$0$i$lcssa)) + 12|0);
     $157 = HEAP32[$156>>2]|0;
     $158 = ($157|0)==($v$0$i$lcssa|0);
     do {
      if ($158) {
       $168 = ((($v$0$i$lcssa)) + 20|0);
       $169 = HEAP32[$168>>2]|0;
       $170 = ($169|0)==(0|0);
       if ($170) {
        $171 = ((($v$0$i$lcssa)) + 16|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($172|0)==(0|0);
        if ($173) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $172;$RP$1$i = $171;
        }
       } else {
        $R$1$i = $169;$RP$1$i = $168;
       }
       while(1) {
        $174 = ((($R$1$i)) + 20|0);
        $175 = HEAP32[$174>>2]|0;
        $176 = ($175|0)==(0|0);
        if (!($176)) {
         $R$1$i = $175;$RP$1$i = $174;
         continue;
        }
        $177 = ((($R$1$i)) + 16|0);
        $178 = HEAP32[$177>>2]|0;
        $179 = ($178|0)==(0|0);
        if ($179) {
         $R$1$i$lcssa = $R$1$i;$RP$1$i$lcssa = $RP$1$i;
         break;
        } else {
         $R$1$i = $178;$RP$1$i = $177;
        }
       }
       $180 = ($RP$1$i$lcssa>>>0)<($150>>>0);
       if ($180) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i$lcssa>>2] = 0;
        $R$3$i = $R$1$i$lcssa;
        break;
       }
      } else {
       $159 = ((($v$0$i$lcssa)) + 8|0);
       $160 = HEAP32[$159>>2]|0;
       $161 = ($160>>>0)<($150>>>0);
       if ($161) {
        _abort();
        // unreachable;
       }
       $162 = ((($160)) + 12|0);
       $163 = HEAP32[$162>>2]|0;
       $164 = ($163|0)==($v$0$i$lcssa|0);
       if (!($164)) {
        _abort();
        // unreachable;
       }
       $165 = ((($157)) + 8|0);
       $166 = HEAP32[$165>>2]|0;
       $167 = ($166|0)==($v$0$i$lcssa|0);
       if ($167) {
        HEAP32[$162>>2] = $157;
        HEAP32[$165>>2] = $160;
        $R$3$i = $157;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $181 = ($155|0)==(0|0);
     do {
      if (!($181)) {
       $182 = ((($v$0$i$lcssa)) + 28|0);
       $183 = HEAP32[$182>>2]|0;
       $184 = (7768 + ($183<<2)|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($v$0$i$lcssa|0)==($185|0);
       if ($186) {
        HEAP32[$184>>2] = $R$3$i;
        $cond$i = ($R$3$i|0)==(0|0);
        if ($cond$i) {
         $187 = 1 << $183;
         $188 = $187 ^ -1;
         $189 = HEAP32[(7468)>>2]|0;
         $190 = $189 & $188;
         HEAP32[(7468)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(7480)>>2]|0;
        $192 = ($155>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($155)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($v$0$i$lcssa|0);
        if ($195) {
         HEAP32[$193>>2] = $R$3$i;
        } else {
         $196 = ((($155)) + 20|0);
         HEAP32[$196>>2] = $R$3$i;
        }
        $197 = ($R$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(7480)>>2]|0;
       $199 = ($R$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($R$3$i)) + 24|0);
       HEAP32[$200>>2] = $155;
       $201 = ((($v$0$i$lcssa)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($R$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($v$0$i$lcssa)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(7480)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($R$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($rsize$0$i$lcssa>>>0)<(16);
     if ($214) {
      $215 = (($rsize$0$i$lcssa) + ($4))|0;
      $216 = $215 | 3;
      $217 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($v$0$i$lcssa) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $4 | 3;
      $223 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $rsize$0$i$lcssa | 1;
      $225 = ((($152)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($152) + ($rsize$0$i$lcssa)|0);
      HEAP32[$226>>2] = $rsize$0$i$lcssa;
      $227 = HEAP32[(7472)>>2]|0;
      $228 = ($227|0)==(0);
      if (!($228)) {
       $229 = HEAP32[(7484)>>2]|0;
       $230 = $227 >>> 3;
       $231 = $230 << 1;
       $232 = (7504 + ($231<<2)|0);
       $233 = HEAP32[1866]|0;
       $234 = 1 << $230;
       $235 = $233 & $234;
       $236 = ($235|0)==(0);
       if ($236) {
        $237 = $233 | $234;
        HEAP32[1866] = $237;
        $$pre$i = ((($232)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F1$0$i = $232;
       } else {
        $238 = ((($232)) + 8|0);
        $239 = HEAP32[$238>>2]|0;
        $240 = HEAP32[(7480)>>2]|0;
        $241 = ($239>>>0)<($240>>>0);
        if ($241) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $238;$F1$0$i = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $229;
       $242 = ((($F1$0$i)) + 12|0);
       HEAP32[$242>>2] = $229;
       $243 = ((($229)) + 8|0);
       HEAP32[$243>>2] = $F1$0$i;
       $244 = ((($229)) + 12|0);
       HEAP32[$244>>2] = $232;
      }
      HEAP32[(7472)>>2] = $rsize$0$i$lcssa;
      HEAP32[(7484)>>2] = $152;
     }
     $245 = ((($v$0$i$lcssa)) + 8|0);
     $$0 = $245;
     return ($$0|0);
    }
   } else {
    $nb$0 = $4;
   }
  } else {
   $246 = ($bytes>>>0)>(4294967231);
   if ($246) {
    $nb$0 = -1;
   } else {
    $247 = (($bytes) + 11)|0;
    $248 = $247 & -8;
    $249 = HEAP32[(7468)>>2]|0;
    $250 = ($249|0)==(0);
    if ($250) {
     $nb$0 = $248;
    } else {
     $251 = (0 - ($248))|0;
     $252 = $247 >>> 8;
     $253 = ($252|0)==(0);
     if ($253) {
      $idx$0$i = 0;
     } else {
      $254 = ($248>>>0)>(16777215);
      if ($254) {
       $idx$0$i = 31;
      } else {
       $255 = (($252) + 1048320)|0;
       $256 = $255 >>> 16;
       $257 = $256 & 8;
       $258 = $252 << $257;
       $259 = (($258) + 520192)|0;
       $260 = $259 >>> 16;
       $261 = $260 & 4;
       $262 = $261 | $257;
       $263 = $258 << $261;
       $264 = (($263) + 245760)|0;
       $265 = $264 >>> 16;
       $266 = $265 & 2;
       $267 = $262 | $266;
       $268 = (14 - ($267))|0;
       $269 = $263 << $266;
       $270 = $269 >>> 15;
       $271 = (($268) + ($270))|0;
       $272 = $271 << 1;
       $273 = (($271) + 7)|0;
       $274 = $248 >>> $273;
       $275 = $274 & 1;
       $276 = $275 | $272;
       $idx$0$i = $276;
      }
     }
     $277 = (7768 + ($idx$0$i<<2)|0);
     $278 = HEAP32[$277>>2]|0;
     $279 = ($278|0)==(0|0);
     L123: do {
      if ($279) {
       $rsize$3$i = $251;$t$2$i = 0;$v$3$i = 0;
       label = 86;
      } else {
       $280 = ($idx$0$i|0)==(31);
       $281 = $idx$0$i >>> 1;
       $282 = (25 - ($281))|0;
       $283 = $280 ? 0 : $282;
       $284 = $248 << $283;
       $rsize$0$i5 = $251;$rst$0$i = 0;$sizebits$0$i = $284;$t$0$i4 = $278;$v$0$i6 = 0;
       while(1) {
        $285 = ((($t$0$i4)) + 4|0);
        $286 = HEAP32[$285>>2]|0;
        $287 = $286 & -8;
        $288 = (($287) - ($248))|0;
        $289 = ($288>>>0)<($rsize$0$i5>>>0);
        if ($289) {
         $290 = ($287|0)==($248|0);
         if ($290) {
          $rsize$412$i = $288;$t$411$i = $t$0$i4;$v$413$i = $t$0$i4;
          label = 90;
          break L123;
         } else {
          $rsize$1$i = $288;$v$1$i = $t$0$i4;
         }
        } else {
         $rsize$1$i = $rsize$0$i5;$v$1$i = $v$0$i6;
        }
        $291 = ((($t$0$i4)) + 20|0);
        $292 = HEAP32[$291>>2]|0;
        $293 = $sizebits$0$i >>> 31;
        $294 = (((($t$0$i4)) + 16|0) + ($293<<2)|0);
        $295 = HEAP32[$294>>2]|0;
        $296 = ($292|0)==(0|0);
        $297 = ($292|0)==($295|0);
        $or$cond1$i = $296 | $297;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $292;
        $298 = ($295|0)==(0|0);
        $299 = $298&1;
        $300 = $299 ^ 1;
        $sizebits$0$$i = $sizebits$0$i << $300;
        if ($298) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 86;
         break;
        } else {
         $rsize$0$i5 = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$$i;$t$0$i4 = $295;$v$0$i6 = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $301 = ($t$2$i|0)==(0|0);
      $302 = ($v$3$i|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $idx$0$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $249 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $nb$0 = $248;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (7768 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $t$4$ph$i = $332;
      } else {
       $t$4$ph$i = $t$2$i;
      }
      $333 = ($t$4$ph$i|0)==(0|0);
      if ($333) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$3$i;
      } else {
       $rsize$412$i = $rsize$3$i;$t$411$i = $t$4$ph$i;$v$413$i = $v$3$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $334 = ((($t$411$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($248))|0;
       $338 = ($337>>>0)<($rsize$412$i>>>0);
       $$rsize$4$i = $338 ? $337 : $rsize$412$i;
       $t$4$v$4$i = $338 ? $t$411$i : $v$413$i;
       $339 = ((($t$411$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $341 = ($340|0)==(0|0);
       if (!($341)) {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $340;$v$413$i = $t$4$v$4$i;
        label = 90;
        continue;
       }
       $342 = ((($t$411$i)) + 20|0);
       $343 = HEAP32[$342>>2]|0;
       $344 = ($343|0)==(0|0);
       if ($344) {
        $rsize$4$lcssa$i = $$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $343;$v$413$i = $t$4$v$4$i;
        label = 90;
       }
      }
     }
     $345 = ($v$4$lcssa$i|0)==(0|0);
     if ($345) {
      $nb$0 = $248;
     } else {
      $346 = HEAP32[(7472)>>2]|0;
      $347 = (($346) - ($248))|0;
      $348 = ($rsize$4$lcssa$i>>>0)<($347>>>0);
      if ($348) {
       $349 = HEAP32[(7480)>>2]|0;
       $350 = ($v$4$lcssa$i>>>0)<($349>>>0);
       if ($350) {
        _abort();
        // unreachable;
       }
       $351 = (($v$4$lcssa$i) + ($248)|0);
       $352 = ($v$4$lcssa$i>>>0)<($351>>>0);
       if (!($352)) {
        _abort();
        // unreachable;
       }
       $353 = ((($v$4$lcssa$i)) + 24|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ((($v$4$lcssa$i)) + 12|0);
       $356 = HEAP32[$355>>2]|0;
       $357 = ($356|0)==($v$4$lcssa$i|0);
       do {
        if ($357) {
         $367 = ((($v$4$lcssa$i)) + 20|0);
         $368 = HEAP32[$367>>2]|0;
         $369 = ($368|0)==(0|0);
         if ($369) {
          $370 = ((($v$4$lcssa$i)) + 16|0);
          $371 = HEAP32[$370>>2]|0;
          $372 = ($371|0)==(0|0);
          if ($372) {
           $R$3$i11 = 0;
           break;
          } else {
           $R$1$i9 = $371;$RP$1$i8 = $370;
          }
         } else {
          $R$1$i9 = $368;$RP$1$i8 = $367;
         }
         while(1) {
          $373 = ((($R$1$i9)) + 20|0);
          $374 = HEAP32[$373>>2]|0;
          $375 = ($374|0)==(0|0);
          if (!($375)) {
           $R$1$i9 = $374;$RP$1$i8 = $373;
           continue;
          }
          $376 = ((($R$1$i9)) + 16|0);
          $377 = HEAP32[$376>>2]|0;
          $378 = ($377|0)==(0|0);
          if ($378) {
           $R$1$i9$lcssa = $R$1$i9;$RP$1$i8$lcssa = $RP$1$i8;
           break;
          } else {
           $R$1$i9 = $377;$RP$1$i8 = $376;
          }
         }
         $379 = ($RP$1$i8$lcssa>>>0)<($349>>>0);
         if ($379) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i8$lcssa>>2] = 0;
          $R$3$i11 = $R$1$i9$lcssa;
          break;
         }
        } else {
         $358 = ((($v$4$lcssa$i)) + 8|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359>>>0)<($349>>>0);
         if ($360) {
          _abort();
          // unreachable;
         }
         $361 = ((($359)) + 12|0);
         $362 = HEAP32[$361>>2]|0;
         $363 = ($362|0)==($v$4$lcssa$i|0);
         if (!($363)) {
          _abort();
          // unreachable;
         }
         $364 = ((($356)) + 8|0);
         $365 = HEAP32[$364>>2]|0;
         $366 = ($365|0)==($v$4$lcssa$i|0);
         if ($366) {
          HEAP32[$361>>2] = $356;
          HEAP32[$364>>2] = $359;
          $R$3$i11 = $356;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $380 = ($354|0)==(0|0);
       do {
        if (!($380)) {
         $381 = ((($v$4$lcssa$i)) + 28|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = (7768 + ($382<<2)|0);
         $384 = HEAP32[$383>>2]|0;
         $385 = ($v$4$lcssa$i|0)==($384|0);
         if ($385) {
          HEAP32[$383>>2] = $R$3$i11;
          $cond$i12 = ($R$3$i11|0)==(0|0);
          if ($cond$i12) {
           $386 = 1 << $382;
           $387 = $386 ^ -1;
           $388 = HEAP32[(7468)>>2]|0;
           $389 = $388 & $387;
           HEAP32[(7468)>>2] = $389;
           break;
          }
         } else {
          $390 = HEAP32[(7480)>>2]|0;
          $391 = ($354>>>0)<($390>>>0);
          if ($391) {
           _abort();
           // unreachable;
          }
          $392 = ((($354)) + 16|0);
          $393 = HEAP32[$392>>2]|0;
          $394 = ($393|0)==($v$4$lcssa$i|0);
          if ($394) {
           HEAP32[$392>>2] = $R$3$i11;
          } else {
           $395 = ((($354)) + 20|0);
           HEAP32[$395>>2] = $R$3$i11;
          }
          $396 = ($R$3$i11|0)==(0|0);
          if ($396) {
           break;
          }
         }
         $397 = HEAP32[(7480)>>2]|0;
         $398 = ($R$3$i11>>>0)<($397>>>0);
         if ($398) {
          _abort();
          // unreachable;
         }
         $399 = ((($R$3$i11)) + 24|0);
         HEAP32[$399>>2] = $354;
         $400 = ((($v$4$lcssa$i)) + 16|0);
         $401 = HEAP32[$400>>2]|0;
         $402 = ($401|0)==(0|0);
         do {
          if (!($402)) {
           $403 = ($401>>>0)<($397>>>0);
           if ($403) {
            _abort();
            // unreachable;
           } else {
            $404 = ((($R$3$i11)) + 16|0);
            HEAP32[$404>>2] = $401;
            $405 = ((($401)) + 24|0);
            HEAP32[$405>>2] = $R$3$i11;
            break;
           }
          }
         } while(0);
         $406 = ((($v$4$lcssa$i)) + 20|0);
         $407 = HEAP32[$406>>2]|0;
         $408 = ($407|0)==(0|0);
         if (!($408)) {
          $409 = HEAP32[(7480)>>2]|0;
          $410 = ($407>>>0)<($409>>>0);
          if ($410) {
           _abort();
           // unreachable;
          } else {
           $411 = ((($R$3$i11)) + 20|0);
           HEAP32[$411>>2] = $407;
           $412 = ((($407)) + 24|0);
           HEAP32[$412>>2] = $R$3$i11;
           break;
          }
         }
        }
       } while(0);
       $413 = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($413) {
         $414 = (($rsize$4$lcssa$i) + ($248))|0;
         $415 = $414 | 3;
         $416 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$416>>2] = $415;
         $417 = (($v$4$lcssa$i) + ($414)|0);
         $418 = ((($417)) + 4|0);
         $419 = HEAP32[$418>>2]|0;
         $420 = $419 | 1;
         HEAP32[$418>>2] = $420;
        } else {
         $421 = $248 | 3;
         $422 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$422>>2] = $421;
         $423 = $rsize$4$lcssa$i | 1;
         $424 = ((($351)) + 4|0);
         HEAP32[$424>>2] = $423;
         $425 = (($351) + ($rsize$4$lcssa$i)|0);
         HEAP32[$425>>2] = $rsize$4$lcssa$i;
         $426 = $rsize$4$lcssa$i >>> 3;
         $427 = ($rsize$4$lcssa$i>>>0)<(256);
         if ($427) {
          $428 = $426 << 1;
          $429 = (7504 + ($428<<2)|0);
          $430 = HEAP32[1866]|0;
          $431 = 1 << $426;
          $432 = $430 & $431;
          $433 = ($432|0)==(0);
          if ($433) {
           $434 = $430 | $431;
           HEAP32[1866] = $434;
           $$pre$i13 = ((($429)) + 8|0);
           $$pre$phi$i14Z2D = $$pre$i13;$F5$0$i = $429;
          } else {
           $435 = ((($429)) + 8|0);
           $436 = HEAP32[$435>>2]|0;
           $437 = HEAP32[(7480)>>2]|0;
           $438 = ($436>>>0)<($437>>>0);
           if ($438) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i14Z2D = $435;$F5$0$i = $436;
           }
          }
          HEAP32[$$pre$phi$i14Z2D>>2] = $351;
          $439 = ((($F5$0$i)) + 12|0);
          HEAP32[$439>>2] = $351;
          $440 = ((($351)) + 8|0);
          HEAP32[$440>>2] = $F5$0$i;
          $441 = ((($351)) + 12|0);
          HEAP32[$441>>2] = $429;
          break;
         }
         $442 = $rsize$4$lcssa$i >>> 8;
         $443 = ($442|0)==(0);
         if ($443) {
          $I7$0$i = 0;
         } else {
          $444 = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($444) {
           $I7$0$i = 31;
          } else {
           $445 = (($442) + 1048320)|0;
           $446 = $445 >>> 16;
           $447 = $446 & 8;
           $448 = $442 << $447;
           $449 = (($448) + 520192)|0;
           $450 = $449 >>> 16;
           $451 = $450 & 4;
           $452 = $451 | $447;
           $453 = $448 << $451;
           $454 = (($453) + 245760)|0;
           $455 = $454 >>> 16;
           $456 = $455 & 2;
           $457 = $452 | $456;
           $458 = (14 - ($457))|0;
           $459 = $453 << $456;
           $460 = $459 >>> 15;
           $461 = (($458) + ($460))|0;
           $462 = $461 << 1;
           $463 = (($461) + 7)|0;
           $464 = $rsize$4$lcssa$i >>> $463;
           $465 = $464 & 1;
           $466 = $465 | $462;
           $I7$0$i = $466;
          }
         }
         $467 = (7768 + ($I7$0$i<<2)|0);
         $468 = ((($351)) + 28|0);
         HEAP32[$468>>2] = $I7$0$i;
         $469 = ((($351)) + 16|0);
         $470 = ((($469)) + 4|0);
         HEAP32[$470>>2] = 0;
         HEAP32[$469>>2] = 0;
         $471 = HEAP32[(7468)>>2]|0;
         $472 = 1 << $I7$0$i;
         $473 = $471 & $472;
         $474 = ($473|0)==(0);
         if ($474) {
          $475 = $471 | $472;
          HEAP32[(7468)>>2] = $475;
          HEAP32[$467>>2] = $351;
          $476 = ((($351)) + 24|0);
          HEAP32[$476>>2] = $467;
          $477 = ((($351)) + 12|0);
          HEAP32[$477>>2] = $351;
          $478 = ((($351)) + 8|0);
          HEAP32[$478>>2] = $351;
          break;
         }
         $479 = HEAP32[$467>>2]|0;
         $480 = ($I7$0$i|0)==(31);
         $481 = $I7$0$i >>> 1;
         $482 = (25 - ($481))|0;
         $483 = $480 ? 0 : $482;
         $484 = $rsize$4$lcssa$i << $483;
         $K12$0$i = $484;$T$0$i = $479;
         while(1) {
          $485 = ((($T$0$i)) + 4|0);
          $486 = HEAP32[$485>>2]|0;
          $487 = $486 & -8;
          $488 = ($487|0)==($rsize$4$lcssa$i|0);
          if ($488) {
           $T$0$i$lcssa = $T$0$i;
           label = 148;
           break;
          }
          $489 = $K12$0$i >>> 31;
          $490 = (((($T$0$i)) + 16|0) + ($489<<2)|0);
          $491 = $K12$0$i << 1;
          $492 = HEAP32[$490>>2]|0;
          $493 = ($492|0)==(0|0);
          if ($493) {
           $$lcssa157 = $490;$T$0$i$lcssa156 = $T$0$i;
           label = 145;
           break;
          } else {
           $K12$0$i = $491;$T$0$i = $492;
          }
         }
         if ((label|0) == 145) {
          $494 = HEAP32[(7480)>>2]|0;
          $495 = ($$lcssa157>>>0)<($494>>>0);
          if ($495) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$$lcssa157>>2] = $351;
           $496 = ((($351)) + 24|0);
           HEAP32[$496>>2] = $T$0$i$lcssa156;
           $497 = ((($351)) + 12|0);
           HEAP32[$497>>2] = $351;
           $498 = ((($351)) + 8|0);
           HEAP32[$498>>2] = $351;
           break;
          }
         }
         else if ((label|0) == 148) {
          $499 = ((($T$0$i$lcssa)) + 8|0);
          $500 = HEAP32[$499>>2]|0;
          $501 = HEAP32[(7480)>>2]|0;
          $502 = ($500>>>0)>=($501>>>0);
          $not$7$i = ($T$0$i$lcssa>>>0)>=($501>>>0);
          $503 = $502 & $not$7$i;
          if ($503) {
           $504 = ((($500)) + 12|0);
           HEAP32[$504>>2] = $351;
           HEAP32[$499>>2] = $351;
           $505 = ((($351)) + 8|0);
           HEAP32[$505>>2] = $500;
           $506 = ((($351)) + 12|0);
           HEAP32[$506>>2] = $T$0$i$lcssa;
           $507 = ((($351)) + 24|0);
           HEAP32[$507>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $508 = ((($v$4$lcssa$i)) + 8|0);
       $$0 = $508;
       return ($$0|0);
      } else {
       $nb$0 = $248;
      }
     }
    }
   }
  }
 } while(0);
 $509 = HEAP32[(7472)>>2]|0;
 $510 = ($509>>>0)<($nb$0>>>0);
 if (!($510)) {
  $511 = (($509) - ($nb$0))|0;
  $512 = HEAP32[(7484)>>2]|0;
  $513 = ($511>>>0)>(15);
  if ($513) {
   $514 = (($512) + ($nb$0)|0);
   HEAP32[(7484)>>2] = $514;
   HEAP32[(7472)>>2] = $511;
   $515 = $511 | 1;
   $516 = ((($514)) + 4|0);
   HEAP32[$516>>2] = $515;
   $517 = (($514) + ($511)|0);
   HEAP32[$517>>2] = $511;
   $518 = $nb$0 | 3;
   $519 = ((($512)) + 4|0);
   HEAP32[$519>>2] = $518;
  } else {
   HEAP32[(7472)>>2] = 0;
   HEAP32[(7484)>>2] = 0;
   $520 = $509 | 3;
   $521 = ((($512)) + 4|0);
   HEAP32[$521>>2] = $520;
   $522 = (($512) + ($509)|0);
   $523 = ((($522)) + 4|0);
   $524 = HEAP32[$523>>2]|0;
   $525 = $524 | 1;
   HEAP32[$523>>2] = $525;
  }
  $526 = ((($512)) + 8|0);
  $$0 = $526;
  return ($$0|0);
 }
 $527 = HEAP32[(7476)>>2]|0;
 $528 = ($527>>>0)>($nb$0>>>0);
 if ($528) {
  $529 = (($527) - ($nb$0))|0;
  HEAP32[(7476)>>2] = $529;
  $530 = HEAP32[(7488)>>2]|0;
  $531 = (($530) + ($nb$0)|0);
  HEAP32[(7488)>>2] = $531;
  $532 = $529 | 1;
  $533 = ((($531)) + 4|0);
  HEAP32[$533>>2] = $532;
  $534 = $nb$0 | 3;
  $535 = ((($530)) + 4|0);
  HEAP32[$535>>2] = $534;
  $536 = ((($530)) + 8|0);
  $$0 = $536;
  return ($$0|0);
 }
 $537 = HEAP32[1984]|0;
 $538 = ($537|0)==(0);
 do {
  if ($538) {
   $539 = (_sysconf(30)|0);
   $540 = (($539) + -1)|0;
   $541 = $540 & $539;
   $542 = ($541|0)==(0);
   if ($542) {
    HEAP32[(7944)>>2] = $539;
    HEAP32[(7940)>>2] = $539;
    HEAP32[(7948)>>2] = -1;
    HEAP32[(7952)>>2] = -1;
    HEAP32[(7956)>>2] = 0;
    HEAP32[(7908)>>2] = 0;
    $543 = (_time((0|0))|0);
    $544 = $543 & -16;
    $545 = $544 ^ 1431655768;
    HEAP32[1984] = $545;
    break;
   } else {
    _abort();
    // unreachable;
   }
  }
 } while(0);
 $546 = (($nb$0) + 48)|0;
 $547 = HEAP32[(7944)>>2]|0;
 $548 = (($nb$0) + 47)|0;
 $549 = (($547) + ($548))|0;
 $550 = (0 - ($547))|0;
 $551 = $549 & $550;
 $552 = ($551>>>0)>($nb$0>>>0);
 if (!($552)) {
  $$0 = 0;
  return ($$0|0);
 }
 $553 = HEAP32[(7904)>>2]|0;
 $554 = ($553|0)==(0);
 if (!($554)) {
  $555 = HEAP32[(7896)>>2]|0;
  $556 = (($555) + ($551))|0;
  $557 = ($556>>>0)<=($555>>>0);
  $558 = ($556>>>0)>($553>>>0);
  $or$cond1$i16 = $557 | $558;
  if ($or$cond1$i16) {
   $$0 = 0;
   return ($$0|0);
  }
 }
 $559 = HEAP32[(7908)>>2]|0;
 $560 = $559 & 4;
 $561 = ($560|0)==(0);
 L257: do {
  if ($561) {
   $562 = HEAP32[(7488)>>2]|0;
   $563 = ($562|0)==(0|0);
   L259: do {
    if ($563) {
     label = 173;
    } else {
     $sp$0$i$i = (7912);
     while(1) {
      $564 = HEAP32[$sp$0$i$i>>2]|0;
      $565 = ($564>>>0)>($562>>>0);
      if (!($565)) {
       $566 = ((($sp$0$i$i)) + 4|0);
       $567 = HEAP32[$566>>2]|0;
       $568 = (($564) + ($567)|0);
       $569 = ($568>>>0)>($562>>>0);
       if ($569) {
        $$lcssa153 = $sp$0$i$i;$$lcssa155 = $566;
        break;
       }
      }
      $570 = ((($sp$0$i$i)) + 8|0);
      $571 = HEAP32[$570>>2]|0;
      $572 = ($571|0)==(0|0);
      if ($572) {
       label = 173;
       break L259;
      } else {
       $sp$0$i$i = $571;
      }
     }
     $595 = HEAP32[(7476)>>2]|0;
     $596 = (($549) - ($595))|0;
     $597 = $596 & $550;
     $598 = ($597>>>0)<(2147483647);
     if ($598) {
      $599 = (_sbrk(($597|0))|0);
      $600 = HEAP32[$$lcssa153>>2]|0;
      $601 = HEAP32[$$lcssa155>>2]|0;
      $602 = (($600) + ($601)|0);
      $603 = ($599|0)==($602|0);
      if ($603) {
       $604 = ($599|0)==((-1)|0);
       if (!($604)) {
        $tbase$746$i = $599;$tsize$745$i = $597;
        label = 193;
        break L257;
       }
      } else {
       $br$2$ph$i = $599;$ssize$2$ph$i = $597;
       label = 183;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 173) {
     $573 = (_sbrk(0)|0);
     $574 = ($573|0)==((-1)|0);
     if (!($574)) {
      $575 = $573;
      $576 = HEAP32[(7940)>>2]|0;
      $577 = (($576) + -1)|0;
      $578 = $577 & $575;
      $579 = ($578|0)==(0);
      if ($579) {
       $ssize$0$i = $551;
      } else {
       $580 = (($577) + ($575))|0;
       $581 = (0 - ($576))|0;
       $582 = $580 & $581;
       $583 = (($551) - ($575))|0;
       $584 = (($583) + ($582))|0;
       $ssize$0$i = $584;
      }
      $585 = HEAP32[(7896)>>2]|0;
      $586 = (($585) + ($ssize$0$i))|0;
      $587 = ($ssize$0$i>>>0)>($nb$0>>>0);
      $588 = ($ssize$0$i>>>0)<(2147483647);
      $or$cond$i17 = $587 & $588;
      if ($or$cond$i17) {
       $589 = HEAP32[(7904)>>2]|0;
       $590 = ($589|0)==(0);
       if (!($590)) {
        $591 = ($586>>>0)<=($585>>>0);
        $592 = ($586>>>0)>($589>>>0);
        $or$cond2$i = $591 | $592;
        if ($or$cond2$i) {
         break;
        }
       }
       $593 = (_sbrk(($ssize$0$i|0))|0);
       $594 = ($593|0)==($573|0);
       if ($594) {
        $tbase$746$i = $573;$tsize$745$i = $ssize$0$i;
        label = 193;
        break L257;
       } else {
        $br$2$ph$i = $593;$ssize$2$ph$i = $ssize$0$i;
        label = 183;
       }
      }
     }
    }
   } while(0);
   L279: do {
    if ((label|0) == 183) {
     $605 = (0 - ($ssize$2$ph$i))|0;
     $606 = ($br$2$ph$i|0)!=((-1)|0);
     $607 = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond7$i = $607 & $606;
     $608 = ($546>>>0)>($ssize$2$ph$i>>>0);
     $or$cond8$i = $608 & $or$cond7$i;
     do {
      if ($or$cond8$i) {
       $609 = HEAP32[(7944)>>2]|0;
       $610 = (($548) - ($ssize$2$ph$i))|0;
       $611 = (($610) + ($609))|0;
       $612 = (0 - ($609))|0;
       $613 = $611 & $612;
       $614 = ($613>>>0)<(2147483647);
       if ($614) {
        $615 = (_sbrk(($613|0))|0);
        $616 = ($615|0)==((-1)|0);
        if ($616) {
         (_sbrk(($605|0))|0);
         break L279;
        } else {
         $617 = (($613) + ($ssize$2$ph$i))|0;
         $ssize$5$i = $617;
         break;
        }
       } else {
        $ssize$5$i = $ssize$2$ph$i;
       }
      } else {
       $ssize$5$i = $ssize$2$ph$i;
      }
     } while(0);
     $618 = ($br$2$ph$i|0)==((-1)|0);
     if (!($618)) {
      $tbase$746$i = $br$2$ph$i;$tsize$745$i = $ssize$5$i;
      label = 193;
      break L257;
     }
    }
   } while(0);
   $619 = HEAP32[(7908)>>2]|0;
   $620 = $619 | 4;
   HEAP32[(7908)>>2] = $620;
   label = 190;
  } else {
   label = 190;
  }
 } while(0);
 if ((label|0) == 190) {
  $621 = ($551>>>0)<(2147483647);
  if ($621) {
   $622 = (_sbrk(($551|0))|0);
   $623 = (_sbrk(0)|0);
   $624 = ($622|0)!=((-1)|0);
   $625 = ($623|0)!=((-1)|0);
   $or$cond5$i = $624 & $625;
   $626 = ($622>>>0)<($623>>>0);
   $or$cond10$i = $626 & $or$cond5$i;
   if ($or$cond10$i) {
    $627 = $623;
    $628 = $622;
    $629 = (($627) - ($628))|0;
    $630 = (($nb$0) + 40)|0;
    $$not$i = ($629>>>0)>($630>>>0);
    if ($$not$i) {
     $tbase$746$i = $622;$tsize$745$i = $629;
     label = 193;
    }
   }
  }
 }
 if ((label|0) == 193) {
  $631 = HEAP32[(7896)>>2]|0;
  $632 = (($631) + ($tsize$745$i))|0;
  HEAP32[(7896)>>2] = $632;
  $633 = HEAP32[(7900)>>2]|0;
  $634 = ($632>>>0)>($633>>>0);
  if ($634) {
   HEAP32[(7900)>>2] = $632;
  }
  $635 = HEAP32[(7488)>>2]|0;
  $636 = ($635|0)==(0|0);
  do {
   if ($636) {
    $637 = HEAP32[(7480)>>2]|0;
    $638 = ($637|0)==(0|0);
    $639 = ($tbase$746$i>>>0)<($637>>>0);
    $or$cond11$i = $638 | $639;
    if ($or$cond11$i) {
     HEAP32[(7480)>>2] = $tbase$746$i;
    }
    HEAP32[(7912)>>2] = $tbase$746$i;
    HEAP32[(7916)>>2] = $tsize$745$i;
    HEAP32[(7924)>>2] = 0;
    $640 = HEAP32[1984]|0;
    HEAP32[(7500)>>2] = $640;
    HEAP32[(7496)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $641 = $i$01$i$i << 1;
     $642 = (7504 + ($641<<2)|0);
     $643 = ((($642)) + 12|0);
     HEAP32[$643>>2] = $642;
     $644 = ((($642)) + 8|0);
     HEAP32[$644>>2] = $642;
     $645 = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($645|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $645;
     }
    }
    $646 = (($tsize$745$i) + -40)|0;
    $647 = ((($tbase$746$i)) + 8|0);
    $648 = $647;
    $649 = $648 & 7;
    $650 = ($649|0)==(0);
    $651 = (0 - ($648))|0;
    $652 = $651 & 7;
    $653 = $650 ? 0 : $652;
    $654 = (($tbase$746$i) + ($653)|0);
    $655 = (($646) - ($653))|0;
    HEAP32[(7488)>>2] = $654;
    HEAP32[(7476)>>2] = $655;
    $656 = $655 | 1;
    $657 = ((($654)) + 4|0);
    HEAP32[$657>>2] = $656;
    $658 = (($654) + ($655)|0);
    $659 = ((($658)) + 4|0);
    HEAP32[$659>>2] = 40;
    $660 = HEAP32[(7952)>>2]|0;
    HEAP32[(7492)>>2] = $660;
   } else {
    $sp$068$i = (7912);
    while(1) {
     $661 = HEAP32[$sp$068$i>>2]|0;
     $662 = ((($sp$068$i)) + 4|0);
     $663 = HEAP32[$662>>2]|0;
     $664 = (($661) + ($663)|0);
     $665 = ($tbase$746$i|0)==($664|0);
     if ($665) {
      $$lcssa147 = $661;$$lcssa149 = $662;$$lcssa151 = $663;$sp$068$i$lcssa = $sp$068$i;
      label = 203;
      break;
     }
     $666 = ((($sp$068$i)) + 8|0);
     $667 = HEAP32[$666>>2]|0;
     $668 = ($667|0)==(0|0);
     if ($668) {
      break;
     } else {
      $sp$068$i = $667;
     }
    }
    if ((label|0) == 203) {
     $669 = ((($sp$068$i$lcssa)) + 12|0);
     $670 = HEAP32[$669>>2]|0;
     $671 = $670 & 8;
     $672 = ($671|0)==(0);
     if ($672) {
      $673 = ($635>>>0)>=($$lcssa147>>>0);
      $674 = ($635>>>0)<($tbase$746$i>>>0);
      $or$cond48$i = $674 & $673;
      if ($or$cond48$i) {
       $675 = (($$lcssa151) + ($tsize$745$i))|0;
       HEAP32[$$lcssa149>>2] = $675;
       $676 = HEAP32[(7476)>>2]|0;
       $677 = ((($635)) + 8|0);
       $678 = $677;
       $679 = $678 & 7;
       $680 = ($679|0)==(0);
       $681 = (0 - ($678))|0;
       $682 = $681 & 7;
       $683 = $680 ? 0 : $682;
       $684 = (($635) + ($683)|0);
       $685 = (($tsize$745$i) - ($683))|0;
       $686 = (($685) + ($676))|0;
       HEAP32[(7488)>>2] = $684;
       HEAP32[(7476)>>2] = $686;
       $687 = $686 | 1;
       $688 = ((($684)) + 4|0);
       HEAP32[$688>>2] = $687;
       $689 = (($684) + ($686)|0);
       $690 = ((($689)) + 4|0);
       HEAP32[$690>>2] = 40;
       $691 = HEAP32[(7952)>>2]|0;
       HEAP32[(7492)>>2] = $691;
       break;
      }
     }
    }
    $692 = HEAP32[(7480)>>2]|0;
    $693 = ($tbase$746$i>>>0)<($692>>>0);
    if ($693) {
     HEAP32[(7480)>>2] = $tbase$746$i;
     $757 = $tbase$746$i;
    } else {
     $757 = $692;
    }
    $694 = (($tbase$746$i) + ($tsize$745$i)|0);
    $sp$167$i = (7912);
    while(1) {
     $695 = HEAP32[$sp$167$i>>2]|0;
     $696 = ($695|0)==($694|0);
     if ($696) {
      $$lcssa144 = $sp$167$i;$sp$167$i$lcssa = $sp$167$i;
      label = 211;
      break;
     }
     $697 = ((($sp$167$i)) + 8|0);
     $698 = HEAP32[$697>>2]|0;
     $699 = ($698|0)==(0|0);
     if ($699) {
      $sp$0$i$i$i = (7912);
      break;
     } else {
      $sp$167$i = $698;
     }
    }
    if ((label|0) == 211) {
     $700 = ((($sp$167$i$lcssa)) + 12|0);
     $701 = HEAP32[$700>>2]|0;
     $702 = $701 & 8;
     $703 = ($702|0)==(0);
     if ($703) {
      HEAP32[$$lcssa144>>2] = $tbase$746$i;
      $704 = ((($sp$167$i$lcssa)) + 4|0);
      $705 = HEAP32[$704>>2]|0;
      $706 = (($705) + ($tsize$745$i))|0;
      HEAP32[$704>>2] = $706;
      $707 = ((($tbase$746$i)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($tbase$746$i) + ($713)|0);
      $715 = ((($694)) + 8|0);
      $716 = $715;
      $717 = $716 & 7;
      $718 = ($717|0)==(0);
      $719 = (0 - ($716))|0;
      $720 = $719 & 7;
      $721 = $718 ? 0 : $720;
      $722 = (($694) + ($721)|0);
      $723 = $722;
      $724 = $714;
      $725 = (($723) - ($724))|0;
      $726 = (($714) + ($nb$0)|0);
      $727 = (($725) - ($nb$0))|0;
      $728 = $nb$0 | 3;
      $729 = ((($714)) + 4|0);
      HEAP32[$729>>2] = $728;
      $730 = ($722|0)==($635|0);
      do {
       if ($730) {
        $731 = HEAP32[(7476)>>2]|0;
        $732 = (($731) + ($727))|0;
        HEAP32[(7476)>>2] = $732;
        HEAP32[(7488)>>2] = $726;
        $733 = $732 | 1;
        $734 = ((($726)) + 4|0);
        HEAP32[$734>>2] = $733;
       } else {
        $735 = HEAP32[(7484)>>2]|0;
        $736 = ($722|0)==($735|0);
        if ($736) {
         $737 = HEAP32[(7472)>>2]|0;
         $738 = (($737) + ($727))|0;
         HEAP32[(7472)>>2] = $738;
         HEAP32[(7484)>>2] = $726;
         $739 = $738 | 1;
         $740 = ((($726)) + 4|0);
         HEAP32[$740>>2] = $739;
         $741 = (($726) + ($738)|0);
         HEAP32[$741>>2] = $738;
         break;
        }
        $742 = ((($722)) + 4|0);
        $743 = HEAP32[$742>>2]|0;
        $744 = $743 & 3;
        $745 = ($744|0)==(1);
        if ($745) {
         $746 = $743 & -8;
         $747 = $743 >>> 3;
         $748 = ($743>>>0)<(256);
         L331: do {
          if ($748) {
           $749 = ((($722)) + 8|0);
           $750 = HEAP32[$749>>2]|0;
           $751 = ((($722)) + 12|0);
           $752 = HEAP32[$751>>2]|0;
           $753 = $747 << 1;
           $754 = (7504 + ($753<<2)|0);
           $755 = ($750|0)==($754|0);
           do {
            if (!($755)) {
             $756 = ($750>>>0)<($757>>>0);
             if ($756) {
              _abort();
              // unreachable;
             }
             $758 = ((($750)) + 12|0);
             $759 = HEAP32[$758>>2]|0;
             $760 = ($759|0)==($722|0);
             if ($760) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $761 = ($752|0)==($750|0);
           if ($761) {
            $762 = 1 << $747;
            $763 = $762 ^ -1;
            $764 = HEAP32[1866]|0;
            $765 = $764 & $763;
            HEAP32[1866] = $765;
            break;
           }
           $766 = ($752|0)==($754|0);
           do {
            if ($766) {
             $$pre9$i$i = ((($752)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $767 = ($752>>>0)<($757>>>0);
             if ($767) {
              _abort();
              // unreachable;
             }
             $768 = ((($752)) + 8|0);
             $769 = HEAP32[$768>>2]|0;
             $770 = ($769|0)==($722|0);
             if ($770) {
              $$pre$phi10$i$iZ2D = $768;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $771 = ((($750)) + 12|0);
           HEAP32[$771>>2] = $752;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $750;
          } else {
           $772 = ((($722)) + 24|0);
           $773 = HEAP32[$772>>2]|0;
           $774 = ((($722)) + 12|0);
           $775 = HEAP32[$774>>2]|0;
           $776 = ($775|0)==($722|0);
           do {
            if ($776) {
             $786 = ((($722)) + 16|0);
             $787 = ((($786)) + 4|0);
             $788 = HEAP32[$787>>2]|0;
             $789 = ($788|0)==(0|0);
             if ($789) {
              $790 = HEAP32[$786>>2]|0;
              $791 = ($790|0)==(0|0);
              if ($791) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $790;$RP$1$i$i = $786;
              }
             } else {
              $R$1$i$i = $788;$RP$1$i$i = $787;
             }
             while(1) {
              $792 = ((($R$1$i$i)) + 20|0);
              $793 = HEAP32[$792>>2]|0;
              $794 = ($793|0)==(0|0);
              if (!($794)) {
               $R$1$i$i = $793;$RP$1$i$i = $792;
               continue;
              }
              $795 = ((($R$1$i$i)) + 16|0);
              $796 = HEAP32[$795>>2]|0;
              $797 = ($796|0)==(0|0);
              if ($797) {
               $R$1$i$i$lcssa = $R$1$i$i;$RP$1$i$i$lcssa = $RP$1$i$i;
               break;
              } else {
               $R$1$i$i = $796;$RP$1$i$i = $795;
              }
             }
             $798 = ($RP$1$i$i$lcssa>>>0)<($757>>>0);
             if ($798) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$RP$1$i$i$lcssa>>2] = 0;
              $R$3$i$i = $R$1$i$i$lcssa;
              break;
             }
            } else {
             $777 = ((($722)) + 8|0);
             $778 = HEAP32[$777>>2]|0;
             $779 = ($778>>>0)<($757>>>0);
             if ($779) {
              _abort();
              // unreachable;
             }
             $780 = ((($778)) + 12|0);
             $781 = HEAP32[$780>>2]|0;
             $782 = ($781|0)==($722|0);
             if (!($782)) {
              _abort();
              // unreachable;
             }
             $783 = ((($775)) + 8|0);
             $784 = HEAP32[$783>>2]|0;
             $785 = ($784|0)==($722|0);
             if ($785) {
              HEAP32[$780>>2] = $775;
              HEAP32[$783>>2] = $778;
              $R$3$i$i = $775;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $799 = ($773|0)==(0|0);
           if ($799) {
            break;
           }
           $800 = ((($722)) + 28|0);
           $801 = HEAP32[$800>>2]|0;
           $802 = (7768 + ($801<<2)|0);
           $803 = HEAP32[$802>>2]|0;
           $804 = ($722|0)==($803|0);
           do {
            if ($804) {
             HEAP32[$802>>2] = $R$3$i$i;
             $cond$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $805 = 1 << $801;
             $806 = $805 ^ -1;
             $807 = HEAP32[(7468)>>2]|0;
             $808 = $807 & $806;
             HEAP32[(7468)>>2] = $808;
             break L331;
            } else {
             $809 = HEAP32[(7480)>>2]|0;
             $810 = ($773>>>0)<($809>>>0);
             if ($810) {
              _abort();
              // unreachable;
             }
             $811 = ((($773)) + 16|0);
             $812 = HEAP32[$811>>2]|0;
             $813 = ($812|0)==($722|0);
             if ($813) {
              HEAP32[$811>>2] = $R$3$i$i;
             } else {
              $814 = ((($773)) + 20|0);
              HEAP32[$814>>2] = $R$3$i$i;
             }
             $815 = ($R$3$i$i|0)==(0|0);
             if ($815) {
              break L331;
             }
            }
           } while(0);
           $816 = HEAP32[(7480)>>2]|0;
           $817 = ($R$3$i$i>>>0)<($816>>>0);
           if ($817) {
            _abort();
            // unreachable;
           }
           $818 = ((($R$3$i$i)) + 24|0);
           HEAP32[$818>>2] = $773;
           $819 = ((($722)) + 16|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           do {
            if (!($821)) {
             $822 = ($820>>>0)<($816>>>0);
             if ($822) {
              _abort();
              // unreachable;
             } else {
              $823 = ((($R$3$i$i)) + 16|0);
              HEAP32[$823>>2] = $820;
              $824 = ((($820)) + 24|0);
              HEAP32[$824>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $825 = ((($819)) + 4|0);
           $826 = HEAP32[$825>>2]|0;
           $827 = ($826|0)==(0|0);
           if ($827) {
            break;
           }
           $828 = HEAP32[(7480)>>2]|0;
           $829 = ($826>>>0)<($828>>>0);
           if ($829) {
            _abort();
            // unreachable;
           } else {
            $830 = ((($R$3$i$i)) + 20|0);
            HEAP32[$830>>2] = $826;
            $831 = ((($826)) + 24|0);
            HEAP32[$831>>2] = $R$3$i$i;
            break;
           }
          }
         } while(0);
         $832 = (($722) + ($746)|0);
         $833 = (($746) + ($727))|0;
         $oldfirst$0$i$i = $832;$qsize$0$i$i = $833;
        } else {
         $oldfirst$0$i$i = $722;$qsize$0$i$i = $727;
        }
        $834 = ((($oldfirst$0$i$i)) + 4|0);
        $835 = HEAP32[$834>>2]|0;
        $836 = $835 & -2;
        HEAP32[$834>>2] = $836;
        $837 = $qsize$0$i$i | 1;
        $838 = ((($726)) + 4|0);
        HEAP32[$838>>2] = $837;
        $839 = (($726) + ($qsize$0$i$i)|0);
        HEAP32[$839>>2] = $qsize$0$i$i;
        $840 = $qsize$0$i$i >>> 3;
        $841 = ($qsize$0$i$i>>>0)<(256);
        if ($841) {
         $842 = $840 << 1;
         $843 = (7504 + ($842<<2)|0);
         $844 = HEAP32[1866]|0;
         $845 = 1 << $840;
         $846 = $844 & $845;
         $847 = ($846|0)==(0);
         do {
          if ($847) {
           $848 = $844 | $845;
           HEAP32[1866] = $848;
           $$pre$i16$i = ((($843)) + 8|0);
           $$pre$phi$i17$iZ2D = $$pre$i16$i;$F4$0$i$i = $843;
          } else {
           $849 = ((($843)) + 8|0);
           $850 = HEAP32[$849>>2]|0;
           $851 = HEAP32[(7480)>>2]|0;
           $852 = ($850>>>0)<($851>>>0);
           if (!($852)) {
            $$pre$phi$i17$iZ2D = $849;$F4$0$i$i = $850;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i17$iZ2D>>2] = $726;
         $853 = ((($F4$0$i$i)) + 12|0);
         HEAP32[$853>>2] = $726;
         $854 = ((($726)) + 8|0);
         HEAP32[$854>>2] = $F4$0$i$i;
         $855 = ((($726)) + 12|0);
         HEAP32[$855>>2] = $843;
         break;
        }
        $856 = $qsize$0$i$i >>> 8;
        $857 = ($856|0)==(0);
        do {
         if ($857) {
          $I7$0$i$i = 0;
         } else {
          $858 = ($qsize$0$i$i>>>0)>(16777215);
          if ($858) {
           $I7$0$i$i = 31;
           break;
          }
          $859 = (($856) + 1048320)|0;
          $860 = $859 >>> 16;
          $861 = $860 & 8;
          $862 = $856 << $861;
          $863 = (($862) + 520192)|0;
          $864 = $863 >>> 16;
          $865 = $864 & 4;
          $866 = $865 | $861;
          $867 = $862 << $865;
          $868 = (($867) + 245760)|0;
          $869 = $868 >>> 16;
          $870 = $869 & 2;
          $871 = $866 | $870;
          $872 = (14 - ($871))|0;
          $873 = $867 << $870;
          $874 = $873 >>> 15;
          $875 = (($872) + ($874))|0;
          $876 = $875 << 1;
          $877 = (($875) + 7)|0;
          $878 = $qsize$0$i$i >>> $877;
          $879 = $878 & 1;
          $880 = $879 | $876;
          $I7$0$i$i = $880;
         }
        } while(0);
        $881 = (7768 + ($I7$0$i$i<<2)|0);
        $882 = ((($726)) + 28|0);
        HEAP32[$882>>2] = $I7$0$i$i;
        $883 = ((($726)) + 16|0);
        $884 = ((($883)) + 4|0);
        HEAP32[$884>>2] = 0;
        HEAP32[$883>>2] = 0;
        $885 = HEAP32[(7468)>>2]|0;
        $886 = 1 << $I7$0$i$i;
        $887 = $885 & $886;
        $888 = ($887|0)==(0);
        if ($888) {
         $889 = $885 | $886;
         HEAP32[(7468)>>2] = $889;
         HEAP32[$881>>2] = $726;
         $890 = ((($726)) + 24|0);
         HEAP32[$890>>2] = $881;
         $891 = ((($726)) + 12|0);
         HEAP32[$891>>2] = $726;
         $892 = ((($726)) + 8|0);
         HEAP32[$892>>2] = $726;
         break;
        }
        $893 = HEAP32[$881>>2]|0;
        $894 = ($I7$0$i$i|0)==(31);
        $895 = $I7$0$i$i >>> 1;
        $896 = (25 - ($895))|0;
        $897 = $894 ? 0 : $896;
        $898 = $qsize$0$i$i << $897;
        $K8$0$i$i = $898;$T$0$i18$i = $893;
        while(1) {
         $899 = ((($T$0$i18$i)) + 4|0);
         $900 = HEAP32[$899>>2]|0;
         $901 = $900 & -8;
         $902 = ($901|0)==($qsize$0$i$i|0);
         if ($902) {
          $T$0$i18$i$lcssa = $T$0$i18$i;
          label = 281;
          break;
         }
         $903 = $K8$0$i$i >>> 31;
         $904 = (((($T$0$i18$i)) + 16|0) + ($903<<2)|0);
         $905 = $K8$0$i$i << 1;
         $906 = HEAP32[$904>>2]|0;
         $907 = ($906|0)==(0|0);
         if ($907) {
          $$lcssa = $904;$T$0$i18$i$lcssa139 = $T$0$i18$i;
          label = 278;
          break;
         } else {
          $K8$0$i$i = $905;$T$0$i18$i = $906;
         }
        }
        if ((label|0) == 278) {
         $908 = HEAP32[(7480)>>2]|0;
         $909 = ($$lcssa>>>0)<($908>>>0);
         if ($909) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$lcssa>>2] = $726;
          $910 = ((($726)) + 24|0);
          HEAP32[$910>>2] = $T$0$i18$i$lcssa139;
          $911 = ((($726)) + 12|0);
          HEAP32[$911>>2] = $726;
          $912 = ((($726)) + 8|0);
          HEAP32[$912>>2] = $726;
          break;
         }
        }
        else if ((label|0) == 281) {
         $913 = ((($T$0$i18$i$lcssa)) + 8|0);
         $914 = HEAP32[$913>>2]|0;
         $915 = HEAP32[(7480)>>2]|0;
         $916 = ($914>>>0)>=($915>>>0);
         $not$$i20$i = ($T$0$i18$i$lcssa>>>0)>=($915>>>0);
         $917 = $916 & $not$$i20$i;
         if ($917) {
          $918 = ((($914)) + 12|0);
          HEAP32[$918>>2] = $726;
          HEAP32[$913>>2] = $726;
          $919 = ((($726)) + 8|0);
          HEAP32[$919>>2] = $914;
          $920 = ((($726)) + 12|0);
          HEAP32[$920>>2] = $T$0$i18$i$lcssa;
          $921 = ((($726)) + 24|0);
          HEAP32[$921>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1052 = ((($714)) + 8|0);
      $$0 = $1052;
      return ($$0|0);
     } else {
      $sp$0$i$i$i = (7912);
     }
    }
    while(1) {
     $922 = HEAP32[$sp$0$i$i$i>>2]|0;
     $923 = ($922>>>0)>($635>>>0);
     if (!($923)) {
      $924 = ((($sp$0$i$i$i)) + 4|0);
      $925 = HEAP32[$924>>2]|0;
      $926 = (($922) + ($925)|0);
      $927 = ($926>>>0)>($635>>>0);
      if ($927) {
       $$lcssa142 = $926;
       break;
      }
     }
     $928 = ((($sp$0$i$i$i)) + 8|0);
     $929 = HEAP32[$928>>2]|0;
     $sp$0$i$i$i = $929;
    }
    $930 = ((($$lcssa142)) + -47|0);
    $931 = ((($930)) + 8|0);
    $932 = $931;
    $933 = $932 & 7;
    $934 = ($933|0)==(0);
    $935 = (0 - ($932))|0;
    $936 = $935 & 7;
    $937 = $934 ? 0 : $936;
    $938 = (($930) + ($937)|0);
    $939 = ((($635)) + 16|0);
    $940 = ($938>>>0)<($939>>>0);
    $941 = $940 ? $635 : $938;
    $942 = ((($941)) + 8|0);
    $943 = ((($941)) + 24|0);
    $944 = (($tsize$745$i) + -40)|0;
    $945 = ((($tbase$746$i)) + 8|0);
    $946 = $945;
    $947 = $946 & 7;
    $948 = ($947|0)==(0);
    $949 = (0 - ($946))|0;
    $950 = $949 & 7;
    $951 = $948 ? 0 : $950;
    $952 = (($tbase$746$i) + ($951)|0);
    $953 = (($944) - ($951))|0;
    HEAP32[(7488)>>2] = $952;
    HEAP32[(7476)>>2] = $953;
    $954 = $953 | 1;
    $955 = ((($952)) + 4|0);
    HEAP32[$955>>2] = $954;
    $956 = (($952) + ($953)|0);
    $957 = ((($956)) + 4|0);
    HEAP32[$957>>2] = 40;
    $958 = HEAP32[(7952)>>2]|0;
    HEAP32[(7492)>>2] = $958;
    $959 = ((($941)) + 4|0);
    HEAP32[$959>>2] = 27;
    ;HEAP32[$942>>2]=HEAP32[(7912)>>2]|0;HEAP32[$942+4>>2]=HEAP32[(7912)+4>>2]|0;HEAP32[$942+8>>2]=HEAP32[(7912)+8>>2]|0;HEAP32[$942+12>>2]=HEAP32[(7912)+12>>2]|0;
    HEAP32[(7912)>>2] = $tbase$746$i;
    HEAP32[(7916)>>2] = $tsize$745$i;
    HEAP32[(7924)>>2] = 0;
    HEAP32[(7920)>>2] = $942;
    $p$0$i$i = $943;
    while(1) {
     $960 = ((($p$0$i$i)) + 4|0);
     HEAP32[$960>>2] = 7;
     $961 = ((($960)) + 4|0);
     $962 = ($961>>>0)<($$lcssa142>>>0);
     if ($962) {
      $p$0$i$i = $960;
     } else {
      break;
     }
    }
    $963 = ($941|0)==($635|0);
    if (!($963)) {
     $964 = $941;
     $965 = $635;
     $966 = (($964) - ($965))|0;
     $967 = HEAP32[$959>>2]|0;
     $968 = $967 & -2;
     HEAP32[$959>>2] = $968;
     $969 = $966 | 1;
     $970 = ((($635)) + 4|0);
     HEAP32[$970>>2] = $969;
     HEAP32[$941>>2] = $966;
     $971 = $966 >>> 3;
     $972 = ($966>>>0)<(256);
     if ($972) {
      $973 = $971 << 1;
      $974 = (7504 + ($973<<2)|0);
      $975 = HEAP32[1866]|0;
      $976 = 1 << $971;
      $977 = $975 & $976;
      $978 = ($977|0)==(0);
      if ($978) {
       $979 = $975 | $976;
       HEAP32[1866] = $979;
       $$pre$i$i = ((($974)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $974;
      } else {
       $980 = ((($974)) + 8|0);
       $981 = HEAP32[$980>>2]|0;
       $982 = HEAP32[(7480)>>2]|0;
       $983 = ($981>>>0)<($982>>>0);
       if ($983) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $980;$F$0$i$i = $981;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $635;
      $984 = ((($F$0$i$i)) + 12|0);
      HEAP32[$984>>2] = $635;
      $985 = ((($635)) + 8|0);
      HEAP32[$985>>2] = $F$0$i$i;
      $986 = ((($635)) + 12|0);
      HEAP32[$986>>2] = $974;
      break;
     }
     $987 = $966 >>> 8;
     $988 = ($987|0)==(0);
     if ($988) {
      $I1$0$i$i = 0;
     } else {
      $989 = ($966>>>0)>(16777215);
      if ($989) {
       $I1$0$i$i = 31;
      } else {
       $990 = (($987) + 1048320)|0;
       $991 = $990 >>> 16;
       $992 = $991 & 8;
       $993 = $987 << $992;
       $994 = (($993) + 520192)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 4;
       $997 = $996 | $992;
       $998 = $993 << $996;
       $999 = (($998) + 245760)|0;
       $1000 = $999 >>> 16;
       $1001 = $1000 & 2;
       $1002 = $997 | $1001;
       $1003 = (14 - ($1002))|0;
       $1004 = $998 << $1001;
       $1005 = $1004 >>> 15;
       $1006 = (($1003) + ($1005))|0;
       $1007 = $1006 << 1;
       $1008 = (($1006) + 7)|0;
       $1009 = $966 >>> $1008;
       $1010 = $1009 & 1;
       $1011 = $1010 | $1007;
       $I1$0$i$i = $1011;
      }
     }
     $1012 = (7768 + ($I1$0$i$i<<2)|0);
     $1013 = ((($635)) + 28|0);
     HEAP32[$1013>>2] = $I1$0$i$i;
     $1014 = ((($635)) + 20|0);
     HEAP32[$1014>>2] = 0;
     HEAP32[$939>>2] = 0;
     $1015 = HEAP32[(7468)>>2]|0;
     $1016 = 1 << $I1$0$i$i;
     $1017 = $1015 & $1016;
     $1018 = ($1017|0)==(0);
     if ($1018) {
      $1019 = $1015 | $1016;
      HEAP32[(7468)>>2] = $1019;
      HEAP32[$1012>>2] = $635;
      $1020 = ((($635)) + 24|0);
      HEAP32[$1020>>2] = $1012;
      $1021 = ((($635)) + 12|0);
      HEAP32[$1021>>2] = $635;
      $1022 = ((($635)) + 8|0);
      HEAP32[$1022>>2] = $635;
      break;
     }
     $1023 = HEAP32[$1012>>2]|0;
     $1024 = ($I1$0$i$i|0)==(31);
     $1025 = $I1$0$i$i >>> 1;
     $1026 = (25 - ($1025))|0;
     $1027 = $1024 ? 0 : $1026;
     $1028 = $966 << $1027;
     $K2$0$i$i = $1028;$T$0$i$i = $1023;
     while(1) {
      $1029 = ((($T$0$i$i)) + 4|0);
      $1030 = HEAP32[$1029>>2]|0;
      $1031 = $1030 & -8;
      $1032 = ($1031|0)==($966|0);
      if ($1032) {
       $T$0$i$i$lcssa = $T$0$i$i;
       label = 307;
       break;
      }
      $1033 = $K2$0$i$i >>> 31;
      $1034 = (((($T$0$i$i)) + 16|0) + ($1033<<2)|0);
      $1035 = $K2$0$i$i << 1;
      $1036 = HEAP32[$1034>>2]|0;
      $1037 = ($1036|0)==(0|0);
      if ($1037) {
       $$lcssa141 = $1034;$T$0$i$i$lcssa140 = $T$0$i$i;
       label = 304;
       break;
      } else {
       $K2$0$i$i = $1035;$T$0$i$i = $1036;
      }
     }
     if ((label|0) == 304) {
      $1038 = HEAP32[(7480)>>2]|0;
      $1039 = ($$lcssa141>>>0)<($1038>>>0);
      if ($1039) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$lcssa141>>2] = $635;
       $1040 = ((($635)) + 24|0);
       HEAP32[$1040>>2] = $T$0$i$i$lcssa140;
       $1041 = ((($635)) + 12|0);
       HEAP32[$1041>>2] = $635;
       $1042 = ((($635)) + 8|0);
       HEAP32[$1042>>2] = $635;
       break;
      }
     }
     else if ((label|0) == 307) {
      $1043 = ((($T$0$i$i$lcssa)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $1045 = HEAP32[(7480)>>2]|0;
      $1046 = ($1044>>>0)>=($1045>>>0);
      $not$$i$i = ($T$0$i$i$lcssa>>>0)>=($1045>>>0);
      $1047 = $1046 & $not$$i$i;
      if ($1047) {
       $1048 = ((($1044)) + 12|0);
       HEAP32[$1048>>2] = $635;
       HEAP32[$1043>>2] = $635;
       $1049 = ((($635)) + 8|0);
       HEAP32[$1049>>2] = $1044;
       $1050 = ((($635)) + 12|0);
       HEAP32[$1050>>2] = $T$0$i$i$lcssa;
       $1051 = ((($635)) + 24|0);
       HEAP32[$1051>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1053 = HEAP32[(7476)>>2]|0;
  $1054 = ($1053>>>0)>($nb$0>>>0);
  if ($1054) {
   $1055 = (($1053) - ($nb$0))|0;
   HEAP32[(7476)>>2] = $1055;
   $1056 = HEAP32[(7488)>>2]|0;
   $1057 = (($1056) + ($nb$0)|0);
   HEAP32[(7488)>>2] = $1057;
   $1058 = $1055 | 1;
   $1059 = ((($1057)) + 4|0);
   HEAP32[$1059>>2] = $1058;
   $1060 = $nb$0 | 3;
   $1061 = ((($1056)) + 4|0);
   HEAP32[$1061>>2] = $1060;
   $1062 = ((($1056)) + 8|0);
   $$0 = $1062;
   return ($$0|0);
  }
 }
 $1063 = (___errno_location()|0);
 HEAP32[$1063>>2] = 12;
 $$0 = 0;
 return ($$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$lcssa = 0, $$pre = 0, $$pre$phi41Z2D = 0, $$pre$phi43Z2D = 0, $$pre$phiZ2D = 0, $$pre40 = 0, $$pre42 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F18$0 = 0, $I20$0 = 0, $K21$0 = 0, $R$1 = 0, $R$1$lcssa = 0, $R$3 = 0, $R8$1 = 0, $R8$1$lcssa = 0, $R8$3 = 0, $RP$1 = 0, $RP$1$lcssa = 0, $RP10$1 = 0, $RP10$1$lcssa = 0;
 var $T$0 = 0, $T$0$lcssa = 0, $T$0$lcssa48 = 0, $cond20 = 0, $cond21 = 0, $not$ = 0, $p$1 = 0, $psize$1 = 0, $psize$2 = 0, $sp$0$i = 0, $sp$0$in$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($mem|0)==(0|0);
 if ($0) {
  return;
 }
 $1 = ((($mem)) + -8|0);
 $2 = HEAP32[(7480)>>2]|0;
 $3 = ($1>>>0)<($2>>>0);
 if ($3) {
  _abort();
  // unreachable;
 }
 $4 = ((($mem)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & 3;
 $7 = ($6|0)==(1);
 if ($7) {
  _abort();
  // unreachable;
 }
 $8 = $5 & -8;
 $9 = (($1) + ($8)|0);
 $10 = $5 & 1;
 $11 = ($10|0)==(0);
 do {
  if ($11) {
   $12 = HEAP32[$1>>2]|0;
   $13 = ($6|0)==(0);
   if ($13) {
    return;
   }
   $14 = (0 - ($12))|0;
   $15 = (($1) + ($14)|0);
   $16 = (($12) + ($8))|0;
   $17 = ($15>>>0)<($2>>>0);
   if ($17) {
    _abort();
    // unreachable;
   }
   $18 = HEAP32[(7484)>>2]|0;
   $19 = ($15|0)==($18|0);
   if ($19) {
    $104 = ((($9)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    HEAP32[(7472)>>2] = $16;
    $108 = $105 & -2;
    HEAP32[$104>>2] = $108;
    $109 = $16 | 1;
    $110 = ((($15)) + 4|0);
    HEAP32[$110>>2] = $109;
    $111 = (($15) + ($16)|0);
    HEAP32[$111>>2] = $16;
    return;
   }
   $20 = $12 >>> 3;
   $21 = ($12>>>0)<(256);
   if ($21) {
    $22 = ((($15)) + 8|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ((($15)) + 12|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = $20 << 1;
    $27 = (7504 + ($26<<2)|0);
    $28 = ($23|0)==($27|0);
    if (!($28)) {
     $29 = ($23>>>0)<($2>>>0);
     if ($29) {
      _abort();
      // unreachable;
     }
     $30 = ((($23)) + 12|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = ($31|0)==($15|0);
     if (!($32)) {
      _abort();
      // unreachable;
     }
    }
    $33 = ($25|0)==($23|0);
    if ($33) {
     $34 = 1 << $20;
     $35 = $34 ^ -1;
     $36 = HEAP32[1866]|0;
     $37 = $36 & $35;
     HEAP32[1866] = $37;
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    $38 = ($25|0)==($27|0);
    if ($38) {
     $$pre42 = ((($25)) + 8|0);
     $$pre$phi43Z2D = $$pre42;
    } else {
     $39 = ($25>>>0)<($2>>>0);
     if ($39) {
      _abort();
      // unreachable;
     }
     $40 = ((($25)) + 8|0);
     $41 = HEAP32[$40>>2]|0;
     $42 = ($41|0)==($15|0);
     if ($42) {
      $$pre$phi43Z2D = $40;
     } else {
      _abort();
      // unreachable;
     }
    }
    $43 = ((($23)) + 12|0);
    HEAP32[$43>>2] = $25;
    HEAP32[$$pre$phi43Z2D>>2] = $23;
    $p$1 = $15;$psize$1 = $16;
    break;
   }
   $44 = ((($15)) + 24|0);
   $45 = HEAP32[$44>>2]|0;
   $46 = ((($15)) + 12|0);
   $47 = HEAP32[$46>>2]|0;
   $48 = ($47|0)==($15|0);
   do {
    if ($48) {
     $58 = ((($15)) + 16|0);
     $59 = ((($58)) + 4|0);
     $60 = HEAP32[$59>>2]|0;
     $61 = ($60|0)==(0|0);
     if ($61) {
      $62 = HEAP32[$58>>2]|0;
      $63 = ($62|0)==(0|0);
      if ($63) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $62;$RP$1 = $58;
      }
     } else {
      $R$1 = $60;$RP$1 = $59;
     }
     while(1) {
      $64 = ((($R$1)) + 20|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if (!($66)) {
       $R$1 = $65;$RP$1 = $64;
       continue;
      }
      $67 = ((($R$1)) + 16|0);
      $68 = HEAP32[$67>>2]|0;
      $69 = ($68|0)==(0|0);
      if ($69) {
       $R$1$lcssa = $R$1;$RP$1$lcssa = $RP$1;
       break;
      } else {
       $R$1 = $68;$RP$1 = $67;
      }
     }
     $70 = ($RP$1$lcssa>>>0)<($2>>>0);
     if ($70) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1$lcssa>>2] = 0;
      $R$3 = $R$1$lcssa;
      break;
     }
    } else {
     $49 = ((($15)) + 8|0);
     $50 = HEAP32[$49>>2]|0;
     $51 = ($50>>>0)<($2>>>0);
     if ($51) {
      _abort();
      // unreachable;
     }
     $52 = ((($50)) + 12|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==($15|0);
     if (!($54)) {
      _abort();
      // unreachable;
     }
     $55 = ((($47)) + 8|0);
     $56 = HEAP32[$55>>2]|0;
     $57 = ($56|0)==($15|0);
     if ($57) {
      HEAP32[$52>>2] = $47;
      HEAP32[$55>>2] = $50;
      $R$3 = $47;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $71 = ($45|0)==(0|0);
   if ($71) {
    $p$1 = $15;$psize$1 = $16;
   } else {
    $72 = ((($15)) + 28|0);
    $73 = HEAP32[$72>>2]|0;
    $74 = (7768 + ($73<<2)|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($15|0)==($75|0);
    if ($76) {
     HEAP32[$74>>2] = $R$3;
     $cond20 = ($R$3|0)==(0|0);
     if ($cond20) {
      $77 = 1 << $73;
      $78 = $77 ^ -1;
      $79 = HEAP32[(7468)>>2]|0;
      $80 = $79 & $78;
      HEAP32[(7468)>>2] = $80;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    } else {
     $81 = HEAP32[(7480)>>2]|0;
     $82 = ($45>>>0)<($81>>>0);
     if ($82) {
      _abort();
      // unreachable;
     }
     $83 = ((($45)) + 16|0);
     $84 = HEAP32[$83>>2]|0;
     $85 = ($84|0)==($15|0);
     if ($85) {
      HEAP32[$83>>2] = $R$3;
     } else {
      $86 = ((($45)) + 20|0);
      HEAP32[$86>>2] = $R$3;
     }
     $87 = ($R$3|0)==(0|0);
     if ($87) {
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
    $88 = HEAP32[(7480)>>2]|0;
    $89 = ($R$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($R$3)) + 24|0);
    HEAP32[$90>>2] = $45;
    $91 = ((($15)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($R$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $p$1 = $15;$psize$1 = $16;
    } else {
     $100 = HEAP32[(7480)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($R$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $R$3;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
   }
  } else {
   $p$1 = $1;$psize$1 = $8;
  }
 } while(0);
 $112 = ($p$1>>>0)<($9>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $113 = ((($9)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = $114 & 1;
 $116 = ($115|0)==(0);
 if ($116) {
  _abort();
  // unreachable;
 }
 $117 = $114 & 2;
 $118 = ($117|0)==(0);
 if ($118) {
  $119 = HEAP32[(7488)>>2]|0;
  $120 = ($9|0)==($119|0);
  if ($120) {
   $121 = HEAP32[(7476)>>2]|0;
   $122 = (($121) + ($psize$1))|0;
   HEAP32[(7476)>>2] = $122;
   HEAP32[(7488)>>2] = $p$1;
   $123 = $122 | 1;
   $124 = ((($p$1)) + 4|0);
   HEAP32[$124>>2] = $123;
   $125 = HEAP32[(7484)>>2]|0;
   $126 = ($p$1|0)==($125|0);
   if (!($126)) {
    return;
   }
   HEAP32[(7484)>>2] = 0;
   HEAP32[(7472)>>2] = 0;
   return;
  }
  $127 = HEAP32[(7484)>>2]|0;
  $128 = ($9|0)==($127|0);
  if ($128) {
   $129 = HEAP32[(7472)>>2]|0;
   $130 = (($129) + ($psize$1))|0;
   HEAP32[(7472)>>2] = $130;
   HEAP32[(7484)>>2] = $p$1;
   $131 = $130 | 1;
   $132 = ((($p$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($p$1) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $114 & -8;
  $135 = (($134) + ($psize$1))|0;
  $136 = $114 >>> 3;
  $137 = ($114>>>0)<(256);
  do {
   if ($137) {
    $138 = ((($9)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($9)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (7504 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(7480)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($9|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[1866]|0;
     $154 = $153 & $152;
     HEAP32[1866] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre40 = ((($141)) + 8|0);
     $$pre$phi41Z2D = $$pre40;
    } else {
     $156 = HEAP32[(7480)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($9|0);
     if ($160) {
      $$pre$phi41Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi41Z2D>>2] = $139;
   } else {
    $162 = ((($9)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($9)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($9|0);
    do {
     if ($166) {
      $177 = ((($9)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $R8$3 = 0;
        break;
       } else {
        $R8$1 = $181;$RP10$1 = $177;
       }
      } else {
       $R8$1 = $179;$RP10$1 = $178;
      }
      while(1) {
       $183 = ((($R8$1)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $R8$1 = $184;$RP10$1 = $183;
        continue;
       }
       $186 = ((($R8$1)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        $R8$1$lcssa = $R8$1;$RP10$1$lcssa = $RP10$1;
        break;
       } else {
        $R8$1 = $187;$RP10$1 = $186;
       }
      }
      $189 = HEAP32[(7480)>>2]|0;
      $190 = ($RP10$1$lcssa>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP10$1$lcssa>>2] = 0;
       $R8$3 = $R8$1$lcssa;
       break;
      }
     } else {
      $167 = ((($9)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(7480)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($9|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($9|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $R8$3 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($9)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (7768 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($9|0)==($195|0);
     if ($196) {
      HEAP32[$194>>2] = $R8$3;
      $cond21 = ($R8$3|0)==(0|0);
      if ($cond21) {
       $197 = 1 << $193;
       $198 = $197 ^ -1;
       $199 = HEAP32[(7468)>>2]|0;
       $200 = $199 & $198;
       HEAP32[(7468)>>2] = $200;
       break;
      }
     } else {
      $201 = HEAP32[(7480)>>2]|0;
      $202 = ($163>>>0)<($201>>>0);
      if ($202) {
       _abort();
       // unreachable;
      }
      $203 = ((($163)) + 16|0);
      $204 = HEAP32[$203>>2]|0;
      $205 = ($204|0)==($9|0);
      if ($205) {
       HEAP32[$203>>2] = $R8$3;
      } else {
       $206 = ((($163)) + 20|0);
       HEAP32[$206>>2] = $R8$3;
      }
      $207 = ($R8$3|0)==(0|0);
      if ($207) {
       break;
      }
     }
     $208 = HEAP32[(7480)>>2]|0;
     $209 = ($R8$3>>>0)<($208>>>0);
     if ($209) {
      _abort();
      // unreachable;
     }
     $210 = ((($R8$3)) + 24|0);
     HEAP32[$210>>2] = $163;
     $211 = ((($9)) + 16|0);
     $212 = HEAP32[$211>>2]|0;
     $213 = ($212|0)==(0|0);
     do {
      if (!($213)) {
       $214 = ($212>>>0)<($208>>>0);
       if ($214) {
        _abort();
        // unreachable;
       } else {
        $215 = ((($R8$3)) + 16|0);
        HEAP32[$215>>2] = $212;
        $216 = ((($212)) + 24|0);
        HEAP32[$216>>2] = $R8$3;
        break;
       }
      }
     } while(0);
     $217 = ((($211)) + 4|0);
     $218 = HEAP32[$217>>2]|0;
     $219 = ($218|0)==(0|0);
     if (!($219)) {
      $220 = HEAP32[(7480)>>2]|0;
      $221 = ($218>>>0)<($220>>>0);
      if ($221) {
       _abort();
       // unreachable;
      } else {
       $222 = ((($R8$3)) + 20|0);
       HEAP32[$222>>2] = $218;
       $223 = ((($218)) + 24|0);
       HEAP32[$223>>2] = $R8$3;
       break;
      }
     }
    }
   }
  } while(0);
  $224 = $135 | 1;
  $225 = ((($p$1)) + 4|0);
  HEAP32[$225>>2] = $224;
  $226 = (($p$1) + ($135)|0);
  HEAP32[$226>>2] = $135;
  $227 = HEAP32[(7484)>>2]|0;
  $228 = ($p$1|0)==($227|0);
  if ($228) {
   HEAP32[(7472)>>2] = $135;
   return;
  } else {
   $psize$2 = $135;
  }
 } else {
  $229 = $114 & -2;
  HEAP32[$113>>2] = $229;
  $230 = $psize$1 | 1;
  $231 = ((($p$1)) + 4|0);
  HEAP32[$231>>2] = $230;
  $232 = (($p$1) + ($psize$1)|0);
  HEAP32[$232>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $233 = $psize$2 >>> 3;
 $234 = ($psize$2>>>0)<(256);
 if ($234) {
  $235 = $233 << 1;
  $236 = (7504 + ($235<<2)|0);
  $237 = HEAP32[1866]|0;
  $238 = 1 << $233;
  $239 = $237 & $238;
  $240 = ($239|0)==(0);
  if ($240) {
   $241 = $237 | $238;
   HEAP32[1866] = $241;
   $$pre = ((($236)) + 8|0);
   $$pre$phiZ2D = $$pre;$F18$0 = $236;
  } else {
   $242 = ((($236)) + 8|0);
   $243 = HEAP32[$242>>2]|0;
   $244 = HEAP32[(7480)>>2]|0;
   $245 = ($243>>>0)<($244>>>0);
   if ($245) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $242;$F18$0 = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $246 = ((($F18$0)) + 12|0);
  HEAP32[$246>>2] = $p$1;
  $247 = ((($p$1)) + 8|0);
  HEAP32[$247>>2] = $F18$0;
  $248 = ((($p$1)) + 12|0);
  HEAP32[$248>>2] = $236;
  return;
 }
 $249 = $psize$2 >>> 8;
 $250 = ($249|0)==(0);
 if ($250) {
  $I20$0 = 0;
 } else {
  $251 = ($psize$2>>>0)>(16777215);
  if ($251) {
   $I20$0 = 31;
  } else {
   $252 = (($249) + 1048320)|0;
   $253 = $252 >>> 16;
   $254 = $253 & 8;
   $255 = $249 << $254;
   $256 = (($255) + 520192)|0;
   $257 = $256 >>> 16;
   $258 = $257 & 4;
   $259 = $258 | $254;
   $260 = $255 << $258;
   $261 = (($260) + 245760)|0;
   $262 = $261 >>> 16;
   $263 = $262 & 2;
   $264 = $259 | $263;
   $265 = (14 - ($264))|0;
   $266 = $260 << $263;
   $267 = $266 >>> 15;
   $268 = (($265) + ($267))|0;
   $269 = $268 << 1;
   $270 = (($268) + 7)|0;
   $271 = $psize$2 >>> $270;
   $272 = $271 & 1;
   $273 = $272 | $269;
   $I20$0 = $273;
  }
 }
 $274 = (7768 + ($I20$0<<2)|0);
 $275 = ((($p$1)) + 28|0);
 HEAP32[$275>>2] = $I20$0;
 $276 = ((($p$1)) + 16|0);
 $277 = ((($p$1)) + 20|0);
 HEAP32[$277>>2] = 0;
 HEAP32[$276>>2] = 0;
 $278 = HEAP32[(7468)>>2]|0;
 $279 = 1 << $I20$0;
 $280 = $278 & $279;
 $281 = ($280|0)==(0);
 do {
  if ($281) {
   $282 = $278 | $279;
   HEAP32[(7468)>>2] = $282;
   HEAP32[$274>>2] = $p$1;
   $283 = ((($p$1)) + 24|0);
   HEAP32[$283>>2] = $274;
   $284 = ((($p$1)) + 12|0);
   HEAP32[$284>>2] = $p$1;
   $285 = ((($p$1)) + 8|0);
   HEAP32[$285>>2] = $p$1;
  } else {
   $286 = HEAP32[$274>>2]|0;
   $287 = ($I20$0|0)==(31);
   $288 = $I20$0 >>> 1;
   $289 = (25 - ($288))|0;
   $290 = $287 ? 0 : $289;
   $291 = $psize$2 << $290;
   $K21$0 = $291;$T$0 = $286;
   while(1) {
    $292 = ((($T$0)) + 4|0);
    $293 = HEAP32[$292>>2]|0;
    $294 = $293 & -8;
    $295 = ($294|0)==($psize$2|0);
    if ($295) {
     $T$0$lcssa = $T$0;
     label = 130;
     break;
    }
    $296 = $K21$0 >>> 31;
    $297 = (((($T$0)) + 16|0) + ($296<<2)|0);
    $298 = $K21$0 << 1;
    $299 = HEAP32[$297>>2]|0;
    $300 = ($299|0)==(0|0);
    if ($300) {
     $$lcssa = $297;$T$0$lcssa48 = $T$0;
     label = 127;
     break;
    } else {
     $K21$0 = $298;$T$0 = $299;
    }
   }
   if ((label|0) == 127) {
    $301 = HEAP32[(7480)>>2]|0;
    $302 = ($$lcssa>>>0)<($301>>>0);
    if ($302) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$$lcssa>>2] = $p$1;
     $303 = ((($p$1)) + 24|0);
     HEAP32[$303>>2] = $T$0$lcssa48;
     $304 = ((($p$1)) + 12|0);
     HEAP32[$304>>2] = $p$1;
     $305 = ((($p$1)) + 8|0);
     HEAP32[$305>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $306 = ((($T$0$lcssa)) + 8|0);
    $307 = HEAP32[$306>>2]|0;
    $308 = HEAP32[(7480)>>2]|0;
    $309 = ($307>>>0)>=($308>>>0);
    $not$ = ($T$0$lcssa>>>0)>=($308>>>0);
    $310 = $309 & $not$;
    if ($310) {
     $311 = ((($307)) + 12|0);
     HEAP32[$311>>2] = $p$1;
     HEAP32[$306>>2] = $p$1;
     $312 = ((($p$1)) + 8|0);
     HEAP32[$312>>2] = $307;
     $313 = ((($p$1)) + 12|0);
     HEAP32[$313>>2] = $T$0$lcssa;
     $314 = ((($p$1)) + 24|0);
     HEAP32[$314>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $315 = HEAP32[(7496)>>2]|0;
 $316 = (($315) + -1)|0;
 HEAP32[(7496)>>2] = $316;
 $317 = ($316|0)==(0);
 if ($317) {
  $sp$0$in$i = (7920);
 } else {
  return;
 }
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $318 = ($sp$0$i|0)==(0|0);
  $319 = ((($sp$0$i)) + 8|0);
  if ($318) {
   break;
  } else {
   $sp$0$in$i = $319;
  }
 }
 HEAP32[(7496)>>2] = -1;
 return;
}
function runPostSets() {
}
function _i64Subtract(a, b, c, d) {
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a - c)>>>0;
    h = (b - d)>>>0;
    h = (b - d - (((c>>>0) > (a>>>0))|0))>>>0; // Borrow one from high word to low word on underflow.
    return ((tempRet0 = h,l|0)|0);
}
function _i64Add(a, b, c, d) {
    /*
      x = a + b*2^32
      y = c + d*2^32
      result = l + h*2^32
    */
    a = a|0; b = b|0; c = c|0; d = d|0;
    var l = 0, h = 0;
    l = (a + c)>>>0;
    h = (b + d + (((l>>>0) < (a>>>0))|0))>>>0; // Add carry from low word to high word on overflow.
    return ((tempRet0 = h,l|0)|0);
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}
function _bitshift64Lshr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >>> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = 0;
    return (high >>> (bits - 32))|0;
}
function _bitshift64Shl(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = (high << bits) | ((low&(ander << (32 - bits))) >>> (32 - bits));
      return low << bits;
    }
    tempRet0 = low << (bits - 32);
    return 0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}
function _bitshift64Ashr(low, high, bits) {
    low = low|0; high = high|0; bits = bits|0;
    var ander = 0;
    if ((bits|0) < 32) {
      ander = ((1 << bits) - 1)|0;
      tempRet0 = high >> bits;
      return (low >>> bits) | ((high&ander) << (32 - bits));
    }
    tempRet0 = (high|0) < 0 ? -1 : 0;
    return (high >> (bits - 32))|0;
  }
function _llvm_cttz_i32(x) {
    x = x|0;
    var ret = 0;
    ret = ((HEAP8[(((cttz_i8)+(x & 0xff))>>0)])|0);
    if ((ret|0) < 8) return ret|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 8)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 8)|0;
    ret = ((HEAP8[(((cttz_i8)+((x >> 16)&0xff))>>0)])|0);
    if ((ret|0) < 8) return (ret + 16)|0;
    return (((HEAP8[(((cttz_i8)+(x >>> 24))>>0)])|0) + 24)|0;
  }

// ======== compiled code from system/lib/compiler-rt , see readme therein
function ___muldsi3($a, $b) {
  $a = $a | 0;
  $b = $b | 0;
  var $1 = 0, $2 = 0, $3 = 0, $6 = 0, $8 = 0, $11 = 0, $12 = 0;
  $1 = $a & 65535;
  $2 = $b & 65535;
  $3 = Math_imul($2, $1) | 0;
  $6 = $a >>> 16;
  $8 = ($3 >>> 16) + (Math_imul($2, $6) | 0) | 0;
  $11 = $b >>> 16;
  $12 = Math_imul($11, $1) | 0;
  return (tempRet0 = (($8 >>> 16) + (Math_imul($11, $6) | 0) | 0) + ((($8 & 65535) + $12 | 0) >>> 16) | 0, 0 | ($8 + $12 << 16 | $3 & 65535)) | 0;
}
function ___divdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $7$0 = 0, $7$1 = 0, $8$0 = 0, $10$0 = 0;
  $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $4$1 = tempRet0;
  $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
  $7$0 = $2$0 ^ $1$0;
  $7$1 = $2$1 ^ $1$1;
  $8$0 = ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, 0) | 0;
  $10$0 = _i64Subtract($8$0 ^ $7$0 | 0, tempRet0 ^ $7$1 | 0, $7$0 | 0, $7$1 | 0) | 0;
  return $10$0 | 0;
}
function ___remdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $rem = 0, $1$0 = 0, $1$1 = 0, $2$0 = 0, $2$1 = 0, $4$0 = 0, $4$1 = 0, $6$0 = 0, $10$0 = 0, $10$1 = 0, __stackBase__ = 0;
  __stackBase__ = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  $rem = __stackBase__ | 0;
  $1$0 = $a$1 >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $1$1 = (($a$1 | 0) < 0 ? -1 : 0) >> 31 | (($a$1 | 0) < 0 ? -1 : 0) << 1;
  $2$0 = $b$1 >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $2$1 = (($b$1 | 0) < 0 ? -1 : 0) >> 31 | (($b$1 | 0) < 0 ? -1 : 0) << 1;
  $4$0 = _i64Subtract($1$0 ^ $a$0 | 0, $1$1 ^ $a$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $4$1 = tempRet0;
  $6$0 = _i64Subtract($2$0 ^ $b$0 | 0, $2$1 ^ $b$1 | 0, $2$0 | 0, $2$1 | 0) | 0;
  ___udivmoddi4($4$0, $4$1, $6$0, tempRet0, $rem) | 0;
  $10$0 = _i64Subtract(HEAP32[$rem >> 2] ^ $1$0 | 0, HEAP32[$rem + 4 >> 2] ^ $1$1 | 0, $1$0 | 0, $1$1 | 0) | 0;
  $10$1 = tempRet0;
  STACKTOP = __stackBase__;
  return (tempRet0 = $10$1, $10$0) | 0;
}
function ___muldi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $x_sroa_0_0_extract_trunc = 0, $y_sroa_0_0_extract_trunc = 0, $1$0 = 0, $1$1 = 0, $2 = 0;
  $x_sroa_0_0_extract_trunc = $a$0;
  $y_sroa_0_0_extract_trunc = $b$0;
  $1$0 = ___muldsi3($x_sroa_0_0_extract_trunc, $y_sroa_0_0_extract_trunc) | 0;
  $1$1 = tempRet0;
  $2 = Math_imul($a$1, $y_sroa_0_0_extract_trunc) | 0;
  return (tempRet0 = ((Math_imul($b$1, $x_sroa_0_0_extract_trunc) | 0) + $2 | 0) + $1$1 | $1$1 & 0, 0 | $1$0 & -1) | 0;
}
function ___udivdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $1$0 = 0;
  $1$0 = ___udivmoddi4($a$0, $a$1, $b$0, $b$1, 0) | 0;
  return $1$0 | 0;
}
function ___uremdi3($a$0, $a$1, $b$0, $b$1) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  var $rem = 0, __stackBase__ = 0;
  __stackBase__ = STACKTOP;
  STACKTOP = STACKTOP + 16 | 0;
  $rem = __stackBase__ | 0;
  ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) | 0;
  STACKTOP = __stackBase__;
  return (tempRet0 = HEAP32[$rem + 4 >> 2] | 0, HEAP32[$rem >> 2] | 0) | 0;
}
function ___udivmoddi4($a$0, $a$1, $b$0, $b$1, $rem) {
  $a$0 = $a$0 | 0;
  $a$1 = $a$1 | 0;
  $b$0 = $b$0 | 0;
  $b$1 = $b$1 | 0;
  $rem = $rem | 0;
  var $n_sroa_0_0_extract_trunc = 0, $n_sroa_1_4_extract_shift$0 = 0, $n_sroa_1_4_extract_trunc = 0, $d_sroa_0_0_extract_trunc = 0, $d_sroa_1_4_extract_shift$0 = 0, $d_sroa_1_4_extract_trunc = 0, $4 = 0, $17 = 0, $37 = 0, $49 = 0, $51 = 0, $57 = 0, $58 = 0, $66 = 0, $78 = 0, $86 = 0, $88 = 0, $89 = 0, $91 = 0, $92 = 0, $95 = 0, $105 = 0, $117 = 0, $119 = 0, $125 = 0, $126 = 0, $130 = 0, $q_sroa_1_1_ph = 0, $q_sroa_0_1_ph = 0, $r_sroa_1_1_ph = 0, $r_sroa_0_1_ph = 0, $sr_1_ph = 0, $d_sroa_0_0_insert_insert99$0 = 0, $d_sroa_0_0_insert_insert99$1 = 0, $137$0 = 0, $137$1 = 0, $carry_0203 = 0, $sr_1202 = 0, $r_sroa_0_1201 = 0, $r_sroa_1_1200 = 0, $q_sroa_0_1199 = 0, $q_sroa_1_1198 = 0, $147 = 0, $149 = 0, $r_sroa_0_0_insert_insert42$0 = 0, $r_sroa_0_0_insert_insert42$1 = 0, $150$1 = 0, $151$0 = 0, $152 = 0, $154$0 = 0, $r_sroa_0_0_extract_trunc = 0, $r_sroa_1_4_extract_trunc = 0, $155 = 0, $carry_0_lcssa$0 = 0, $carry_0_lcssa$1 = 0, $r_sroa_0_1_lcssa = 0, $r_sroa_1_1_lcssa = 0, $q_sroa_0_1_lcssa = 0, $q_sroa_1_1_lcssa = 0, $q_sroa_0_0_insert_ext75$0 = 0, $q_sroa_0_0_insert_ext75$1 = 0, $q_sroa_0_0_insert_insert77$1 = 0, $_0$0 = 0, $_0$1 = 0;
  $n_sroa_0_0_extract_trunc = $a$0;
  $n_sroa_1_4_extract_shift$0 = $a$1;
  $n_sroa_1_4_extract_trunc = $n_sroa_1_4_extract_shift$0;
  $d_sroa_0_0_extract_trunc = $b$0;
  $d_sroa_1_4_extract_shift$0 = $b$1;
  $d_sroa_1_4_extract_trunc = $d_sroa_1_4_extract_shift$0;
  if (($n_sroa_1_4_extract_trunc | 0) == 0) {
    $4 = ($rem | 0) != 0;
    if (($d_sroa_1_4_extract_trunc | 0) == 0) {
      if ($4) {
        HEAP32[$rem >> 2] = ($n_sroa_0_0_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
        HEAP32[$rem + 4 >> 2] = 0;
      }
      $_0$1 = 0;
      $_0$0 = ($n_sroa_0_0_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    } else {
      if (!$4) {
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      HEAP32[$rem >> 2] = $a$0 & -1;
      HEAP32[$rem + 4 >> 2] = $a$1 & 0;
      $_0$1 = 0;
      $_0$0 = 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    }
  }
  $17 = ($d_sroa_1_4_extract_trunc | 0) == 0;
  do {
    if (($d_sroa_0_0_extract_trunc | 0) == 0) {
      if ($17) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_0_0_extract_trunc >>> 0);
          HEAP32[$rem + 4 >> 2] = 0;
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_0_0_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      if (($n_sroa_0_0_extract_trunc | 0) == 0) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = 0;
          HEAP32[$rem + 4 >> 2] = ($n_sroa_1_4_extract_trunc >>> 0) % ($d_sroa_1_4_extract_trunc >>> 0);
        }
        $_0$1 = 0;
        $_0$0 = ($n_sroa_1_4_extract_trunc >>> 0) / ($d_sroa_1_4_extract_trunc >>> 0) >>> 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $37 = $d_sroa_1_4_extract_trunc - 1 | 0;
      if (($37 & $d_sroa_1_4_extract_trunc | 0) == 0) {
        if (($rem | 0) != 0) {
          HEAP32[$rem >> 2] = 0 | $a$0 & -1;
          HEAP32[$rem + 4 >> 2] = $37 & $n_sroa_1_4_extract_trunc | $a$1 & 0;
        }
        $_0$1 = 0;
        $_0$0 = $n_sroa_1_4_extract_trunc >>> ((_llvm_cttz_i32($d_sroa_1_4_extract_trunc | 0) | 0) >>> 0);
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $49 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
      $51 = $49 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
      if ($51 >>> 0 <= 30) {
        $57 = $51 + 1 | 0;
        $58 = 31 - $51 | 0;
        $sr_1_ph = $57;
        $r_sroa_0_1_ph = $n_sroa_1_4_extract_trunc << $58 | $n_sroa_0_0_extract_trunc >>> ($57 >>> 0);
        $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($57 >>> 0);
        $q_sroa_0_1_ph = 0;
        $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $58;
        break;
      }
      if (($rem | 0) == 0) {
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      HEAP32[$rem >> 2] = 0 | $a$0 & -1;
      HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
      $_0$1 = 0;
      $_0$0 = 0;
      return (tempRet0 = $_0$1, $_0$0) | 0;
    } else {
      if (!$17) {
        $117 = Math_clz32($d_sroa_1_4_extract_trunc | 0) | 0;
        $119 = $117 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        if ($119 >>> 0 <= 31) {
          $125 = $119 + 1 | 0;
          $126 = 31 - $119 | 0;
          $130 = $119 - 31 >> 31;
          $sr_1_ph = $125;
          $r_sroa_0_1_ph = $n_sroa_0_0_extract_trunc >>> ($125 >>> 0) & $130 | $n_sroa_1_4_extract_trunc << $126;
          $r_sroa_1_1_ph = $n_sroa_1_4_extract_trunc >>> ($125 >>> 0) & $130;
          $q_sroa_0_1_ph = 0;
          $q_sroa_1_1_ph = $n_sroa_0_0_extract_trunc << $126;
          break;
        }
        if (($rem | 0) == 0) {
          $_0$1 = 0;
          $_0$0 = 0;
          return (tempRet0 = $_0$1, $_0$0) | 0;
        }
        HEAP32[$rem >> 2] = 0 | $a$0 & -1;
        HEAP32[$rem + 4 >> 2] = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$1 = 0;
        $_0$0 = 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
      $66 = $d_sroa_0_0_extract_trunc - 1 | 0;
      if (($66 & $d_sroa_0_0_extract_trunc | 0) != 0) {
        $86 = (Math_clz32($d_sroa_0_0_extract_trunc | 0) | 0) + 33 | 0;
        $88 = $86 - (Math_clz32($n_sroa_1_4_extract_trunc | 0) | 0) | 0;
        $89 = 64 - $88 | 0;
        $91 = 32 - $88 | 0;
        $92 = $91 >> 31;
        $95 = $88 - 32 | 0;
        $105 = $95 >> 31;
        $sr_1_ph = $88;
        $r_sroa_0_1_ph = $91 - 1 >> 31 & $n_sroa_1_4_extract_trunc >>> ($95 >>> 0) | ($n_sroa_1_4_extract_trunc << $91 | $n_sroa_0_0_extract_trunc >>> ($88 >>> 0)) & $105;
        $r_sroa_1_1_ph = $105 & $n_sroa_1_4_extract_trunc >>> ($88 >>> 0);
        $q_sroa_0_1_ph = $n_sroa_0_0_extract_trunc << $89 & $92;
        $q_sroa_1_1_ph = ($n_sroa_1_4_extract_trunc << $89 | $n_sroa_0_0_extract_trunc >>> ($95 >>> 0)) & $92 | $n_sroa_0_0_extract_trunc << $91 & $88 - 33 >> 31;
        break;
      }
      if (($rem | 0) != 0) {
        HEAP32[$rem >> 2] = $66 & $n_sroa_0_0_extract_trunc;
        HEAP32[$rem + 4 >> 2] = 0;
      }
      if (($d_sroa_0_0_extract_trunc | 0) == 1) {
        $_0$1 = $n_sroa_1_4_extract_shift$0 | $a$1 & 0;
        $_0$0 = 0 | $a$0 & -1;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      } else {
        $78 = _llvm_cttz_i32($d_sroa_0_0_extract_trunc | 0) | 0;
        $_0$1 = 0 | $n_sroa_1_4_extract_trunc >>> ($78 >>> 0);
        $_0$0 = $n_sroa_1_4_extract_trunc << 32 - $78 | $n_sroa_0_0_extract_trunc >>> ($78 >>> 0) | 0;
        return (tempRet0 = $_0$1, $_0$0) | 0;
      }
    }
  } while (0);
  if (($sr_1_ph | 0) == 0) {
    $q_sroa_1_1_lcssa = $q_sroa_1_1_ph;
    $q_sroa_0_1_lcssa = $q_sroa_0_1_ph;
    $r_sroa_1_1_lcssa = $r_sroa_1_1_ph;
    $r_sroa_0_1_lcssa = $r_sroa_0_1_ph;
    $carry_0_lcssa$1 = 0;
    $carry_0_lcssa$0 = 0;
  } else {
    $d_sroa_0_0_insert_insert99$0 = 0 | $b$0 & -1;
    $d_sroa_0_0_insert_insert99$1 = $d_sroa_1_4_extract_shift$0 | $b$1 & 0;
    $137$0 = _i64Add($d_sroa_0_0_insert_insert99$0 | 0, $d_sroa_0_0_insert_insert99$1 | 0, -1, -1) | 0;
    $137$1 = tempRet0;
    $q_sroa_1_1198 = $q_sroa_1_1_ph;
    $q_sroa_0_1199 = $q_sroa_0_1_ph;
    $r_sroa_1_1200 = $r_sroa_1_1_ph;
    $r_sroa_0_1201 = $r_sroa_0_1_ph;
    $sr_1202 = $sr_1_ph;
    $carry_0203 = 0;
    while (1) {
      $147 = $q_sroa_0_1199 >>> 31 | $q_sroa_1_1198 << 1;
      $149 = $carry_0203 | $q_sroa_0_1199 << 1;
      $r_sroa_0_0_insert_insert42$0 = 0 | ($r_sroa_0_1201 << 1 | $q_sroa_1_1198 >>> 31);
      $r_sroa_0_0_insert_insert42$1 = $r_sroa_0_1201 >>> 31 | $r_sroa_1_1200 << 1 | 0;
      _i64Subtract($137$0 | 0, $137$1 | 0, $r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0) | 0;
      $150$1 = tempRet0;
      $151$0 = $150$1 >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1;
      $152 = $151$0 & 1;
      $154$0 = _i64Subtract($r_sroa_0_0_insert_insert42$0 | 0, $r_sroa_0_0_insert_insert42$1 | 0, $151$0 & $d_sroa_0_0_insert_insert99$0 | 0, ((($150$1 | 0) < 0 ? -1 : 0) >> 31 | (($150$1 | 0) < 0 ? -1 : 0) << 1) & $d_sroa_0_0_insert_insert99$1 | 0) | 0;
      $r_sroa_0_0_extract_trunc = $154$0;
      $r_sroa_1_4_extract_trunc = tempRet0;
      $155 = $sr_1202 - 1 | 0;
      if (($155 | 0) == 0) {
        break;
      } else {
        $q_sroa_1_1198 = $147;
        $q_sroa_0_1199 = $149;
        $r_sroa_1_1200 = $r_sroa_1_4_extract_trunc;
        $r_sroa_0_1201 = $r_sroa_0_0_extract_trunc;
        $sr_1202 = $155;
        $carry_0203 = $152;
      }
    }
    $q_sroa_1_1_lcssa = $147;
    $q_sroa_0_1_lcssa = $149;
    $r_sroa_1_1_lcssa = $r_sroa_1_4_extract_trunc;
    $r_sroa_0_1_lcssa = $r_sroa_0_0_extract_trunc;
    $carry_0_lcssa$1 = 0;
    $carry_0_lcssa$0 = $152;
  }
  $q_sroa_0_0_insert_ext75$0 = $q_sroa_0_1_lcssa;
  $q_sroa_0_0_insert_ext75$1 = 0;
  $q_sroa_0_0_insert_insert77$1 = $q_sroa_1_1_lcssa | $q_sroa_0_0_insert_ext75$1;
  if (($rem | 0) != 0) {
    HEAP32[$rem >> 2] = 0 | $r_sroa_0_1_lcssa;
    HEAP32[$rem + 4 >> 2] = $r_sroa_1_1_lcssa | 0;
  }
  $_0$1 = (0 | $q_sroa_0_0_insert_ext75$0) >>> 31 | $q_sroa_0_0_insert_insert77$1 << 1 | ($q_sroa_0_0_insert_ext75$1 << 1 | $q_sroa_0_0_insert_ext75$0 >>> 31) & 0 | $carry_0_lcssa$1;
  $_0$0 = ($q_sroa_0_0_insert_ext75$0 << 1 | 0 >>> 31) & -2 | $carry_0_lcssa$0;
  return (tempRet0 = $_0$1, $_0$0) | 0;
}
// =======================================================================



  
function dynCall_i(index) {
  index = index|0;
  
  return FUNCTION_TABLE_i[index&15]()|0;
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&15](a1|0)|0;
}


function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&15](a1|0,a2|0,a3|0)|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&31](a1|0);
}


function dynCall_v(index) {
  index = index|0;
  
  FUNCTION_TABLE_v[index&15]();
}

function b1() {
 ; nullFunc_i(0);return 0;
}
function b2() {
 ; nullFunc_i(9);return 0;
}
function b3() {
 ; nullFunc_i(10);return 0;
}
function b4() {
 ; nullFunc_i(11);return 0;
}
function b5() {
 ; nullFunc_i(12);return 0;
}
function b6() {
 ; nullFunc_i(13);return 0;
}
function b7() {
 ; nullFunc_i(14);return 0;
}
function b8() {
 ; nullFunc_i(15);return 0;
}
function b10(p0) {
 p0 = p0|0; nullFunc_ii(0);return 0;
}
function b11(p0) {
 p0 = p0|0; nullFunc_ii(1);return 0;
}
function b12(p0) {
 p0 = p0|0; nullFunc_ii(2);return 0;
}
function b13(p0) {
 p0 = p0|0; nullFunc_ii(3);return 0;
}
function b14(p0) {
 p0 = p0|0; nullFunc_ii(4);return 0;
}
function b15(p0) {
 p0 = p0|0; nullFunc_ii(5);return 0;
}
function b16(p0) {
 p0 = p0|0; nullFunc_ii(6);return 0;
}
function b17(p0) {
 p0 = p0|0; nullFunc_ii(7);return 0;
}
function b18(p0) {
 p0 = p0|0; nullFunc_ii(8);return 0;
}
function b19(p0) {
 p0 = p0|0; nullFunc_ii(10);return 0;
}
function b20(p0) {
 p0 = p0|0; nullFunc_ii(11);return 0;
}
function b21(p0) {
 p0 = p0|0; nullFunc_ii(12);return 0;
}
function b22(p0) {
 p0 = p0|0; nullFunc_ii(13);return 0;
}
function b23(p0) {
 p0 = p0|0; nullFunc_ii(14);return 0;
}
function b24(p0) {
 p0 = p0|0; nullFunc_ii(15);return 0;
}
function b26(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b27(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(1);return 0;
}
function b28(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(2);return 0;
}
function b29(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(3);return 0;
}
function b30(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(4);return 0;
}
function b31(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(5);return 0;
}
function b32(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(6);return 0;
}
function b33(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(7);return 0;
}
function b34(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(8);return 0;
}
function b35(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(9);return 0;
}
function b36(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(12);return 0;
}
function b37(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(13);return 0;
}
function b38(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(14);return 0;
}
function b40(p0) {
 p0 = p0|0; nullFunc_vi(0);
}
function b41(p0) {
 p0 = p0|0; nullFunc_vi(1);
}
function b42(p0) {
 p0 = p0|0; nullFunc_vi(2);
}
function b43(p0) {
 p0 = p0|0; nullFunc_vi(3);
}
function b44(p0) {
 p0 = p0|0; nullFunc_vi(4);
}
function b45(p0) {
 p0 = p0|0; nullFunc_vi(5);
}
function b46(p0) {
 p0 = p0|0; nullFunc_vi(6);
}
function b47(p0) {
 p0 = p0|0; nullFunc_vi(7);
}
function b48(p0) {
 p0 = p0|0; nullFunc_vi(8);
}
function b49(p0) {
 p0 = p0|0; nullFunc_vi(9);
}
function b50(p0) {
 p0 = p0|0; nullFunc_vi(10);
}
function b51(p0) {
 p0 = p0|0; nullFunc_vi(11);
}
function b52(p0) {
 p0 = p0|0; nullFunc_vi(14);
}
function b53(p0) {
 p0 = p0|0; nullFunc_vi(15);
}
function b54(p0) {
 p0 = p0|0; nullFunc_vi(17);
}
function b55(p0) {
 p0 = p0|0; nullFunc_vi(18);
}
function b56(p0) {
 p0 = p0|0; nullFunc_vi(19);
}
function b57(p0) {
 p0 = p0|0; nullFunc_vi(20);
}
function b58(p0) {
 p0 = p0|0; nullFunc_vi(21);
}
function b59(p0) {
 p0 = p0|0; nullFunc_vi(22);
}
function b60(p0) {
 p0 = p0|0; nullFunc_vi(23);
}
function b61(p0) {
 p0 = p0|0; nullFunc_vi(24);
}
function b62(p0) {
 p0 = p0|0; nullFunc_vi(25);
}
function b63(p0) {
 p0 = p0|0; nullFunc_vi(26);
}
function b64(p0) {
 p0 = p0|0; nullFunc_vi(27);
}
function b65(p0) {
 p0 = p0|0; nullFunc_vi(28);
}
function b66(p0) {
 p0 = p0|0; nullFunc_vi(29);
}
function b67(p0) {
 p0 = p0|0; nullFunc_vi(30);
}
function b68(p0) {
 p0 = p0|0; nullFunc_vi(31);
}
function b70() {
 ; nullFunc_v(0);
}
function b71() {
 ; nullFunc_v(1);
}
function b72() {
 ; nullFunc_v(2);
}
function b73() {
 ; nullFunc_v(3);
}
function b74() {
 ; nullFunc_v(4);
}
function b75() {
 ; nullFunc_v(5);
}
function b76() {
 ; nullFunc_v(6);
}
function b77() {
 ; nullFunc_v(7);
}
function b78() {
 ; nullFunc_v(8);
}
function b79() {
 ; nullFunc_v(9);
}
function b80() {
 ; nullFunc_v(10);
}
function b81() {
 ; nullFunc_v(11);
}
function b82() {
 ; nullFunc_v(12);
}
function b83() {
 ; nullFunc_v(13);
}
function b84() {
 ; nullFunc_v(15);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_i = [b1,_usrClear,_consVer,_usrExit,_makeChild,_closeChild,_focusCmd,_moveChild,_moveMe,b2,b3,b4,b5,b6,b7,b8];
var FUNCTION_TABLE_ii = [b10,b11,b12,b13,b14,b15,b16,b17,b18,___stdio_close,b19,b20,b21,b22,b23,b24];
var FUNCTION_TABLE_iiii = [b26,b27,b28,b29,b30,b31,b32,b33,b34,b35,___stdout_write,___stdio_seek,b36,b37,b38,___stdio_write];
var FUNCTION_TABLE_vi = [b40,b41,b42,b43,b44,b45,b46,b47,b48,b49,b50,b51,_Rect_deleter,_window_deleter,b52,b53,_cleanup_282,b54,b55,b56,b57,b58,b59,b60,b61,b62,b63,b64,b65
,b66,b67,b68];
var FUNCTION_TABLE_v = [b70,b71,b72,b73,b74,b75,b76,b77,b78,b79,b80,b81,b82,b83,_input_loop,b84];

  return { _i64Subtract: _i64Subtract, _free: _free, _main: _main, _i64Add: _i64Add, _memset: _memset, _malloc: _malloc, _memcpy: _memcpy, _bitshift64Lshr: _bitshift64Lshr, _fflush: _fflush, ___errno_location: ___errno_location, _bitshift64Shl: _bitshift64Shl, runPostSets: runPostSets, _emscripten_replace_memory: _emscripten_replace_memory, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_i: dynCall_i, dynCall_ii: dynCall_ii, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_v: dynCall_v };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var real__i64Subtract = asm["_i64Subtract"]; asm["_i64Subtract"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Subtract.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real__main = asm["_main"]; asm["_main"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__main.apply(null, arguments);
};

var real__i64Add = asm["_i64Add"]; asm["_i64Add"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__i64Add.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real__bitshift64Lshr = asm["_bitshift64Lshr"]; asm["_bitshift64Lshr"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Lshr.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};

var real__bitshift64Shl = asm["_bitshift64Shl"]; asm["_bitshift64Shl"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__bitshift64Shl.apply(null, arguments);
};
var _i64Subtract = Module["_i64Subtract"] = asm["_i64Subtract"];
var _free = Module["_free"] = asm["_free"];
var _main = Module["_main"] = asm["_main"];
var _i64Add = Module["_i64Add"] = asm["_i64Add"];
var _memset = Module["_memset"] = asm["_memset"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var _emscripten_replace_memory = Module["_emscripten_replace_memory"] = asm["_emscripten_replace_memory"];
var _bitshift64Lshr = Module["_bitshift64Lshr"] = asm["_bitshift64Lshr"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var _bitshift64Shl = Module["_bitshift64Shl"] = asm["_bitshift64Shl"];
var dynCall_i = Module["dynCall_i"] = asm["dynCall_i"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_v = Module["dynCall_v"] = asm["dynCall_v"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===




function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return; 

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}






// {{MODULE_ADDITIONS}}



//# sourceMappingURL=wyg_test.js.map