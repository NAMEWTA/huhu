<a id="compiling-c-and-c-to-webassembly-with-emscripten"></a>

# 使用 Emscripten 将 C 和 C++ 编译为 WebAssembly

使用 Emscripten（`emcc` 和 `em++`），将 C 和 C++ 编译成面向浏览器的高性能 WebAssembly（Wasm）模块。

<a id="1-recommended-emscripten-compilation-flags"></a>

## 1. 推荐的 Emscripten 编译参数

使用 `emcc` 或 `em++` 编译与链接时，采用现代模块化参数：

- `-sSTRICT`：启用严格的现代 Emscripten 行为，关闭已弃用或旧式兼容特性。
- `-sEXPORT_ES6`：生成标准 ES6 模块（`import` / `export`）。该选项自动包含 `-sMODULARIZE`，封装生成代码，避免污染全局命名空间。
- `-sENVIRONMENT=web`：去除 Node.js 和 shell 运行时支持代码，尽量缩小包体。仅在 Web Worker 中运行时使用 `-sENVIRONMENT=worker`，同时支持两种环境时使用 `-sENVIRONMENT=web,worker`。
- `-sALLOW_MEMORY_GROWTH`：允许分配超过初始堆大小时，动态扩展 WebAssembly 线性内存堆。
- `-Werror -Wall`：将编译器警告视为错误，尽早发现 C/C++ 缺陷及无效编译设置。
- `-O3`、`-Os` 或 `-Oz` 配合 `-flto`：发布构建中，运行性能最关键时选 `-O3`；优先减小二进制载荷时选 `-Os` / `-Oz`。编译和链接阶段都传入 `-flto`，启用链接时优化。

<a id="command-line-style"></a>

### 命令行风格

让 `emcc` 和 `em++` 调用保持简洁、精简且一致：

- **省略默认已启用的设置**：不要重复传入现代 Emscripten 已默认采用的参数，例如 `-sWASM`，或者已设置 `-sEXPORT_ES6` 时再传 `-sMODULARIZE`。
- **省略布尔 `-s` 参数的 `=1` 后缀**：写 `-sSTRICT`、`-sEXPORT_ES6` 和 `-sALLOW_MEMORY_GROWTH`，不写 `-sSTRICT=1`、`-sEXPORT_ES6=1` 或 `-sALLOW_MEMORY_GROWTH=1`。
- **优先使用标准编译器参数**：用 `-pthread` 替代 `-sUSE_PTHREADS`，用 `-m64` 替代 `-sMEMORY64`。
- **使用简单逗号分隔列表**：列表设置传入不带方括号或引号的逗号分隔值，例如 `-sEXPORTED_FUNCTIONS=_render,_malloc,_free` 和 `-sEXPORTED_RUNTIME_METHODS=HEAPU8`，不要写成 `-sEXPORTED_FUNCTIONS=['_render','_malloc','_free']` 这样的 JSON 数组。
- **长列表使用响应文件**：导出列表较长时，使用 `@filename` 响应文件，不要写很长的内联列表，例如 `-sEXPORTED_FUNCTIONS=@exported_funcs.txt`。
- **多文件项目分开编译**：先通过 `em++ -c` 将 `.c` / `.cpp` 源文件编译为 `.o` 目标文件，再链接成最终模块，不要在单个巨型调用中完成所有工作。

```bash
# Compile C++ source to an object file
em++ -c renderer.cpp -o renderer.o -O3 -flto -Werror -Wall

# Link into an ES6 WebAssembly module targeting a Web Worker
em++ renderer.o -o renderer.js \
  -O3 -flto \
  -sSTRICT \
  -sEXPORT_ES6 \
  -sENVIRONMENT=worker \
  -sALLOW_MEMORY_GROWTH \
  -sEXPORTED_FUNCTIONS=_render_frame,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8
```

<a id="debug-vs-release-profiles"></a>

### 调试与发布配置

同一构建配置中的编译和链接参数保持一致，生产环境绝不携带调试信息：

- **发布构建**：编译和链接都使用 `-O3`、`-Os` 或 `-Oz` 配合 `-flto`，省略 `-g` 和 `-sASSERTIONS`。除非外部打包器已压缩生成的 JavaScript 胶水代码，否则链接时添加 `--closure=1`。
- **调试构建**：编译时使用 `-g`，链接时使用 `-g`、`-gline-tables-only` 或 `-gsource-map`，并启用 `-sASSERTIONS`。避免 `-O2`、`-O3`、`-Os`、`-Oz` 和 `-flto`，以提高编译速度并获得准确的源码级调试。

<a id="2-javascript-webassembly-boundary-efficiency"></a>

## 2. JavaScript 与 WebAssembly 边界效率

