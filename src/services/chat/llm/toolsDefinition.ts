/**
 * 浏览器工具定义 —— core + Pro 插槽组装，再转换为各 LLM 格式。
 *
 *   - getClaudeTools()  → Claude 格式 ({ name, description, input_schema })
 *   - getGeminiTools()  → Gemini 格式 ([{ functionDeclarations }])
 *   - getOpenAICompatibleTools() → OpenAI 兼容格式 ({ type:'function', function:{...} })
 *
 * 版别附加工具（视频下载/用户脚本/广告）由 @/services/chat/llm/editionToolDefs 注入；
 * Open 插槽为空列表，模型请求中不会出现对应描述。
 */

import type { ToolDef } from './toolDefSchema';
import { p, pArray } from './toolDefSchema';
import { getEditionToolDefs } from '@/services/chat/llm/editionToolDefs';

/**
 * 全版别共享工具（含字幕 / seek）
 * 类型统一用 JSON Schema 标准：string / integer / number / boolean / array
 */
const CORE_BROWSER_TOOLS: ToolDef[] = [
  {
    name: "browser_extension_api",
    description:
      "在后台调用浏览器扩展 API（chrome.* / browser.*）的通用入口。op=list 列出可用命名空间与方法；op=call 按 path 调用方法（argsJson 为 JSON 字符串，通常是数组）。出于安全与兼容考虑，仅开放常见安全命名空间，且会自动 promisify callback 风格 API。",
    properties: {
      op: p("string", "操作：list（列出可用 API）或 call（调用 API）"),
      path: p("string", "op=call 时必填。形如 tabs.query、runtime.getManifest、storage.local.get"),
      argsJson: p("string", "op=call 时可选。JSON 字符串，通常为参数数组，如 [ {active:true} ]"),
      timeoutMs: p("integer", "可选，callback API 等待超时（毫秒），默认 10000"),
    },
    required: ["op"],
  },
  // ========== 标签页操作 ==========
  {
    name: 'browser_get_current_tab',
    description: '获取当前激活的浏览器标签页信息，包括 URL、标题、tab ID。',
    properties: {},
  },
  {
    name: 'browser_get_tab',
    description: '获指定标签页信息，包括 URL、标题、tab ID。',
    properties: {
      targetTabId: p('integer', '标签页 ID'),
    },
    required: ['targetTabId'],
  },
  {
    name: 'browser_list_tabs',
    description: '列出当前聚焦窗口中的全部标签页（含 URL、标题、是否 active）。可选 windowId 指定其它窗口。',
    properties: { 
      windowId: p('integer', '可选，指定窗口 ID；不传则取最后聚焦的窗口')
    },
  },
  {
    name: 'browser_navigate',
    description: '打开指定的网页链接',
    properties: {
      url: p('string', '要打开的 URL：支持 http(s)://、chrome://、// 协议相对、域名简写（自动补 https）、localhost、IPv4 等'),
      active: p('boolean', '是否激活新标签页，默认 true'),
    },
    required: ['url', 'openerTabId', 'active'],
  },
  {
    name: 'browser_close_tab',
    description: '关闭浏览器标签页。',
    properties: { tabIdList: pArray('integer', '要关闭的标签页 ID列表') },
    required: ['tabIdList'],
  },
  {
    name: 'browser_reload_tab',
    description: '刷新当前或指定的标签页。',
    properties: { tabId: p('integer', '可选，指定标签页 ID') },
  },
  {
    name: 'browser_call_tab',
    description: '向指定标签页派发任务并激活该标签页。用于跨 tab 协作：子页完成局部操作后，回传操作摘要（instruction），由目标页 screenshot 后决定下一步；子页若无总任务完成提示，完成合理操作后也应回传，勿在子页无限等待。禁止在尚未于当前页执行 browser_screenshot 和实际操作前调用。',
    properties: {
      targetTabId: p('integer', '可选 要交给的标签页 ID'),
      url: p('string', '可选 想要打开的 URL，如果想要打开一个新标签页，请填写这个参数'),
      instruction: p('string', '任务指令'),
      addonInstruction: p('string', '可选 附加任务指令')
    },
    required: ['instruction']
  },
  // ========== 页面交互 ==========
  {
    name: 'browser_click',
    description: '点击页面元素（MAIN world 多 frame + DOM/Tab 可观测性校验；观测到进展则 ok=true）。定位：优先 SoM index，否则 selector（二选一，勿同时传）。可选 text：主点击 ok=false 时在子树内按文本再点。返回 ok/reason/hint/attempts；若 text 或点击目标文案含验证码相关词，另含 instruction（须优先执行，如先确认协议勾选）。',
    properties: {
      index: p('integer', 'SoM 编号（截图标注）；与 selector 二选一，优先 index'),
      selector: p('string', 'CSS 选择器；与 index 二选一'),
      text: p('string', '可选，期望点击的子元素文本。主点击 ok=false 时，会在该元素子树内匹配并点击'),
      waitMs: p('integer', '点击后 DOM 轮询等待毫秒数，默认 300'),
    },
  },
  {
    name: 'browser_type',
    description: '向输入框输入文本（合成 → 校验 → CDP 兜底）。定位：优先 SoM index，否则 selector（二选一）。返回 verified/finalValue/method。implTag: type-unified-som-v2',
    properties: {
      index: p('integer', 'SoM 编号；与 selector 二选一，优先 index'),
      selector: p('string', '输入框 CSS 选择器；与 index 二选一'),
      text: p('string', '要输入的文本'),
      clear: p('boolean', '是否先清空输入框，默认 true')
    },
    required: ['text'],
  },
  {
    name: 'browser_scroll',
    description:
      '滚动页面或指定元素。无 selector 时：先尝试 window，若不可滚则自动选择视口内最大可滚动容器（适合 Gmail 等 SPA）。有 selector 时从该元素向上查找可滚动父容器。以真实位移为准，滚不动会返回 ok=false。',
    properties: {
      direction: p('string', '滚动方向：up、down、left、right'),
      amount: p('integer', '滚动距离（像素），默认 500'),
      selector: p('string', '可选，指定起点元素，会向上查找可滚动容器')
    },
  },
  {
    name: 'browser_get_page_content',
    description: '获取页面的文本内容，包括标题、URL 和正文。',
    properties: {
      selector: p('string', '可选，只获取指定元素的内容')
    },
  },
  {
    name: 'browser_get_elements',
    description: '获取匹配选择器的元素列表，包括标签名、ID、类名、文本等信息。',
    properties: {
      selector: p('string', 'CSS 选择器'),
      limit: p('integer', '最多返回元素数量，默认 20')
    },
    required: ['selector'],
  },
  {
    name: 'browser_wait',
    description: '等待指定时间或等待元素出现。',
    properties: {
      ms: p('integer', '等待毫秒数，默认 1000'),
      selector: p('string', '可选，等待元素出现'),
      timeoutMs: p('integer', '等待元素的超时时间（毫秒），默认 10000')
    },
  },
  {
    name: 'browser_list_iframes',
    description: '获取当前页面中的所有 iframe 信息。',
    properties: {},
  },
  {
    name: 'browser_get_iframe',
    description: '根据url或者iframeId获取iframe信息。',
    properties: {
      iframeId: p('integer', 'iframe 的 ID'),
      url: p('string', 'iframe 的 URL'),
    },
  },
  {
    name: 'browser_execute_script',
    description: `在页面中执行 JavaScript 代码。`,
    properties: {
      code: p('string', '要执行的 JavaScript 代码'),
      timeoutMs: p('integer', '视频下载超时时间（毫秒），默认 1800000 '),
      allFrames: p('boolean', '可选，是否在所有 iframe 中执行，默认 false'),
    },
    required: ['code','timeoutMs'],
  },
  {
    name: 'browser_submit_form',
    description: '提交表单。',
    properties: {
      selector: p('string', '可选，表单的 CSS 选择器；不填则提交页面上的第一个表单')
    },
  },
  {
    name: 'browser_press_key',
    description: '模拟按键（synthetic → verified → CDP 兜底）。定位：优先 SoM index，否则 selector；均可省略（当前焦点）。可用 shortcut 或 key+modifiers。implTag: press-key-unified-v1',
    properties: {
      index: p('integer', 'SoM 编号（按键前 focus）；与 selector 二选一，优先 index'),
      selector: p('string', '可选，按键前先 focus 的 CSS 选择器；与 index 二选一'),
      key: p('string', '主键名，如 Enter、h、Escape；也支持 Control+h / Ctrl+Shift+P 组合写法'),
      shortcut: p('string', '可选，组合快捷键字符串，如 Ctrl+H、Control+Shift+P（与 key+modifiers 二选一）'),
      modifiers: pArray('string', '可选，修饰符数组：ctrl、alt、shift、meta（与 shortcut 二选一）'),
    },
  },
  
  // ========== 高级交互 ==========
  {
    name: 'browser_hover',
    description: '悬停元素（synthetic → 验证 → CDP 兜底；默认停留 600ms）。定位：优先 SoM index，否则 selector（二选一）。implTag: hover-real-mouse-v2',
    properties: {
      index: p('integer', 'SoM 编号；与 selector 二选一，优先 index'),
      selector: p('string', 'CSS 选择器；与 index 二选一'),
      dwellMs: p('integer', '悬停停留毫秒数，默认 600，最大 5000'),
    },
  },
  {
    name: 'browser_highlight',
    description:
      '用户问「在哪/哪个按钮/帮我指一下」时必须调用（禁止只文字描述）。高亮指引，不点击。优先 SoM index，否则 selector。无 x/y 时闪烁元素边框；传 x 和/或 y 时在锚定元素内偏移位置画圆点（缺省的一侧按 0；overlay 始终在顶层页面，与元素是否在 iframe 内无关；x/y 为相对锚定元素左上角偏移）。跨域 iframe 内元素请改标主页面 captcha/iframe 容器。替用户点用 browser_click。',
    properties: {
      index: p('integer', 'SoM 编号（截图标注）；与 selector 二选一，优先 index'),
      selector: p('string', 'CSS 选择器；与 index 二选一'),
      x: p('integer', '可选，相对锚定元素左上角的 X 偏移（像素）；传 x 和/或 y 即画圆点，缺省侧为 0'),
      y: p('integer', '可选，相对锚定元素左上角的 Y 偏移（像素）；传 x 和/或 y 即画圆点，缺省侧为 0'),
      label: p('string', '可选，高亮旁短文案，如「点这里」「缺口」'),
      pulses: p('integer', '闪烁次数，默认 3'),
      durationMs: p('integer', '单次闪烁时长（毫秒），默认 500'),
      scroll: p('boolean', '是否先滚到可视区，默认 true'),
    },
  },
  {
    name: 'browser_select_option',
    description: '选择下拉框选项。支持原生 <select> 和自定义下拉组件（Ant Design / Element UI / 自定义 role=listbox 等）。原生 select 支持模糊匹配（忽略大小写）；非原生 select 会自动点击触发器，在弹出的选项面板中用文本匹配并点击对应选项。',
    properties: {
      selector: p('string', '下拉框元素的 CSS 选择器（原生 select 或自定义触发器）'),
      value: p('string', '可选，按 value 属性选择'),
      text: p('string', '可选，按显示文本选择（支持模糊匹配）'),
      index: p('integer', '可选，按索引选择（从 0 开始，仅原生 select）')
    },
    required: ['selector'],
  },
  {
    name: 'browser_double_click',
    description: '双击页面上的元素。',
    properties: {
      selector: p('string', 'CSS 选择器')
    },
    required: ['selector'],
  },
  {
    name: 'browser_get_select_options',
    description: '获取下拉框的所有选项。支持原生 <select> 和自定义下拉组件（aria-controls / role=listbox / Ant Design / Element UI 等面板）。如果自定义下拉未展开，需先 browser_click 打开面板再调用此工具。',
    properties: {
      selector: p('string', '下拉框元素的 CSS 选择器')
    },
    required: ['selector'],
  },
  {
    name: 'browser_mouse_click',
    description: '坐标级鼠标点击（implTag: mouse-click-cdp-v1）：先 synthetic mousedown/mouseup/click + verified；未通过则 CDP Input.dispatchMouseEvent 真实坐标点击并复验。left 默认；right→contextmenu；middle→auxclick。支持 selector 或 text；x/y 为相对元素左上角偏移（省略则取元素中心）。显示 agent 光标与点击波纹。',
    properties: {
      selector: p('string', '可选，元素的 CSS 选择器，如 [data-som-idx="8"]'),
      text: p('string', '可选，元素的文本内容（如 "20"、"确定"），用于日期选择等场景'),
      x: p('integer', '可选，相对元素左上角的 X 偏移像素；省略则用元素宽度中心'),
      y: p('integer', '可选，相对元素左上角的 Y 偏移像素；省略则用元素高度中心'),
      button: p('string', '可选，鼠标按钮：left（默认）、right、middle')
    },
  },
  {
    name: 'browser_long_press',
    description: '长按元素（mousedown → duration → mouseup）。定位：优先 SoM index，否则 selector（二选一）。implTag: long-press-unified-som-v1',
    properties: {
      index: p('integer', 'SoM 编号；与 selector 二选一，优先 index'),
      selector: p('string', 'CSS 选择器；与 index 二选一'),
      duration: p('integer', '长按持续时间（毫秒），默认 1000，最大 120000'),
    },
  },
  {
    name: 'browser_drag',
    description: '拖拽元素（synthetic → range/DnD 兜底）。起点：优先 fromIndex，否则 fromSelector；终点：toIndex/toSelector 或 offset。implTag: drag-range-v1',
    properties: {
      fromIndex: p('integer', '起始 SoM 编号；与 fromSelector 二选一，优先 fromIndex'),
      fromSelector: p('string', '起始 CSS 选择器；与 fromIndex 二选一'),
      toIndex: p('integer', '可选，目标 SoM 编号；与 toSelector/offset 二选一'),
      toSelector: p('string', '可选，目标 CSS 选择器（与 offset 二选一）'),
      offsetX: p('integer', '可选，相对 thumb/中心的 X 偏移像素（水平滑块常用，如 80）'),
      offsetY: p('integer', '可选，Y 偏移像素，默认 0'),
    },
  },
  {
    name: 'browser_element_get_style',
    description: '获取元素的样式。',
    properties: {
      selector: p('string', '元素的 CSS 选择器')
    },
    required: ['selector'],
  },
  {
    name: 'browser_element_add_style',
    description: '添加样式到元素（直接设置 element.style.cssText）。如果需要“强制生效”覆盖页面已有样式，请在 style 中使用 !important；例如改颜色建议同时写 color 和 -webkit-text-fill-color：`color: blue !important; -webkit-text-fill-color: blue !important;`。',
    properties: {
      selectors: pArray('string', '元素的 CSS 选择器数组'),
      style: p('string', '要添加的样式')
    },
    required: ['selectors', 'style'],
  },
  {
    name: 'browser_element_remove_style',
    description: '删除元素的样式。',
    properties: {
      selectors: pArray('string', '元素的 CSS 选择器数组')
    },
  },
  // ========== 日期和复杂表单 ==========
  {
    name: 'browser_set_input_value',
    description: '直接设置输入框的值（绕过键盘事件）。适用于日期选择器、颜色选择器等特殊输入框。会触发 input 和 change 事件。',
    properties: {
      selector: p('string', '输入框的 CSS 选择器'),
      value: p('string', '要设置的值（如日期格式 2026-02-20）')
    },
    required: ['selector', 'value'],
  },
  {
    name: 'browser_set_input_user_data',
    description: '直接将用户预存数据设置为输入框的值（绕过键盘事件）。适用于日期选择器、颜色选择器等特殊输入框。会触发 input 和 change 事件。 这个方法只会在browser_user_data 之后调用。',
    properties: {
      selector: p('string', '输入框的 CSS 选择器'),
      key: p('string', '用户数据区 key（通常以 data- 开头）')
    },
    required: ['selector', 'key'],
  },
  {
    name: 'browser_pick_date',
    description: '在日期选择器弹窗中选择日期。先点击日期输入框打开选择器，然后用此工具点击具体日期。支持通过日期文本、aria-label 或 data 属性定位日期元素。',
    properties: {
      dateText: p('string', '日期文本（如 "20"、"2月20日"）或完整日期'),
      container: p('string', '可选，日期选择器容器的 CSS 选择器，缩小搜索范围')
    },
    required: ['dateText'],
  },
  {
    name: 'browser_toggle_checkbox',
    description: '切换复选框或单选框的选中状态。可以指定设为选中或取消选中。',
    properties: {
      selector: p('string', 'checkbox/radio 的 CSS 选择器'),
      checked: p('boolean', '可选，true=选中，false=取消；不填则切换当前状态')
    },
    required: ['selector'],
  },
  {
    name: 'browser_multi_select',
    description: '在多选下拉框（multiple select）中选择多个选项。',
    properties: {
      selector: p('string', 'select[multiple] 元素的 CSS 选择器'),
      values: pArray('string', '要选中的选项值数组')
    },
    required: ['selector', 'values'],
  },
  {
    name: 'browser_get_form_fields',
    description: '获取表单字段信息（input/select/textarea/checkbox/contenteditable 等）。会自动为每个字段附加 label、placeholder、aria-label 等辅助信息。优先在指定容器或 <form> 中搜索，找不到字段时自动扫描整个页面的所有可见输入控件。',
    properties: {
      selector: p('string', '可选，表单或容器的 CSS 选择器；不填则获取页面第一个表单，或扫描整页')
    },
  },

  // ========== 剪贴板 ==========
  {
    name: 'browser_get_clipboard',
    description: '读取系统剪贴板中的文本内容。',
    properties: {},
  },
  {
    name: 'browser_set_clipboard',
    description: '将文本写入系统剪贴板。',
    properties: { text: p('string', '要写入剪贴板的文本') },
    required: ['text'],
  },

  // ========== 截图（SoM 元素标注） ==========
  {
    name: 'browser_screenshot',
    description:
      '截取当前标签页可见区域全屏截图（默认 SoM 标注）。必填 purpose+goal。' +
      'purpose=act：推进本步 goal。Jev 开启时：本工具内部多步循环（每步刷新 SoM→Jev 选 click|type→代执行），直到 Jev 认为完成/无法继续或达步数上限；返回 jev.steps 摘要（通常无图）。你不必传 action。' +
      '若 goal 涉及填写/输入/填表：必须同时传 values（推荐）或 text；否则无法 type。' +
      'Jev 开启且 values 有多条时：先选 SoM 控件，再由 Jev 从 values 里选要填的那一条（不必 key 与页面文案一致）。' +
      '仅点击/勾选/提交时可只传 goal。purpose=verify：确认 goal 是否已达成。' +
      'Jev 关闭或循环零步失败时：返回截图+elements。触顶时有 areas，可用 browser_screenshot_area。' +
      '若页上有弹窗/日历等阻断层：返回 blockingOverlay（含 kind/expected，错误弹窗另有 isError+message），elements 中 ov=层内、ds=关闭类；并可能带 instruction。' +
      '错误/校验弹窗：读懂 message → 点层内确定/× → 用新 goal 按提示修正，禁止只关窗重复原操作。' +
      '输入建议层（blockingOverlay.kind=suggest，listbox/option）：在层内点与输入/values 最接近的 option，勿点 Select multiple 类开关。' +
      '关层优先层内 dismiss，禁止靠点外面链接关闭。',
    properties: {
      purpose: p('string', '必填。act=下一步操作（Jev 开着时可能多步代执行）；verify=确认 goal 是否完成'),
      goal: p('string', '必填。本步可观察的短目标，如 "Fill and submit the pizza form" / "Confirm inbox is visible"'),
      action: p('string', '可选提示 click|type；Jev 开启时可不传'),
      text: p('string', '填表/输入时：单个可填字符串（与 values 二选一或并用）'),
      values: p(
        'object',
        '填表/输入时强烈建议必传。多个可填字符串，如 { customer_name:"Alice", telephone:"555", email:"a@b.com" }。Jev 内环逐步选用；不要发明未提供的内容。',
      ),
      withLabels: p('boolean', '是否在截图上标注可交互元素编号，默认 true'),
      maxWidth: p('integer', '最大宽度像素，默认 800')
    },
    required: ['purpose', 'goal'],
  },
  {
    name: 'browser_screenshot_area',
    description:
      '对全页 SoM 溢出区域（A1/A2…）做二次截图与详细编号标注。须先 browser_screenshot 且返回了 areas。返回该区域裁剪图 + 从 1 起的新 elements；之后 click/type 使用本结果中的 index。',
    properties: {
      areaId: p('string', '溢出区域 id，如 A1（来自 browser_screenshot 的 areas）'),
      maxWidth: p('integer', '裁剪图最大宽度像素，默认 900'),
    },
    required: ['areaId'],
  },
  {
    name: 'browser_capture_element_shot',
    description: '为 UI 规格书截取组件局部图（viewport 整页截图 + CSS 选择器裁剪）。独立于 browser_screenshot，不做 SoM 标注。截图存入会话资产库，返回 doma-spec:assetId；在 ```cursor-prompt``` 围栏内用 ![标签](doma-spec:assetId) 插入。节制使用：每个组件只截主要样式态（default）+ 交互后变化明显的状态（hover/selected/展开后等），避免过量截图。',
    properties: {
      selector: p('string', '目标元素的 CSS 选择器'),
      state: p('string', '状态名，如 default / hover / selected / expanded'),
      componentId: p('string', '可选，组件 ID，如 C1'),
      padding: p('integer', '裁剪边距 px，默认 8'),
      maxWidth: p('integer', '输出最大宽度 px，默认 960（小控件建议 960–1200）'),
    },
    required: ['selector', 'state'],
  },

  // ========== SoM / 用户数据填充 ==========
  {
    name: 'browser_type_index_user_data',
    description: '通过 SoM 编号向输入框填入用户预存数据（内部走 browser_type）。先 screenshot 再调用；通常在 browser_user_data 之后。',
    properties: {
      index: p('integer', '截图中标注的输入框 SoM 编号'),
      key: p('string', '用户数据区 key（通常以 data- 开头）'),
      clear: p('boolean', '是否先清空输入框，默认 true')
    },
    required: ['index', 'key'],
  },
  {
    name: 'browser_plan',
    description: '自动化网页操作步骤清单',
    properties: {
      planId: p('string', '步骤清单ID'),
      planName: p('string', '步骤清单名称'),
      stepList: pArray('object', '有序步骤列表。每项对象字段: id(string, 格式step-x), title(string, 步骤标题, 给用户看), intent(string, 本步要做什么，给执行用)'),
    },
    required: ['planId', 'planName', 'stepList']
  },
  {
    name: 'browser_plan_cancel',
    description: '取消规划的任务',
    properties:  {
      planId: p('string', '步骤清单ID'),
      planName: p('string', '步骤清单名称'),
    },
    required: ['planId','planName']
  },
  {
    name:'browser_plan_questions',
    description: '在规划步骤前，像用户提问获取更多信息来帮助生成操作清单',
    properties: {
      questionList: pArray('object', '问题列表。每项对象字段: id(string, 格式question-x), question(string, 问题), optionsList(array, 选项列表，每项对象字段: id(string, 格式option-xa/b/c), label(string, 选项标签A/B/C), value(string, 选项值))'),
      timeoutMs: p('integer', '问题超时时间（毫秒），默认 3600000 ')
    },
    required: ['questionList', 'timeoutMs']
  },
  {
    name: 'browser_step_done',
    description: '通知Agent本步操作完成',
    properties: {
      planId: p('string', '步骤清单ID'),
      stepId: p('string', '步骤ID'),
      success: p('boolean', '是否成功'),
    },
    required: ['planId', 'stepId', 'success']
  },
  // ========== 清洗 HTML ==========
  {
    name: 'browser_get_clean_html',
    description: '获取清洗后的页面 HTML。三层清洗：1)移除 script/style/svg 等无用标签；2)移除 class/style/data-v-* 等冗余属性；3)只保留 id/name/placeholder 等核心属性。适用于需要理解页面结构但不需要精确坐标的场景。',
    properties: {
      selector: p('string', '可选，限定获取内容的容器选择器'),
      maxLength: p('integer', '最大返回长度，默认 3000')
    },
  },
  {
    name: 'browser_get_video_caption',
    description:
      '读取当前页面视频的字幕（Caption）。视频总结、内容概括、要点提取等任务应优先调用本工具。通过页面嗅探获取字幕 JSON 对象。返回 { ok, caption }，caption 为字幕 JSON；未找到时 ok 为 false。',
    properties: {},
  },
  {
    name: 'browser_seek_video',
    description:
      '将当前页面视频播放器跳转到指定时间点（秒）。可选 videoUuid 指定播放器；不传则操作页面上最大的可见 video 元素。返回 { ok, currentTime, duration? }。',
    properties: {
      seconds: p('number', '目标时间（秒），支持小数'),
      videoUuid: p('string', '可选，指定 video 的 stay-video-uuid'),
    },
    required: ['seconds'],
  },

  // ========== 用户数据 / 上传 ==========
  {
    name: 'browser_user_data',
    description: '只要需要在网页表单中填充用户相关数据（不论是手机号、邮箱、姓名、地址、身份证号、公司信息或其它个人资料），请先调用本工具查询用户预存数据。填充时可以调用 browser_set_input_user_data 或者 browser_type_index_user_data 进行自动填充。',
    properties: {}
  },
  {
    name: 'browser_get_upload_file',
    description: '读取 attachedFiles 上传文件， 非用户上传文件禁止调用该方法。fileId=files[].id。文本/表格默认每次返回约200行，响应 pagination.total 为总行数，hasMore 时用 offset=pagination.nextOffset 续读。表格可选 sheetIndex/sheetName。图片等返回 base64。',
    properties: {
      fileId: p('string', 'attachedFiles.files[].id'),
      offset: p('number', '起始行（0-based），默认 0'),
      limit: p('number', '本次最多返回行数，默认 200，最大 500'),
      sheetIndex: p('number', '表格文件：sheet 序号（0-based），默认 0'),
      sheetName: p('string', '表格文件：sheet 名称（优先于 sheetIndex）'),
      maxBytes: p('number', '可选，文件大小上限（字节），默认约 6MB'),
    },
    required: ['fileId']
  },
  {
    name: 'browser_store_put',
    description:
      '将中间过程数据写入 session store。返回 storeId + preview + schema + query（非全量）。rows 传 JSON 数组；或 text 传纯文本。后续用 browser_store_produce 导出/展示。',
    properties: {
      rows: pArray('object', 'JSON 数组，每项为一行/一条记录（推荐）'),
      text: p('string', '纯文本（多行用 \\n 分隔），与 rows 二选一'),
      storeId: p('string', '可选，已有 store-xxx 则覆盖该 store'),
      desc: p('string', '可选，store 用途说明'),
    },
  },
  {
    name: 'browser_store_append',
    description:
      '向已有 session store 追加数据（分页采集、多页合并）。必须传 put 返回的 storeId。返回更新后的 itemCount/bytes/preview/schema。',
    properties: {
      storeId: p('string', 'browser_store_put 返回的 storeId'),
      rows: pArray('object', '追加的 JSON 数组'),
      text: p('string', '追加的纯文本，与 rows 二选一'),
    },
    required: ['storeId'],
  },
  {
    name: 'browser_store_produce',
    description:
      '按 format 从 store 组装输出。delivery=download 时内部下载文件（大数据不进对话）；delivery=display 时仅返回小体积 content（过大则 truncated，改 download）。',
    properties: {
      storeId: p('string', 'browser_store_put 返回的 storeId'),
      format: p('string', 'json | csv | markdown | jsonl | text，默认 json 或 text'),
      fields: pArray('string', 'json-array 时只输出这些列，如 ["email","source"]'),
      delivery: p('string', 'display | download，默认 display'),
      fileName: p('string', 'delivery=download 时的文件名，如 emails.csv'),
      maxDisplayChars: p('number', 'delivery=display 时最多返回字符数，默认 2048'),
    },
    required: ['storeId', 'delivery'],
  },
  {
    name: 'browser_spill_get',
    description:
      '读取 context spill 外置数据（stub.spillRef）。text 用 grep 搜关键词；json-array 或 object 内 elements/rows 等数组用 slice+path+fields 分页（path 可省略自动探测）。peek 只看 preview。',
    properties: {
      spillRef: p('string', 'stub 里的 spillRef（spill-xxx）'),
      mode: p('string', 'slice | tail | peek | full | grep，默认 slice'),
      path: p('string', 'object 内嵌数组的键名，如 elements（browser_get_elements）；可省略自动探测'),
      offset: p('number', 'slice 起始位置（0-based），默认 0'),
      limit: p('number', 'slice/tail 条数；grep 匹配数（默认 20，最大 100）'),
      fields: pArray('string', 'json-array 时只返回这些字段，如 ["text","selector"]'),
      pattern: p('string', 'mode=grep 时必填，支持正则；非法正则则按字面量匹配'),
      contextChars: p('number', 'grep 命中前后各保留字符数，默认 80，最大 500'),
      ignoreCase: p('boolean', 'grep 是否忽略大小写，默认 false'),
    },
    required: ['spillRef'],
  },
  {
    name: 'browser_spill_produce',
    description:
      '从 context spill 组装输出并交付用户。省略 path 时按 stub.schema.arrayPath 自动定位数组（如 result.uniqueEmails）。delivery=download 内部下载（大数据不进对话）；string[] 用 csv 导出为单列 value。',
    properties: {
      spillRef: p('string', 'stub 里的 spillRef（spill-xxx）'),
      format: p('string', 'json | csv | markdown | jsonl | text，默认 json 或 text'),
      path: p('string', 'object 内嵌数组的键名，如 elements；可省略自动探测'),
      fields: pArray('string', 'json-array 时只输出这些列，如 ["email","source"]'),
      delivery: p('string', 'display | download，默认 display'),
      fileName: p('string', 'delivery=download 时的文件名，如 emails.csv'),
      maxDisplayChars: p('number', 'delivery=display 时最多返回字符数，默认 2048'),
    },
    required: ['spillRef', 'delivery'],
  },
  {
    name: 'browser_list_conversactions',
    description: '获取所有对话',
    properties: {
    }
  },
  {
    name: 'browser_delete_conversactions',
    description: '删除对话',
    properties: {
      targetConversationIds: pArray('string', '对话ID列表'),
    },
    required: ['targetConversationIds']
  },
  {
    name: 'browser_get_conversaction',
    description: '获取对话',
    properties: {
      targetConversationId: p('string', '对话ID'),
    },
    required: ['targetConversationId']
  },
  {
    name: 'browser_refresh_conversactions',
    description: '刷新所有对话，当调用browser_delete_conversactions删除对话后，需要调用此方法刷新所有对话',
    properties: {
    }
  },
  {
    name: 'browser_download_files',
    description:
      '下载文件到用户本机。二选一或同时使用：① assetIdList（推荐，来自 browser_html_to_pdf 等返回的短引用，无需传文件内容）；② fileInfoList（小文本：fileName + content + mimeType）。',
    properties: {
      assetIdList: pArray('string', '优先：workspace tool 资产 id 列表（如 wsasset-...），按资产 mime/fileName 下载'),
      fileInfoList: pArray(
        'object',
        '可选：文本文件列表，每项含 fileName、content、mimeType（如 text/plain）',
      ),
    },
    required: [],
  },
  {
    name: 'browser_html_to_pdf',
    description:
      '将 HTML（或纯文本）渲染为 PDF。返回 assetId（短引用）+ fileName + bytes，不要把 PDF 内容放进对话。后续用 browser_write_workspace({ assetId, fileName }) 写入工作区；也可 download/open。html 可为完整文档、片段或纯文本。',
    properties: {
      html: p('string', 'HTML 内容或纯文本。完整 html 文档或片段均可；纯文本会包一层基础样式'),
      fileName: p('string', '输出文件名，默认 document.pdf；可省略 .pdf 后缀'),
      open: p('boolean', '生成后是否在新标签打开 PDF，默认 true'),
      download: p('boolean', '是否同时触发浏览器下载，默认 true'),
      landscape: p('boolean', '是否横向页面，默认 false'),
    },
    required: ['html'],
  },
  {
    name: 'browser_write_workspace',
    description:
      '在用户已授权的 DomA 工作区写入文件。优先传 assetId（来自 browser_html_to_pdf 等 tool 返回的短引用），由本 tool 读取字节写入，模型无需传递文件内容。也可用 content 写小文本。path 为相对工作区根的子目录，默认根目录。未授权返回 workspace_not_authorized / workspace_permission_denied。',
    properties: {
      fileName: p('string', '文件名，如 hello.txt / guide.pdf。传 assetId 时可省略，默认用资产上的 fileName'),
      assetId: p('string', '优先：browser_html_to_pdf 等返回的 assetId（wsasset-...）'),
      content: p('string', '可选：小文本内容（UTF-8）。与 assetId 二选一；同时有时以 assetId 为准'),
      path: p('string', '相对工作区根的目录，默认 ""（根目录）。如 notes 或 travel/tokyo'),
    },
    required: [],
  },
  {
    name: 'browser_cli_list',
    description:
      '列出「一等公民 CLI」目录（内置 reveal + 用户在连接器→命令运行器登记的名称与描述）。专有/小众 CLI 先 list 再 browser_cli_run。通用本机操作请用 browser_cli_shell。runnerRunning=false 时提示 ~/bin/doma-cli-runner start -d。',
    properties: {},
  },
  {
    name: 'browser_cli_run',
    description:
      '执行 CLI 目录中的具名命令（需 CLI Runner）。先 browser_cli_list。内置 reveal 用 path=绝对路径；用户登记 CLI 用 commandId/name + 可选 args。未在目录中的命令不要用本 tool，改用 browser_cli_shell。本地未安装则返回 stderr/exitCode。',
    properties: {
      commandId: p('string', '来自 browser_cli_list 的 commandId 或 name'),
      path: p('string', 'reveal：本地绝对路径'),
      args: p('string', '用户登记 CLI：跟在命令名后的参数，如 help 或 search query="x"'),
    },
    required: ['commandId'],
  },
  {
    name: 'browser_cli_shell',
    description:
      '在用户本机用 shell 执行一整行命令（需 CLI Runner）。Windows 使用 cmd.exe，macOS/Linux 使用 bash/sh，按实际 shell 选择语法；PowerShell 或 Bash 专用语法需显式调用对应解释器。失败时读取 shell、stderr 和 exitCode，调整后再执行。软件自带且已登记在 CLI 目录的，优先 browser_cli_run。',
    properties: {
      command: p('string', '符合本机 shell 语法的完整命令行，如 git status'),
      timeoutSec: p('integer', '超时秒数，默认 120，最大 300'),
    },
    required: ['command'],
  },
  {
    name: 'browser_download_search',
    description:
      '查询浏览器最近下载记录（chrome.downloads.search）。用于确认点击/导航后是否产生下载、获取文件名与状态。默认按开始时间倒序返回最近若干条。',
    properties: {
      limit: p('integer', '返回条数上限，默认 10，最大 50'),
      state: p('string', '可选过滤：in_progress | interrupted | complete'),
      startedAfterMs: p('integer', '可选：只查该时刻之后开始的下载（Unix 毫秒时间戳）'),
      filenameRegex: p('string', '可选：文件名正则'),
      urlRegex: p('string', '可选：URL 正则'),
      query: p('string', '可选：搜索词（匹配 URL/文件名等，同 downloads.search 的 query）'),
    },
  },
  {
    name: 'browser_skill_image_recognition',
    description:
      '识别图片内容（视觉模型）。二选一传参：① 用户消息 attachedFiles 里的上传图/截图 → 只传 fileId（必须等于消息 JSON 中 files[].id，禁止编造）；② 页面图片、外链图、截图 URL → 只传 imageUrl（img 的 src 或完整 http(s)/data URL）。无 attachedFiles 时禁止传 fileId。',
    properties: {
      imageUrl: p(
        'string',
        '页面/外链图片的绝对 URL（http/https/data:）。从 img[src]、browser_get_elements 或截图结果获取。非用户上传场景必须用此字段，禁止用 fileId 代替。',
      ),
      fileId: p(
        'string',
        '仅用于用户 attachedFiles 上传附件：必须原样使用消息里 files[].id（如 file-xxx）。禁止自行构造、猜测或编造 fileId。',
      ),
    },
  },
  {
    name: 'browser_invoke_agent_skill',
    description:
      'Load an agent skill by name when the user task matches an entry in Available skills. Returns full skill instructions (instructions field) to follow before using other browser tools.',
    properties: {
      skill_name: p('string', 'Skill name from Available skills catalog (e.g. book-12306)'),
    },
    required: ['skill_name'],
  },
  {
    name: 'browser_save_extension_files',
    description:
      '创建独立Chrome 扩展源码存入会话资产库并注入稳定 extensionId（manifest.key）与默认图标。参数：name、description、files[{path,content}]。校验 MV3：有 background.js 须 service_worker；有 popup 时 background 必须 onMessage。失败返回 ok:false + issues，须修正后重调。成功返回瘦 ```extension markdown。禁止把源码全文贴进对话。',
    properties: {
      name: p('string', '扩展包名（小写连字符，如 tab-organizer）'),
      description: p('string', '一句话功能描述（展示在下载卡片上）'),
      files: pArray(
        'object',
        '源码文件列表。每项: path(string, 如 manifest.json/content.js), content(string, 文件全文)',
      ),
    },
    required: ['name', 'description', 'files'],
  },
  {
    name: 'browser_conversation_summarized',
    description:
      '当系统通过 interactionBlock 提示「上下文已达上限」时必须调用：把当前对话压成一段摘要写入 summary，供后续回合使用。调用后不要再执行其它工具。',
    properties: {
      summary: p(
        'string',
        '对话摘要正文：保留关键结论、待办、用户约束、重要 URL/选择与未完成步骤；简洁中文，尽量不超过 800 字',
      ),
    },
    required: ['summary'],
  },
  {
    name: 'browser_memory_upsert',
    description:
      '写入/更新本地长期记忆（按 key upsert）。仅在用户消息 interactionBlock 明确要求调用本工具时使用；不要因对话内容自行推断并调用。',
    properties: {
      key: p(
        'string',
        '记忆槽位名（稳定 key，如 locale、browser.open_tab_policy，或 site.{host}.{slot}）',
      ),
      content: p('string', '记忆正文（短句，偏好/事实，非多步流程）'),
      source: p(
        'string',
        '写入方式：explicit（用户明确要求记住）| implicit（从对话推断，未明确要求）',
      ),
      scope: p('string', '可选，默认 global；站点习惯可用 site:hostname'),
      category: p(
        'string',
        '可选：preference | profile | constraint | site_habit | other',
      ),
      aliases: pArray('string', '检索用同义词（必填更佳）：用户提起该偏好时可能说的词，供发送时本地匹配'),
    },
    required: ['key', 'content', 'source', 'aliases'],
  },
];

