# Schema Explorer（Preact）

云数据库结构的**唯一真相来源**在：

- `cloudfunctions/common/models.ts` — 集合 / 字段 / 关系（Viewer 运行时读取）
- `cloudfunctions/common/types.ts` — 文档 TS 类型（`Users` / `Events` / … + `*Insert`）

本目录只放浏览器 UI（`npm run schema:dev`）。

## 预览

```bash
npm run schema:dev
```

打开终端地址（默认 http://127.0.0.1:5179/）。改 `cloudfunctions/common/models.ts` 后刷新即可。

浅色 IDE 风；侧栏集合/关系；搜索；卡片 key / 类型 / enum / ref·copyFrom；Bezier 连线；Inspector；滚轮缩放、拖动画布/卡片；`/` `F` `Esc`。

esbuild 从 `viewer.tsx` 直接打包，并 resolve `../cloudfunctions/common/models.ts`（无需再在 `schema/` 下留一份 models）。

## 类型检查

```bash
npm run typecheck:schema
npm run typecheck:cloudfunctions
```

## 云函数怎么用类型

微信云函数上传的是**单个函数目录**。只用 **`import type`**（编译后擦除）：

```ts
import type { EventsInsert } from '../common/types'
```

不必也不要把 `common/` 打进每个函数包。