避免高频跨越 JavaScript–WebAssembly 边界。每个像素、每个音频采样或每个顶点都调用一次 Wasm 导出函数，会产生抵消 Wasm 性能收益的边界开销。

应让 C/C++ 入口在单次调用中处理整个缓冲区或内存区域，再读取或写入线性内存中的连续缓冲区：

```js
import initRenderer from './renderer.js';

const wasm = await initRenderer();
const byteLength = width * height * 4;
const ptr = wasm._malloc(byteLength);

try {
  wasm._render_frame(ptr, width, height, samples);
  const pixels = new Uint8ClampedArray(
    wasm.HEAPU8.buffer,
    ptr,
    byteLength,
  ).slice();
  self.postMessage({ pixels, width, height }, [pixels.buffer]);
} finally {
  wasm._free(ptr);
}
```

注意：在可能引发内存增长的调用之后直接访问 `wasm.HEAPU8.buffer`，必须等 Wasm 调用返回后重新读取 `wasm.HEAPU8`，因为 `-sALLOW_MEMORY_GROWTH` 调整尺寸时会分离之前的 `ArrayBuffer`。

<a id="3-avoid-blocking-the-main-thread"></a>

## 3. 避免阻塞主线程

浏览器主 UI 线程依赖协作式多任务。任何耗时超过几毫秒的 WebAssembly 调用，例如图片渲染、光线追踪、物理模拟或繁重解析，都**不能**同步运行在主线程，否则会冻结页面渲染和输入。

采用以下一种方式保持 UI 响应：

1. **在 Web Worker 中运行 WebAssembly 模块**：在专用模块 Worker（`new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`）中实例化并调用 ES6 Wasm 模块，再通过 `postMessage` 和可转移的 `ArrayBuffer` 对象返回渲染缓冲区。
2. **使用多线程（`-pthread`）**：通过标准 POSIX 线程把繁重计算分配到后台 worker。注意，`-pthread` 需要 `SharedArrayBuffer`，这要求页面运行在跨源隔离上下文中，设置 `Cross-Origin-Opener-Policy: same-origin` 和 `Cross-Origin-Embedder-Policy: require-corp`。
3. **让出执行权给浏览器事件循环**：重构 C/C++ 持续循环，通过 `emscripten_set_main_loop` 一次运行一帧；如果同步 C/C++ 代码必须暂停以等待异步 JavaScript API，则使用 JavaScript Promise Integration（`-sJSPI`）或 Asyncify（`-sASYNCIFY`）。

<a id="4-test-runtime-execution-and-memory-limits"></a>

## 4. 测试运行执行与内存限制

始终在真实浏览器环境中运行并验证编译后的 WebAssembly 模块，确认控制台没有警告或未处理错误：

- **开发时使用 `-sASSERTIONS` 验证**：构建和测试时启用 `-sASSERTIONS`，尽早发现非法内存访问、缺少导出或 ABI 不匹配；最终发布构建移除 `-sASSERTIONS`。
- **注意递归 C/C++ 代码的栈溢出**：Emscripten 默认执行栈大小（`-sSTACK_SIZE`）为 64 KB，远小于原生操作系统栈。深度递归算法，例如递归光线追踪或树遍历，可能溢出并破坏线性内存，除非改写为迭代循环，或链接时增大栈，例如 `-sSTACK_SIZE=1MB`。

<a id="5-avoid-dynamic-linking-if-possible"></a>

## 5. 尽量避免动态链接

Emscripten 最适合静态链接与静态归档库（`.a`）。共享库（`.so`、`.dylib`、`.dll`）和动态链接（`-sMAIN_MODULE` / `-sSIDE_MODULE`）会增加代码尺寸及运行时开销，除非确实要求运行时加载插件，否则应避免。

<a id="6-porting-existing-cc-libraries-and-build-integration"></a>

## 6. 移植现有 C/C++ 库与构建集成

将 C/C++ 编译集成进 Web 应用项目时，应把 `emcc` / `em++` 构建接入项目构建流程，例如 `package.json` 的 `"build"` 脚本，使项目在打包前先编译 WebAssembly 产物。

使用第三方 C/C++ 库已有的构建系统时：

<a id="cmake-projects"></a>

### CMake 项目

通过 `emcmake` 和 `emmake` 包装 `cmake` 与 `make`：

```bash
mkdir -p build && cd build
emcmake cmake .. -DCMAKE_BUILD_TYPE=Release
emmake make
```

<a id="autoconf--make-projects"></a>

### Autoconf / Make 项目

使用 `emconfigure` 配置交叉编译工具链目标，并禁用共享库：

```bash
emconfigure ./configure --host=wasm32-unknown-emscripten --disable-shared
emmake make
```
