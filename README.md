# 大文件分片上传项目

本仓库用于演示与实践“大文件分片上传”，包含前后端两个子项目：

- `server`：Node.js + Express 提供分片上传与合并接口
- `vue3_demo`：Vue 3 + Vite 前端演示界面，支持分片上传、暂停与恢复、上传进度展示、文件内容哈希计算等

---

## 仓库结构

```
big-file-upload/
├── server/        # 后端服务（Express + formidable）
└── vue3_demo/     # 前端演示（Vue3 + Vite）
```

---

## 技术栈说明

根据各子项目的 `package.json`：

- 后端 `server`
  - `Node.js`（建议 v18+）
  - `Express@^5.1.0`（HTTP 服务与路由）
  - `formidable@^3.5.4`（处理 `multipart/form-data`，解析分片上传表单）
  - 其他：`fs`、`path`（Node.js 内置模块，用于文件系统与路径处理）

- 前端 `vue3_demo`
  - `Vue@^3.5.22`（前端框架）
  - `Vite@^7.1.7`（开发与构建工具）
  - `TypeScript@~5.9.3`（类型系统）
  - `Naive UI@^2.43.1`（UI 组件库，用于上传界面、表格、进度条等）
  - `Axios@^1.13.2`（HTTP 请求）
  - `SparkMD5@3.0.2`（通过 Web Worker 计算文件内容哈希，当前使用 CDN 引入）

---

## 环境与版本要求

- 操作系统：Windows、macOS 或 Linux
- `Node.js`：建议 `>= 18.x`（与 Vite 7 要求一致）
- 包管理工具（任选其一）
  - `pnpm >= 9`（推荐，仓库内存在 `pnpm-lock.yaml`）
  - 或 `npm >= 9`（可选，部分目录存在 `package-lock.json`）
- `Git`：用于克隆仓库

如需安装 pnpm：

```bash
npm i -g pnpm@9
```

---

## 克隆与安装依赖

1) 克隆仓库：

```bash
git clone https://github.com/java6688/big-file-upload.git
cd big-file-upload
```

2) 安装依赖（推荐使用 pnpm，也可使用 npm）：

- 使用 pnpm

```bash
# 后端
cd server
pnpm install

# 前端
cd ../vue3_demo
pnpm install
```

- 使用 npm

```bash
# 后端
cd server
npm install

# 前端
cd ../vue3_demo
npm install
```

---

## 启动项目

- 启动后端（默认端口 `3000`）

```bash
cd server
node app.js
# 终端输出：服务器运行在 http://localhost:3000
```

- 启动前端（Vite 开发服务器，默认 `http://localhost:5173`）

```bash
cd vue3_demo
pnpm dev
# 或 npm run dev
```

前端默认通过 `http://localhost:3000` 与后端交互，无需额外代理配置。

---

## 后端接口说明（server）

- `GET /check/file?fileHash=<hash>`：检查目标文件是否已在服务端合并完成
  - 响应示例：`{ code: 200, message: '文件已存在', hasExist: true }`

- `GET /chunk/check?chunkName=<hash-index>`：检查某个分片是否已存在（可用于断点续传优化）
  - 响应示例：`{ code: 200, message: '切片不存在，继续上传', hasExist: true }`

- `POST /chunk?chunkName=<hash-index>`：上传单个分片
  - 请求体：`FormData`，字段 `chunk`（Blob）
  - 说明：服务端会将分片写入 `chunks/<fileHash>/` 目录下

- `POST /merge-chunk`：合并所有分片
  - 请求体：`{ fileHash: '<hash.ext>' }`
  - 说明：服务端会按照分片索引顺序合并到 `upload/<fileHash>`，并清理临时分片目录

目录约定：

- 分片目录：`./chunks/<fileHash>/`（自动创建）
- 合并后目录：`./upload/`（自动创建），文件名即 `fileHash`
- 临时目录：`./temp/`（`formidable` 的临时上传目录）

---

## 前端功能说明（vue3_demo）

- 选择文件并计算内容哈希（Web Worker + SparkMD5）
- 将文件拆分为分片（默认分片大小 1MB，可在 `src/hooks/useBigFileUpload.ts` 中调整 `chunkSize`）
- 并发上传分片，展示每个分片的请求进度与完成状态（`ChunkDetail` 表格）
- 支持暂停与恢复上传（AbortController 中断请求）
- 进度条展示整体上传进度与哈希计算进度

---

## 快速运行（TL;DR）

1. 安装 Node.js 18+；安装 pnpm 9+ 或使用 npm 9+
2. 克隆仓库并安装依赖：`server` 与 `vue3_demo` 分别执行安装
3. 启动后端：`node app.js`（监听 `http://localhost:3000`）
4. 启动前端：`pnpm dev` 或 `npm run dev`（一般在 `http://localhost:5173`）
5. 打开前端页面，选择大文件进行分片上传，观察进度与状态

---

## 常见问题与说明补充

- 端口占用或跨域问题：后端内置 CORS 允许所有来源；如端口被占用，请修改启动端口或关闭占用程序。
- 哈希计算耗时：大文件哈希计算在 Web Worker 中异步进行，可根据设备性能调整分片大小降低内存占用与计算压力。
- 文件命名与排序：分片名称为 `fileHash-index`，服务端按 `index` 进行排序后再合并。
- 生产环境建议：
  - 为后端增加请求大小与超时限制，并接入反向代理（如 Nginx）
  - 将 SparkMD5 固定版本并改为本地依赖或私有 CDN，以提高稳定性
  - 使用更健壮的断点续传策略（前端在上传前调用 `/chunk/check`，跳过已存在分片）

---
