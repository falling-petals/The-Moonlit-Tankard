# 月光酒馆 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 先完成统一美术资产，再交付个人本机可玩的纯前端酒馆经营MVP，验证完整营业与真实AI店员互动。

**Architecture:** 无构建依赖的HTML/CSS/ES modules与Canvas渲染；纯状态经营引擎与异步AI分离；本地存档。Python启动器仅提供静态文件，通过一次性浏览器fragment把本机环境配置交给当前会话，页面立即清除fragment；浏览器直连模型，不设置业务后端或API代理。

**Tech Stack:** 原生JavaScript、Canvas 2D、Node test runner、Python静态启动器、Playwright QA、image_gen美术。

**Spec:** docs/design/2026-10-22-ai-staff-tavern.md

## Global Constraints

- 个人自用、纯前端、无自建业务后端。
- AI为雇佣店员，顾客为规则驱动像素小人。
- 真实模型异步调用；模型等待不阻塞经营；凭据不得写入源码、存档或测试报告。
- 昼夜相同布局，白天C温室、夜晚B雨光。厂商形象后续替换，目前原创临时角色。
- 首版4桌、3饮品、自动工作和临时指派、雇佣、库存、升级、结算、本地存档。
- 本轮用户已明确授权生成资产并实现MVP；直接执行，不重复请求确认。

## Review Focus

- 没有API或API超时仍可继续经营，界面明确真实连接状态。
- 缺货或余额不足不能出现负数、重复扣费或重复结算。
- 暂停、倍速和重载不能造成计时跳变、重复订单或历史重复入账。
- 损坏或不兼容存档能安全恢复，导出不包含密钥。
- 角色能到达各工作站与桌边，弹窗及窄桌面尺寸不遮挡关键操作。

### Task 1: 美术资产包

Files: assets/art/*.png, assets/manifest.json, docs/art-guide.md, art-prototype/final/*.png

- [x] 生成日景空场、同布局夜景、AI店员图集、顾客图集、家具物件、物品图标和头像。
- [x] 逐张检查透明背景、可切片性、风格与构图；保存原始生成提示词。
- [x] 编制图集坐标与中文规范，制作本地资产图册。

### Task 2: 经营状态与存档

Files: src/engine.js, src/content.js, src/storage.js, tests/engine.test.js, tests/storage.test.js

Interfaces: createGame(), advance(state,seconds), act(state,action), publicSave(state), loadGame(raw).

- [x] 测试营业日推进、顾客点单到结算、库存与金币守恒、雇佣与升级、暂停和跨日、坏存档与秘密排除；先跑失败再实现。
- [x] 实现确定性状态机、四桌任务调度、桌边路线和员工工作记录；深度技能培养留待后续扩展。
- [x] Node测试通过后进入UI集成。

### Task 3: AI连接与店员互动

Files: src/ai.js, tests/ai.test.js, tools/launch.py, start.cmd

Interfaces: requestStaffReply(config,staff,context,message,{signal}), parseReply(text), consumeBootstrap(location,sessionStorage).

- [x] 测试超时、错误结构、JSON清理、记忆上限与可允许的动作；先失败再实现。
- [x] 实现兼容接口请求、对话与记忆、同事聊天、顾客回应、建议事件，状态机独立推进。
- [x] 启动器在内存中读取环境凭据，静态服务器不提供配置端点；使用浏览器直连做真实验证。

### Task 4: 游戏界面与画布

Files: index.html, src/app.js, src/render.js, style.css

- [x] 三栏桌面布局：导航/员工，中心实时酒馆，右侧经营订单；顶部资源与底部营业控制。
- [x] 实现库存补货、员工雇佣与指派、菜单、升级、活动、AI聊天、设置、结算与导入导出。
- [x] 集成美术图集、移动角色、日夜光照与雨景，提供独立资产图册入口。

### Task 5: 完成验证和交付

Files: tools/qa.py, README.md, docs/validation.md, screenshots/*.png

- [x] 运行完整Node测试；浏览器验证真实营业日、各面板、重载存档、无密钥模式与真实AI回复。
- [x] 检查日夜和桌面尺寸截图，修复观察到的问题。
- [x] 保存运行说明、美术清单、测试结论；保持本机预览可访问。
