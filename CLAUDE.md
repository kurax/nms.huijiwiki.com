```
# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在处理本仓库代码时提供指导。

## 项目概述

这是一个为 **NMS 灰机wiki（No Man's Sky 无人深空）** 平台开发的数据处理系统。它用于处理从无人深空游戏中提取的 MXML 格式数据，并自动更新到 NMS 灰机wiki 上。

## 核心文件和目录

### 源代码 (`src/`)
- `gamedata.ts`: 处理 MXML 格式的游戏数据文件，解析本地化内容，提取物品/配方/物质/科技数据，并在 `output/data/` 中生成 JSON 文件。处理图片提取和关系链接（配方 → 产品/物质）。
- `huiji.ts`: 灰机wiki API 客户端，支持登录、编辑、移动和上传功能。
- `localization.ts`: 生成 `output/localization.json` 本地化文件。
- `module.ts`: 更新wiki上的 `Module:CommonData` 模块，包含物质分类数据。
- `update.ts`: 将处理后的JSON数据上传到wiki的 `Data:2026/` 命名空间。
- `upload.ts`: 将提取的PNG图片上传到wiki的File命名空间，通过SHA1哈希比较跳过未更改的文件。

### 数据目录
- `data/`: 输入目录，包含 MXML 游戏文件（从游戏提取）和其他原始数据。
- `output/`: 生成的数据目录：
  - `output/data/`: 按游戏数据类型分类的处理后的JSON文件（配方、物质、科技等）
  - `output/file/`: 从游戏中提取的PNG图片
  - `output/localization.json`: 多种语言的本地化字符串

## 设置和运行

1. **安装依赖**: `yarn install` (使用 Yarn 4.13.0)
2. **运行数据处理**: `yarn tsx src/gamedata.ts`
3. **运行本地化处理**: `yarn tsx src/localization.ts`
4. **运行数据更新**: `yarn tsx src/update.ts`
5. **运行模块更新**: `yarn tsx src/module.ts`
6. **运行图片上传**: `yarn tsx src/upload.ts`
7. **环境变量**: 创建 `.env` 文件，包含以下内容：
   - `API_KEY`: 灰机wiki API 密钥
   - `BOT_USER`: 机器人账号用户名
   - `BOT_PASS`: 机器人账号密码

## 主要工作流程

### 1. 数据处理 (gamedata.ts)
处理 `data/mxml/METADATA/REALITY/TABLES/` 目录下的 MXML 文件：
- 提取配方、物质、科技、产品和程序化科技数据
- 将配方与成分/结果链接
- 处理本地化字符串
- 生成图标映射

### 2. Wiki 更新 (update.ts)
将处理后的JSON数据文件上传到wiki的Data命名空间，支持重试逻辑（最多5次）。

### 3. 模块更新 (module.ts)
从本地化文件中提取物质分类数据，并将其转换为Lua代码更新 `Module:CommonData`。

### 4. 图片上传 (upload.ts)
将游戏图标上传到File命名空间，使用SHA1哈希比较跳过未更改的文件。

## 技术栈

- Node.js + TypeScript (5.9.3)
- tsx 用于执行 (4.21.0)
- 主要依赖：
  - `fast-xml-parser`: 解析 MXML 文件
  - `lodash`: 数据处理
  - `lua-json`: JSON转Lua表格式
  - `p-all`: 并发控制
  - `p-retry`: 重试逻辑
  - `signale`: 日志记录
  - `chalk`: 彩色输出
  - `dotenv`: 环境变量管理
  - `sort-keys`: 排序键值对
  - `true-case-path`: 真实路径匹配
```