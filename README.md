# 月下酒馆 / The Moonlit Tankard

一款在桌面浏览器里玩的像素酒馆经营游戏。白天阳光照进温室，夜里吧台亮起暖灯。你是酒馆店长，可以亲手调饮、端送、收桌，也可以和有不同性格与记忆的 AI 店员一起经营。

## 本机启动

需要 Python 3.11+ 和 [uv](https://docs.astral.sh/uv/)。下载或克隆仓库后，Windows 用户双击 `start.cmd`；也可以在项目目录运行：

```console
uv sync --locked
uv run --locked python tools/launch.py
```

首次启动会安装锁定的 Python 依赖。游戏默认在 [127.0.0.1:4173](http://127.0.0.1:4173/) 打开，前端无需安装 npm 依赖或构建。经营进度保存在当前浏览器，可在设置里导入、导出存档。

## 怎么玩

- 点击地面移动，点击顾客处理订单或特殊需要；点击店员，走近后对话。顾客等得太久会离开并打断连击。
- 从两桌开始，逐步扩建到六桌。按制作、送餐和清洁需要安排伙伴，也能自己上手。
- 用灵感抽秘方，开门前选招牌和经营路线，营业中冲连击、办派对。
- 在「原料」手动补货。三星解锁地窖后，可雇伙伴付费自动补货，也可安排 Tom 捕鼠。

## 可选：开启 AI 对话

不配置模型也能经营。开启真实对话时，在启动游戏的系统或终端环境中设置 `AI_DASHSCOPE_API_KEY`（也支持 `DASHSCOPE_API_KEY`），默认使用百炼的 `qwen-plus`。只设置 `OPENAI_API_KEY` 时，默认使用 OpenAI 的 `gpt-4.1-mini`。可通过 `AI_BASE_URL` 和 `AI_MODEL` 覆盖服务地址和模型名称。更改变量后需重启本机服务。

服务只监听本机回环地址。Python / LangChain 负责角色提示、对话上下文和流式回复，密钥由服务进程读取。浏览器不接收密钥，模型也不能直接修改金币、库存或岗位。角色和客串均为游戏设定，与模型服务商无关。

## 开发与测试

- `src/`：经营规则、场景、交互与存档。
- `server/`：FastAPI 同源服务与 LangChain 对话。
- `assets/`：游戏场景、角色图集和角色动作预览；可从游戏设置打开图册。

```console
npm test
uv run --locked python -m unittest discover -s tests -p '*_test.py'
```

JavaScript 测试需要 Node.js。测试使用替身模型，不会发起真实模型请求。
