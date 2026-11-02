# Schema-as-Code

`models.ts` 是云数据库结构的唯一真相来源（带类型）。

## 运行时预览（Preact）

```bash
npm run schema:dev
```

打开终端地址（默认 http://127.0.0.1:5179/）。改 `models.ts` 或 UI 后刷新即可。

**Explorer UI（Preact）**：深色 IDE 风；侧栏集合/关系；搜索；卡片展示 key / 类型 / enum / ref·copyFrom；连线 hover/选中；Inspector 看 denorm；滚轮缩放、拖动画布/卡片；`/` `F` `Esc`。

实现：`serve.mjs` 用 esbuild（`jsxImportSource: preact`）打包 `viewer.tsx` → `/.serve/viewer.js`。

## 类型检查

```bash
npm run typecheck:schema
```
