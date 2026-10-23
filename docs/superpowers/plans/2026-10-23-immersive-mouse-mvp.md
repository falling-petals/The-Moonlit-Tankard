# Immersive Mouse Tavern Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将酒馆改为全屏沉浸场景，全鼠标控制人类店长，与AI员工共同完成服务，近身对话并自然发生同事交流。

**Architecture:** 保留纯前端经营引擎、真实模型客户端与本地存档。新增可走区域寻路、人类店长与任务归属；Canvas使用铺满视口的镜头。角落HUD、场景热点和轻量对话替代固定管理栏。

**Tech Stack:** 原生JS / Canvas / Node测试 / Python静态启动 / Playwright / image_gen。

**Spec:** docs/design/2026-10-23-immersive-tavern-brainstorm.md；用户已确认全鼠标，授权直接执行。

## Global Constraints

- 人类店长由玩家控制；AI仅为雇员；顾客为普通像素小人。
- 点击地面走动，点击人物或设施自动走近互动，全部操作支持鼠标。
- 可亲自制作、携带并送餐、收桌，也可交给员工；互斥任务不重复领用、扣料或收款。
- 对话时场景保持可见，员工互聊有空间和事件依据。
- 保持现有C昼景/B夜景、真实模型、本机密钥、存档和经营功能。
- subagent最高GPT-6.1-Sol。

## Review Focus

- 玩家与员工竞争同一订单时，只有领取者消耗原料和完成订单。
- 玩家中途改目的地、暂停、打烊或读档不会造成永久锁单和错误收款。
- 寻路避开桌椅吧台，鼠标坐标在不同镜头/尺寸下保持一致。
- 模型取消、离开对话及员工远离时不发生隔空或重叠气泡。
- 旧存档可迁移，新增玩家任务可保存，密钥不进入导出。

## Tasks

- [x] 1. 人类店长四方向与工作图集，更新manifest与图册。
- [x] 2. 导航模块：A*和障碍，入口至工作站与桌边路径测试。
- [x] 3. 自然交流：空间检查、分回合气泡、真实模型与取消，专门回归测试。
- [x] 4. 经营引擎：玩家移动、近身互动、调饮携带送餐清桌、任务互斥与恢复测试。
- [x] 5. 全屏场景、镜头与鼠标坐标；角落HUD、近身对话和场景设施。
- [x] 6. 存档迁移与客户端集成；浏览器验证全鼠标服务、真实AI及完整营业日。
- [x] 7. 目视检查日夜截图，刷新交付包与说明。