const BROWSER_TOOLS: ToolDef[] = [...CORE_BROWSER_TOOLS, ...getEditionToolDefs()];

function buildSchema(tool: ToolDef): { type: string; properties: Record<string, unknown>; required?: string[] } {
  const schema: Record<string, unknown> = {
    type: 'object',
    properties: { ...tool.properties },
  };
  if (tool.required && tool.required.length > 0) {
    schema.required = tool.required;
  }
  return schema as { type: string; properties: Record<string, unknown>; required?: string[] };
}

/** Claude: { name, description, input_schema } */
export function getClaudeTools() {
  return BROWSER_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: buildSchema(tool),
  }));
}

/** Gemini: [{ functionDeclarations: [{ name, description, parameters }] }] */
export function getGeminiTools() {
  const functionDeclarations = BROWSER_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: buildSchema(tool),
  }));
  return [{ functionDeclarations }];
}

/** OpenAI 兼容：{ type:'function', function: { name, description, parameters } } */
export function getOpenAICompatibleTools() {
  return BROWSER_TOOLS.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: buildSchema(tool),
    },
  }));
}

/** MCP 格式: { name, description, inputSchema } */
export function getMcpTools() {
  return BROWSER_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: buildSchema(tool)
  }));
}

export function getToolDefinitions(): readonly ToolDef[] {
  return BROWSER_TOOLS;
}
