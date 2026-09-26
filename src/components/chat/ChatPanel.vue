<template>
  <div class="chat-panel" :class="{ 'chat-panel--safari-shell': IS_SAFARI_EXT }">
    <div v-if="IS_SAFARI_EXT" class="safari-shell-header">
      <div class="safari-shell-brand">
        <span class="safari-shell-icon doma-icon" aria-hidden="true" :style="domaIconMaskStyle" />
        <span class="safari-shell-title">{{ safariShellTitle }}</span>
      </div>
      <button
        type="button"
        class="safari-panel-close-btn"
        title="Close"
        aria-label="Close"
        @click="closeSafariSidePanel"
      >
        <svg class="safari-panel-close-icon" viewBox="0 0 12 12" width="18" height="18" aria-hidden="true">
          <path
            fill="currentColor"
            d="M2.1 2.1a.75.75 0 0 1 1.06 0L6 4.94l2.84-2.84a.75.75 0 1 1 1.06 1.06L7.06 6l2.84 2.84a.75.75 0 1 1-1.06 1.06L6 7.06 3.16 9.9a.75.75 0 1 1-1.06-1.06L4.94 6 2.1 3.16a.75.75 0 0 1 0-1.06z"
          />
        </svg>
      </button>
    </div>
    <header class="chat-header">
      <div class="chat-title-row">
        <div class="chat-header-lead">
          <ChatPanelSlots position="lead" />
        </div>
        <h1 class="chat-title" aria-label="DomA">
          <span class="doma-icon" aria-hidden="true" :style="domaIconMaskStyle" />
        </h1>
        <div class="chat-header-actions" role="toolbar" aria-label="DomA">
          <button
            class="new-chat-btn header-action-btn"
            data-onboarding="newChat"
            @click="startNewConversation"
            :title="t('chat.newChat')"
          >
            <ChatNewSvg />
          </button>
          <button
            class="group-session-btn header-action-btn"
            data-onboarding="groupSession"
            @click="startGroupSession"
            :title="t('chat.groupSession')"
          >
            <ChatGroupBubbleSvg />
          </button>
          <button
            class="history-btn header-action-btn"
            data-onboarding="history"
            @click="toggleHistoryPanel"
            :class="{ active: showHistory }"
            :title="t('chat.history')"
          >
            <ChatHistorySvg />
          </button>
          <button
            class="scheduled-btn header-action-btn"
            data-onboarding="scheduled"
            @click="toggleScheduledPanel"
            :class="{ active: showScheduled }"
            :title="t('chat.scheduled.title')"
          >
            <ChatScheduleSvg />
          </button>
          <ChatPanelSlots position="toolbar" />
          <button
            class="dbplus-btn header-action-btn"
            data-onboarding="tempData"
            @click="showDbPlus = !showDbPlus; showHistory = false; showScheduled = false; showSettings = false; showMcp = false; closeChatPanelSlotsPanels()"
            :class="{ active: showDbPlus }"
            :title="t('chat.tempDataZone')"
          >
            <DbPlusSvg class="dbplus-icon" aria-hidden="true" />
          </button>
          <button
            type="button"
            class="mcp-btn header-action-btn"
            data-onboarding="connector"
            :class="{ active: showMcp }"
            :title="t('chat.connector.title')"
            @click="toggleMcpPanel"
          >
            <McpLinkSvg aria-hidden="true" />
            <span
              v-if="mcpBridgeEnabled && mcpAgentCount > 0"
              class="mcp-agent-badge"
              aria-label="connected agents"
            >{{ mcpAgentCount > 9 ? "9+" : mcpAgentCount }}</span>
          </button>
        </div>
      </div>

      <ChatPanelSlots position="downloader-panel" />
      
      <!-- 设置面板 -->
      <div v-if="showSettings" class="settings-panel">
        <div class="setting-row">
          <label>模型提供商</label>
          <select v-model="selectedProvider" @change="onProviderChange" class="setting-select">
            <option value="gemini">Gemini</option>
            <option value="claude">Claude</option>
            <option value="qwen">千问</option>
            <option value="kimi">Kimi</option>
            <option value="openai">OpenAI</option>
          </select>
        </div>
        <div class="setting-row">
          <label>API Key</label>
          <input 
            v-model="currentApiKey" 
            type="password" 
            :placeholder="getApiKeyPlaceholder()"
            class="setting-input"
            @blur="saveCurrentApiKey"
          />
        </div>
        <div class="setting-row" v-if="selectedProvider === 'claude' || selectedProvider === 'openai'">
          <label>Base URL</label>
          <input 
            v-model="currentBaseUrl" 
            type="text" 
            :placeholder="selectedProvider === 'openai' ? '可选，默认 api.openai.com（支持任何兼容接口）' : '可选，默认官方 API（代理地址如 https://your-proxy.com）'"
            class="setting-input"
            @blur="saveCurrentBaseUrl"
          />
        </div>
        <div class="setting-row">
          <label>模型</label>
          <select v-model="currentModel" @change="saveCurrentModel" class="setting-select">
            <option v-for="model in availableModels" :key="model" :value="model">{{ model }}</option>
          </select>
        </div>
        <div class="setting-row hint">
          <span v-if="selectedProvider === 'gemini'">获取 API Key: <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a></span>
          <span v-else-if="selectedProvider === 'claude'">获取 API Key: <a href="https://console.anthropic.com/" target="_blank">Anthropic Console</a> | 支持自定义代理</span>
          <span v-else-if="selectedProvider === 'qwen'">获取 API Key: <a href="https://dashscope.console.aliyun.com/" target="_blank">阿里云 DashScope</a></span>
          <span v-else-if="selectedProvider === 'kimi'">获取 API Key: <a href="https://platform.moonshot.ai/" target="_blank">Moonshot AI</a></span>
          <span v-else-if="selectedProvider === 'openai'">获取 API Key: <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a> | 支持自定义 Base URL</span>
        </div>
      </div>
      
      <!-- 历史会话面板（按日期分组，数据来自 chatStorage） -->
      <Transition name="chat-header-panel">
        <div v-if="showHistory" key="history" class="chat-header-panel-mount">
          <div class="chat-header-panel-inner">
      <div class="history-panel">
        <div class="history-search">
          <span class="history-search-icon" aria-hidden="true">
            <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
          </span>
          <input
            v-model="historySearchQuery"
            type="search"
            class="history-search-input"
            :placeholder="t('chat.historyPanel.searchPlaceholder')"
          />
        </div>

        <div class="history-scroll" v-if="groupedHistoryConversations.length > 0">
          <section
            v-for="group in groupedHistoryConversations"
            :key="group.dateKey"
            class="history-date-group"
          >
            <h3 class="history-date-label">{{ group.label }}</h3>
            <div class="history-date-items">
              <div
                v-for="conv in group.items"
                :key="conv.id"
                class="history-card"
                :class="{ active: conv.id === conversationId }"
                @click="loadHistoryConversation(conv)"
              >
                <span v-if="conv.hostname" class="history-card-host">{{ conv.hostname }}</span>
                <span class="history-card-question">{{ conv.lastUserQuestion }}</span>
                <button
                  class="history-delete-btn"
                  @click.stop="deleteConversation(conv.id)"
                  :title="t('chat.tempData.delete')"
                >
                  <ChatTrashSvg />
                </button>
              </div>
            </div>
          </section>
        </div>
        <div v-else class="history-empty">
          {{ t('chat.historyPanel.empty') }}
        </div>
      </div>
          </div>
        </div>
      </Transition>

      <!-- 定时消息面板 -->
      <Transition name="chat-header-panel">
        <div v-if="showScheduled" key="scheduled" class="chat-header-panel-mount">
          <div class="chat-header-panel-inner">
            <div class="scheduled-panel">
              <template v-if="scheduledDetailItem">
                <div class="scheduled-detail-header">
                  <button
                    type="button"
                    class="scheduled-back-btn"
                    @click="closeScheduledDetail"
                  >
                    ← {{ t('chat.scheduled.back') }}
                  </button>
                  <div class="scheduled-detail-title">{{ t('chat.scheduled.runHistory') }}</div>
                </div>
                <pre class="scheduled-detail-text">{{ scheduledDetailItem.text }}</pre>
                <div class="scheduled-scroll" v-if="scheduledDetailRuns.length > 0">
                  <div
                    v-for="run in scheduledDetailRuns"
                    :key="run.id"
                    class="scheduled-run-card"
                  >
                    <div class="scheduled-card-meta">
                      <span class="scheduled-card-time">{{ formatScheduledRunAt(run.createdAt) }}</span>
                      <span class="scheduled-card-status">{{ scheduledRunStatusLabel(run.status) }}</span>
                    </div>
                    <pre class="msg-content scheduled-run-result">{{ run.resultText || t('chat.scheduled.emptyResult') }}</pre>
                  </div>
                </div>
                <div v-else class="scheduled-empty">
                  {{ t('chat.scheduled.noRuns') }}
                </div>
              </template>
              <template v-else>
                <div class="scheduled-scroll" v-if="scheduledMessages.length > 0">
                  <div
                    v-for="item in scheduledMessages"
                    :key="item.id"
                    class="scheduled-card chat-msg user"
                    role="button"
                    tabindex="0"
                    @click="openScheduledDetail(item)"
                    @keydown.enter.prevent="openScheduledDetail(item)"
                  >
                    <div class="scheduled-card-main">
                      <div class="scheduled-card-meta">
                        <span class="scheduled-card-status">{{ scheduledStatusLabel(item.status) }}</span>
                        <span class="scheduled-card-repeat">{{ scheduledRepeatLabel(item) }}</span>
                      </div>
                      <div
                        v-if="scheduledShowNextRun(item)"
                        class="scheduled-card-next"
                      >
                        {{ t('chat.scheduled.nextRun', { time: formatScheduledRunAt(item.runAt) }) }}
                      </div>
                      <pre class="msg-content scheduled-card-text">{{ item.text }}</pre>
                    </div>
                    <div class="scheduled-card-trailing">
                      <div class="scheduled-card-actions">
                        <button
                          class="scheduled-action-btn"
                          type="button"
                          :title="t('chat.scheduled.edit')"
                          @click.stop="openEditScheduledMessage(item)"
                        >
                          <ChatEditSvg />
                        </button>
                        <button
                          class="scheduled-action-btn scheduled-action-btn--danger"
                          type="button"
                          :title="t('chat.scheduled.delete')"
                          @click.stop="deleteScheduledMessageItem(item.id)"
                        >
                          <ChatTrashSvg />
                        </button>
                      </div>
                      <span class="scheduled-card-chevron" aria-hidden="true">
                        <ChatChevronForwardSvg />
                      </span>
                    </div>
                  </div>
                </div>
                <div v-else class="scheduled-empty">
                  {{ t('chat.scheduled.empty') }}
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>

      <!-- 账户信息（Pro 编译插槽） -->
      <ChatPanelSlots position="account-panel" />

      <!-- 临时数据区标题（无需白框面板样式） -->
      <Transition name="chat-header-panel">
        <div v-if="showDbPlus" key="dbplus" class="chat-header-panel-mount">
          <div class="chat-header-panel-inner">
      <div class="dbplus-wrap">
        <div class="dbplus-header">{{ t('chat.tempData.title') }}</div>
        <div class="dbplus-desc">
          {{ t('chat.tempData.description') }}
        </div>
        <button class="dbplus-add-btn" type="button" @click="addTempDataRow">{{ t('chat.tempData.add') }}</button>

        <div v-if="tempDataRows.length" class="dbplus-rows">
          <div v-for="row in tempDataRows" :key="row.id" class="dbplus-row">
            <input
              v-model="row.desc"
              class="dbplus-input"
              type="text"
              :placeholder="t('chat.tempData.descPlaceholder')"
              @blur="onTempDataRowBlur(row)"
            />
            <span class="dbplus-sep">-</span>
            <input
              v-model="row.value"
              class="dbplus-input"
              type="text"
              :placeholder="t('chat.tempData.valuePlaceholder')"
              @blur="onTempDataRowBlur(row)"
            />
            <button class="dbplus-del-btn" type="button" @click="removeTempDataRow(row.id)" :title="t('chat.tempData.delete')">
              <ChatTrashSvg class="dbplus-del-icon" />
            </button>
          </div>
        </div>
      </div>
          </div>
        </div>
      </Transition>

      <Transition name="chat-header-panel">
        <div v-if="showMcp" key="mcp" class="chat-header-panel-mount">
          <div class="chat-header-panel-inner">
            <ConnectorPanel
              :open="showMcp"
              @bridge-enabled-change="onMcpBridgeEnabledChange"
              @cli-bridge-enabled-change="onCliBridgeEnabledChange"
              @bridge-ensure="ensureSidepanelMcpBridge"
            />
          </div>
        </div>
      </Transition>
    </header>
    
    <div
      class="chat-messages-area"
      :class="{ 'chat-messages-area--skill-drop': skillFileDropActive }"
      @dragenter.prevent="onMessagesAreaDragEnter"
      @dragover.prevent="onMessagesAreaDragOver"
      @dragleave="onMessagesAreaDragLeave"
      @drop.prevent="onMessagesAreaSkillFileDrop"
    >
      <div v-if="skillFileDropActive" class="chat-skill-drop-overlay" aria-hidden="true">
        <span class="chat-skill-drop-overlay-text">{{ t("chat.skills.dropToInstall") }}</span>
      </div>
      <BrowserPlanStepBar
        v-if="activeBrowserPlanSteps.length"
        :steps="activeBrowserPlanSteps"
        :plan-id="activeBrowserPlanId"
        :plan-name="activeBrowserPlanName"
        @cancel="onCancelBrowserPlan"
      />
      <div class="chat-messages-scroll-row">
      <QuickMessagesPanel
        v-if="showQuickMessages"
        @send="onQuickMessageSend"
      />
      <div class="chat-messages" ref="messagesEl" @click="onChatMessagesClick" @copy="onChatMessagesCopy" @scroll="scheduleUserBubbleMinimapLayout">
        <!-- 普通消息 -->
        <template v-for="(item, dIdx) in displayMessages" :key="`${item.type}-${item.id}-${dIdx}`">
          <div
            v-if="item.type === 'message' && shouldShowChatMessageRow(item.msg)"
            :class="[
              'chat-msg',
              item.msg.role,
              {
                'chat-msg--inline-editing':
                  item.msg.role === 'user' &&
                  inlineEditingUserMsgId === item.msg.id,
                'chat-msg--doma-triggered':
                  item.msg.role === 'user' &&
                  hasInteractionBlockDomaTag(String(item.msg.content ?? '')),
                'chat-msg--ask-mode':
                  item.msg.role === 'user' &&
                  hasInteractionBlockAskTag(String(item.msg.content ?? '')),
                'chat-msg--mcp-call':
                  item.msg.role === 'user' &&
                  hasInteractionBlockMcpCallTag(String(item.msg.content ?? '')),
                'chat-msg--scheduled':
                  item.msg.role === 'user' &&
                  hasInteractionBlockScheduledTag(String(item.msg.content ?? '')),
              },
            ]"
            :data-user-msg-id="item.msg.role === 'user' ? item.msg.id : undefined"
          >
          <span
            v-if="item.msg.role === 'user' && mcpCallBadgeLabel(item.msg)"
            class="chat-msg-mcp-badge"
            aria-hidden="true"
          >{{ mcpCallBadgeLabel(item.msg) }}</span>
          <span
            v-else-if="
              item.msg.role === 'user' &&
              hasInteractionBlockScheduledTag(String(item.msg.content ?? ''))
            "
            class="chat-msg-scheduled-badge"
            aria-hidden="true"
          >Scheduled</span>
          <span
            v-else-if="
              item.msg.role === 'user' &&
              hasInteractionBlockDomaTag(String(item.msg.content ?? ''))
            "
            class="chat-msg-doma-badge"
            aria-hidden="true"
          >DomA</span>
          <TurnActivityTraceView
            v-if="item.msg.role === 'assistant' && item.msg.activityTrace"
            :trace="item.msg.activityTrace"
            @toggle="onActivityTraceToggle(item.msg)"
          />
          <!-- user: 纯文本渲染；assistant: Markdown 渲染（已做 XSS 清洗） -->
          <div
            v-if="
              item.msg.role === 'assistant' &&
              isTaskStoppedMessage(item.msg)
            "
            class="msg-task-stopped-row"
          >
            <AssistantMessageContent
              class="msg-task-stopped-text"
              :content="String(item.msg.content)"
              :streaming="false"
              :typewriter-enabled="false"
              @doma-link-click="handleDomaLinkClick"
              @create-skill-from-panel="onCreateSkillFromPanel"
              @download-extension-from-panel="onDownloadExtensionFromPanel"
            />
            <button
              type="button"
              class="msg-action-icon-btn msg-turn-delete-btn"
              :title="t('chat.deleteTurn')"
              :aria-label="t('chat.deleteTurn')"
              @click="onDeleteTurnFromToolbar(item.msg)"
            >
              <ChatTrashSvg aria-hidden="true" />
            </button>
          </div>
          <AssistantMessageContent
            v-else-if="
              item.msg.role === 'assistant' &&
              (
                item.msg.content?.trim() ||
                (activeStreamMsgId === item.msg.id && !item.msg.activityTrace)
              )
            "
            :content="String(item.msg.content)"
            :streaming="activeStreamMsgId === item.msg.id"
            :typewriter-enabled="CHAT_TYPEWRITER_ENABLED"
            @doma-link-click="handleDomaLinkClick"
            @create-skill-from-panel="onCreateSkillFromPanel"
            @download-extension-from-panel="onDownloadExtensionFromPanel"
          />
          <template v-else-if="item.msg.role === 'user'">
            <div
              v-if="inlineEditingUserMsgId === item.msg.id"
              class="user-bubble-inline-composer"
              @focusout="onInlineComposerFocusOut($event, item.msg.id)"
            >
              <ChatComposer
                :key="`inline-composer-${item.msg.id}`"
                ref="inlineComposerUiRef"
                v-bind="inlineComposerBinding"
                @preview-attached-file="openComposerImagePreview"
              />
            </div>
            <div
              v-else-if="item.msg.content"
              class="msg-content msg-content--click-edit"
              v-html="renderUserBubbleHtml(String(item.msg.content))"
              @click="onUserBubbleContentClick(item.msg, $event)"
            ></div>
            <div
              v-if="item.msg.content && inlineEditingUserMsgId !== item.msg.id"
              class="user-msg-quote-row"
            >
              <button
                type="button"
                class="msg-action-icon-btn user-msg-quote-btn"
                :title="t('chat.quote.action')"
                :aria-label="t('chat.quote.action')"
                @click.stop="onQuoteUserMessage(item.msg)"
              >
                <svg class="toolbar-icon" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
                  <path d="M3.5 3.5A1.5 1.5 0 0 0 2 5v2.5A1.5 1.5 0 0 0 3.5 9H5v1.2c0 .9-.7 1.5-1.6 1.8a.5.5 0 0 0 .3.95C5.2 12.6 6.5 11.4 6.5 9.7V5A1.5 1.5 0 0 0 5 3.5H3.5Zm7 0A1.5 1.5 0 0 0 9 5v2.5A1.5 1.5 0 0 0 10.5 9H12v1.2c0 .9-.7 1.5-1.6 1.8a.5.5 0 0 0 .3.95c1.95-.35 3.3-1.55 3.3-3.25V5A1.5 1.5 0 0 0 12 3.5h-1.5Z"/>
                </svg>
              </button>
            </div>
          </template>
          <div
            v-if="
              item.msg.toolBarItems?.length ||
              (
                !item.msg.activityTrace &&
                (
                  getVisibleToolCalls(item.msg.toolCalls).length ||
                  getDoingToolCalls(item.msg.toolCalls).length ||
                  (toolDebug && getDebugToolCalls(item.msg.toolCalls).length)
                )
              )
            "
            class="msg-actions"
          >
            <div class="msg-actions-row">
              <div class="msg-actions-row-start">
              <div
                v-if="
                  item.msg.toolBarItems?.length ||
                  (toolDebug && getDebugToolCalls(item.msg.toolCalls).length) ||
                  getVisibleToolCalls(item.msg.toolCalls).length ||
                  getDoingToolCalls(item.msg.toolCalls).length
                "
                class="msg-toolbar"
              >
                <template v-if="item.msg.toolBarItems?.length">
                  <template v-for="(tb, i) in item.msg.toolBarItems" :key="`copy-${i}`">
                    <button
                      v-if="tb.type === 'copy'"
                      type="button"
                      class="msg-action-icon-btn toolbar-btn"
                      :title="t('chat.copyTurn')"
                      :aria-label="t('chat.copyTurn')"
                      @click="onToolBarItemClick(tb)"
                    >
                      <template v-if="isToolBarItemCopied(tb)">
                        <ChatCheckmarkSvg class="checkmark" />
                      </template>
                      <template v-else>
                        <ChatCopySvg class="toolbar-icon" />
                      </template>
                    </button>
                  </template>
                  <button
                    type="button"
                    class="msg-action-icon-btn toolbar-btn"
                    :title="t('chat.retryTurn')"
                    :aria-label="t('chat.retryTurn')"
                    @click="onRetryTurnFromToolbar(item.msg)"
                  >
                    <ChatRetrySvg class="toolbar-icon" />
                  </button>
                </template>

                <div
                  v-if="
                    toolDebug
                      ? getDebugToolCalls(item.msg.toolCalls).length
                      : getVisibleToolCalls(item.msg.toolCalls).length
                        || getDoingToolCalls(item.msg.toolCalls).length
                  "
                  class="toolcall-header"
                >
                <template v-if="toolDebug">
                  <button
                    type="button"
                    class="toolcall-aggregate"
                    @click="toggleToolCallsExpanded(item.msg.id)"
                  >
                    <template v-if="getDoingToolCalls(item.msg.toolCalls).length">
                      <template v-if="getDoingToolCalls(item.msg.toolCalls).length === 1">
                        {{ t('chat.toolCall.callingOne', { name: getDoingToolCalls(item.msg.toolCalls)[0].name }) }}
                      </template>
                      <template v-else>
                        {{ t('chat.toolCall.callingMany', { count: getDoingToolCalls(item.msg.toolCalls).length }) }}
                      </template>
                    </template>
                    <template v-else>
                      <span class="toolcall-summary">
                        {{ t('chat.toolCall.calledTotal', { count: getDebugToolCalls(item.msg.toolCalls).length }) }}
                      </span>
                    </template>
                    <ChatChevronForwardSvg
                      v-if="getDebugToolCalls(item.msg.toolCalls).length"
                      class="chevron"
                      :class="{ expanded: isToolCallsExpanded(item.msg.id) }"
                    />
                  </button>
                </template>
                <template v-else>
                  <span class="toolcall-aggregate toolcall-aggregate--static">
                    <template v-if="getDoingToolCalls(item.msg.toolCalls).length">
                      <span class="toolcall-calling">{{ t('chat.toolCall.callingAgent') }}</span>
                    </template>
                    <template v-else>
                      <span class="toolcall-summary">
                        {{ t('chat.toolCall.calledCount', { count: getVisibleToolCalls(item.msg.toolCalls).length }) }}
                      </span>
                    </template>
                  </span>
                </template>
                </div>
              </div>
              </div>
              <div
                v-if="item.msg.toolBarItems?.length"
                class="msg-actions-row-end"
              >
                <button
                  type="button"
                  class="msg-action-icon-btn msg-turn-memory-btn"
                  :title="t('chat.saveTurnMemory')"
                  :aria-label="t('chat.saveTurnMemory')"
                  @click="onSaveTurnMemoryClick(item.msg)"
                >
                  <ChatMemorySvg aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="msg-action-icon-btn msg-turn-delete-btn"
                  :title="t('chat.deleteTurn')"
                  :aria-label="t('chat.deleteTurn')"
                  @click="onDeleteTurnFromToolbar(item.msg)"
                >
                  <ChatTrashSvg aria-hidden="true" />
                </button>
              </div>
            </div>

            <div
              v-if="toolDebug && isToolCallsExpanded(item.msg.id)"
              class="toolcall-list"
            >
              <div
                v-for="(tc, ti) in getDebugToolCalls(item.msg.toolCalls)"
                :key="`${tc.id || tc.name}-${ti}`"
                class="toolcall-item"
                :class="{ 'toolcall-item--doing': tc.state === 'doing' }"
              >
                <template v-if="tc.state === 'doing'">
                  {{ t('chat.toolCall.callingOne', { name: tc.name }) }}
                </template>
                <template v-else>
                  {{ tc.name }}
                </template>
              </div>
            </div>
          </div>
          <CustomUIRenderer
            v-if="item.msg.customUi"
            :customUi="item.msg.customUi"
            :messageId="item.msg.id"
            @action="(action: string, data: Record<string, unknown>) => handleCustomUIAction(item.msg.id, action, data)"
          />
        </div>
        <div v-else-if="item.type === 'process-group'" class="process-group" :class="{ executing: item.isExecuting }">
          <div class="process-header">
            <ChatExpandRightSvg :class="['expand-icon', { expanded: true }]" />
            <span class="process-title">
              <template v-if="item.isExecuting">
                <span class="executing-indicator"></span>
                正在执行... ({{ item.processes.length }} 步)
              </template>
              <template v-else>
                执行完成 ({{ item.processes.length }} 步)
              </template>
            </span>
          </div>
          <div class="process-list">
            <div v-for="(proc, index) in item.processes" :key="`${proc.id}-step-${index}`" class="process-item">
              <div class="process-step-header">
                <span class="step-number">步骤 {{ index + 1 }}</span>
                <span class="step-tool">{{ stepToolLabel(proc) }}</span>
                <ChatExpandDownSvg :class="['step-expand-icon', { expanded: true }]" />
              </div>
              <div class="process-content-wrapper">
                <CustomUIRenderer
                  v-if="proc.customUi"
                  :customUi="proc.customUi"
                  :messageId="proc.id"
                  @action="(action: string, data: Record<string, unknown>) => handleCustomUIAction(proc.id, action, data)"
                />
                <pre v-else class="process-content">{{ sanitizeAssistantUserFacing(String(proc.content ?? '')) }}</pre>
              </div>
            </div>
          </div>
        </div>
      </template>
      <div v-if="showPlanQuestionsCard" class="chat-msg assistant plan-questions-msg">
        <PlanQuestionsCard />
      </div>
        <!-- 底部占位，确保滚动到底部时内容不被遮挡 -->
        <div class="scroll-anchor" aria-hidden="true"></div>
      </div>
      <aside
        v-if="userBubbleMinimapMarks.length"
        ref="userBubbleMinimapEl"
        class="user-bubble-minimap"
        aria-label="用户消息导航"
      >
        <button
          v-for="mark in userBubbleMinimapMarks"
          :key="mark.id"
          type="button"
          class="user-bubble-minimap-mark"
          :class="{
            'user-bubble-minimap-mark--doma': mark.isDoma,
            'user-bubble-minimap-mark--ask': mark.isAsk,
            'user-bubble-minimap-mark--mcp': mark.isMcp,
            'user-bubble-minimap-mark--scheduled': mark.isScheduled,
          }"
          :style="{ top: `${mark.top}px`, height: `${mark.height}px` }"
          :aria-label="mark.preview"
          @click="scrollToUserBubble(mark.id)"
          @mouseenter="showUserBubbleMinimapTooltip(mark, $event)"
          @mouseleave="hideUserBubbleMinimapTooltip"
        />
      </aside>
      <div
        v-if="userBubbleMinimapTooltip"
        class="user-bubble-minimap-tooltip"
        :style="userBubbleMinimapTooltipStyle"
      >
        {{ userBubbleMinimapTooltip.preview }}
      </div>
      </div>
    </div>

    <div class="chat-input-row">
      <div class="composer-modal-anchor">
      <div class="composer-stack">
        <!-- 顶部 host + 会话选择（贴住输入框上沿） -->
        <MessageEnqueuePanel
          :conversation-id="conversationId"
          @send="onEnqueueSend"
          @remove="onEnqueueRemove"
        />
        <ConversationPicker
          :options="conversationPickerOptions"
          :loading="loading"
          @change="onConversationSelectChange"
          @close="onConversationPickerClose"
        />

        <ChatComposer
          ref="dockComposerUiRef"
          v-bind="dockComposerBinding"
          @preview-attached-file="openComposerImagePreview"
          @schedule-request="onDockScheduleMessageClick"
        />
      </div>
      <ActionModal
        v-model:show="showActionModal"
        :title="actionModalTitle"
        :buttonText="actionModalButtonText"
        :inviteCode="actionModalInviteCode"
        :inviteLabel="actionModalInviteLabel"
        @action="onActionModalClick"
      />
    <Teleport to="body">
      <ProviderSetupDialog
          v-if="isOpenEdition() && showProviderSetup"
          @close="showProviderSetup = false"
          @saved="onProviderSetupSaved"
        />
      </Teleport>
      </div>
    </div>

    <ChatPanelSlots position="first-chat-prompt" />
    <ChatPanelSlots position="login-welcome" />

    <CreateExtensionDescDialog
      :visible="showCreateExtensionDescDialog"
      :title="t('chat.createExtensionDesc.title')"
      :hint="t('chat.createExtensionDesc.hint')"
      :placeholder="t('chat.createExtensionDesc.placeholder')"
      :use-popup-label="t('chat.createExtensionDesc.usePopupLabel')"
      :use-popup-hint="t('chat.createExtensionDesc.usePopupHint')"
      :confirm-text="t('chat.createExtensionDesc.confirm')"
      :cancel-text="t('chat.createExtensionDesc.cancel')"
      @confirm="onCreateExtensionDescConfirm"
      @cancel="onCreateExtensionDescCancel"
    />

    <div
      v-if="composerImagePreview"
      class="composer-image-preview-overlay"
      role="dialog"
      aria-modal="true"
      :aria-label="composerImagePreview.name"
      @mousedown.self="closeComposerImagePreview"
    >
      <div class="composer-image-preview-dialog">
        <button
          type="button"
          class="composer-image-preview-close"
          aria-label="关闭"
          @click="closeComposerImagePreview"
        >
          ×
        </button>
        <img
          class="composer-image-preview-img"
          :src="composerImagePreview.url"
          :alt="composerImagePreview.name"
        />
        <div class="composer-image-preview-caption">{{ composerImagePreview.name }}</div>
      </div>
    </div>

    <ScheduleMessageDialog
      :visible="showScheduleDialog"
      :text="scheduleDraftText"
      :title="editingScheduledId ? t('chat.scheduled.editDialogTitle') : t('chat.scheduled.dialogTitle')"
      :date-time-label="t('chat.scheduled.dateTime')"
      :repeat-label="t('chat.scheduled.repeat')"
      :repeat-none="t('chat.scheduled.repeatNone')"
      :repeat-daily="t('chat.scheduled.repeatDaily')"
      :repeat-hourly="t('chat.scheduled.repeatHourly')"
      :repeat-minutes="t('chat.scheduled.repeatMinutes')"
      :interval-minutes-label="t('chat.scheduled.intervalMinutesLabel')"
      :interval-minutes-placeholder="t('chat.scheduled.intervalMinutesPlaceholder')"
      :invalid-interval-text="t('chat.scheduled.invalidInterval')"
      :cancel-text="t('chat.scheduled.cancel')"
      :confirm-text="editingScheduledId ? t('chat.scheduled.save') : t('chat.scheduled.confirm')"
      :saving-text="t('chat.scheduled.saving')"
      :invalid-time-text="t('chat.scheduled.invalidTime')"
      :initial-run-at="scheduleDialogInitialRunAt"
      :initial-repeat="scheduleDialogInitialRepeat"
      :initial-interval-minutes="scheduleDialogInitialIntervalMinutes"
      :submit-error="scheduleDialogError"
      @cancel="closeScheduleDialog"
      @confirm="onScheduleDialogConfirm"
    />

    <OnboardingOverlay
      v-if="showOnboarding"
      panel-selector=".chat-panel"
      @done="onOnboardingDone"
    />
  </div>
</template>
 
<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Storage } from "@/store/Storage";
import { localDecrypt, localEncrypt } from "@/utils/localCrypto";

import { renderUserPlainTextAsBubbleHtml } from "@/services/chat/ChatMarkdownRenderer";
import { llmManager, type LlmProvider, type LlmResponse, DEFAULT_MODELS } from "@/services/chat/llm/entry";
import { chatStorage, newChatMessageId, type StoredConversation, type StoredMessage } from "@/services/chat/chatStorage";
import CustomUIRenderer from "./CustomUIRenderer.vue";
import AssistantMessageContent from "./AssistantMessageContent.vue";
import TurnActivityTraceView from "./TurnActivityTrace.vue";
import ConversationPicker from "./ConversationPicker.vue";
import ChatComposer from "./composer/ChatComposer.vue";
import CreateExtensionDescDialog from "./composer/CreateExtensionDescDialog.vue";
import type { CreateExtensionDescConfirmPayload } from "./composer/CreateExtensionDescDialog.vue";
import QuickMessagesPanel from "./QuickMessagesPanel.vue";
import OnboardingOverlay from "./OnboardingOverlay.vue";
import { useChatComposer } from "./composer/useChatComposer";
import ScheduleMessageDialog, {
  type ScheduleMessageConfirmPayload,
} from "./ScheduleMessageDialog.vue";
import {
  createScheduledMessage,
  createScheduledRun,
  deleteScheduledMessage,
  listScheduledMessages,
  listScheduledRuns,
  patchScheduledMessage,
  type ScheduledFirePayload,
  type ScheduledMessage,
  type ScheduledMessageStatus,
  type ScheduledRepeat,
  type ScheduledRun,
  type ScheduledRunStatus,
} from "@/services/chat/scheduledMessagesStore";
import { armScheduledAlarm, clearScheduledAlarm } from "@/services/chat/scheduledMessagesAlarms";
import {
  applyFaviconToImg,
  faviconPlaceholderSrc,
  getCachedFaviconObjectUrl,
} from "./composer/faviconCache";
import type { ComposerSendPayload, AttachedFilePreviewPayload } from "./composer/types";
import { slashCommandLabel, buildSlashCommandSendText } from "@/services/chat/slashCommands";
import { buildTabMentionSendText } from "@/services/chat/tabMentionSend";
import { slashSkillLabel, buildSlashSkillSendText } from "@/services/chat/slashSkills";
import { parseExtensionFencePayload } from "@/services/chat/extensionFence";
import { getExtensionAsset } from "@/services/chat/extensionAssetStore";
import { buildZipBlob, triggerBlobDownload } from "@/services/chat/extensionZip";
import { normalizeMcpExternalSendText } from "@/services/chat/mcpExternalSend";
import { notePanelActivity, pingServiceWorker, logIdleDiag } from "@/services/chat/swIdleDiag";
import {
  DOMA_CLI_BRIDGE_PORT,
  DOMA_MCP_BRIDGE_PORT,
  isMcpBridgeConnected,
  sendMcpBridgeAccepted,
  sendMcpBridgeResult,
  sendMcpBridgeRunning,
  startMcpBridgeClient,
  stopMcpBridgeClient,
  type McpBridgeInboundMessage,
} from "@/services/chat/mcpBridgeClient";
import { isCliBridgeEnabled, isMcpBridgeEnabled } from "@/services/chat/mcpBridgePrefs";
import { prepareUserSendText } from "@/services/chat/interactionBlockSendHints";
import {
  appendReasoningToTrace,
  cloneTurnActivityTrace,
  completeToolInTrace,
  completeTraceBeforeAnswer,
  createTurnActivityTrace,
  finishTurnActivityTrace,
  reopenTurnActivityTrace,
  startToolInTrace,
} from "@/services/chat/activityTrace";
import {
  enrichUserSendTextWithMemories,
  type ActiveTabContext,
} from "@/services/chat/memoryHooks";
import {
  CONTEXT_SUMMARIZE_INTERACTION_BLOCK,
  CONTEXT_SUMMARIZE_TOOL_NAME,
  extractSummarizedResult,
  resetUsageAfterSummarize,
  shouldTriggerContextSummarize,
} from "@/services/chat/contextSummarize";
import { hydrateContextUsageFromIdb, resetContextUsage } from "@/services/chat/llm/contextUsage";
import {
  isOnboardingDone,
} from "@/services/chat/onboardingStore";
import BrowserPlanStepBar from "./BrowserPlanStepBar.vue";
import PlanQuestionsCard from "./PlanQuestionsCard.vue";
import {
  getBrowserPlanSteps,
  getBrowserPlanId,
  getBrowserPlanName,
  clearBrowserPlanSteps,
  applyBrowserStepDoneFromToolCall,
  initBrowserPlanFromToolCall,
  updateBrowserPlanStepStatus,
} from "@/services/chat/browserPlanSteps";
import {
  formatPlanQuestionsContent,
  isPlanQuestionsActiveForConversation,
  normalizePlanQuestionList,
  openPlanQuestionsSession,
} from "@/services/chat/planQuestionsSession";
import { isDomaSkillFile, readDomaSkillFileText } from "@/services/chat/skills/importDomaSkill";
import MessageEnqueuePanel from "./MessageEnqueuePanel.vue";
import ActionModal from "./ActionModal.vue";
import {
  type ChatMessage,
  type DisplayItem,
  type CustomUI,
  type ProgressPayload,
  // type ThinkingPayload, // [disabled 2026-06-18] see disabledFeatures.record.md
  type UserscriptsPayload,
  type ChatMessageToolBarItem,
  type ChatMessageToolCall,
  type TurnActivityTrace,
  type CopySelectionAnchor,
  type CopySelectionChipPayload,
  type PageElementsPayload,
  type PrimarySubjectType,
  type UserAttachedFileMeta,
  type UserToolInputBlock,
  readChatMessageProcessMeta,
  CHAT_MESSAGE_PROCESS_META_KEY,
} from './chatTypes';
import { getContext, getCurrentTab, getCurrentWindowId } from "@/services/Context";
import {
  flattenElementsStruct,
  formatElementsChipLabel,
  formatUserMessageForModel,
  parseUserMessageSegments,
  serializeUserMessageSegments,
  expandQuotedUserMessagesInSendText,
  formatQuotedUserMessageForSend,
  shouldHideUserBubble,
  hasInteractionBlockDomaTag,
  hasInteractionBlockAskTag,
  hasInteractionBlockMcpCallTag,
  hasInteractionBlockScheduledTag,
  ensureScheduledInteractionTag,
  extractScheduledIdFromContent,
  extractMcpCallLabel,
  resolveConversationLastUserQuestion,
  buildElementsStructFromCopyMessage,
  composerPasteSegmentsToUserMessageSegments,
  parseComposerPasteDom,
  parseCopySelectionAnchor,
  parseCopySelectionSelectors,
  parseSourceTabId,
  selectorsWireFromStruct,
  toolInputDisplayLabel,
} from './chatTypes';
import { getUploadFile } from "@/services/chat/uploadFileStore";
import ProviderSetupDialog from './ProviderSetupDialog.vue';
import { isOpenEdition } from '@/config/buildEdition';
import { sendEdition } from '@/services/chat/sendEdition';
import { setChatActionModalOpener } from '@/services/chat/chatActionModalBridge';
import {
  closeChatPanelSlotsPanels,
  isChatPanelSlotsPanelOpen,
  notifyChatPanelSlotsAfterOnboardingDone,
  registerChatPanelSlotsHost,
} from '@/services/chat/chatPanelSlotsBridge';
import ChatPanelSlots from '@/components/chat/ChatPanelSlots';
import { openProUpgradeActionModal } from '@/services/chat/proUpgradeModal';
import ChatNewSvg from "@/assets/images/chat-new.svg";
import ChatGroupBubbleSvg from "@/assets/images/chat-group-bubble.svg";
import ChatHistorySvg from "@/assets/images/chat-history.svg";
import ChatScheduleSvg from "@/assets/images/chat-schedule.svg";
import ChatTrashSvg from "@/assets/images/chat-trash.svg";
import ChatMemorySvg from "@/assets/images/chat-memory.svg";
import ChatEditSvg from "@/assets/images/chat-edit.svg";
import ChatChevronForwardSvg from "@/assets/images/chat-chevron-forward.svg";
import ChatCopySvg from "@/assets/images/chat-copy.svg";
import ChatRetrySvg from "@/assets/images/chat-retry.svg";
import ChatCheckmarkSvg from "@/assets/images/chat-checkmark.svg";
import ChatExpandRightSvg from "@/assets/images/chat-expand-right.svg";
import ChatExpandDownSvg from "@/assets/images/chat-expand-down.svg";
import domaIconMaskUrl from "@/assets/images/doma-icon.svg?url";
import DbPlusSvg from "@/assets/images/db-plus.svg";
import McpLinkSvg from "@/assets/images/mcp-link.svg";
import ConnectorPanel from "@/components/chat/ConnectorPanel.vue";
import { getLocalizedString } from "@/services/extensionService";
import { isHttpError } from "@/services/chat/sseFetcher";
const domaIconMaskStyle = {
  maskImage: `url("${domaIconMaskUrl}")`,
  WebkitMaskImage: `url("${domaIconMaskUrl}")`,
};
import { awaitConversationContextPersistenceReady, reloadConversationContextsFromDisk } from "@/services/chat/conversationContextPersistence";
import {
  enqueueMessage,
  shiftEnqueueForConversation,
  type EnqueueItem,
} from "@/services/chat/enqueueStore";
import { 
  getConversationIdByTabId, 
  upsertConversationContext, 
  pruneInvalidConversationContexts, 
  listConversationContexts,
  replaceConversationMapsFromPersisted,
  generateConversationId,
  getConversationContext,
  getConversationCallChain,
  type ConversationCallChainLink,
  removeConversationByGroupId,
  type ConversationContext,
  removeConversationByTabId,
  getConversationIdByGroupId,  
  getConversationIdByGroupTabId,
  removeConversationContext,
  // getConversationIdByThinkId, // [disabled 2026-06-18]
} from "@/services/chat/conversationContextStore";
import { isBuiltinNewTabOrStartPageUrl } from "@/services/chat/browserTools";
import { sanitizeAssistantUserFacing } from "@/utils/sanitizeAssistantReply";
import {
  parseDomaVideoSeekHref,
  resolveDomaHrefFromClickTarget,
} from "@/utils/domaVideoSeek";
import {
  toggleUserscript,
  deleteUserscript,
} from '@/edition/chatPanelProBridge';
import { VideoPageTools } from '@/services/videoPageTools';
import {
  extractHostnameFromUrl,
  groupConversationsByDate,
  searchHistoryConversations,
  stripInteractionBlocksForHistoryUi,
  type HistoryConversationMeta,
  type HistoryConversationRow,
} from "@/utils/historyConversationUi";
import {
  cancelActiveTabRecording,
  isTabRecordingActive,
  startActiveTabRecording,
  stopActiveTabRecordingAndDownload,
} from "@/services/chat/tabRecording";
import {
  initActiveBrowserTabTracking,
  isSafariSidePanelShell,
  requestCloseSidePanelShell,
  resolveActiveBrowserTab,
} from "@/edition/activeBrowserTab";
import {
  safariShellOnAssistantUpsert,
  safariShellOnStop,
  safariShellOnTurnDone,
  safariShellOnUserSend,
} from "@/edition/safariShellChat";

/** Safari 页内壳：禁 tabs/windows；宿主 tab 由 edition(pro) + panelShell 注入 */
const IS_SAFARI_EXT = isSafariSidePanelShell();

if (IS_SAFARI_EXT) {
  initActiveBrowserTabTracking((tab) => {
    console.log("[ChatPanel] safari host tab", tab);
  });
}

function closeSafariSidePanel() {
  void requestCloseSidePanelShell();
}

const safariShellTitle =
  getLocalizedString("extension_name") || "DomA - Conversation is action, Your browser agent";


const { t, locale } = useI18n();

export type DomaLinkClickHandler = (href: string, event: MouseEvent) => void;

const props = defineProps<{
  /** 点击消息中的 doma:// 链接时调用（未传则 emit domaLinkClick） */
  onDomaLinkClick?: DomaLinkClickHandler;
}>();

const emit = defineEmits<{
  (e: "back"): void;
  (e: "toolbar", item: ChatMessageToolBarItem): void;
  (e: "domaLinkClick", href: string, event: MouseEvent): void;
}>();

const taggleSelect = ref(false);
const messages = ref<ChatMessage[]>([]);

/** 流式打字机效果：改这里即可，默认关闭 */
const CHAT_TYPEWRITER_ENABLED = false;

const loadingConversationIds = ref<Set<string>>(new Set());
const thinkingConversationIds = ref<Set<string>>(new Set());
type ActivityTraceRuntime = {
  rootMessageId: string;
  trace: TurnActivityTrace;
};
const activityTraceByConversation = new Map<string, ActivityTraceRuntime>();
/** 当前正在流式输出的 assistant 消息 id（用于轻量增量渲染） */
const activeStreamMsgId = ref<string | null>(null);
const abortControllersByConversation = new Map<string, AbortController>();
/** 侧栏首屏 loadBound 完成前入队 */
const mcpExternalTaskQueue: Array<{
  requestId: string;
  sendText: string;
  callerAgent: string;
  attachments: unknown[];
}> = [];
let chatPanelReadyForMcp = false;

function newMcpAttachedFileId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `file-${crypto.randomUUID()}`
    : `file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function stripDataUrlBase64(raw: string): { base64: string; mimeType?: string } {
  const s = raw.trim();
  if (s.startsWith("data:") && s.includes(",")) {
    const [header, data] = s.split(",", 2);
    const mime = header.startsWith("data:") ? header.slice(5).split(";")[0] : undefined;
    return { base64: data, mimeType: mime || undefined };
  }
  return { base64: s };
}

/** 将 MCP attachments 写入 upload store，并返回 attachedFiles 元数据 */
async function ingestMcpAttachments(rawList: unknown[]): Promise<UserAttachedFileMeta[]> {
  const out: UserAttachedFileMeta[] = [];
  if (!Array.isArray(rawList) || !rawList.length) return out;

  for (let i = 0; i < rawList.length; i++) {
    const item = rawList[i];
    let name = `attachment-${i}`;
    let mimeType = "application/octet-stream";
    let base64 = "";
    let size = 0;
    let lastModified = Date.now();

    if (typeof item === "string") {
      const parsed = stripDataUrlBase64(item);
      base64 = parsed.base64;
      if (parsed.mimeType) mimeType = parsed.mimeType;
    } else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const raw =
        (typeof o.dataBase64 === "string" && o.dataBase64) ||
        (typeof o.base64 === "string" && o.base64) ||
        (typeof o.data === "string" && o.data) ||
        "";
      if (!raw) continue;
      const parsed = stripDataUrlBase64(raw);
      base64 = parsed.base64;
      name =
        (typeof o.name === "string" && o.name.trim()) ||
        (typeof o.fileName === "string" && o.fileName.trim()) ||
        name;
      mimeType =
        (typeof o.mimeType === "string" && o.mimeType) ||
        (typeof o.type === "string" && o.type) ||
        parsed.mimeType ||
        mimeType;
      if (typeof o.size === "number" && Number.isFinite(o.size)) size = Math.max(0, Math.floor(o.size));
      if (typeof o.lastModified === "number" && Number.isFinite(o.lastModified)) {
        lastModified = Math.floor(o.lastModified);
      }
    } else {
      continue;
    }

    if (!base64) continue;
    const id = newMcpAttachedFileId();
    try {
      const res = await getContext().browser.runtime.sendMessage({
        origin: "sidepanel",
        operate: "chat/uploadFilesPutBase64",
        file: {
          id,
          base64,
          name,
          type: mimeType,
          size: size || undefined,
          lastModified,
        },
      });
      if (!res || (res as { ok?: boolean }).ok !== true) {
        console.warn("[ChatPanel] MCP attachment store failed", name, res);
        continue;
      }
      out.push({
        id,
        name,
        type: mimeType,
        size: size || undefined,
        lastModified,
      });
    } catch (e) {
      console.warn("[ChatPanel] MCP attachment ingest error", name, e);
    }
  }
  return out;
}

async function processMcpExternalTask(payload: {
  requestId: string;
  sendText: string;
  callerAgent: string;
  attachments?: unknown[];
}): Promise<void> {
  const { requestId, callerAgent } = payload;
  // 块内仅 Agent 名；instruction 必须在 interactionBlock 外
  let sendText = normalizeMcpExternalSendText(payload.sendText, callerAgent);

  const files = await ingestMcpAttachments(
    Array.isArray(payload.attachments) ? payload.attachments : [],
  );
  if (files.length) {
    sendText = formatUserMessageForModel({ files, body: sendText });
  }

  const instruction = sendText
    .replace(/<interactionBlock>[\s\S]*?<\/interactionBlock>/gi, "")
    .trim();
  console.log("[ChatPanel] processMcpExternalTask", {
    requestId,
    callerAgent,
    attachmentCount: files.length,
    sendText,
    instruction,
  });
  if (!instruction) {
    reportMcpExternalResult({
      requestId,
      ok: false,
      text: "MCP 任务缺少 instruction",
      status: "error",
    });
    return;
  }

  try {
    await startGroupSession();
    // conversationId 由 startGroupSession 生成；MCP 返回的必须是这个 id
    const cid = conversationId.value;
    if (!cid) {
      reportMcpExternalResult({
        requestId,
        ok: false,
        text: "DomA 未能创建会话（conversationId 为空）",
        status: "error",
      });
      return;
    }
    reportMcpExternalAccepted({ requestId, conversationId: cid });
    if (isConversationLoading(cid)) {
      reportMcpExternalResult({
        conversationId: cid,
        requestId,
        ok: false,
        text: "DomA 正在执行其他任务，请稍后再试",
        status: "error",
      });
      return;
    }
    await addMessage(cid, "user", sendText);
    await send2(sendText, {
      conversationId: cid,
      skipUserMessage: true,
      skipSummarizeGate: true,
      mcpConversationId: cid,
    });
  } catch (e) {
    reportMcpExternalResult({
      requestId,
      conversationId: conversationId.value || undefined,
      ok: false,
      text: e instanceof Error ? e.message : String(e),
      status: "error",
    });
  }
}

function handleMcpExternalTaskMessage(message: {
  requestId?: unknown;
  sendText?: unknown;
  callerAgent?: unknown;
  attachments?: unknown;
}): { ok: boolean; error?: string; queued?: boolean } {
  const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
  const rawSend = typeof message.sendText === "string" ? message.sendText.trim() : "";
  const callerAgent =
    typeof message.callerAgent === "string" && message.callerAgent.trim()
      ? message.callerAgent.trim()
      : "MCP";
  if (!requestId) return { ok: false, error: "requestId required" };
  if (!rawSend) return { ok: false, error: "sendText required" };

  const sendText = normalizeMcpExternalSendText(rawSend, callerAgent);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const item = { requestId, sendText, callerAgent, attachments };

  if (!chatPanelReadyForMcp) {
    mcpExternalTaskQueue.push(item);
    console.log("[ChatPanel] mcpExternalTask queued until panel ready", { requestId });
    return { ok: true, queued: true };
  }

  void processMcpExternalTask(item);
  return { ok: true };
}

/**
 * MCP `browser_send_conversation_message` → ChatPanel 入口。
 * 注意：参数勿命名 conversationId，会遮蔽组件内的 conversationId ref。
 */
async function processMcpExternalMessage(payload: {
  requestId: string;
  targetConversationId: string;
  sendText: string;
  callerAgent: string;
  attachments?: unknown[];
}): Promise<void> {
  const { requestId, targetConversationId, callerAgent } = payload;
  let sendText = payload.sendText;

  const files = await ingestMcpAttachments(
    Array.isArray(payload.attachments) ? payload.attachments : [],
  );
  if (files.length) {
    sendText = formatUserMessageForModel({ files, body: sendText });
  }

  console.log("[ChatPanel] processMcpExternalMessage", {
    requestId,
    targetConversationId,
    callerAgent,
    attachmentCount: files.length,
    sendText,
  });

  // 先 ack，避免 daemon 等待超时
  reportMcpExternalAccepted({ requestId, conversationId: targetConversationId });

  try {
    if (conversationId.value !== targetConversationId) {
      await loadConversation(targetConversationId, "mcp.externalTask");
    }
    if (isConversationLoading(targetConversationId)) {
      reportMcpExternalResult({
        conversationId: targetConversationId,
        requestId,
        ok: false,
        text: "DomA 正在执行其他任务，请稍后再试",
        status: "error",
      });
      return;
    }
    await addMessage(targetConversationId, "user", sendText);
    await send2(sendText, {
      conversationId: targetConversationId,
      skipUserMessage: true,
      skipSummarizeGate: true,
      mcpConversationId: targetConversationId,
    });
  } catch (e) {
    reportMcpExternalResult({
      requestId,
      conversationId: targetConversationId,
      ok: false,
      text: e instanceof Error ? e.message : String(e),
      status: "error",
    });
  }
}

function handleMcpExternalMessageMessage(message: {
  requestId?: unknown;
  conversationId?: unknown;
  sendText?: unknown;
  callerAgent?: unknown;
  attachments?: unknown;
}): { ok: boolean; error?: string; queued?: boolean } {
  const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
  const targetConversationId =
    typeof message.conversationId === "string" ? message.conversationId.trim() : "";
  const rawSend = typeof message.sendText === "string" ? message.sendText.trim() : "";
  const callerAgent =
    typeof message.callerAgent === "string" && message.callerAgent.trim()
      ? message.callerAgent.trim()
      : "MCP";
  if (!requestId) return { ok: false, error: "requestId required" };
  if (!targetConversationId) return { ok: false, error: "conversationId required" };
  if (!rawSend) return { ok: false, error: "sendText required" };

  const sendText = normalizeMcpExternalSendText(rawSend, callerAgent);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const item = { requestId, targetConversationId, sendText, callerAgent, attachments };

  if (!chatPanelReadyForMcp) {
    // 面板未就绪时仍异步跑（侧栏已挂载，通常很快 ready）
    console.log("[ChatPanel] mcpExternalMessage before ready — running anyway", { requestId });
  }

  void processMcpExternalMessage(item);
  return { ok: true };
}

/**
 * MCP `browser_close_conversation` → ChatPanel 入口。
 * 实际关闭会话逻辑请在 processMcpExternalClose 中实现。
 */
async function processMcpExternalClose(payload: {
  requestId: string;
  targetConversationId: string;
  callerAgent: string;
}): Promise<void> {
  const { requestId, targetConversationId, callerAgent } = payload;
  console.log("[ChatPanel] processMcpExternalClose", {
    requestId,
    targetConversationId,
    callerAgent,
  });

  // 先 ack，避免 daemon 等待超时
  reportMcpExternalAccepted({ requestId, conversationId: targetConversationId });

  try {
    // TODO: 在此实现关闭对话（UI / 会话状态 / 标签组等）
    const conversation = getConversationContext(targetConversationId);
    
    if (isConversationLoading(targetConversationId)) {
    try {
      abortControllersByConversation.get(targetConversationId)?.abort();
    } catch {
      // ignore
    }
    abortControllersByConversation.delete(targetConversationId);

  }

    if (conversation) {
      if (conversation.mode === "group") {
        const groupId = conversation.groupId;
        if (typeof groupId === "number" && groupId >= 0) {
          const browser = getContext().browser;
          const tabs = await browser.tabs.query({ groupId });
          const tabIds = tabs
            .map((t: { id?: number }) => t.id)
            .filter((id: number | undefined): id is number => typeof id === "number" && id >= 0);
          if (tabIds.length) {
            await browser.tabs.remove(tabIds);
          }
        }
      }
      else if (conversation.mode === "single") {
        const tabId = conversation.tabId;
        if (typeof tabId === "number" && tabId >= 0) {
          const browser = getContext().browser;
          await browser.tabs.remove(tabId);
        }
      }
    }

    reportMcpExternalResult({
      requestId,
      conversationId: targetConversationId,
      ok: true,
      text: `会话关闭请求已接收（conversationId=${targetConversationId}）`,
      status: "done",
    });
  } catch (e) {
    reportMcpExternalResult({
      requestId,
      conversationId: targetConversationId,
      ok: false,
      text: e instanceof Error ? e.message : String(e),
      status: "error",
    });
  }
}

function handleMcpExternalCloseMessage(message: {
  requestId?: unknown;
  conversationId?: unknown;
  callerAgent?: unknown;
}): { ok: boolean; error?: string } {
  const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
  const targetConversationId =
    typeof message.conversationId === "string" ? message.conversationId.trim() : "";
  const callerAgent =
    typeof message.callerAgent === "string" && message.callerAgent.trim()
      ? message.callerAgent.trim()
      : "MCP";
  if (!requestId) return { ok: false, error: "requestId required" };
  if (!targetConversationId) return { ok: false, error: "conversationId required" };

  void processMcpExternalClose({ requestId, targetConversationId, callerAgent });
  return { ok: true };
}

/** 触顶总结回合：暂存用户原消息，待摘要成功后再 send2 */
const pendingSummarizeReplayByConversation = new Map<string, string>();
/** 本轮总结 tool 已成功落地摘要的会话 */
const summarizeCompactSucceeded = new Set<string>();
/** 子任务回传触发的续跑会话（筛 console：[handoff]） */
const handoffPendingByConversation = new Set<string>();

function markHandoffPending(cid: string | undefined, reason: string) {
  if (!cid) return;
  handoffPendingByConversation.add(cid);
  console.log("[handoff] pending:mark", { cid, reason });
}

function takeHandoffPending(cid: string | undefined): boolean {
  if (!cid || !handoffPendingByConversation.has(cid)) return false;
  handoffPendingByConversation.delete(cid);
  return true;
}

function setConversationLoading(convId: string, active: boolean) {
  const next = new Set(loadingConversationIds.value);
  if (active) next.add(convId);
  else next.delete(convId);
  loadingConversationIds.value = next;
}

function setConversationThinking(convId: string, active: boolean) {
  const next = new Set(thinkingConversationIds.value);
  if (active) next.add(convId);
  else next.delete(convId);
  thinkingConversationIds.value = next;
}

function publishActivityTrace(convId: string, runtime: ActivityTraceRuntime): void {
  upsertAssistantMessage(
    convId,
    runtime.rootMessageId,
    "",
    undefined,
    undefined,
    cloneTurnActivityTrace(runtime.trace),
  );
}

function startActivityTrace(convId: string, msgId: string): ActivityTraceRuntime {
  const existing = activityTraceByConversation.get(convId);
  if (existing) {
    reopenTurnActivityTrace(existing.trace);
    publishActivityTrace(convId, existing);
    return existing;
  }

  const runtime: ActivityTraceRuntime = {
    rootMessageId: msgId,
    trace: createTurnActivityTrace(msgId),
  };
  activityTraceByConversation.set(convId, runtime);
  publishActivityTrace(convId, runtime);
  return runtime;
}

function appendActivityReasoning(convId: string, msgId: string, content: string): void {
  if (!content) return;
  const runtime = activityTraceByConversation.get(convId) ?? startActivityTrace(convId, msgId);
  if (appendReasoningToTrace(runtime.trace, content)) {
    publishActivityTrace(convId, runtime);
  }
}

function startActivityTool(convId: string, msgId: string, toolCall: any): void {
  const runtime = activityTraceByConversation.get(convId) ?? startActivityTrace(convId, msgId);
  startToolInTrace(runtime.trace, toolCall, (key, named) => t(key, named ?? {}));
  publishActivityTrace(convId, runtime);
}

function completeActivityTool(convId: string, toolCall: any, result?: unknown): void {
  const runtime = activityTraceByConversation.get(convId);
  if (!runtime) return;
  if (completeToolInTrace(
    runtime.trace,
    toolCall,
    result,
    (key, named) => t(key, named ?? {}),
  )) {
    publishActivityTrace(convId, runtime);
  }
}

function completeActivityBeforeAnswer(convId: string): void {
  const runtime = activityTraceByConversation.get(convId);
  if (!runtime) return;
  if (completeTraceBeforeAnswer(runtime.trace)) {
    publishActivityTrace(convId, runtime);
  }
}

function finishActivityTrace(
  convId: string,
  status: "completed" | "stopped" | "error",
): void {
  const runtime = activityTraceByConversation.get(convId);
  if (!runtime) return;
  finishTurnActivityTrace(runtime.trace, status);
  publishActivityTrace(convId, runtime);
  activityTraceByConversation.delete(convId);
}

function onActivityTraceToggle(msg: ChatMessage): void {
  if (!msg.activityTrace) return;
  msg.activityTrace = {
    ...msg.activityTrace,
    expanded: !msg.activityTrace.expanded,
  };
  queueMessagePersist(msg.id, conversationId.value);
}

function isConversationLoading(convId: string | undefined): boolean {
  return !!convId && loadingConversationIds.value.has(convId);
}

function transferConversationRuntimeState(fromId: string, toId: string) {
  if (!fromId || !toId || fromId === toId) return;

  if (loadingConversationIds.value.has(fromId)) {
    setConversationLoading(fromId, false);
    setConversationLoading(toId, true);
  }
  if (thinkingConversationIds.value.has(fromId)) {
    setConversationThinking(fromId, false);
    setConversationThinking(toId, true);
  }
  const activity = activityTraceByConversation.get(fromId);
  if (activity) {
    activityTraceByConversation.delete(fromId);
    activityTraceByConversation.set(toId, activity);
  }

  const controller = abortControllersByConversation.get(fromId);
  if (controller) {
    abortControllersByConversation.delete(fromId);
    abortControllersByConversation.set(toId, controller);
  }
}

const loading = computed(() => isConversationLoading(conversationId.value));

const thinking = computed(() => {
  const cid = conversationId.value;
  return !!cid && thinkingConversationIds.value.has(cid);
});
const expandedToolCalls = ref<Set<string>>(new Set());
/** 设为 true：展示具体 tool 名，完成后仍保留调用记录 */
const toolDebug = ref(false);
const isTabRecording = ref(false);
const copiedToolBarKeys = ref<Set<string>>(new Set());
const cancelled = ref(false);
const conversationId = ref<string | undefined>(undefined);

const activeBrowserPlanSteps = computed(() =>
  conversationId.value ? getBrowserPlanSteps(conversationId.value) : [],
);

const activeBrowserPlanId = computed(() =>
  conversationId.value ? getBrowserPlanId(conversationId.value) : undefined,
);

const activeBrowserPlanName = computed(() =>
  conversationId.value ? getBrowserPlanName(conversationId.value) : undefined,
);

/** 步骤条右上角「取消计划」——业务逻辑自行补充 */
async function onCancelBrowserPlan(payload: { planId?: string; planName?: string }) {
  const planId = payload.planId?.trim();
  const planName = payload.planName?.trim();
  if (!planId || !planName) return;

  const convId = conversationId.value;
  if (convId) clearBrowserPlanSteps(convId);

  await stopTask();

  void send2(
    formatUserMessageForModel({
      segments: [
        {
          type: "toolInput",
          block: {
            name: "browser_plan_cancel",
            args: { planId, planName },
            __text: t("chat.plan.cancel"),
          },
        },
      ],
    }),
  );
}

const showPlanQuestionsCard = computed(() =>
  conversationId.value ? isPlanQuestionsActiveForConversation(conversationId.value) : false,
);

watch(showPlanQuestionsCard, (visible) => {
  if (!visible) return;
  void nextTick(() => scrollToBottom());
});

/** 更新当前会话 browser_plan 步骤状态（也可直接 import updateBrowserPlanStepStatus） */
function patchBrowserPlanStepStatus(
  stepId: string,
  status: "pending" | "doing" | "done" | "failed",
  convId?: string,
): boolean {
  const cid = convId ?? conversationId.value;
  if (!cid) return false;
  return updateBrowserPlanStepStatus(cid, stepId, status);
}

type Send2Options = {
  fromInlineComposer?: boolean;
  /** 显式落盘/LLM 会话；若与面板不同则切到该会话 */
  conversationId?: string;
  /** 后台 tab 的 url，用于 site/host */
  siteUrl?: string;
  /** 重试：保留已有 user 消息，仅重新请求模型 */
  resend?: boolean;
  /** 跳过触顶总结门禁（总结后重放用户消息 / 总结回合本身） */
  skipSummarizeGate?: boolean;
  /** 当前即为触顶后的隐藏总结回合 */
  summarizeTurn?: boolean;
  /** 用户气泡已预先 addMessage，send2 不再重复插入 UI（LLM history 仍追加） */
  skipUserMessage?: boolean;
  /** MCP 外部任务：用 DomA conversationId 回传结果 */
  mcpConversationId?: string;
};
const messagesEl = ref<HTMLElement | null>(null);
const userBubbleMinimapEl = ref<HTMLElement | null>(null);

type UserBubbleMinimapMark = {
  id: string;
  top: number;
  height: number;
  preview: string;
  isDoma: boolean;
  isAsk: boolean;
  isMcp: boolean;
  isScheduled: boolean;
};

const userBubbleMinimapMarks = ref<UserBubbleMinimapMark[]>([]);
const userBubbleMinimapTooltip = ref<UserBubbleMinimapMark | null>(null);
const userBubbleMinimapTooltipStyle = ref<Record<string, string>>({});

let userBubbleMinimapLayoutRaf = 0;
let userBubbleMinimapResizeObserver: ResizeObserver | null = null;

function userMessagePreviewForMinimap(content: string): string {
  const segments = parseUserMessageSegments(content);
  const parts: string[] = [];
  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        if (seg.text.trim()) parts.push(seg.text.trim());
        break;
      case "attachedFiles":
        parts.push(seg.files.map((f) => f.name).join("、"));
        break;
      case "primarySubject":
        parts.push(formatElementsChipLabel(seg.block.payload));
        break;
      case "toolInput":
        parts.push(toolInputDisplayLabel(seg.block));
        break;
      case "command":
        parts.push(`/${seg.commandId}`);
        break;
      case "skill":
        parts.push(slashSkillLabel(seg.skillId));
        break;
      case "tab":
        parts.push(seg.tab.title || seg.tab.url);
        break;
      case "quote":
        parts.push(t("chat.quote.nestedPreview"));
        break;
    }
  }
  const joined = parts.filter(Boolean).join(" · ");
  if (!joined) return "（空消息）";
  return joined.length > 160 ? `${joined.slice(0, 160)}…` : joined;
}

function resolveQuoteChipLabel(quotedMsgId: string): string {
  const id = String(quotedMsgId ?? "").trim();
  if (!id) return t("chat.quote.fallbackLabel");
  const msg = messages.value.find((m) => m.id === id && m.role === "user");
  if (!msg?.content) return t("chat.quote.missingLabel");
  // 摘要优先取正文，避免把选区/附件标题拼进 chip 导致过长溢出
  const segments = parseUserMessageSegments(String(msg.content));
  let preview = "";
  for (const seg of segments) {
    if (seg.type === "text" && seg.text.trim()) {
      preview = seg.text.trim().replace(/\s+/g, " ");
      break;
    }
  }
  if (!preview) preview = userMessagePreviewForMinimap(String(msg.content));
  const short = preview.length > 28 ? `${preview.slice(0, 28)}…` : preview;
  return t("chat.quote.chipLabel", { preview: short });
}

function flashUserBubbleHighlight(msgId: string) {
  const root = messagesEl.value;
  if (!root) return;
  const el = root.querySelector<HTMLElement>(
    `.chat-msg.user[data-user-msg-id="${CSS.escape(msgId)}"]`,
  );
  if (!el) return;
  el.classList.remove("chat-msg--quote-flash");
  void el.offsetWidth;
  el.classList.add("chat-msg--quote-flash");
  window.setTimeout(() => el.classList.remove("chat-msg--quote-flash"), 1200);
}

function onQuoteChipNavigate(quotedMsgId: string) {
  const id = String(quotedMsgId ?? "").trim();
  if (!id) return;
  scrollToUserBubble(id);
  flashUserBubbleHighlight(id);
}

function onQuoteUserMessage(msg: ChatMessage) {
  if (msg.role !== "user" || !msg.id || !msg.content) return;
  if (inlineEditingUserMsgId.value) {
    exitInlineBubbleEdit();
  }
  dockComposer.insertQuoteChipAtCaret(msg.id, resolveQuoteChipLabel(msg.id));
  void nextTick(() => dockComposer.focus());
}

function mcpCallBadgeLabel(msg: { content?: string | null }): string {
  return extractMcpCallLabel(String(msg.content ?? "")) ?? "";
}

function messageScrollOffset(root: HTMLElement, el: HTMLElement): number {
  return el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
}

function scheduleUserBubbleMinimapLayout() {
  if (userBubbleMinimapLayoutRaf) cancelAnimationFrame(userBubbleMinimapLayoutRaf);
  userBubbleMinimapLayoutRaf = requestAnimationFrame(() => {
    userBubbleMinimapLayoutRaf = 0;
    updateUserBubbleMinimapLayout();
  });
}

function updateUserBubbleMinimapLayout() {
  const root = messagesEl.value;
  if (!root) {
    userBubbleMinimapMarks.value = [];
    return;
  }

  const scrollHeight = root.scrollHeight;
  const trackHeight = userBubbleMinimapEl.value?.clientHeight ?? root.clientHeight;
  if (scrollHeight <= 0 || trackHeight <= 0) {
    userBubbleMinimapMarks.value = [];
    return;
  }

  const minMarkHeight = 3;
  const maxMarkHeight = Math.max(minMarkHeight, trackHeight * 0.1);
  const heightScale = 0.45;
  const marks: UserBubbleMinimapMark[] = [];

  root.querySelectorAll<HTMLElement>(".chat-msg.user[data-user-msg-id]").forEach((el) => {
    const id = el.dataset.userMsgId?.trim();
    if (!id) return;

    const msgTop = messageScrollOffset(root, el);
    const msgHeight = el.offsetHeight;
    const heightRatio = msgHeight / scrollHeight;
    let height = Math.max(minMarkHeight, heightRatio * trackHeight * heightScale);
    height = Math.min(height, maxMarkHeight);

    let top = (msgTop / scrollHeight) * trackHeight;
    top = Math.max(0, Math.min(top, trackHeight - height));

    const msg = messages.value.find((m) => m.id === id);
    const content = msg?.content ? String(msg.content) : "";
    marks.push({
      id,
      top,
      height,
      preview: content ? userMessagePreviewForMinimap(content) : "（空消息）",
      isDoma: hasInteractionBlockDomaTag(content),
      isAsk: hasInteractionBlockAskTag(content),
      isMcp: hasInteractionBlockMcpCallTag(content),
      isScheduled: hasInteractionBlockScheduledTag(content),
    });
  });

  userBubbleMinimapMarks.value = marks;
}

function scrollToUserBubble(msgId: string) {
  const root = messagesEl.value;
  if (!root) return;
  const el = root.querySelector<HTMLElement>(
    `.chat-msg.user[data-user-msg-id="${CSS.escape(msgId)}"]`,
  );
  if (!el) return;
  root.scrollTo({ top: Math.max(0, messageScrollOffset(root, el) - 12), behavior: "smooth" });
}

function showUserBubbleMinimapTooltip(mark: UserBubbleMinimapMark, event: MouseEvent) {
  const btn = event.currentTarget as HTMLElement | null;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  userBubbleMinimapTooltip.value = mark;
  userBubbleMinimapTooltipStyle.value = {
    top: `${rect.top + rect.height / 2}px`,
    right: `${window.innerWidth - rect.left + 8}px`,
    transform: "translateY(-50%)",
  };
}

function hideUserBubbleMinimapTooltip() {
  userBubbleMinimapTooltip.value = null;
}

function setupUserBubbleMinimapObserver() {
  if (userBubbleMinimapResizeObserver || typeof ResizeObserver === "undefined") return;
  userBubbleMinimapResizeObserver = new ResizeObserver(() => {
    scheduleUserBubbleMinimapLayout();
  });
  if (messagesEl.value) userBubbleMinimapResizeObserver.observe(messagesEl.value);
}

function teardownUserBubbleMinimapObserver() {
  if (userBubbleMinimapLayoutRaf) {
    cancelAnimationFrame(userBubbleMinimapLayoutRaf);
    userBubbleMinimapLayoutRaf = 0;
  }
  userBubbleMinimapResizeObserver?.disconnect();
  userBubbleMinimapResizeObserver = null;
}

// 逐条消息串行落盘：保证顺序（避免乱序覆盖），同时不做 debounce
const messagePersistQueues = new Map<string, Promise<void>>();
/** 落盘用的会话 id（切 tab 后 conversationId 可能已变，不能只靠面板） */
const messagePersistConvById = new Map<string, string>();

function resolveMessageForPersist(
  messageId: string,
): { convId: string; msg: ChatMessage } | null {
  const msg = messages.value.find((m) => m.id === messageId);
  const convId = messagePersistConvById.get(messageId) ?? conversationId.value;
  if (msg && convId) return { convId, msg };
  return null;
}

const conversationContextList = ref<ConversationContext[]>([]);
let tabInfo: { id?: number; title?: string; url?: string } = {};

/** 从侧栏缓存的会话上下文解析工具目标 tabId（供 BG browserTools 经消息查询）。 */
function getTabIdByConversationIdFromList(conversationId: string): number | undefined {
  const id = conversationId.trim();
  if (!id) return undefined;
  const conversation = getConversationContext(id);
  if (!conversation) return undefined;
  if (conversation.mode === "group") {
    return conversation.groupWorkingTabId;
  }
  else if (conversation.mode === "single") {
    return conversation.tabId;
  }
  return undefined;
}

/** 将当前内存中的消息排队写入 IndexedDB（非定时消息） */
function queueMessagePersist(messageId: string, convId?: string) {
  if (convId) messagePersistConvById.set(messageId, convId);
  const prev = messagePersistQueues.get(messageId) ?? Promise.resolve();
  const next = prev
    .catch(() => {
      // 保证链不断
    })
    .then(() => persistMessageNow(messageId));
  messagePersistQueues.set(messageId, next);
}

async function flushAllMessagePersists(): Promise<void> {
  try {
    await Promise.all([...messagePersistQueues.values()]);
  } catch {
    // ignore
  }
}

function mergeToolCallIntoList(
  toolCalls: ChatMessageToolCall[] | undefined,
  toolCall: ChatMessageToolCall,
): ChatMessageToolCall[] {
  const list = toolCalls ? [...toolCalls] : [];
  const idx = list.findIndex((t) => t.id === toolCall.id);
  if (idx === -1) list.push(toolCall);
  else list[idx] = toolCall;
  return list;
}

/** 非当前面板会话：流式/工具更新直接读写 IDB（按 msgId 串行） */
function queueOffPanelAssistantUpsert(
  convId: string,
  msgId: string,
  content: string,
  toolCall?: ChatMessageToolCall,
  customUi?: CustomUI,
  activityTrace?: TurnActivityTrace,
) {
  messagePersistConvById.set(msgId, convId);
  const prev = messagePersistQueues.get(msgId) ?? Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(() => upsertAssistantMessageInIdb(
      convId,
      msgId,
      content,
      toolCall,
      customUi,
      activityTrace,
    ));
  messagePersistQueues.set(msgId, next);
}

async function upsertAssistantMessageInIdb(
  convId: string,
  msgId: string,
  content: string,
  toolCall?: ChatMessageToolCall,
  customUi?: CustomUI,
  activityTrace?: TurnActivityTrace,
): Promise<void> {
  try {
    const existing = await chatStorage.getMessage(msgId);
    if (existing) {
      let newContent = String(existing.content ?? "");
      if (content) {
        newContent = sanitizeAssistantUserFacing(newContent + content);
      }
      const toolCalls = toolCall
        ? mergeToolCallIntoList(existing.toolCalls as ChatMessageToolCall[] | undefined, toolCall)
        : (existing.toolCalls as ChatMessageToolCall[] | undefined);
      const plainCustomUi = customUi
        ? (JSON.parse(JSON.stringify(customUi)) as Record<string, unknown>)
        : (existing.customUi as Record<string, unknown> | undefined);
      const plainActivityTrace = activityTrace
        ? cloneTurnActivityTrace(activityTrace)
        : existing.activityTrace;
      await chatStorage.updateMessage(msgId, {
        content: newContent,
        ...(toolCalls ? { toolCalls } : {}),
        ...(plainCustomUi ? { customUi: plainCustomUi } : {}),
        ...(plainActivityTrace ? { activityTrace: plainActivityTrace } : {}),
      });
      return;
    }
    await chatStorage.addMessage({
      id: msgId,
      conversationId: convId,
      role: "assistant",
      content: content ? sanitizeAssistantUserFacing(content) : "",
      toolCalls: toolCall ? [toolCall] : [],
      customUi: customUi
        ? (JSON.parse(JSON.stringify(customUi)) as Record<string, unknown>)
        : undefined,
      activityTrace: activityTrace ? cloneTurnActivityTrace(activityTrace) : undefined,
    });
  } catch (e) {
    console.warn("[Chat] upsertAssistantMessageInIdb failed:", e);
  }
}

/** 从 IndexedDB 读出的顶层 process 字段并入 toolInput，供内存态 ChatMessage 使用 */
function toolInputAfterLoadFromStored(
  raw: Record<string, unknown> | undefined,
  m: Pick<StoredMessage, "isProcess" | "toolName" | "groupId">,
): Record<string, unknown> | undefined {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw) ? { ...raw } : {};
  if (m.isProcess === true && typeof m.groupId === "string" && m.groupId.trim().length > 0) {
    base[CHAT_MESSAGE_PROCESS_META_KEY] = {
      isProcess: true,
      toolName: m.toolName,
      groupId: m.groupId,
    };
  }
  return Object.keys(base).length > 0 ? base : undefined;
}

function stepToolLabel(proc: ChatMessage): string {
  return readChatMessageProcessMeta(proc)?.toolName ?? "";
}

async function persistMessageNow(messageId: string): Promise<void> {
  const resolved = resolveMessageForPersist(messageId);
  if (!resolved) return;
  const { convId, msg } = resolved;
  const plainToolCalls: ChatMessageToolCall[] = Array.isArray(msg.toolCalls)
    ? msg.toolCalls.map((t) => ({ id: t.id, name: t.name, state: t.state }))
    : [];
  const plainCustomUi = msg.customUi
    ? (JSON.parse(JSON.stringify(msg.customUi)) as Record<string, unknown>)
    : undefined;
  const plainToolInput = msg.toolInput
    ? (JSON.parse(JSON.stringify(msg.toolInput)) as Record<string, unknown>)
    : undefined;
  if (plainToolInput && CHAT_MESSAGE_PROCESS_META_KEY in plainToolInput) {
    delete plainToolInput[CHAT_MESSAGE_PROCESS_META_KEY];
  }
  const procMeta = readChatMessageProcessMeta(msg);
  const plainToolInputOut =
    plainToolInput && Object.keys(plainToolInput).length > 0 ? plainToolInput : undefined;
  const plainToolBarItems = msg.toolBarItems
    ? (JSON.parse(JSON.stringify(msg.toolBarItems)) as any)
    : undefined;
  const plainActivityTrace = msg.activityTrace
    ? cloneTurnActivityTrace(msg.activityTrace)
    : undefined;
  try {
    const ok = await chatStorage.updateMessage(messageId, {
      content: msg.content,
      isProcess: procMeta?.isProcess,
      toolName: procMeta?.toolName,
      groupId: procMeta?.groupId,
      customUi: plainCustomUi,
      toolInput: plainToolInputOut,
      toolBarItems: plainToolBarItems,
      toolCalls: plainToolCalls,
      activityTrace: plainActivityTrace,
    });
    if (!ok) {
      await chatStorage.addMessage({
        id: messageId,
        conversationId: convId,
        role: msg.role,
        content: msg.content,
        isProcess: procMeta?.isProcess,
        toolName: procMeta?.toolName,
        groupId: procMeta?.groupId,
        customUi: plainCustomUi,
        toolInput: plainToolInputOut,
        toolBarItems: plainToolBarItems,
        toolCalls: plainToolCalls,
        activityTrace: plainActivityTrace,
      });
    }
  } catch (e) {
    console.warn("[Chat] Failed to persist message update:", e);
  }
}

function getActiveProcessGroupId(): string | undefined {
  if (!loading.value) return undefined;
  for (let i = messages.value.length - 1; i >= 0; i--) {
    const pm = readChatMessageProcessMeta(messages.value[i]);
    if (pm?.isProcess && pm.groupId) return pm.groupId;
  }
  return undefined;
}

// 设置相关
const showSettings = ref(false);
const showProviderSetup = ref(false);
const openModelButtonLabel = ref('');

function refreshOpenModelButtonLabel() {
  if (!isOpenEdition()) return;
  const fromMgr = llmManager.getModelButtonLabel?.() ?? '';
  openModelButtonLabel.value = fromMgr.trim() || t('chat.providerSetup.addModel');
}

function openProviderSetupDialog() {
  showProviderSetup.value = true;
}

function onProviderSetupSaved() {
  refreshOpenModelButtonLabel();
}

watch(locale, () => {
  refreshOpenModelButtonLabel();
});

function onOpenModelButtonClick() {
  openProviderSetupDialog();
}
const showDbPlus = ref(false);
const showMcp = ref(false);
const mcpBridgeEnabled = ref(false);
const cliBridgeEnabled = ref(false);
const mcpAgentCount = ref(0);
/** 最近在侧栏 WS 上发过请求的 agent → lastSeen */
const mcpRecentAgents = new Map<string, number>();
const MCP_AGENT_IDLE_MS = 30_000;
let mcpBadgeIdleTimer: ReturnType<typeof setTimeout> | null = null;

function closeSharedHeaderPanels() {
  showHistory.value = false;
  showScheduled.value = false;
  showSettings.value = false;
  showDbPlus.value = false;
  showMcp.value = false;
}

function toggleMcpPanel() {
  showMcp.value = !showMcp.value;
  if (showMcp.value) {
    showHistory.value = false;
    showScheduled.value = false;
    showSettings.value = false;
    showDbPlus.value = false;
    closeChatPanelSlotsPanels();
  }
}

let lastMcpBridgeEnsureAt = 0;
const MCP_BRIDGE_ENSURE_COOLDOWN_MS = 12_000;

function clearMcpAgentBadge() {
  mcpRecentAgents.clear();
  mcpAgentCount.value = 0;
  if (mcpBadgeIdleTimer != null) {
    clearTimeout(mcpBadgeIdleTimer);
    mcpBadgeIdleTimer = null;
  }
}

function pruneMcpAgentBadge() {
  const now = Date.now();
  for (const [name, lastSeen] of mcpRecentAgents) {
    if (now - lastSeen >= MCP_AGENT_IDLE_MS) mcpRecentAgents.delete(name);
  }
  mcpAgentCount.value = mcpRecentAgents.size;
}

function scheduleMcpBadgeIdleCheck() {
  if (mcpBadgeIdleTimer != null) {
    clearTimeout(mcpBadgeIdleTimer);
    mcpBadgeIdleTimer = null;
  }
  if (mcpRecentAgents.size === 0) return;
  const now = Date.now();
  let waitMs = MCP_AGENT_IDLE_MS;
  for (const lastSeen of mcpRecentAgents.values()) {
    waitMs = Math.min(waitMs, lastSeen + MCP_AGENT_IDLE_MS - now);
  }
  mcpBadgeIdleTimer = setTimeout(() => {
    mcpBadgeIdleTimer = null;
    pruneMcpAgentBadge();
    scheduleMcpBadgeIdleCheck();
  }, Math.max(200, waitMs));
}

/** 侧栏 WS 真正收到 MCP 入站请求时点亮角标；30s 无新请求则熄灭对应 agent */
function noteMcpAgentActivity(callerAgent?: string) {
  if (!mcpBridgeEnabled.value) return;
  const name =
    typeof callerAgent === "string" && callerAgent.trim()
      ? callerAgent.trim().slice(0, 64)
      : "MCP";
  mcpRecentAgents.set(name, Date.now());
  pruneMcpAgentBadge();
  scheduleMcpBadgeIdleCheck();
}

function onMcpBridgeInbound(msg: McpBridgeInboundMessage) {
  noteMcpAgentActivity(msg.callerAgent);
  if (msg.type === "close") {
    handleMcpExternalCloseMessage({
      requestId: msg.requestId,
      conversationId: msg.conversationId,
      callerAgent: msg.callerAgent,
    });
    return;
  }
  if (msg.type === "message") {
    handleMcpExternalMessageMessage({
      requestId: msg.requestId,
      conversationId: msg.conversationId,
      sendText: msg.sendText,
      callerAgent: msg.callerAgent,
      attachments: msg.attachments,
    });
    return;
  }
  handleMcpExternalTaskMessage({
    requestId: msg.requestId,
    sendText: msg.sendText,
    callerAgent: msg.callerAgent,
    attachments: msg.attachments,
  });
}

/** 按开关分别监听 MCP / CLI 本机桥 */
function syncMcpBridgeListening() {
  const ports: number[] = [];
  if (mcpBridgeEnabled.value) ports.push(DOMA_MCP_BRIDGE_PORT);
  if (cliBridgeEnabled.value) ports.push(DOMA_CLI_BRIDGE_PORT);
  if (ports.length === 0) {
    console.log("[ChatPanel] bridge listening OFF");
    stopMcpBridgeClient();
    clearMcpAgentBadge();
    return;
  }
  console.log("[ChatPanel] bridge listening ON", ports);
  startMcpBridgeClient(onMcpBridgeInbound, ports);
}

/** 侧栏存活且 MCP 开关开启时，断线则重连（不经 SW） */
function ensureSidepanelMcpBridge() {
  if (!mcpBridgeEnabled.value) return;
  const now = Date.now();
  if (now - lastMcpBridgeEnsureAt < MCP_BRIDGE_ENSURE_COOLDOWN_MS) return;
  lastMcpBridgeEnsureAt = now;
  if (isMcpBridgeConnected(DOMA_MCP_BRIDGE_PORT)) return;
  console.log("[ChatPanel] MCP bridge ensure reconnect");
  syncMcpBridgeListening();
}

function onMcpBridgeEnabledChange(enabled: boolean) {
  mcpBridgeEnabled.value = enabled === true;
  syncMcpBridgeListening();
  if (!mcpBridgeEnabled.value) {
    clearMcpAgentBadge();
  }
}

function onCliBridgeEnabledChange(enabled: boolean) {
  cliBridgeEnabled.value = enabled === true;
  syncMcpBridgeListening();
}

const showActionModal = ref(false);
const showOnboarding = ref(false);

function onOnboardingDone() {
  showOnboarding.value = false;
  notifyChatPanelSlotsAfterOnboardingDone();
}

const actionModalTitle = ref('');
const actionModalButtonText = ref('确定');
const actionModalInviteCode = ref('');
const actionModalInviteLabel = ref('');
const actionModalClickHandler = ref<(() => void) | null>(null);

type OpenActionModalOptions = {
  title: string;
  buttonText: string;
  onAction?: () => void;
  inviteCode?: string;
  inviteLabel?: string;
};

/** 通用 ActionModal：无「升级 Pro」默认；升级走 openProUpgradeActionModal */
function openActionModal(opts: OpenActionModalOptions) {
  actionModalTitle.value = opts.title;
  actionModalButtonText.value = opts.buttonText;
  actionModalInviteCode.value = (opts.inviteCode || '').trim();
  actionModalInviteLabel.value = (opts.inviteLabel || '').trim();
  actionModalClickHandler.value = opts.onAction ?? null;
  showActionModal.value = true;
}

setChatActionModalOpener(openActionModal);

watch(showActionModal, (open) => {
  if (!open) {
    actionModalClickHandler.value = null;
    actionModalInviteCode.value = '';
    actionModalInviteLabel.value = '';
  }
});

const onActionModalClick = () => {
  try {
    actionModalClickHandler.value?.();
  } catch (e) {
    console.warn("[Chat][ActionModal] action failed:", e);
  }
};

type TempDataRow = { id: string; desc: string; value: string };
const tempDataRows = ref<TempDataRow[]>([]);
const tempDataStorage = Storage.init();
const DBPLUS_KEY_PREFIX = "data-";
let dbplusLoading = false;

function newTempDataRowId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `td-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function addTempDataRow() {
  tempDataRows.value = [...tempDataRows.value, { id: newTempDataRowId(), desc: "", value: "" }];
}

function newDataStorageKey(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? `${DBPLUS_KEY_PREFIX}${crypto.randomUUID()}`
    : `${DBPLUS_KEY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function shouldPersistTempRow(row: TempDataRow): boolean {
  const desc = (row.desc ?? "").trim();
  const value = (row.value ?? "").trim();
  return Boolean(desc || value);
}

function encryptTempValue(plain: string, dataKey: string): string {
  // 密钥与 dataKey 绑定，后续可用同一 dataKey 解密。
  return localEncrypt(plain, dataKey);
}

function decryptTempValue(cipher: string, dataKey: string): string {
  return localDecrypt(cipher, dataKey);
}

async function persistTempRow(row: TempDataRow): Promise<void> {
  if (!shouldPersistTempRow(row)) return;
  let dataKey = row.id;
  if (!dataKey.startsWith(DBPLUS_KEY_PREFIX)) {
    dataKey = newDataStorageKey();
    row.id = dataKey;
  }
  const payload = {
    desc: (row.desc ?? "").trim(),
    value: encryptTempValue((row.value ?? "").trim(), dataKey),
    updatedAt: Date.now(),
  };
  await tempDataStorage.set(dataKey, payload);
}

async function persistAllTempRows(): Promise<void> {
  // 串行保存，避免频繁并发写 storage
  for (const row of tempDataRows.value) {
    await persistTempRow(row);
  }
}

async function loadTempRowsFromStorage(): Promise<void> {
  dbplusLoading = true;
  try {
    const raw = await tempDataStorage.getByPrefix(DBPLUS_KEY_PREFIX);
    const rows: TempDataRow[] = [];
    for (const [key, v] of Object.entries(raw)) {
      const desc = typeof (v as any)?.desc === "string" ? (v as any).desc : "";
      const cipher = typeof (v as any)?.value === "string" ? (v as any).value : "";
      const plain = cipher ? decryptTempValue(cipher, key) : "";
      rows.push({ id: key, desc, value: plain });
    }
    // 稳定排序：新的在前
    rows.sort((a, b) => (b.id > a.id ? 1 : -1));
    tempDataRows.value = rows;
  } catch (e) {
    console.warn("[Chat][DbPlus] load failed:", e);
  } finally {
    dbplusLoading = false;
  }
}

async function onTempDataRowBlur(row: TempDataRow) {
  if (dbplusLoading) return;
  try {
    await persistTempRow(row);
  } catch (e) {
    console.warn("[Chat][DbPlus] persist row failed:", e);
  }
}

async function removeTempDataRow(id: string) {
  tempDataRows.value = tempDataRows.value.filter((r) => r.id !== id);
  if (id.startsWith(DBPLUS_KEY_PREFIX)) {
    try {
      await tempDataStorage.remove(id);
    } catch (e) {
      console.warn("[Chat][DbPlus] remove failed:", e);
    }
  }
}

watch(
  () => showDbPlus.value,
  async (open, prev) => {
    // 打开：加载；关闭：自动保存
    if (open) {
      await loadTempRowsFromStorage();
      return;
    }
    if (prev && !open) {
      await persistAllTempRows();
    }
  }
);
const selectedProvider = ref<LlmProvider>('gemini');
const currentApiKey = ref('');
const currentBaseUrl = ref('');
const currentModel = ref('');
const availableModels = ref<string[]>([]);

// 当前标签页缓存（conversationContext 使用，不再写入用户消息）
let cachedUserTabId = "";
let cachedUserTabUrl = "";
let cachedUserTabTitle = "";
let cachedUserTabGroupId: number | undefined = undefined;

// 当前标签页信息（用于展示 host）
const currentHost = ref('');
const currentFavicon = ref('');

/** 仅暂存：等用户在输入框粘贴与之一致的文本后再显示摘要 chip（对齐 Cursor） */
const pendingCopySelectionFromPage = ref<CopySelectionChipPayload | null>(null);
function mapDomTagToCnLabel(rawType: string): string {
  const t = (rawType || "").trim().toLowerCase();
  if (!t) return "元素";
  const m: Record<string, string> = {
    input: "输入框",
    textarea: "文本框",
    select: "下拉框",
    option: "选项",
    button: "按钮",
    a: "链接",
    img: "图片",
    video: "视频",
    audio: "音频",
    form: "表单",
    label: "标签",
    table: "表格",
    thead: "表头",
    tbody: "表体",
    tfoot: "表尾",
    tr: "表格行",
    th: "表头单元格",
    td: "单元格",
    ul: "无序列表",
    ol: "有序列表",
    li: "列表项",
    nav: "导航",
    header: "页头",
    footer: "页脚",
    main: "主体",
    section: "区块",
    article: "文章",
    aside: "侧栏",
    div: "区域",
    span: "文本",
    p: "段落",
    h1: "标题",
    h2: "标题",
    h3: "标题",
    h4: "标题",
    h5: "标题",
    h6: "标题",
    iframe: "内嵌框架",
    canvas: "画布",
    svg: "图形",
  };
  return m[t] || t;
}

function getBestCurrentHost(): string {
  const h = (currentHost.value || "").trim();
  if (h) return h;
  const url = (cachedUserTabUrl || "").trim();
  if (!url) return "";
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function addElementsChipToComposer(
  struct: PageElementsPayload,
  subjectType: PrimarySubjectType,
  selectionAnchor?: CopySelectionAnchor,
) {
  dockComposer.addElementsChipToComposer(struct, subjectType, selectionAnchor);
}

// tab 监听句柄
let handleTabActivated: ((activeInfo: { tabId: number; windowId: number }) => void) | null = null;
let handleTabUpdated: ((tabId: number, changeInfo: Record<string, unknown>, tab: Record<string, unknown>) => void) | null = null;
let handleTabCreated: ((tab: Record<string, unknown>) => void) | null = null;
let handleTabRemoved: ((tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void) | null = null;
let handleTabGroupRemoved: ((group: { id?: number }) => void) | null = null;
let handleTabGroupCreated: ((group: { id?: number; color?: string; title?: string; collapsed?: boolean; windowId?: number }) => void) | null = null;
let handleTabGroupUpdated: ((group: { id?: number; color?: string; title?: string; collapsed?: boolean; windowId?: number }) => void) | null = null;
let handleNavigationTargetCreated: ((details: Record<string, unknown>) => void) | null = null;
/**
 * >0 时 onActivated 不绑面板。截图 brief-activate 临时切 tab 时由 SW 通过
 * chat/suppressTabBind 升降，避免后台会话抢空面板且 restore 时被 loading pin 卡住。
 */
let suppressTabActivatedBindDepth = 0;

function setSuppressTabActivatedBind(suppress: boolean): void {
  if (suppress) {
    suppressTabActivatedBindDepth += 1;
  } else {
    suppressTabActivatedBindDepth = Math.max(0, suppressTabActivatedBindDepth - 1);
  }
  console.log("[DOMA_BIND] suppressTabBind", {
    suppress,
    depth: suppressTabActivatedBindDepth,
    panelCid: conversationId.value,
  });
}
/** 侧栏所在浏览器窗口（`windows.getCurrent`）；仅处理该窗口内的 tab 事件 */
let chatPanelWindowId: number | undefined;

async function ensureChatPanelWindowId(): Promise<number | undefined> {
  if (chatPanelWindowId != null) return chatPanelWindowId;
  // Safari（尤其页内 iframe 侧栏）：windows.getCurrent 曾触发 WebContent 崩溃
  if (IS_SAFARI_EXT) {
    console.log("[ChatPanel] safari skip windows.getCurrent");
    return undefined;
  }
  try {
    chatPanelWindowId = await getCurrentWindowId();
  } catch (e) {
    console.warn("[ChatPanel] ensureChatPanelWindowId failed", e);
  }
  return chatPanelWindowId;
}

async function isChatPanelWindow(windowId: number | undefined): Promise<boolean> {
  if (windowId == null) return false;
  const panelWinId = await ensureChatPanelWindowId();
  return panelWinId != null && windowId === panelWinId;
}

function formatConversationCallChainLines(chain: ConversationCallChainLink[]): string {
  if (chain.length === 0) return "- （无派生链）";
  return chain
    .map((link) => {
      const role =
        link.depth === 0
          ? "根"
          : link.depth === chain.length - 1
            ? "当前"
            : "中间";
      const tabLabel = link.tabId != null ? `tab ${link.tabId}` : "tab ?";
      return `- depth ${link.depth}（${role}）: ${tabLabel}, conversationId=${link.conversationId}`;
    })
    .join("\n");
}

async function runTabHandoverIfNeeded(tab: {
  sourceTabId: number;
  id: number;
  url: string;
  via?: string;
}): Promise<void> {
  const openerConversationId = await getConversationIdByTabId(tab.sourceTabId);
  if (!openerConversationId) {
    return;
  }
  const openerConversation = getConversationContext(openerConversationId);
  if (!openerConversation) {
    return;
  }

  const openerIsLoading = isConversationLoading(openerConversationId);
  if (openerIsLoading) {
    abortControllersByConversation.get(openerConversationId)?.abort();
  }

  if (openerConversation.mode === "single") {
    const newConversationId = generateConversationId();
    upsertConversationContext({
      conversationId: newConversationId,
      tabId: tab.id,
      mode: "single",
      tabInfo: {
        url: tab.url as string | undefined,
      },
      lastUserQuestion: openerConversation.lastUserQuestion,
      parentConversationId: openerConversationId,
    });

    await chatStorage.migrateConversationMessages(
      openerConversationId,
      newConversationId,
    );

    // 迁过来的历史可能带着来源回合未收尾的 doing；来源 onConversationDone 只会清旧 id
    const clearedN = await clearDoingToolCallsForConversationInIdb(newConversationId);
    console.log("[handoff] tabHandover:clear-doing", {
      fromCid: openerConversationId,
      toCid: newConversationId,
      clearedMsgCount: clearedN,
      openerWasLoading: openerIsLoading,
    });

    refreshConversationContextList();
    conversationId.value = newConversationId;
    await loadConversation(newConversationId, "tabHandover");
    // 面板内存再扫一遍，避免 Calling 残留到子页会话
    clearDoingToolCallsOnMessages([], newConversationId);
    void flushAllMessagePersists();

    const callChain = getConversationCallChain(newConversationId);
    const taskDepth = callChain.length > 0 ? callChain.length - 1 : 0;
    const rootLink = callChain[0];
    const parentLink = taskDepth > 0 ? callChain[taskDepth - 1] : undefined;

    if (openerIsLoading) {
      send2(`<interactionBlock>
# 最优先使用以下上下文
## 跨标签页协作（来源页 tab ${tab.sourceTabId} → 当前子页）
- 当前子页由来源页打开；来源页通常承载**总任务**与下一步决策，子页通常只承载**本次派生的局部操作**。
- 子页往往**没有**总任务完成提示（进度条、领取按钮、任务状态等可能只在来源页可见）——**不要**在子页等待这些信号。

## 调用链（parentConversationId，depth 0 = 根）
${formatConversationCallChainLines(callChain)}
- 当前 taskDepth=${taskDepth}${taskDepth === 0 ? "（根任务页）" : ""}
- 直接父页 tab ${tab.sourceTabId}${parentLink ? `（conversationId=${parentLink.conversationId}）` : ""}
${rootLink?.tabId != null ? `- 根页 tab ${rootLink.tabId}（conversationId=${rootLink.conversationId}）` : ""}

## 必须按此顺序执行
1. browser_screenshot，确认当前子页状态与本次待办
2. 在子页完成本次派生操作（点击、输入、浏览、提交等）
3. 判断子页工作是否做完：
   - 子页有明确完成提示（成功 toast、订单号、提交成功页等）→ 视为完成
   - 子页**无**明确完成提示 → 根据来源页派发的意图，完成合理操作后**自行判断**子页部分已做完（不必无限试探）
4. **子页部分完成后必须**调用 browser_call_tab({
     targetTabId: ${tab.sourceTabId},
     instruction: "<做了什么；观察到什么；指定任务是否成功/失败/部分完成及原因>",
     addonInstruction: "请回到来源页后：1. 以本条回传为主要依据，判断子任务结果；2. browser_screenshot 仅用于确认仍在正确来源页、以及是否还有待办列表项；3. 如果是下载任务可以调用 browser_download_search 查询下载结果 4. 根据回传结果 + 原总任务，继续下一步或结束。"
   })
${taskDepth > 1 ? `- 注意：当前 depth>1，来源页也是中间层；来源页收到回传后若本层也完成，须继续 browser_call_tab 向更上层回传，直到根页 taskDepth=0` : ""}

## 禁止
- 禁止在子页尚未 screenshot 并执行实际操作前调用 browser_call_tab
- 禁止仅口头总结而不继续执行子页操作
- 禁止把 browser_call_tab 当作交接的第一步
- 禁止因「子页看不到总任务完成标志」就停住不回传——应总结子页操作后交还来源页
- 禁止跳过直接父页 call_tab 更上层 tab
</interactionBlock>`);
    }
  } else if (openerConversation.mode === "group") {
    upsertConversationContext({
      conversationId: openerConversationId,
      groupWorkingTabId: tab.id,
      tabInfo: {
        url: tab.url as string | undefined,
      },
      appendedGroupTabs: [tab.id],
    });
  }
}

async function runCallTab(params: {
  sourceConversationId: string;
  targetTabId: number;
  instruction: string;
  addonInstruction?: string;
}): Promise<void> {
  const sourceConversationId = params.sourceConversationId;
  const targetTabId = params.targetTabId;
  const instruction = params.instruction;
  const addonInstruction =
    typeof params.addonInstruction === "string" && params.addonInstruction.trim()
      ? params.addonInstruction.trim()
      : "";
  console.log("[handoff] runCallTab:enter", {
    sourceCid: sourceConversationId,
    targetTabId,
    hasAddon: !!addonInstruction,
    addonLen: addonInstruction.length,
    instrLen: instruction?.length ?? 0,
  });
  if (!targetTabId) {
    console.warn("[handoff] runCallTab:skip", { reason: "no-targetTabId" });
    return;
  }
  if (!instruction) {
    console.warn("[handoff] runCallTab:skip", { reason: "no-instruction" });
    return;
  }

  const sourceConversationIsLoading = isConversationLoading(sourceConversationId);
  console.log("[handoff] runCallTab:state", {
    sourceCid: sourceConversationId,
    sourceLoading: sourceConversationIsLoading,
    panelCid: conversationId.value,
    panelLoading: isConversationLoading(conversationId.value),
  });
  if (sourceConversationIsLoading) {
    console.log("[handoff] runCallTab:abort-source", { sourceCid: sourceConversationId });
    abortControllersByConversation.get(sourceConversationId)?.abort();
    console.log("[handoff] runCallTab:abort-source-after", {
      sourceCid: sourceConversationId,
      sourceLoading: isConversationLoading(sourceConversationId),
    });
  }

  const targetConversationId = await getConversationIdByTabId(targetTabId);
  console.log("[handoff] runCallTab:target", {
    targetTabId,
    targetCid: targetConversationId ?? null,
    targetLoading: isConversationLoading(targetConversationId),
  });
  conversationId.value = targetConversationId;
  if (conversationId.value) {
    await switchToConversation(conversationId.value);
  } else {
    console.warn("[handoff] runCallTab:no-target-cid", {
      targetTabId,
      note: "send2 may bind wrong/new conversation",
    });
  }

  markHandoffPending(targetConversationId, "runCallTab");
  const handoffText = `<interactionBlock>
    # 最优先使用以下上下文
    - 子页已回传操作摘要，请由**当前来源页** browser_screenshot 查看状态后决定并执行下一步
    - 派发方对话：${sourceConversationId}
    ${addonInstruction ? `${addonInstruction}` : ""}
    <doma/>
    </interactionBlock>${instruction}`;
  console.log("[handoff] runCallTab:send2", {
    targetCid: targetConversationId ?? conversationId.value ?? null,
    hasDoma: true,
    hasAddonInText: !!addonInstruction,
    textLen: handoffText.length,
  });
  void send2(handoffText);
}

async function runBackgroundConversationIfNeeded(tab: {
  sourceConversationId: string;
  newTabId: number;
  url: string;
  prompt: string;
}) {
  const newConversationId = generateConversationId();
  upsertConversationContext({
    conversationId: newConversationId,
    tabId: tab.newTabId,
    mode: "single",
    tabInfo: {
      url: tab.url as string | undefined,
    },
    lastUserQuestion: tab.prompt,
    relayToConversationId: tab.sourceConversationId,
  });

  send2(tab.prompt, {
    conversationId: newConversationId,
    siteUrl: tab.url,
  });
}

/** 侧栏唯一 `runtime.onMessage` 入口，卸载时 remove 同一引用 */
let sidePanelRuntimeOnMessageListener: ((message: any, sender: any, sendResponse: (r?: unknown) => void) => void) | null =
  null;
/** Safari panelShell → iframe 中转（open 侧栏无此路径，监听无害） */
let sidePanelShellRelayListener: ((event: MessageEvent) => void) | null = null;


// 历史会话相关
const showHistory = ref(false);
const conversations = ref<StoredConversation[]>([]);
const historySearchQuery = ref("");

// 定时消息
const showScheduled = ref(false);
const scheduledMessages = ref<ScheduledMessage[]>([]);
const scheduledDetailId = ref<string | null>(null);
const scheduledDetailRuns = ref<ScheduledRun[]>([]);
const showScheduleDialog = ref(false);
const scheduleDraftText = ref("");
const scheduleDialogError = ref("");
const editingScheduledId = ref<string | null>(null);
const scheduleDialogInitialRunAt = ref<number | undefined>(undefined);
const scheduleDialogInitialRepeat = ref<ScheduledRepeat | undefined>(undefined);
const scheduleDialogInitialIntervalMinutes = ref<number | undefined>(undefined);
/** 本轮 send2 对应的定时任务 id（fire 时写入，done/error 时消费） */
const pendingScheduledIdByConversation = new Map<string, string>();
/** 防止 onMessageError 与 onConversationDone 重复落库 */
const recordedScheduledRunConversations = new Set<string>();

/** 空会话快捷消息：不进 messages 列表，点击走 send2 */
const showQuickMessages = computed(() => {
  if (messages.value.length > 0) return false;
  if (loading.value) return false;
  if (showHistory.value) return false;
  if (showScheduled.value) return false;
  if (isChatPanelSlotsPanelOpen()) return false;
  if (showDbPlus.value) return false;
  if (showMcp.value) return false;
  if (showSettings.value) return false;
  return true;
});

function onQuickMessageSend(text: string) {
  const trimmed = (text || "").trim();
  if (!trimmed) return;
  void send2(trimmed);
}

const scheduledDetailItem = computed(() => {
  const id = scheduledDetailId.value;
  if (!id) return null;
  return scheduledMessages.value.find((m) => m.id === id) ?? null;
});

function formatScheduledRunAt(ms: number): string {
  try {
    return new Date(ms).toLocaleString(locale.value || undefined, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return new Date(ms).toLocaleString();
  }
}

function scheduledShowNextRun(item: ScheduledMessage): boolean {
  return item.status === "scheduled" || item.status === "running" || item.status === "error";
}

function scheduledStatusLabel(status: ScheduledMessageStatus): string {
  switch (status) {
    case "running":
      return t("chat.scheduled.statusRunning");
    case "done":
      return t("chat.scheduled.statusDone");
    case "paused":
      return t("chat.scheduled.statusPaused");
    case "error":
      return t("chat.scheduled.statusError");
    default:
      return t("chat.scheduled.statusScheduled");
  }
}

function scheduledRunStatusLabel(status: ScheduledRunStatus): string {
  switch (status) {
    case "error":
      return t("chat.scheduled.runStatusError");
    case "cancelled":
      return t("chat.scheduled.runStatusCancelled");
    default:
      return t("chat.scheduled.runStatusOk");
  }
}

function scheduledRepeatLabel(item: Pick<ScheduledMessage, "repeat" | "intervalMinutes">): string {
  switch (item.repeat) {
    case "none":
      return t("chat.scheduled.repeatNone");
    case "hourly":
      return t("chat.scheduled.repeatHourly");
    case "minutes":
      return t("chat.scheduled.repeatEveryMinutes", {
        count: Math.max(1, Math.floor(item.intervalMinutes ?? 1)),
      });
    case "daily":
    default:
      return t("chat.scheduled.repeatDaily");
  }
}

function resolveScheduledIdForTurn(convId: string, assistantMsgIds: string[]): string | null {
  const pending = pendingScheduledIdByConversation.get(convId)?.trim();
  if (pending) return pending;

  const firstAssistId = assistantMsgIds[0];
  const firstAssistIdx = firstAssistId
    ? messages.value.findIndex((m) => m.id === firstAssistId)
    : -1;
  const search =
    firstAssistIdx >= 0 ? messages.value.slice(0, firstAssistIdx) : messages.value;
  for (let i = search.length - 1; i >= 0; i--) {
    const m = search[i];
    if (!m || m.role !== "user") continue;
    const id = extractScheduledIdFromContent(String(m.content ?? ""));
    if (id) return id;
  }
  return null;
}

async function recordScheduledRunResult(
  convId: string,
  assistantMsgIds: string[],
  status: ScheduledRunStatus,
  resultText: string,
): Promise<void> {
  if (recordedScheduledRunConversations.has(convId)) return;
  const scheduledId = resolveScheduledIdForTurn(convId, assistantMsgIds);
  if (!scheduledId) return;
  recordedScheduledRunConversations.add(convId);
  pendingScheduledIdByConversation.delete(convId);
  try {
    const row = await createScheduledRun({
      scheduledId,
      conversationId: convId,
      assistantMsgIds,
      resultText,
      status,
    });
    console.log("[ChatPanel] scheduled run saved", {
      runId: row.id,
      scheduledId,
      status,
      textLen: row.resultText.length,
    });
    await patchScheduledMessage(scheduledId, {
      lastConversationId: convId,
      lastError: status === "ok" ? undefined : resultText.slice(0, 500),
    });
    if (showScheduled.value && scheduledDetailId.value === scheduledId) {
      scheduledDetailRuns.value = await listScheduledRuns(scheduledId);
    }
  } catch (e) {
    console.error("[ChatPanel] save scheduled run failed:", e);
  } finally {
    await cleanupScheduledConversation(convId);
  }
}

/**
 * 定时一轮结束后：关 group tabs、删消息库会话、清 context / loading / LLM history。
 * 依据 ConversationContext.scheduled（及 mode/groupTabs）识别要关的会话。
 */
async function cleanupScheduledConversation(convId: string): Promise<void> {
  const id = convId.trim();
  if (!id) return;
  const conversation = getConversationContext(id);
  if (!conversation || conversation.scheduled !== true) {
    console.log("[ChatPanel] cleanupScheduledConversation: skip (not scheduled)", { id });
    return;
  }

  setConversationLoading(id, false);
  setConversationThinking(id, false);
  abortControllersByConversation.get(id)?.abort();
  abortControllersByConversation.delete(id);

  const tabIds =
    conversation.mode === "group"
      ? [...(conversation.groupTabs ?? [])]
      : conversation.tabId != null
        ? [conversation.tabId]
        : [];

  for (const tabId of tabIds) {
    try {
      await new Promise<void>((resolve) => {
        getContext().browser.tabs.remove(tabId, () => resolve());
      });
    } catch (e) {
      console.warn("[ChatPanel] cleanupScheduledConversation: remove tab failed", tabId, e);
    }
  }

  try {
    await chatStorage.deleteConversation(id);
  } catch (e) {
    console.warn("[ChatPanel] cleanupScheduledConversation: deleteConversation failed", id, e);
  }
  resetContextUsage(id);
  llmManager.clearConversation(id);
  removeConversationContext(id);

  if (conversationId.value === id) {
    messages.value = [];
    conversationId.value = undefined;
  }
  await refreshConversationContextList();
  if (showHistory.value) {
    await refreshHistoryConversations();
  }
  console.log("[ChatPanel] scheduled conversation cleaned up", {
    convId: id,
    closedTabs: tabIds.length,
  });
}

async function refreshScheduledMessages() {
  try {
    scheduledMessages.value = await listScheduledMessages();
  } catch (e) {
    console.error("[ChatPanel] listScheduledMessages failed:", e);
    scheduledMessages.value = [];
  }
}

async function openScheduledDetail(item: ScheduledMessage) {
  scheduledDetailId.value = item.id;
  try {
    scheduledDetailRuns.value = await listScheduledRuns(item.id);
  } catch (e) {
    console.error("[ChatPanel] listScheduledRuns failed:", e);
    scheduledDetailRuns.value = [];
  }
}

function closeScheduledDetail() {
  scheduledDetailId.value = null;
  scheduledDetailRuns.value = [];
}

async function toggleScheduledPanel() {
  showScheduled.value = !showScheduled.value;
  showHistory.value = false;
  showSettings.value = false;
  showMcp.value = false;
  closeChatPanelSlotsPanels();
  showDbPlus.value = false;
  if (showScheduled.value) {
    closeScheduledDetail();
    await refreshScheduledMessages();
  } else {
    closeScheduledDetail();
  }
}

function closeScheduleDialog() {
  showScheduleDialog.value = false;
  scheduleDialogError.value = "";
  editingScheduledId.value = null;
  scheduleDialogInitialRunAt.value = undefined;
  scheduleDialogInitialRepeat.value = undefined;
  scheduleDialogInitialIntervalMinutes.value = undefined;
}

function onDockScheduleMessageClick() {
  const text = dockComposer.buildMessageText().trim();
  if (!text) return;
  editingScheduledId.value = null;
  scheduleDialogInitialRunAt.value = undefined;
  scheduleDialogInitialRepeat.value = undefined;
  scheduleDialogInitialIntervalMinutes.value = undefined;
  scheduleDraftText.value = text;
  scheduleDialogError.value = "";
  showScheduleDialog.value = true;
}

function openEditScheduledMessage(item: ScheduledMessage) {
  editingScheduledId.value = item.id;
  scheduleDraftText.value = item.text;
  scheduleDialogInitialRunAt.value = item.runAt;
  scheduleDialogInitialRepeat.value = item.repeat;
  scheduleDialogInitialIntervalMinutes.value = item.intervalMinutes;
  scheduleDialogError.value = "";
  showScheduleDialog.value = true;
}

async function onScheduleDialogConfirm(payload: ScheduleMessageConfirmPayload) {
  const text = scheduleDraftText.value.trim();
  if (!text) {
    closeScheduleDialog();
    return;
  }
  scheduleDialogError.value = "";
  const editId = editingScheduledId.value;
  try {
    if (editId) {
      const updated = await patchScheduledMessage(editId, {
        runAt: payload.runAt,
        repeat: payload.repeat,
        intervalMinutes:
          payload.repeat === "minutes" ? payload.intervalMinutes : undefined,
        status: "scheduled",
        lastError: undefined,
      });
      if (!updated) {
        throw new Error(t("chat.scheduled.createFailed"));
      }
      console.log("[ChatPanel] scheduled updated", {
        id: updated.id,
        runAt: updated.runAt,
        runAtIso: new Date(updated.runAt).toISOString(),
        repeat: updated.repeat,
        intervalMinutes: updated.intervalMinutes,
      });
      await clearScheduledAlarm(updated.id);
      await armScheduledAlarm(updated);
      console.log("[ChatPanel] scheduled re-armed", updated.id);
    } else {
      const row = await createScheduledMessage({
        text,
        runAt: payload.runAt,
        repeat: payload.repeat,
        intervalMinutes: payload.intervalMinutes,
      });
      console.log("[ChatPanel] scheduled created", {
        id: row.id,
        runAt: row.runAt,
        runAtIso: new Date(row.runAt).toISOString(),
        repeat: row.repeat,
        intervalMinutes: row.intervalMinutes,
        textLen: row.text.length,
      });
      await armScheduledAlarm(row);
      console.log("[ChatPanel] scheduled armed", row.id);
      dockComposer.resetAfterSend();
    }
    closeScheduleDialog();
    if (showScheduled.value) {
      await refreshScheduledMessages();
    }
  } catch (e) {
    console.error("[ChatPanel] save scheduled message failed:", e);
    scheduleDialogError.value =
      e instanceof Error && e.message.trim()
        ? e.message
        : t("chat.scheduled.createFailed");
  }
}

async function deleteScheduledMessageItem(id: string) {
  try {
    console.log("[ChatPanel] delete scheduled", id);
    await deleteScheduledMessage(id);
    await clearScheduledAlarm(id);
    if (scheduledDetailId.value === id) {
      closeScheduledDetail();
    }
    await refreshScheduledMessages();
  } catch (e) {
    console.error("[ChatPanel] delete scheduled message failed:", e);
  }
}

/**
 * SW alarm → 侧栏就绪后投递。
 * 与 MCP `browser_start_group_conversation`（processMcpExternalTask）同一路径：
 * startGroupSession → addMessage → send2。
 */
async function onScheduledMessageFire(payload: ScheduledFirePayload): Promise<void> {
  console.log("[ChatPanel] scheduled fire received", {
    id: payload.id,
    runAt: payload.runAt,
    runAtIso: new Date(payload.runAt).toISOString(),
    textPreview: (payload.text || "").slice(0, 80),
  });
  const raw = (payload.text || "").trim();
  if (!raw) {
    console.warn("[ChatPanel] scheduled fire: empty text", payload.id);
    return;
  }
  const sendText = ensureScheduledInteractionTag(raw, payload.id);
  let fireConvId = "";

  try {
    console.log("[DOMA_BIND] scheduledFire:start", {
      id: payload.id,
      panelCid: conversationId.value,
      panelLoading: conversationId.value
        ? isConversationLoading(conversationId.value)
        : false,
    });
    const cid = await startGroupSession();
    if (!cid) {
      console.warn("[ChatPanel] scheduled fire: startGroupSession returned empty", payload.id);
      return;
    }
    upsertConversationContext({
      conversationId: cid,
      scheduled: true,
    });
    fireConvId = cid;
    console.log("[DOMA_BIND] scheduledFire:before-addMessage", {
      id: payload.id,
      cid,
      panelCid: conversationId.value,
      sameAsPanel: cid === conversationId.value,
    });
    recordedScheduledRunConversations.delete(cid);
    pendingScheduledIdByConversation.set(cid, payload.id);
    await addMessage(cid, "user", sendText);
    console.log("[DOMA_BIND] scheduledFire:before-send2", {
      id: payload.id,
      cid,
      panelCid: conversationId.value,
      sameAsPanel: cid === conversationId.value,
    });
    await send2(sendText, {
      conversationId: cid,
      skipUserMessage: true,
      skipSummarizeGate: true,
    });
    console.log("[DOMA_BIND] scheduledFire:send2-done", {
      id: payload.id,
      cid,
      panelCid: conversationId.value,
      sameAsPanel: cid === conversationId.value,
    });
  } catch (e) {
    console.error("[ChatPanel] scheduled fire failed", payload.id, e);
    if (fireConvId) {
      if (pendingScheduledIdByConversation.get(fireConvId) === payload.id) {
        void recordScheduledRunResult(
          fireConvId,
          [],
          "error",
          e instanceof Error ? e.message : String(e),
        );
      }
    }
  }
}

function getHistoryConversationMeta(convId: string): HistoryConversationMeta {
  const stored = conversations.value.find((c) => c.id === convId);
  const ctx = getConversationContext(convId);
  return {
    hostname: extractHostnameFromUrl(stored?.url?.trim()) || extractHostnameFromUrl(ctx?.tabInfo?.url),
    lastUserQuestion: ctx?.lastUserQuestion?.trim() || "",
  };
}

const groupedHistoryConversations = computed(() => {
  const labels = {
    today: t("chat.historyPanel.today"),
    yesterday: t("chat.historyPanel.yesterday"),
  };
  return groupConversationsByDate(
    conversations.value,
    getHistoryConversationMeta,
    locale.value,
    labels,
  );
});

let historySearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function resetHistoryPanelState() {
  conversations.value = [];
  historySearchQuery.value = "";
  if (historySearchDebounceTimer) {
    clearTimeout(historySearchDebounceTimer);
    historySearchDebounceTimer = null;
  }
}

watch(showHistory, (open) => {
  if (!open) resetHistoryPanelState();
});

watch(historySearchQuery, (query) => {
  if (!showHistory.value) return;
  if (historySearchDebounceTimer) clearTimeout(historySearchDebounceTimer);
  historySearchDebounceTimer = setTimeout(() => {
    if (!showHistory.value) return;
    void refreshHistoryConversations(query);
  }, 200);
});

const conversationPickerOptions = computed(() => {
  return conversationContextList.value
    .filter((c) => c.scheduled !== true)
    .map((c) => ({
    id: c.conversationId,
    question: c.lastUserQuestion?.trim() || undefined,
    url: c.tabInfo?.url,
    icon: c.tabInfo?.icon,
    selected: c.conversationId === conversationId.value,
    mode: c.mode,
    groupColor: c.groupColor,
    groupTitle: c.groupTitle,
    updatedAt: c.updatedAt,
  }));
});

async function onConversationSelectChange(targetId: string) {
  const id = (targetId || "").trim();
  if (!id) return;
  await switchToConversation(id);
}

async function onConversationPickerClose(targetId: string) {
  const id = (targetId || "").trim();
  if (!id) return;
  const conversation = getConversationContext(id);
  if (!conversation) return;

  try {
    removeConversationContext(id);
    if (id != conversationId.value) {
      refreshConversationContextList();
    }
    if (conversation.mode === "single") {
      getContext().browser.tabs.remove(conversation.tabId);
    }
    else if (conversation.mode === "group") {
      conversation.groupTabs?.forEach((tabId) => {
        getContext().browser.tabs.remove(tabId);
      });
    }
  } catch (e) {
    console.error("[Chat] Failed to close conversation:", e);
  }
}

async function switchToConversation(targetConversationId: string): Promise<void> {
  const conversation = getConversationContext(targetConversationId);
  if (!conversation) return;

  try {
    if (conversation.mode === "single") {
      if (conversation.tabId != null) {
        try {
          const tab = await getContext().browser.tabs.get(conversation.tabId);
          if (tab?.id != null) {
            await getContext().browser.tabs.update(conversation.tabId, { active: true });
          }
        } catch {
          const newTab = await getContext().browser.tabs.create({
            url: conversation.tabInfo?.url,
            active: true,
          });
          if (newTab?.id != null) {
            upsertConversationContext({
              conversationId: targetConversationId,
              tabId: newTab.id,
            });
          }
        }
      }
    } else if (conversation.mode === "group" && conversation.groupWorkingTabId != null) {
      await getContext().browser.tabs.update(conversation.groupWorkingTabId, { active: true });
    }
  } catch (e) {
    console.warn("[Chat] switchToConversation tab activate failed:", e);
  }

  await loadConversation(targetConversationId, "switchToConversation");
  await refreshConversationContextList();
}


const addRuntimeListener = () => {
  getContext().browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (r?: unknown) => void) => {
    if (message.origin === "content") {
      if (message.operate === "closeCapture") {
        taggleSelect.value = false;
      }
    }
  });
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeHttpOrHttpsUrl(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

function bubbleChipFaviconImgHtml(favicon: string | undefined): string {
  if (!favicon || !isSafeHttpOrHttpsUrl(favicon)) return "";
  const http = favicon.trim();
  const src = getCachedFaviconObjectUrl(http) || faviconPlaceholderSrc();
  return `<img class="copy-selection-chip-favicon" src="${escapeHtml(src)}" data-favicon-http="${escapeHtml(http)}" alt="" width="12" height="12" decoding="async" />`;
}

function hydrateBubbleChipFavicons(root: HTMLElement | null | undefined): void {
  if (!root) return;
  root.querySelectorAll<HTMLImageElement>("img[data-favicon-http]").forEach((img) => {
    const httpUrl = img.dataset.faviconHttp?.trim();
    if (!httpUrl || !isSafeHttpOrHttpsUrl(httpUrl)) return;
    applyFaviconToImg(img, httpUrl);
  });
}

function buildBubbleElementsChipHtml(
  payload: PageElementsPayload,
  subjectType: PrimarySubjectType = "copyElements",
): string {
  const label = formatElementsChipLabel(payload);
  const structAttr = encodeURIComponent(JSON.stringify(payload));
  const leading = `<span class="copy-selection-chip-leading">${bubbleChipFaviconImgHtml(payload.favicon)}</span>`;
  const textSpan = `<span class="copy-selection-chip-text">${escapeHtml(label)}</span>`;
  return `<span class="copy-selection-chip copy-selection-chip--inline copy-selection-chip--bubble" role="button" tabindex="0" data-bubble-elements-chip="1" data-subject-type="${subjectType}" data-struct="${structAttr}">${leading}${textSpan}</span>`;
}

type BubbleFileMeta = { id?: string; name: string; type?: string; size?: number; lastModified?: number };

function formatBytesForBubble(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  const d = i === 0 ? 0 : v >= 10 ? 1 : 2;
  return `${v.toFixed(d)} ${units[i]}`;
}

function buildBubbleToolInputChipHtml(block: UserToolInputBlock): string {
  const label = toolInputDisplayLabel(block);
  return `<span class="copy-selection-chip copy-selection-chip--inline copy-selection-chip--bubble copy-selection-chip--tool-input" role="status" data-bubble-tool-input="1"><span class="copy-selection-chip-text">${escapeHtml(label)}</span></span>`;
}

function buildBubbleTabChipHtml(tab: {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
}): string {
  const label = tab.title.trim() || tab.url.trim() || `Tab ${tab.tabId}`;
  const leading = `<span class="copy-selection-chip-leading">${bubbleChipFaviconImgHtml(tab.favIconUrl)}</span>`;
  const textSpan = `<span class="copy-selection-chip-text">${escapeHtml(label)}</span>`;
  return `<span class="copy-selection-chip copy-selection-chip--inline copy-selection-chip--bubble tab-mention-chip--bubble" role="status" data-bubble-tab-chip="1">${leading}${textSpan}</span>`;
}

function buildBubbleCommandChipHtml(commandId: string): string {
  const label = slashCommandLabel(commandId);
  return `<span class="slash-command-chip slash-command-chip--bubble" role="status" data-bubble-command-chip="1"><span class="slash-command-chip-text">${escapeHtml(label)}</span></span>`;
}

function buildBubbleSkillChipHtml(skillId: string): string {
  const label = slashSkillLabel(skillId);
  return `<span class="slash-command-chip slash-command-chip--bubble" role="status" data-bubble-skill-chip="1"><span class="slash-command-chip-text">${escapeHtml(label)}</span></span>`;
}

function buildBubbleQuoteChipHtml(quotedMsgId: string): string {
  const label = resolveQuoteChipLabel(quotedMsgId);
  const idAttr = encodeURIComponent(quotedMsgId);
  return `<span class="slash-command-chip slash-command-chip--bubble quote-msg-chip--bubble" role="button" tabindex="0" data-bubble-quote-chip="1" data-quoted-msg-id="${idAttr}" title="${escapeHtml(t("chat.quote.chipTitle"))}"><span class="slash-command-chip-text">${escapeHtml(label)}</span></span>`;
}

function isBubbleImageFile(f: Pick<BubbleFileMeta, "name" | "type">): boolean {
  const mime = (f.type || "").trim().toLowerCase();
  if (mime.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|heif|avif)$/i.test(f.name || "");
}

const bubbleThumbObjectUrls = new Set<string>();

function revokeBubbleThumbObjectUrl(url: string): void {
  if (!bubbleThumbObjectUrls.has(url)) return;
  try {
    URL.revokeObjectURL(url);
  } catch {
    // ignore
  }
  bubbleThumbObjectUrls.delete(url);
}

function clearBubbleFileThumbnails(): void {
  for (const url of bubbleThumbObjectUrls) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }
  bubbleThumbObjectUrls.clear();
}

async function hydrateBubbleFileThumbnails(root: HTMLElement | null | undefined): Promise<void> {
  if (!root) return;
  const imgs = root.querySelectorAll<HTMLImageElement>('img[data-bubble-file-thumb="1"]');
  const tasks: Promise<void>[] = [];
  for (const img of imgs) {
    if (img.dataset.thumbLoaded === "1" || img.dataset.thumbLoading === "1") continue;
    const pill = img.closest<HTMLElement>(".bubble-file-pill");
    const fileId = pill?.dataset.fileId?.trim();
    if (!fileId) continue;
    img.dataset.thumbLoading = "1";
    tasks.push(
      (async () => {
        try {
          const rec = await getUploadFile(fileId);
          if (!rec) {
            img.style.display = "none";
            return;
          }
          const mime = (rec.type || rec.blob.type || "").trim().toLowerCase();
          if (!mime.startsWith("image/") && !isBubbleImageFile({ name: rec.name, type: mime })) {
            img.style.display = "none";
            return;
          }
          const url = URL.createObjectURL(rec.blob);
          bubbleThumbObjectUrls.add(url);
          img.src = url;
          img.onerror = () => {
            img.style.display = "none";
            revokeBubbleThumbObjectUrl(url);
          };
        } catch {
          img.style.display = "none";
        } finally {
          img.dataset.thumbLoaded = "1";
          delete img.dataset.thumbLoading;
        }
      })(),
    );
  }
  await Promise.all(tasks);
}

function buildBubbleFilesHtml(files: BubbleFileMeta[]): string {
  const pills = files
    .map((f) => {
      const meta = formatBytesForBubble(f.size);
      const metaHtml = meta ? `<span class="bubble-file-meta">${escapeHtml(meta)}</span>` : "";
      const dataAttr = f.id ? ` data-file-id="${escapeHtml(f.id)}"` : "";
      const showThumb = !!f.id && isBubbleImageFile(f);
      if (showThumb) {
        return `<span class="bubble-file-pill has-preview" role="status"${dataAttr}><span class="bubble-file-thumb-wrap" aria-hidden="true"><img class="bubble-file-thumb" data-bubble-file-thumb="1" alt="" /></span><span class="bubble-file-info"><span class="bubble-file-name">${escapeHtml(f.name)}</span>${metaHtml}</span></span>`;
      }
      return `<span class="bubble-file-pill" role="status"${dataAttr}><span class="bubble-file-name">${escapeHtml(f.name)}</span>${metaHtml}</span>`;
    })
    .join("");
  return `<div class="bubble-files" data-bubble-files="1">${pills}</div>`;
}

function renderPlainUserTextHtml(text: string): string {
  const cleaned = String(text ?? "")
    .replace(/<doma\s*\/?>\s*/gi, "")
    .replace(/<ask\s*\/?>\s*/gi, "")
    .replace(/<mcpCall\b[^>]*>[\s\S]*?<\/mcpCall>\s*/gi, "");
  return renderUserPlainTextAsBubbleHtml(cleaned);
}

/** 纯 interactionBlock 上下文消息：整行不渲染（避免空灰框） */
function shouldShowChatMessageRow(msg: ChatMessage): boolean {
  if (msg.role !== "user") return true;
  if (!shouldHideUserBubble(String(msg.content ?? ""))) return true;
  return !!(
    msg.toolBarItems?.length ||
    getVisibleToolCalls(msg.toolCalls).length ||
    getDoingToolCalls(msg.toolCalls).length ||
    (toolDebug.value && getDebugToolCalls(msg.toolCalls).length)
  );
}

/** 用户气泡：按消息片段顺序渲染 chip 与正文 */
function renderUserBubbleHtml(content: string): string {
  const segments = parseUserMessageSegments(content);
  const parts: string[] = [];

  for (const seg of segments) {
    switch (seg.type) {
      case "text":
        parts.push(renderPlainUserTextHtml(seg.text));
        break;
      case "primarySubject":
        parts.push(buildBubbleElementsChipHtml(seg.block.payload, seg.block.type));
        break;
      case "attachedFiles":
        parts.push(buildBubbleFilesHtml(seg.files));
        break;
      case "toolInput":
        parts.push(buildBubbleToolInputChipHtml(seg.block));
        break;
      case "command":
        parts.push(buildBubbleCommandChipHtml(seg.commandId));
        break;
      case "skill":
        parts.push(buildBubbleSkillChipHtml(seg.skillId));
        break;
      case "tab":
        parts.push(buildBubbleTabChipHtml(seg.tab));
        break;
      case "quote":
        parts.push(buildBubbleQuoteChipHtml(seg.quotedMsgId));
        break;
    }
  }

  if (!parts.length && content.trim()) {
    // MCP / 定时：块外正文；若解析为空则剥掉 interactionBlock 再展示
    if (hasInteractionBlockMcpCallTag(content) || hasInteractionBlockScheduledTag(content)) {
      const outside = content
        .replace(/<interactionBlock>[\s\S]*?<\/interactionBlock>/gi, "")
        .trim();
      if (outside) return renderPlainUserTextHtml(outside);
    }
    parts.push(renderPlainUserTextHtml(content));
  }
  return parts.join("");
}

function scrollToElementsOnTab(opts: {
  struct: PageElementsPayload;
  selectionAnchor?: CopySelectionAnchor;
}): void {
  const tabId = parseSourceTabId(opts.struct.tabId);
  if (tabId == null) return;
  const hasSelectors = flattenElementsStruct(opts.struct).length > 0;
  if (!opts.selectionAnchor && !hasSelectors) return;
  const browser = getContext().browser;
  const payload: Record<string, unknown> = {
    origin: "sidepanel",
    operate: "scrollToSelectionAnchor",
  };
  if (opts.selectionAnchor) payload.selectionAnchor = opts.selectionAnchor;
  if (hasSelectors) payload.selectors = selectorsWireFromStruct(opts.struct);
  void browser.tabs
    .sendMessage(tabId, payload, { frameId: 0 })
    .catch((e: unknown) => console.warn("[Chat] scrollToSelectionAnchor:", e));
}

async function seekVideoFromDomaLink(href: string): Promise<boolean> {
  const target = parseDomaVideoSeekHref(href);
  if (!target) return false;

  let tabId =
    conversationId.value != null
      ? getTabIdByConversationIdFromList(conversationId.value)
      : undefined;
  if (tabId == null) tabId = await resolveActiveTabId();
  if (tabId == null) {
    console.warn("[Chat] video seek: no target tab");
    return true;
  }

  try {
    const browser = getContext().browser;
    await new Promise<void>((resolve) => {
      browser.tabs.update(tabId, { active: true }, () => resolve());
    });

    const result = await VideoPageTools.seekVideoPlayer(
      tabId,
      target.seconds,
      target.videoUuid,
    );
    if (result && typeof result === "object" && (result as { ok?: boolean }).ok === false) {
      console.warn("[Chat] video seek failed:", result);
    }
  } catch (e) {
    console.warn("[Chat] video seek error:", e);
  }
  return true;
}

function handleDomaLinkClick(href: string, event: MouseEvent): void {
  void seekVideoFromDomaLink(href).then((handled) => {
    if (handled) return;
    if (props.onDomaLinkClick) {
      props.onDomaLinkClick(href, event);
      return;
    }
    emit("domaLinkClick", href, event);
  });
}

function onChatMessagesClick(e: MouseEvent) {
  const href = resolveDomaHrefFromClickTarget(e.target);
  if (href) {
    e.preventDefault();
    e.stopPropagation();
    handleDomaLinkClick(href, e);
    return;
  }

  const t = e.target as HTMLElement | null;
  const quoteChip = t?.closest("[data-bubble-quote-chip]") as HTMLElement | null;
  if (quoteChip) {
    e.preventDefault();
    e.stopPropagation();
    const enc = quoteChip.dataset.quotedMsgId;
    if (!enc) return;
    try {
      onQuoteChipNavigate(decodeURIComponent(enc));
    } catch {
      onQuoteChipNavigate(enc);
    }
    return;
  }

  const chip = t?.closest("[data-bubble-elements-chip]") as HTMLElement | null;
  if (!chip) return;
  e.preventDefault();
  const structEnc = chip.dataset.struct;
  if (!structEnc) return;
  let struct: PageElementsPayload;
  try {
    struct = JSON.parse(decodeURIComponent(structEnc)) as PageElementsPayload;
  } catch {
    return;
  }
  scrollToElementsOnTab({ struct });
}

function findUserBubbleMsgContentFromNode(node: Node | null): HTMLElement | null {
  let el: HTMLElement | null =
    node?.nodeType === Node.TEXT_NODE ? (node as Text).parentElement : (node as HTMLElement | null);
  while (el) {
    if (el.classList.contains("msg-content") && el.closest(".chat-msg.user")) return el;
    el = el.parentElement;
  }
  return null;
}

function onChatMessagesCopy(e: ClipboardEvent) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  if (!findUserBubbleMsgContentFromNode(range.commonAncestorContainer)) return;

  const segments = parseComposerPasteDom(range.cloneContents());
  if (!segments?.some((s) => s.type === "elements")) return;

  const plain = serializeUserMessageSegments(composerPasteSegmentsToUserMessageSegments(segments));
  if (!plain.trim()) return;

  e.preventDefault();
  e.clipboardData?.setData("text/plain", plain);
}

function getVisibleToolCalls(toolCalls: ChatMessageToolCall[] | undefined): ChatMessageToolCall[] {
  if (!toolCalls?.length) return [];
  return toolCalls.filter((t) => t.state === "visible");
}

function getDoingToolCalls(toolCalls: ChatMessageToolCall[] | undefined): ChatMessageToolCall[] {
  if (!toolCalls?.length) return [];
  return toolCalls.filter((t) => t.state === "doing");
}

/** 会话结束时，将所有仍为 doing 的 tool call 标记为 gone，避免「正在调用…」残留 */
function clearDoingToolCallsOnMessages(msgIds: string[], convId?: string) {
  const touched = new Set<string>();

  const touch = (msgId: string) => {
    if (touched.has(msgId)) return;
    const msg = getMessageById(msgId);
    if (!msg?.toolCalls?.length) return;
    let changed = false;
    for (const tc of msg.toolCalls) {
      if (tc.state === "doing") {
        tc.state = "gone";
        changed = true;
      }
    }
    if (changed) {
      touched.add(msgId);
      queueMessagePersist(msgId, convId);
    }
  };

  for (const msgId of msgIds) touch(msgId);
  for (const msg of messages.value) {
    if (getDoingToolCalls(msg.toolCalls).length) touch(msg.id);
  }
}

/** 清掉指定会话 IDB 里全部 doing（handover 迁消息后用，避免旧回合 Calling 残留） */
async function clearDoingToolCallsForConversationInIdb(convId: string): Promise<number> {
  try {
    const list = await chatStorage.getMessagesByConversation(convId);
    const ids = list.map((m) => m.id);
    if (!ids.length) return 0;
    await clearDoingToolCallsInIdb(ids);
    return ids.length;
  } catch (e) {
    console.warn("[Chat] clearDoingToolCallsForConversationInIdb failed:", convId, e);
    return 0;
  }
}

/** 非面板会话：在 IDB 上将 doing → gone */
async function clearDoingToolCallsInIdb(msgIds: string[]): Promise<void> {
  await Promise.all(
    msgIds.map((id) => (messagePersistQueues.get(id) ?? Promise.resolve()).catch(() => {})),
  );
  for (const msgId of msgIds) {
    try {
      const existing = await chatStorage.getMessage(msgId);
      if (!existing?.toolCalls?.length) continue;
      const toolCalls = (existing.toolCalls as ChatMessageToolCall[]).map((t) => ({ ...t }));
      let changed = false;
      for (const tc of toolCalls) {
        if (tc.state === "doing") {
          tc.state = "gone";
          changed = true;
        }
      }
      if (changed) await chatStorage.updateMessage(msgId, { toolCalls });
    } catch (e) {
      console.warn("[Chat] clearDoingToolCallsInIdb failed:", msgId, e);
    }
  }
}

/** 非面板会话：在 IDB 上收尾 toolCalls / toolBarItems */
async function finalizeOffPanelConversationDone(
  convId: string,
  msgIds: string[],
): Promise<void> {
  await clearDoingToolCallsInIdb(msgIds);

  const completedToolCalls: ChatMessageToolCall[] = [];
  for (const msgId of msgIds) {
    try {
      const existing = await chatStorage.getMessage(msgId);
      if (!existing) continue;
      const toolCalls = Array.isArray(existing.toolCalls)
        ? (existing.toolCalls as ChatMessageToolCall[])
        : [];
      for (const t of toolCalls) {
        completedToolCalls.push({
          id: t.id,
          name: t.name,
          state: "visible",
        } as ChatMessageToolCall);
      }
    } catch (e) {
      console.warn("[Chat] finalizeOffPanel collect tools failed:", msgId, e);
    }
  }

  const lastMsgId = msgIds[msgIds.length - 1];
  if (!lastMsgId) return;
  try {
    await chatStorage.updateMessage(lastMsgId, {
      toolCalls: completedToolCalls,
      toolBarItems: [{ type: "copy", msgIds } as ChatMessageToolBarItem],
    });
    messagePersistConvById.set(lastMsgId, convId);
  } catch (e) {
    console.warn("[Chat] finalizeOffPanel lastMsg failed:", lastMsgId, e);
  }
}

/** 从面板或 IDB 收集助手正文（切走后 getMessageById 会空） */
async function collectAssistantTextFromMsgIds(msgIds: string[]): Promise<string> {
  const parts: string[] = [];
  for (const id of msgIds) {
    const panel = getMessageById(id);
    if (panel) {
      const c = String(panel.content ?? "").trim();
      if (c) parts.push(c);
      continue;
    }
    try {
      const stored = await chatStorage.getMessage(id);
      const c = String(stored?.content ?? "").trim();
      if (c) parts.push(c);
    } catch {
      // ignore
    }
  }
  return parts.join("\n\n").trim();
}

/** toolDebug：含 doing / gone / visible，完成后仍保留名称 */
function getDebugToolCalls(toolCalls: ChatMessageToolCall[] | undefined): ChatMessageToolCall[] {
  if (!toolCalls?.length) return [];
  return toolCalls.filter((t) => typeof t.name === "string" && t.name.trim());
}

/** assistant 仅 tool 脚手架（gone、无正文）时不占气泡位，避免 tool 完成后留空行 */
function isRenderableChatMessage(msg: ChatMessage): boolean {
  if (msg.role === "user") return true;
  if (msg.activityTrace) return true;
  if (msg.customUi) return true;
  if (msg.toolBarItems?.length) return true;
  if (getDoingToolCalls(msg.toolCalls).length > 0) return true;
  if (getVisibleToolCalls(msg.toolCalls).length > 0) return true;
  if (String(msg.content ?? "").trim()) return true;
  return false;
}

function isToolCallsExpanded(messageId: string): boolean {
  return expandedToolCalls.value.has(messageId);
}

function toggleToolCallsExpanded(messageId: string) {
  if (expandedToolCalls.value.has(messageId)) {
    expandedToolCalls.value.delete(messageId);
  } else {
    expandedToolCalls.value.add(messageId);
  }
  // 触发响应式更新（Set 变更不会总是触发）
  expandedToolCalls.value = new Set(expandedToolCalls.value);
}

const taggleSelectPageDom = () => {
  taggleSelect.value = !taggleSelect.value;

  getCurrentTab((tabUrl: string, tabId: number)=>{
    getContext().browser.tabs.sendMessage(tabId, {
      origin: "sidepanel",
      operate: "handleSelect",
      taggle: taggleSelect.value,
    });
  });
}

const dockComposerUiRef = ref<InstanceType<typeof ChatComposer> | null>(null);
const inlineComposerUiRef = ref<InstanceType<typeof ChatComposer> | null>(null);
const inlineEditingUserMsgId = ref<string | null>(null);
const composerImagePreview = ref<{ url: string; name: string } | null>(null);
let inlineHydrateSerial = 0;
let inlineBlurExitTimer: ReturnType<typeof setTimeout> | null = null;

function exitInlineBubbleEdit(): void {
  if (inlineBlurExitTimer) {
    clearTimeout(inlineBlurExitTimer);
    inlineBlurExitTimer = null;
  }
  inlineHydrateSerial += 1;
  inlineEditingUserMsgId.value = null;
}

function openComposerImagePreview(file: AttachedFilePreviewPayload): void {
  const url = file.previewUrl?.trim();
  if (!url) return;
  composerImagePreview.value = { url, name: file.name || "image" };
}

function closeComposerImagePreview(): void {
  composerImagePreview.value = null;
}

function onInlineComposerFocusOut(e: FocusEvent, msgId: string) {
  if (inlineEditingUserMsgId.value !== msgId) return;
  const wrap = e.currentTarget as HTMLElement;
  const next = e.relatedTarget as Node | null;
  if (next && wrap.contains(next)) return;

  if (inlineBlurExitTimer) clearTimeout(inlineBlurExitTimer);
  // 延迟一帧：避免点击发送/附件时 blur 先触发导致 composer 被卸载、click 丢失
  inlineBlurExitTimer = setTimeout(() => {
    inlineBlurExitTimer = null;
    if (inlineEditingUserMsgId.value !== msgId) return;
    if (wrap.isConnected && wrap.contains(document.activeElement)) return;
    exitInlineBubbleEdit();
  }, 120);
}

const composerPlaceholder = computed(() => {
  if (loading.value) return t("chat.composer.enqueuePlaceholder");
  const atHint = locale.value.startsWith("zh")
    ? "，@ 选择标签页"
    : ", @ for tabs";
  return `${t("chat.composer.placeholder")}${atHint}`;
});

/** command / skill / tab chip 按 segments 顺序组装 interactionBlock 并发送 */
async function buildComposerStructuredSendText(payload: ComposerSendPayload): Promise<string> {
  const parts: string[] = [];
  for (const seg of payload.segments) {
    switch (seg.type) {
      case "text":
      case "attachedFiles":
      case "primarySubject":
      case "toolInput":
        parts.push(serializeUserMessageSegments([seg]));
        break;
      case "command":
        parts.push(buildSlashCommandSendText(seg.commandId, ""));
        break;
      case "skill":
        parts.push(await buildSlashSkillSendText(seg.skillId, ""));
        break;
      case "tab":
        parts.push(buildTabMentionSendText(seg.tab, ""));
        break;
      case "quote":
        parts.push(formatQuotedUserMessageForSend(seg.quotedMsgId));
        break;
    }
  }
  return parts.join("");
}

async function handleComposerStructuredSend(
  payload: ComposerSendPayload,
  opts?: Send2Options,
): Promise<boolean> {
  if (payloadHasCreateExtensionSkill(payload)) {
    pendingCreateExtensionSend.value = { payload, opts };
    showCreateExtensionDescDialog.value = true;
    return false;
  }
  const text = await buildComposerStructuredSendText(payload);
  await send2(text, opts);
  return true;
}

const dockComposer = useChatComposer({
  mode: "dock",
  loading,
  conversationId,
  scopeActive: taggleSelect,
  pendingCopySelectionFromPage,
  placeholder: composerPlaceholder,
  onScopeToggle: taggleSelectPageDom,
  onChipScrollToPage: (chip) => {
    if (chip.kind !== "elements") return;
    scrollToElementsOnTab({ struct: chip.struct, selectionAnchor: chip.selectionAnchor });
  },
  onQuoteChipClick: onQuoteChipNavigate,
  resolveQuoteChipLabel,
  onSend: async (payload) => {
    await send2(payload.rawText);
  },
  onStructuredSend: async (payload) => {
    return handleComposerStructuredSend(payload);
  },
  onEnqueue: (rawText) => {
    if (!conversationId.value) return;
    enqueueMessage(conversationId.value, rawText);
  },
  onStop: () => {
    void stopTask();
  },
});

const inlineComposer = useChatComposer({
  mode: "inline",
  loading,
  conversationId,
  scopeActive: taggleSelect,
  pendingCopySelectionFromPage,
  placeholder: composerPlaceholder,
  onScopeToggle: taggleSelectPageDom,
  onChipScrollToPage: (chip) => {
    if (chip.kind !== "elements") return;
    scrollToElementsOnTab({ struct: chip.struct, selectionAnchor: chip.selectionAnchor });
  },
  onQuoteChipClick: onQuoteChipNavigate,
  resolveQuoteChipLabel,
  onSend: async (payload) => {
    if (inlineBlurExitTimer) {
      clearTimeout(inlineBlurExitTimer);
      inlineBlurExitTimer = null;
    }
    await send2(payload.rawText, { fromInlineComposer: true });
    inlineEditingUserMsgId.value = null;
    inlineComposer.resetAfterSend();
  },
  onStructuredSend: async (payload) => {
    if (inlineBlurExitTimer) {
      clearTimeout(inlineBlurExitTimer);
      inlineBlurExitTimer = null;
    }
    const ok = await handleComposerStructuredSend(payload, { fromInlineComposer: true });
    if (!ok) return false;
    inlineEditingUserMsgId.value = null;
    inlineComposer.resetAfterSend();
    return true;
  },
  onStop: () => {
    void stopTask();
  },
});

watch(dockComposerUiRef, (ui) => dockComposer.syncDomFromUi(ui), { flush: "post" });

const dockComposerBinding = computed(() => ({
  ...dockComposer.binding.value,
  onPreviewAttachedFile: openComposerImagePreview,
  showModelPicker: isOpenEdition(),
  modelButtonLabel: openModelButtonLabel.value,
  onModelButtonClick: onOpenModelButtonClick,
}));
const inlineComposerBinding = computed(() => ({
  ...inlineComposer.binding.value,
  onPreviewAttachedFile: openComposerImagePreview,
}));

function resolveInlineComposerUi(): InstanceType<typeof ChatComposer> | null {
  const raw = inlineComposerUiRef.value;
  if (!raw) return null;
  if (Array.isArray(raw)) {
    for (let i = raw.length - 1; i >= 0; i--) {
      const ui = raw[i];
      if (ui) return ui;
    }
    return null;
  }
  return raw;
}

watch(
  inlineEditingUserMsgId,
  async (id, prevId) => {
    if (id) {
      const msg = messages.value.find((m) => m.id === id);
      if (!msg) return;

      const serial = ++inlineHydrateSerial;
      await nextTick();
      await nextTick();
      if (serial !== inlineHydrateSerial || inlineEditingUserMsgId.value !== id) return;

      const ui = resolveInlineComposerUi();
      if (!ui) return;

      try {
        inlineComposer.syncDomFromUi(ui);
        await inlineComposer.restoreFromUserMessageContent(String(msg.content ?? ""));
        if (serial !== inlineHydrateSerial || inlineEditingUserMsgId.value !== id) return;
        inlineComposer.focus();
      } catch (err) {
        console.error("[ChatPanel] inline composer hydrate failed:", err);
        inlineEditingUserMsgId.value = null;
      }
    }

    // 退出 inline 编辑或切换到另一条消息时，气泡 v-html 会重建，需重新加载附件缩略图
    if (prevId && id !== prevId) {
      await nextTick();
      await hydrateBubbleFileThumbnails(messagesEl.value);
      hydrateBubbleChipFavicons(messagesEl.value);
      scheduleUserBubbleMinimapLayout();
    }
  },
  { flush: "post" },
);

function onUserBubbleContentClick(msg: ChatMessage, e: MouseEvent) {
  const t = e.target as HTMLElement | null;
  if (t?.closest("[data-bubble-elements-chip]")) return;
  if (t?.closest("[data-bubble-quote-chip]")) return;
  if (t?.closest("a.chat-bubble-link, a.chat-doma-link")) return;
  if (inlineEditingUserMsgId.value === msg.id) return;
  e.stopPropagation();
  if (inlineBlurExitTimer) {
    clearTimeout(inlineBlurExitTimer);
    inlineBlurExitTimer = null;
  }
  inlineEditingUserMsgId.value = msg.id;
}

const onKeydownChange = (e: KeyboardEvent) => {
  if (e.key !== "Escape" && e.code !== "Escape") return;
  if (composerImagePreview.value) {
    e.preventDefault();
    closeComposerImagePreview();
    return;
  }
  if (inlineEditingUserMsgId.value) {
    e.preventDefault();
    exitInlineBubbleEdit();
    return;
  }
  if (taggleSelect.value) {
    e.preventDefault();
    taggleSelectPageDom();
  }
};

onMounted(() => {
  console.log("[ChatPanel] mount-1 begin", { safari: IS_SAFARI_EXT });
  exitInlineBubbleEdit();
  addRuntimeListener();
  document.addEventListener("keydown", onKeydownChange, true);
  // Safari：minimap MutationObserver 曾与重模板叠加触发 WebContent 崩溃
  if (!IS_SAFARI_EXT) {
    setupUserBubbleMinimapObserver();
    void nextTick(() => scheduleUserBubbleMinimapLayout());
  } else {
    console.log("[ChatPanel] safari skip minimap observer");
  }
});

const displayMessages = computed<DisplayItem[]>(() => {
  void messages.value;
  void loading.value;

  const activeProcessGroupId = getActiveProcessGroupId();
  const result: DisplayItem[] = [];
  let currentProcessGroup: ChatMessage[] = [];
  let currentProcGroupId: string | undefined = undefined;

  for (const msg of messages.value) {
    const procMeta = readChatMessageProcessMeta(msg);
    if (procMeta?.isProcess && procMeta.groupId) {
      if (currentProcGroupId !== procMeta.groupId) {
        if (currentProcessGroup.length > 0 && currentProcGroupId) {
          const isExecuting = currentProcGroupId === activeProcessGroupId;
          result.push({
            type: 'process-group',
            id: `pg-${currentProcGroupId}`,
            groupId: currentProcGroupId,
            processes: currentProcessGroup,
            isExecuting,
          });
        }
        currentProcessGroup = [];
        currentProcGroupId = procMeta.groupId;
      }
      currentProcessGroup.push(msg);
    } else {
      if (currentProcessGroup.length > 0 && currentProcGroupId) {
        const isExecuting = currentProcGroupId === activeProcessGroupId;
        result.push({
          type: 'process-group',
          id: `pg-${currentProcGroupId}`,
          groupId: currentProcGroupId,
          processes: currentProcessGroup,
          isExecuting,
        });
        currentProcessGroup = [];
        currentProcGroupId = undefined;
      }
      if (isRenderableChatMessage(msg)) {
        result.push({ type: 'message', id: msg.id, msg });
      }
    }
  }

  if (currentProcessGroup.length > 0 && currentProcGroupId) {
    const isExecuting = currentProcGroupId === activeProcessGroupId;
    result.push({
      type: 'process-group',
      id: `pg-${currentProcGroupId}`,
      groupId: currentProcGroupId,
      processes: currentProcessGroup,
      isExecuting,
    });
  }

  return result;
});

/**
 * 滚动消息列表到底部。必须对 .chat-messages 自身设 scrollTop：
 * 子节点 scrollIntoView 在 flex+overflow 侧栏里常滚不动外层列表。
 * 双帧 + nextTick 调用处配合，确保 DOM 布局后再滚。
 */
function scrollToBottom(smooth = false) {
  const apply = () => {
    const box = messagesEl.value;
    if (!box) return;
    if (smooth) {
      box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
    } else {
      box.scrollTop = box.scrollHeight;
    }
  };
  apply();
  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });
}

async function scrollToBottomAfterUpdate(smooth = false) {
  await nextTick();
  scrollToBottom(smooth);
  if (!IS_SAFARI_EXT) scheduleUserBubbleMinimapLayout();
}

watch(loading, () => {
  void scrollToBottomAfterUpdate(false);
});

watch(thinking, () => {
  void scrollToBottomAfterUpdate(false);
});

watch(
  displayMessages,
  () => {
    // Safari：首屏 post-flush 里 hydrate/minimap 与重模板叠加时易打挂 WebContent
    if (IS_SAFARI_EXT) return;
    void nextTick(() => {
      hydrateBubbleFileThumbnails(messagesEl.value);
      hydrateBubbleChipFavicons(messagesEl.value);
      scheduleUserBubbleMinimapLayout();
    });
  },
  { flush: "post" },
);

watch(messagesEl, (el, prev) => {
  if (IS_SAFARI_EXT) return;
  if (!userBubbleMinimapResizeObserver) return;
  if (prev) userBubbleMinimapResizeObserver.unobserve(prev);
  if (el) userBubbleMinimapResizeObserver.observe(el);
});

watch(userBubbleMinimapEl, (el, prev) => {
  if (IS_SAFARI_EXT) return;
  if (!userBubbleMinimapResizeObserver) return;
  if (prev) userBubbleMinimapResizeObserver.unobserve(prev);
  if (el) userBubbleMinimapResizeObserver.observe(el);
});

function notifySwAbortTools(cid: string) {
  try {
    void getContext().browser.runtime.sendMessage({
      origin: "sidepanel",
      operate: "chat/abortTools",
      conversationId: cid,
    });
  } catch (e) {
    console.warn("[ChatPanel] chat/abortTools failed", e);
  }
}

function notifySwResetToolAbort(cid: string) {
  try {
    void getContext().browser.runtime.sendMessage({
      origin: "sidepanel",
      operate: "chat/resetToolAbort",
      conversationId: cid,
    });
  } catch (e) {
    console.warn("[ChatPanel] chat/resetToolAbort failed", e);
  }
}

async function stopTask(
  message?: string | Event,
  options?: { skipAssistantMessage?: boolean },
) {
  const cid = conversationId.value;
  try {
    if (cid) abortControllersByConversation.get(cid)?.abort();
  } catch {
    // ignore
  }
  if (cid) {
    notifySwAbortTools(cid);
    abortControllersByConversation.delete(cid);
    setConversationLoading(cid, false);
    setConversationThinking(cid, false);
    finishActivityTrace(cid, "stopped");
  }
  cancelled.value = true;
  const msg = typeof message === "string" ? message : undefined;
  if (cid && !options?.skipAssistantMessage) {
    await addMessage(cid, "assistant", msg || t("chat.taskStopped"));
  }
  if (cid) {
    safariShellOnStop(cid, msg || t("chat.taskStopped"));
  }
}

/** 丢掉已流式写入的助手气泡（会员软失败等） */
async function discardAssistantMessageById(convId: string, msgId: string) {
  const id = String(msgId || "").trim();
  if (!id) return;
  const pending = messagePersistQueues.get(id);
  messagePersistQueues.delete(id);
  messagePersistConvById.delete(id);
  if (pending) {
    try {
      await pending;
    } catch {
      // ignore upsert errors; still delete
    }
  }
  if (convId === conversationId.value) {
    const idx = messages.value.findIndex((m) => m.id === id);
    if (idx >= 0) messages.value.splice(idx, 1);
  }
  if (activeStreamMsgId.value === id) {
    activeStreamMsgId.value = null;
  }
  try {
    await chatStorage.deleteMessage(id);
  } catch (e) {
    console.warn("[Chat] discardAssistantMessage delete failed:", e);
  }
  try {
    if (convId === conversationId.value) {
      syncLlmHistoryFromPanelMessages(convId);
    }
  } catch (e) {
    console.warn("[Chat] discardAssistantMessage sync history failed:", e);
  }
}

async function abortTask() {
  const cid = conversationId.value;
  try {
    if (cid) abortControllersByConversation.get(cid)?.abort();
  } catch {
    // ignore
  }
  if (cid) {
    notifySwAbortTools(cid);
    abortControllersByConversation.delete(cid);
    setConversationLoading(cid, false);
    setConversationThinking(cid, false);
    finishActivityTrace(cid, "stopped");
  }
  cancelled.value = true;
}

onMounted(async () => {
  console.log("[ChatPanel] mount-2 begin", { safari: IS_SAFARI_EXT });
  if (IS_SAFARI_EXT) {
    console.warn("[PANEL-RELOAD][iframe] ChatPanel mount-2", {
      href: String(location.href || "").slice(0, 160),
      t: Date.now(),
    });
    try {
      window.addEventListener("pagehide", (ev) => {
        console.warn("[PANEL-RELOAD][iframe] pagehide", {
          persisted: !!(ev && (ev as PageTransitionEvent).persisted),
          t: Date.now(),
        });
      });
      window.addEventListener("pageshow", (ev) => {
        console.warn("[PANEL-RELOAD][iframe] pageshow", {
          persisted: !!(ev && (ev as PageTransitionEvent).persisted),
          t: Date.now(),
        });
      });
      document.addEventListener("visibilitychange", () => {
        console.log("[PANEL-RELOAD][iframe] visibilitychange", {
          state: document.visibilityState,
          t: Date.now(),
        });
      });
    } catch (e) {
      console.warn("[PANEL-RELOAD][iframe] lifecycle listeners failed", e);
    }
  }
  registerChatPanelSlotsHost({
    closeSharedPanels: closeSharedHeaderPanels,
    afterLogin: () => {
      void loadBoundConversation();
    },
    afterLogout: () => {
      void loadBoundConversation();
    },
    getPanelMessageCount: () => messages.value.length,
    isOnboardingOpen: () => showOnboarding.value,
    sendPromptText: (text: string) => {
      void send2(text);
    },
  });
  await loadConfig();
  console.log("[ChatPanel] loadConfig done");
  await ensureChatPanelWindowId();
  addListener();
  if (!IS_SAFARI_EXT) {
    addTabListeners();
  } else {
    console.log("[ChatPanel] safari skip addTabListeners");
  }
  // 先让首屏渲染完成，再加载历史会话/标签页信息（避免首屏被大量消息/Markdown 渲染拖慢）
  await nextTick();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  console.log("[ChatPanel] first paint tick done");

  if (IS_SAFARI_EXT) {
    // hostTab 已由 panelShell 注入；略延迟绑会话，避开首屏压力
    window.setTimeout(() => {
      console.log("[ChatPanel] safari delayed loadBoundConversation");
      void loadBoundConversation();
    }, 400);
  } else {
    await loadBoundConversation();
  }

  chatPanelReadyForMcp = true;
  flushMcpExternalTaskQueue();
  isTabRecording.value = isTabRecordingActive();
  // Provider / CLI 开关 → 侧栏分别连本机桥（不再经 SW）
  try {
    mcpBridgeEnabled.value = await isMcpBridgeEnabled();
    cliBridgeEnabled.value = await isCliBridgeEnabled();
    if (!IS_SAFARI_EXT) {
      syncMcpBridgeListening();
    } else {
      console.log("[ChatPanel] safari skip syncMcpBridgeListening (defer)");
      window.setTimeout(() => {
        try {
          syncMcpBridgeListening();
        } catch (e) {
          console.warn("[ChatPanel] safari late mcp bridge", e);
        }
      }, 800);
    }
  } catch (e) {
    console.warn("[ChatPanel] load bridge enabled failed", e);
  }
  try {
    // Open 无账户/下载器等 Pro 工具栏项，不做 header 新手引导
    if (!isOpenEdition() && !IS_SAFARI_EXT) {
      const done = await isOnboardingDone();
      if (!done) {
        await nextTick();
        showOnboarding.value = true;
      }
    }
  } catch (e) {
    console.warn("[ChatPanel] onboarding check failed", e);
  }
});

function resolveActiveTabId(): Promise<number | undefined> {
  return new Promise((resolve) => {
    getCurrentTab((_url: string, tabId: number) => {
      resolve(parseSourceTabId(tabId));
    });
  });
}

/** 页面点选结果 → 写入输入区 chip；tabId 取当前窗口活动标签（侧栏场景下即用户正在看的页） */
async function handlePageSelectResultMessage(message: any): Promise<void> {
  if (loading.value) return;
  const body = message?.body;
  let selectors = parseCopySelectionSelectors(body?.selectors);
  if (!selectors) {
    const legacySelector = typeof body?.selector === "string" ? body.selector.trim() : "";
    if (legacySelector) {
      selectors = { rootSelector: legacySelector, childSelectors: [] };
    }
  }

  if (!selectors?.rootSelector) return;

  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  const rawType = typeof body?.type === "string" ? body.type.trim() : "";
  const displayText = rawText || mapDomTagToCnLabel(rawType);
  const host = typeof body?.host === "string" ? body.host.trim() : "";
  const favicon = typeof body?.favicon === "string" ? body.favicon : undefined;
  const activeTabId = await resolveActiveTabId();
  if (!host || activeTabId == null) return;
  const struct = buildElementsStructFromCopyMessage({
    host,
    text: displayText,
    favicon,
    imgList: body?.imgList,
    tabId: activeTabId,
    selectors,
  });
  addElementsChipToComposer(struct, "selectedElements");
}

/** content 划词 / background 转发划词 → 待插入区 */
async function handleAssistantCopySelectionRelayMessage(message: any): Promise<void> {
  const host = typeof message.host === "string" ? message.host : "";
  const text = typeof message.text === "string" ? message.text : "";
  const favicon = typeof message.favicon === "string" ? message.favicon : "";
  const selectionAnchor = parseCopySelectionAnchor(message.selectionAnchor);
  let sourceTabId = parseSourceTabId(message.sourceTabId);
  if (sourceTabId == null) {
    sourceTabId = await resolveActiveTabId();
  }
  const selectors = parseCopySelectionSelectors(message.selectors);
  const struct = buildElementsStructFromCopyMessage({
    host,
    text,
    favicon: favicon || undefined,
    tabId: sourceTabId,
    selectors,
  });
  pendingCopySelectionFromPage.value = {
    kind: "elements",
    struct,
    subjectType: "copyElements",
    ...(selectionAnchor ? { selectionAnchor } : {}),
  };
}

/** 侧栏唯一分发：按 `origin` + `operate` 路由（便于扩展 BG → sidepanel） */
function handleUseCaseInstructionMessage(message: {
  instruction?: unknown;
  tabId?: unknown;
  url?: unknown;
}): void {
  const instruction = typeof message.instruction === "string" ? message.instruction.trim() : "";
  if (!instruction) return;
  const tabId = typeof message.tabId === "number" ? message.tabId : undefined;
  const url = typeof message.url === "string" ? message.url : undefined;
  console.log("[ChatPanel] chat/useCaseInstruction", { instruction, tabId, url });
  // TODO: 在此处理 use-case instruction（如自动 send2）
  send2(instruction);
}

function reportMcpExternalAccepted(payload: {
  requestId: string;
  conversationId: string;
}): void {
  try {
    sendMcpBridgeAccepted(payload.requestId, payload.conversationId);
    sendMcpBridgeRunning(payload.conversationId, "DomA 执行中…");
  } catch (e) {
    console.warn("[ChatPanel] mcpExternalAccepted send failed", e);
  }
}

function reportMcpExternalResult(payload: {
  conversationId?: string;
  requestId?: string;
  ok: boolean;
  text: string;
  status: "done" | "error";
}): void {
  try {
    sendMcpBridgeResult(payload);
  } catch (e) {
    console.warn("[ChatPanel] mcpExternalResult send failed", e);
  }
}

function flushMcpExternalTaskQueue(): void {
  const queued = mcpExternalTaskQueue.splice(0, mcpExternalTaskQueue.length);
  for (const item of queued) {
    void processMcpExternalTask(item);
  }
}

async function dispatchSidePanelRuntimeMessage(message: any): Promise<unknown> {
  if (!message || typeof message !== "object") return;
  const origin = message.origin;
  const operate = message.operate;
  if (typeof origin !== "string" || typeof operate !== "string") return;

  if (origin === "content" && operate === "pageSelectResult") {
    await handlePageSelectResultMessage(message);
    return;
  }
  if (
    (origin === "content" && operate === "assistant/copySelection")
    || (origin === "background" && operate === "assistant/copySelectionRelay")
  ) {
    await handleAssistantCopySelectionRelayMessage(message);
    return;
  }
  if (origin === "background" && operate === "chat/getTabIdByConversationId") {
    const cid = typeof message.conversationId === "string" ? message.conversationId.trim() : "";
    return { tabId: getTabIdByConversationIdFromList(cid) };
  }
  if (origin === "background" && operate === "chat/planQuestionsShow") {
    const cid = typeof message.conversationId === "string" ? message.conversationId.trim() : "";
    const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
    const questionList = normalizePlanQuestionList(message.questionList);
    if (!cid || !requestId || !questionList.length) {
      return { skipped: true };
    }
    if (conversationId.value !== cid) {
      conversationId.value = cid;
      await loadConversation(cid, "planQuestionsShow");
    }
    try {
      const userResult = await openPlanQuestionsSession({
        requestId,
        conversationId: cid,
        questionList,
      });
      if (userResult.skipped) {
        return { skipped: true };
      }
      return {
        skipped: false,
        content: formatPlanQuestionsContent(userResult.answers),
      };
    } catch (e) {
      console.error("[ChatPanel] chat/planQuestionsShow failed:", e);
      return { skipped: true };
    }
  }
  if (origin === "background" && operate === "chat/refreshConversations") {
    try {
      await reloadConversationContextsFromDisk(replaceConversationMapsFromPersisted);
      await refreshConversationContextList();
      const currentId = conversationId.value;
      if (currentId && !getConversationContext(currentId)) {
        conversationId.value = await getBoundConversationId();
        await loadConversation(conversationId.value, "refreshConversations.rebind");
      }
      return { ok: true };
    } catch (e) {
      console.error("[ChatPanel] chat/refreshConversations failed:", e);
      return { ok: false, error: String(e) };
    }
  }
  if (origin === "background" && operate === "chat/deleteConversations") {
    try {
      const raw = message.conversationIds;
      const ids = Array.isArray(raw)
        ? raw.filter((id): id is string => typeof id === "string" && !!id.trim()).map((id) => id.trim())
        : [];
      for (const id of ids) {
        await chatStorage.deleteConversation(id);
        resetContextUsage(id);
      }
      if (showHistory.value) {
        await refreshHistoryConversations();
      }
      const currentId = conversationId.value;
      if (currentId && ids.includes(currentId)) {
        await startNewConversation();
      }
      return { ok: true };
    } catch (e) {
      console.error("[ChatPanel] chat/deleteConversations failed:", e);
      return { ok: false, error: String(e) };
    }
  }
  if (origin === "background" && operate === "chat/runTabHandover") {
    const sourceTabId = message.sourceTabId;
    const newTabId = message.newTabId;
    const url = message.url;
    console.log("[DOMA_HANDOVER]", "dispatch:runTabHandover", {
      sourceTabId,
      newTabId,
      url,
      panelCid: conversationId.value,
      argOk:
        typeof sourceTabId === "number"
        && typeof newTabId === "number"
        && typeof url === "string",
    });
    if (typeof sourceTabId === "number" && typeof newTabId === "number" && typeof url === "string") {
      await runTabHandoverIfNeeded({
        sourceTabId,
        id: newTabId,
        url,
        via: "runtime-message",
      });
    } else {
      console.warn("[DOMA_HANDOVER]", "dispatch:runTabHandover:bad-args", {
        sourceTabId,
        newTabId,
        url,
      });
    }
    return { ok: true };
  }
  if (origin === "background" && operate === "chat/runCallTab") {
    const sourceConversationId = message.sourceConversationId;
    const targetTabId = message.targetTabId;
    const instruction = message.instruction;
    const addonInstruction =
      typeof message.addonInstruction === "string" ? message.addonInstruction : undefined;
    console.log("[handoff] runCallTab:recv", {
      sourceCid: sourceConversationId,
      targetTabId,
      hasAddon: !!(addonInstruction && addonInstruction.trim()),
      addonLen: addonInstruction?.trim().length ?? 0,
      instrLen: typeof instruction === "string" ? instruction.length : 0,
      // 当前实现若未把 addon 传入 runCallTab，后续续跑提示会变弱
      willPassAddon: false,
    });
    if (typeof targetTabId === "number" && typeof instruction === "string") {
      // 刻意不传 addonInstruction（现状），便于对照日志确认丢失点；修行为时再改 willPassAddon
      await runCallTab({
        sourceConversationId,
        targetTabId,
        instruction,
        // addon 暂不传入，与线上行为一致；recv 日志已记录是否收到
      });
    } else {
      console.warn("[handoff] runCallTab:recv-invalid", {
        targetTabId,
        hasInstruction: typeof instruction === "string",
      });
    }
    return { ok: true };
  }
  if (origin === "background" && operate === "chat/runTabBackground") {
    const sourceConversationId = message.sourceConversationId;
    const newTabId = message.newTabId;
    const url = message.url;
    const prompt = message.prompt;
    if (typeof sourceConversationId === "string" && typeof newTabId === "number" && typeof url === "string") {
      await runBackgroundConversationIfNeeded({sourceConversationId, newTabId, url, prompt});
    }
    return { ok: true };
  }
  if (origin === "background" && operate === "chat/toolProgress") {
    const processId = typeof message.processId === "string" ? message.processId.trim() : "";
    const status = message.status;
    if (
      processId
      && (status === "running" || status === "completed" || status === "error")
    ) {
      patchProgressByProcessId(processId, {
        status,
        message: typeof message.message === "string" ? message.message : undefined,
        errorMessage: typeof message.errorMessage === "string" ? message.errorMessage : undefined,
      });
    }
    return { ok: true };
  }
  if (origin === "background" && operate === "chat/useCaseInstruction") {
    handleUseCaseInstructionMessage(message);
    return { ok: true };
  }
  if (origin === "background" && operate === "chat/scheduledPing") {
    console.log("[ChatPanel] scheduledPing");
    return { ok: true };
  }
  if (origin === "background" && operate === "chat/suppressTabBind") {
    const suppress = message.suppress === true;
    setSuppressTabActivatedBind(suppress);
    return { ok: true, depth: suppressTabActivatedBindDepth };
  }
  if (origin === "background" && operate === "chat/scheduledFire") {
    const payload = message.payload as ScheduledFirePayload | undefined;
    console.log("[ChatPanel] scheduledFire message", payload);
    if (payload && typeof payload.text === "string" && typeof payload.id === "string") {
      void onScheduledMessageFire(payload);
      if (showScheduled.value) {
        void refreshScheduledMessages();
      }
      return { ok: true };
    }
    return { ok: false, error: "invalid scheduled payload" };
  }
}

function addListener() {
  const browser = getContext().browser;
  if (sidePanelRuntimeOnMessageListener) {
    try {
      browser.runtime.onMessage.removeListener(sidePanelRuntimeOnMessageListener);
    } catch {
      // ignore
    }
  }
  sidePanelRuntimeOnMessageListener = (message, sender, sendResponse) => {
    if (
      message?.origin === "background"
      && (message?.operate === "chat/getTabIdByConversationId"
        || message?.operate === "chat/planQuestionsShow"
        || message?.operate === "chat/runTabHandover"
        || message?.operate === "chat/runConversationHandover"
        || message?.operate === "chat/refreshConversations"
        || message?.operate === "chat/deleteConversations"
        || message?.operate === "chat/scheduledPing"
        || message?.operate === "chat/suppressTabBind"
        || message?.operate === "chat/scheduledFire")
    ) {
      void (async () => {
        const payload = await dispatchSidePanelRuntimeMessage(message);
        sendResponse(payload ?? { ok: true });
      })();
      return true;
    }
    void dispatchSidePanelRuntimeMessage(message);
    return undefined;
  };
  browser.runtime.onMessage.addListener(sidePanelRuntimeOnMessageListener);

  // Safari：SW → tabs → panelShell → postMessage；Chrome 独立侧栏不会收到此类 message
  if (sidePanelShellRelayListener) {
    try {
      window.removeEventListener("message", sidePanelShellRelayListener);
    } catch {
      // ignore
    }
  }
  sidePanelShellRelayListener = (event: MessageEvent) => {
    const data = event?.data;
    if (!data || data.source !== "doma-panel-shell") return;
    if (data.operate !== "safariPanel/sidePanelRelay") return;
    const requestId = data.requestId;
    const payload = data.payload;
    if (!payload || typeof payload !== "object") return;
    // MCP 下行由 entry.pro 的 mcpResponse / sidePanelRelay 监听处理
    if (
      (payload as { operate?: string }).operate === "safariPanel/mcpResponse"
      || (payload as { operate?: string }).operate === "mcp/response"
    ) {
      return;
    }
    void (async () => {
      try {
        const response = await dispatchSidePanelRuntimeMessage(payload);
        window.parent.postMessage(
          {
            source: "doma-sidepanel",
            operate: "safariPanel/sidePanelRelayResult",
            requestId,
            response: response ?? { ok: true },
          },
          "*",
        );
      } catch (e) {
        window.parent.postMessage(
          {
            source: "doma-sidepanel",
            operate: "safariPanel/sidePanelRelayResult",
            requestId,
            response: { ok: false, error: String((e as Error)?.message || e) },
          },
          "*",
        );
      }
    })();
  };
  window.addEventListener("message", sidePanelShellRelayListener);
}

function addTabListeners() {
  const browser = getContext().browser;
  if (!handleTabActivated) {
    handleTabActivated = async (activeInfo) => {
      console.log("[ChatPanel] tabs.onActivated", { activeInfo });
      if (!(await isChatPanelWindow(activeInfo.windowId))) return;

      // 截图 brief-activate 等临时切 tab：禁止抢绑面板
      if (suppressTabActivatedBindDepth > 0) {
        console.warn("[DOMA_HANDOVER]", "onActivated:skip-suppress", {
          tabId: activeInfo.tabId,
          depth: suppressTabActivatedBindDepth,
          panelCid: conversationId.value,
        });
        return;
      }

      const tabId = activeInfo.tabId;
      const panelCidBefore = conversationId.value;
      const targetConversationId = await getConversationIdByTabId(tabId);
      console.log("[DOMA_HANDOVER]", "onActivated:bind", {
        tabId,
        panelCid: panelCidBefore,
        targetConversationId,
        targetLoading: targetConversationId
          ? isConversationLoading(targetConversationId)
          : false,
        willClear: !targetConversationId,
      });

      conversationId.value = targetConversationId;
      loadConversation(targetConversationId, "onActivated");

      if (targetConversationId) {
        getContext().browser.tabs.get(tabId, (tab: any) => {
          if (tab) {  
            upsertConversationContext({
            conversationId: targetConversationId,
            tabInfo: {
              url: tab.url as string | undefined,
              icon: tab.favIconUrl as string | undefined,
            },
          });
          }
          refreshConversationContextList();
        });
      }
      else{
        console.warn("[DOMA_HANDOVER]", "onActivated:clear-unbound-tab", {
          tabId,
          panelCidBefore,
        });
        refreshConversationContextList();
      }
    };
    browser.tabs.onActivated.addListener(handleTabActivated);
  }
  if (!handleTabUpdated) {
    handleTabUpdated = async (tabId, changeInfo, tab) => {
      console.log("[ChatPanel] tabs.onUpdated", { tabId, changeInfo, tab });
      if (changeInfo.status === "complete") {
        const conversationId = await getConversationIdByTabId(tabId);
        if (!conversationId) return;
        const conversation = getConversationContext(conversationId);
        if (conversation) {
          console.log("[ChatPanel] tabs.onUpdated tabInfo",{url: tab.url as string | undefined, icon: tab.favIconUrl as string | undefined});
          upsertConversationContext({
            conversationId,
            tabInfo: {
              url: tab.url as string | undefined,
              icon: tab.favIconUrl as string | undefined
            }
          });
          refreshConversationContextList();
          }
      }

      if (changeInfo.groupId) {
        if (typeof changeInfo.groupId === "number") {
          if (changeInfo.groupId >= 0) {
            const groupConversationId = getConversationIdByGroupId(changeInfo.groupId);
            if (!groupConversationId) return;
            const conversation = getConversationContext(groupConversationId);
            if (conversation) {
              upsertConversationContext({
                conversationId: groupConversationId,
                groupWorkingTabId: tabId,
                appendedGroupTabs: [tabId]
              });
              // 未激活 tab 入组只更新 context，不抢面板；
              // 用户点到该 tab 时由 onActivated 再 loadConversation。
              console.log("[DOMA_BIND] onUpdated:groupId", {
                groupConversationId,
                tabId,
                tabActive: tab.active === true,
                panelCid: conversationId.value,
              });
              if (tab.active) {
                loadConversation(groupConversationId, "onUpdated.groupId.active");
              } else {
                console.log("[DOMA_BIND] onUpdated:groupId:skip-inactive", {
                  groupConversationId,
                  tabId,
                });
              }
            }
          }
          else {
            const conversationId = getConversationIdByGroupTabId(tabId);
            if (!conversationId) return;
            const conversation = getConversationContext(conversationId);
            if (conversation) {
              upsertConversationContext({
                conversationId,
                removedGroupTabs: [tabId]
              });

              const updatedConversation = getConversationContext(conversationId);
              if (updatedConversation && updatedConversation.groupTabs && updatedConversation.groupTabs.length > 0) {
                const nextWorkingTabId = updatedConversation.groupTabs[updatedConversation.groupTabs.length - 1];
                upsertConversationContext({
                  conversationId,
                  groupWorkingTabId: nextWorkingTabId
                });
                getContext().browser.tabs.update(nextWorkingTabId, { active: true });
                loadConversation(conversationId, "onUpdated.groupId.removed");
              }
            }
          }
        }
      }
    };
    browser.tabs.onUpdated.addListener(handleTabUpdated);
  }
  const webNavigation = (browser as { webNavigation?: { onCreatedNavigationTarget?: { addListener: (cb: (d: Record<string, unknown>) => void) => void } } }).webNavigation;
  if (webNavigation?.onCreatedNavigationTarget && !handleNavigationTargetCreated) {
    handleNavigationTargetCreated = (details) => {
      console.log("[DOMA_HANDOVER]", "nav:onCreatedNavigationTarget", {
        sourceTabId: details.sourceTabId,
        newTabId: details.tabId,
        url: details.url,
        panelCid: conversationId.value,
      });
      runTabHandoverIfNeeded({
        sourceTabId: details.sourceTabId as number,
        id: details.tabId as number,
        url: details.url as string,
        via: "webNavigation",
      });
    };
    webNavigation.onCreatedNavigationTarget.addListener(handleNavigationTargetCreated);
  }
  if (!handleTabCreated) {
    handleTabCreated = async (tab: any) => {
      // console.log("[ChatPanel] tabs.onCreated", { tab });
      // await runTabHandoverIfNeeded(tab);
    };
    browser.tabs.onCreated.addListener(handleTabCreated);
  }
  if (!handleTabRemoved) {
    handleTabRemoved = async (tabId, removeInfo) => {
      console.log("[ChatPanel] tabs.onRemoved", { tabId, removeInfo });
      const conversationId = await getConversationIdByTabId(tabId);
      if (!conversationId) return;
      const conversation = getConversationContext(conversationId); 
      if (conversation && conversation.mode === "single") {
        removeConversationByTabId(tabId);
      }
    };
    browser.tabs.onRemoved.addListener(handleTabRemoved);
  }
  if (browser.tabGroups?.onCreated && !handleTabGroupCreated) {
    handleTabGroupCreated = (group) => {
      console.log("[ChatPanel] tabGroups.onCreated", group);
    };
    browser.tabGroups.onCreated.addListener(handleTabGroupCreated);
  }
  if (browser.tabGroups?.onUpdated && !handleTabGroupUpdated) {
    handleTabGroupUpdated = (group) => {
      console.log("[ChatPanel] tabGroups.onUpdated", group);
      if (group?.id == null) return;
      const targetConversationId = getConversationIdByGroupId(group.id);
      if (!targetConversationId) return;
      const conversation = getConversationContext(targetConversationId);
      if (!conversation || conversation.mode !== "group") return;
      upsertConversationContext({
        conversationId: targetConversationId,
        groupColor: group.color,
        groupTitle: group.title,
      });
      refreshConversationContextList();
    };
    browser.tabGroups.onUpdated.addListener(handleTabGroupUpdated);
  }
  if (browser.tabGroups?.onRemoved && !handleTabGroupRemoved) {
    handleTabGroupRemoved = (group) => {
      if (group?.id != null) {
        removeConversationByGroupId(group.id);
      }
    };
    browser.tabGroups.onRemoved.addListener(handleTabGroupRemoved);
  }
}

function removeTabListeners() {
  const browser = getContext().browser;
  if (handleTabActivated) {
    try {
      browser.tabs.onActivated.removeListener(handleTabActivated);
    } catch {
      // ignore
    }
    handleTabActivated = null;
  }
  if (handleTabUpdated) {
    try {
      browser.tabs.onUpdated.removeListener(handleTabUpdated);
    } catch {
      // ignore
    }
    handleTabUpdated = null;
  }
  if (handleTabCreated) {
    try {
      browser.tabs.onCreated.removeListener(handleTabCreated);
    } catch {
      // ignore
    }
    handleTabCreated = null;
  }
  if (handleTabRemoved) {
    try {
      browser.tabs.onRemoved.removeListener(handleTabRemoved);
    } catch {
      // ignore
    }
    handleTabRemoved = null;
  }
  if (handleTabGroupCreated && browser.tabGroups?.onCreated) {
    try {
      browser.tabGroups.onCreated.removeListener(handleTabGroupCreated);
    } catch {
      // ignore
    }
    handleTabGroupCreated = null;
  }
  if (handleTabGroupUpdated && browser.tabGroups?.onUpdated) {
    try {
      browser.tabGroups.onUpdated.removeListener(handleTabGroupUpdated);
    } catch {
      // ignore
    }
    handleTabGroupUpdated = null;
  }
  if (handleTabGroupRemoved && browser.tabGroups?.onRemoved) {
    try {
      browser.tabGroups.onRemoved.removeListener(handleTabGroupRemoved);
    } catch {
      // ignore
    }
    handleTabGroupRemoved = null;
  }
  const webNavigation = (browser as { webNavigation?: { onCreatedNavigationTarget?: { removeListener: (cb: (d: Record<string, unknown>) => void) => void } } }).webNavigation;
  if (handleNavigationTargetCreated && webNavigation?.onCreatedNavigationTarget) {
    try {
      webNavigation.onCreatedNavigationTarget.removeListener(handleNavigationTargetCreated);
    } catch {
      // ignore
    }
    handleNavigationTargetCreated = null;
  }
}

onUnmounted(() => {
  clearMcpAgentBadge();
  stopMcpBridgeClient();
  registerChatPanelSlotsHost(null);
  setChatActionModalOpener(null);
  if (inlineBlurExitTimer) {
    clearTimeout(inlineBlurExitTimer);
    inlineBlurExitTimer = null;
  }
  document.removeEventListener("keydown", onKeydownChange, true);
  teardownUserBubbleMinimapObserver();
  clearBubbleFileThumbnails();
  // sidepanel 可能被浏览器快速销毁：尽量在卸载时 flush 所有待落盘的流式消息
  try {
    for (const id of messagePersistQueues.keys()) {
      queueMessagePersist(id);
    }
    void flushAllMessagePersists();
  } catch {
    // ignore
  }
  try {
    const browser = getContext().browser;
    if (sidePanelRuntimeOnMessageListener) {
      browser.runtime.onMessage.removeListener(sidePanelRuntimeOnMessageListener);
      sidePanelRuntimeOnMessageListener = null;
    }
  } catch {
    // ignore
  }
  if (sidePanelShellRelayListener) {
    try {
      window.removeEventListener("message", sidePanelShellRelayListener);
    } catch {
      // ignore
    }
    sidePanelShellRelayListener = null;
  }
  removeTabListeners();
  if (isTabRecording.value || isTabRecordingActive()) {
    cancelActiveTabRecording();
    isTabRecording.value = false;
  }
});

async function loadConfig() {
  const config = await llmManager.loadConfig();
  if (isOpenEdition()) {
    const openCfg = config as {
      provider?: string | null;
      activeModel?: string | null;
      apiKeys?: Record<string, string>;
      baseUrls?: Record<string, string>;
    };
    selectedProvider.value = (openCfg.provider || 'qwen') as LlmProvider;
    currentApiKey.value =
      (openCfg.provider && openCfg.apiKeys?.[openCfg.provider]) || '';
    currentBaseUrl.value =
      (openCfg.provider && openCfg.baseUrls?.[openCfg.provider]) || '';
    currentModel.value = openCfg.activeModel || '';
    availableModels.value = llmManager.getAvailableModels(selectedProvider.value as any) || [];
  } else {
    selectedProvider.value = (config.provider || 'openai') as LlmProvider;
    if (config.provider && config.apiKeys) {
      currentApiKey.value = (config.apiKeys as Record<string, string>)[config.provider] || '';
      currentBaseUrl.value = config.baseUrls?.[config.provider as LlmProvider] || '';
      currentModel.value =
        (config as { models?: Record<string, string> }).models?.[config.provider] ||
        DEFAULT_MODELS[selectedProvider.value];
    }
    availableModels.value = llmManager.getAvailableModels(selectedProvider.value as any) || [];
  }
  refreshOpenModelButtonLabel();
}

// ========== 历史会话管理（IndexedDB conversations 表） ==========

async function refreshHistoryConversations(query = historySearchQuery.value) {
  try {
    await chatStorage.init();
    const rows = await searchHistoryConversations(query, getHistoryConversationMeta);
    // 定时会话不进历史（结束后也会从 chatStorage 删除；运行中靠 scheduled 标记过滤）
    conversations.value = rows.filter((c) => getConversationContext(c.id)?.scheduled !== true);
  } catch (e) {
    console.error("[Chat] Failed to refresh history conversations:", e);
  }
}

async function onTabRecordToggle() {
  if (isTabRecording.value) {
    const result = await stopActiveTabRecordingAndDownload();
    isTabRecording.value = false;
    if (!result.ok) {
      console.warn("[Chat] tab record stop failed:", result.error);
    }
    return;
  }

  const preferredTabId = conversationId.value
    ? getTabIdByConversationIdFromList(conversationId.value)
    : undefined;
  const result = await startActiveTabRecording(
    typeof preferredTabId === "number" ? { tabId: preferredTabId } : undefined,
  );
  if (result.ok) {
    isTabRecording.value = true;
  } else {
    isTabRecording.value = false;
    console.warn("[Chat] tab record start failed:", result.error);
  }
}

async function toggleHistoryPanel() {
  showHistory.value = !showHistory.value;
  showScheduled.value = false;
  showSettings.value = false;
  showMcp.value = false;
  closeChatPanelSlotsPanels();
  showDbPlus.value = false;
  if (showHistory.value) {
    historySearchQuery.value = "";
    await refreshHistoryConversations("");
  }
}

async function getBoundConversationId() {
  const currentTab = await resolveActiveBrowserTab();
  if (currentTab?.id == null) {
    if (IS_SAFARI_EXT) {
      console.log("[ChatPanel] safari getBoundConversationId: no hostTab yet");
    }
    return undefined;
  }
  return await getConversationIdByTabId(currentTab.id);
}

async function loadBoundConversation() {
  try {
    await chatStorage.init();
    await awaitConversationContextPersistenceReady(replaceConversationMapsFromPersisted);
    await refreshConversationContextList();
    conversationId.value = await getBoundConversationId();
    await loadConversation(conversationId.value, "loadBoundConversation");
  } catch (e) {
    console.error("[Chat] Failed to load bound conversation:", e);
  }
}

async function refreshConversationContextList() {
  pruneInvalidConversationContexts();
  conversationContextList.value = listConversationContexts();
}

async function loadHistoryConversation(conv: HistoryConversationRow) {
  const conversation = getConversationContext(conv.id);
  if (conversation){
    switchToConversation(conv.id);
  }
  else{
      const newTab = await getContext().browser.tabs.create({
        url: conv.url,
        active: true,
      });
      if (newTab?.id != null) {
        // 用完整原文写回 context（列表上的 lastUserQuestion 已剥 interactionBlock，仅供展示）
        const meta = getHistoryConversationMeta(conv.id);
        const fullQuestion =
          meta.lastUserQuestion ||
          conv.firstUserMessage?.trim() ||
          conv.title ||
          "";
        upsertConversationContext({
          mode: "single",
          tabInfo: {
            url: conv.url,
          },
          conversationId: conv.id,
          tabId: newTab.id,
          lastUserQuestion: fullQuestion,
        });
      }

      loadConversation(conv.id, "loadHistoryConversation");

      await refreshConversationContextList();
    }

  showHistory.value = false;
}

async function loadConversation(convId: string | undefined, reason = "unknown") {
  const panelBefore = conversationId.value;
  const handoverRelated =
    reason === "tabHandover"
    || reason === "onActivated"
    || !convId;
  if (handoverRelated) {
    console.log("[DOMA_HANDOVER]", "load:enter", {
      reason,
      convId,
      panelBefore,
      panelLoading: panelBefore ? isConversationLoading(panelBefore) : false,
      targetLoading: convId ? isConversationLoading(convId) : false,
      msgCount: messages.value.length,
    });
  }
  console.log("[DOMA_BIND] loadConversation:enter", {
    reason,
    convId,
    panelBefore,
    panelLoading: panelBefore ? isConversationLoading(panelBefore) : false,
    targetLoading: convId ? isConversationLoading(convId) : false,
    msgCount: messages.value.length,
  });
  try {
    // 切走前尽量把面板上排队的落盘跑完
    if (panelBefore && panelBefore !== convId) {
      await flushAllMessagePersists();
    }

    if (!convId){
      messages.value = [];
      conversationId.value = undefined;
      console.warn("[DOMA_HANDOVER]", "load:cleared", { reason, panelBefore });
      console.log("[DOMA_BIND] loadConversation:cleared", { reason, panelBefore });
      return;
    }

    const storedMessages = await chatStorage.getMessagesByConversation(convId);
    messages.value = storedMessages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      customUi: m.customUi as unknown as CustomUI | undefined,
      toolInput: toolInputAfterLoadFromStored(
        m.toolInput as Record<string, unknown> | undefined,
        m,
      ),
      toolBarItems: (m as any).toolBarItems as ChatMessageToolBarItem[] | undefined,
      toolCalls: m.toolCalls as ChatMessageToolCall[],
      activityTrace: m.activityTrace
        ? cloneTurnActivityTrace(m.activityTrace)
        : undefined,
    }));
    conversationId.value = convId;

    showHistory.value = false;

    // 任务进行中勿用气泡重建 LLM history（会丢掉 tool_calls/tool result，导致死循环调 tool）
    if (!isConversationLoading(convId)) {
      syncLlmHistoryFromPanelMessages(convId);
    }

    await hydrateContextUsageFromIdb(convId);

    await scrollToBottomAfterUpdate(false);
    if (handoverRelated) {
      console.log("[DOMA_HANDOVER]", "load:done", {
        reason,
        convId,
        panelBefore,
        panelAfter: conversationId.value,
        loadedMsgCount: messages.value.length,
        storedMsgCount: storedMessages.length,
      });
    }
    console.log("[DOMA_BIND] loadConversation:done", {
      reason,
      convId,
      panelBefore,
      panelAfter: conversationId.value,
      loadedMsgCount: messages.value.length,
    });
  } catch (e) {
    console.error("[DOMA_HANDOVER]", "load:error", { reason, convId, error: e });
    console.error("[DOMA_BIND] loadConversation:error", { reason, convId, error: e });
  }
}

async function startNewConversation() {
  if (!conversationId.value) return;
  messages.value = [];
  const conversation = getConversationContext(conversationId.value);
  if (conversation && conversation.mode === "group") {
    await chatStorage.deleteConversation(conversationId.value); 
    resetContextUsage(conversationId.value);
    upsertConversationContext({
      conversationId: conversationId.value,
      lastUserQuestion: ''
    });
    conversationId.value = undefined;
  }
  else{
    removeConversationContext(conversationId.value);
    conversationId.value = undefined;
  }
  refreshConversationContextList();
  showHistory.value = false;

  // 清除 LLM 会话历史
  llmManager.clearConversation(conversationId.value || '');
}

/** Chrome 标签组颜色枚举；与 UI 的 --stay-primary(#2F3134) 最接近的是 grey */
const DOMA_TAB_GROUP_COLOR = "grey";
const DOMA_TAB_GROUP_TITLE_PREFIX = "DomA - ";

function formatDomATabGroupTitle(raw: string): string {
  const title = (raw || "").trim();
  if (!title) return "DomA";
  if (title === "DomA" || title.startsWith(DOMA_TAB_GROUP_TITLE_PREFIX)) return title;
  return `${DOMA_TAB_GROUP_TITLE_PREFIX}${title}`;
}

async function startGroupSession() {
  try {
    const browser = getContext().browser;
    const w = await getContext().browser.windows.getLastFocused({ populate: true });
    const currentTab = w.tabs?.find((t:any) => t.active);
    // 在同窗口新开一个空白页作为组会话的起点 tab
    const newTab = await new Promise<any>((resolve, reject) => {
      const createInfo: any = { active: true };
      if (typeof currentTab?.windowId === 'number') createInfo.windowId = currentTab.windowId;
      browser.tabs.create(createInfo, (t: any) => {
        if (browser.runtime.lastError) {
          reject(new Error(browser.runtime.lastError.message));
        } else {
          resolve(t);
        }
      });
    });
    const newTabId = typeof newTab?.id === 'number' ? newTab.id : undefined;
    if (newTabId == null) return;

    // 把新空白 tab 放进一个新 group
    const groupId = await new Promise<number>((resolve, reject) => {
      browser.tabs.group({ tabIds: [newTabId] }, (gid: number) => {
        if (browser.runtime.lastError) {
          reject(new Error(browser.runtime.lastError.message));
        } else {
          resolve(gid);
        }
      });
    });

    // 固定品牌色 + DomA 前缀标题（Chrome 只能用枚举色，不能传 CSS 变量）
    let group: any = null;
    if (browser.tabGroups?.update) {
      try {
        group = await browser.tabGroups.update(groupId, {
          color: DOMA_TAB_GROUP_COLOR,
          title: "DomA",
        });
      } catch (e) {
        console.warn("[Chat] Failed to style DomA tab group:", e);
      }
    }
    if (!group && browser.tabGroups?.get) {
      group = await browser.tabGroups.get(groupId);
    }

    // 生成新的 conversationId，与新空白 tab 和 group 绑定
    const newConvId = generateConversationId();
    upsertConversationContext({
      conversationId: newConvId,
      groupId,
      mode: 'group',
      tabInfo: {
        url: newTab.url as string | undefined,
        icon: newTab?.favIconUrl as string | undefined
      },
      groupWorkingTabId: newTabId,
      groupTabs: [newTabId],
      groupColor: (group?.color as string | undefined) || DOMA_TAB_GROUP_COLOR,
      groupTitle: (group?.title as string | undefined) || "DomA",
    });

    conversationId.value = newConvId;
    await loadConversation(newConvId, "startGroupSession");
    await refreshConversationContextList();
 
    console.log('[Chat] Group session started, groupId:', groupId, 'newTabId:', newTabId, 'conversationId:', newConvId);
    return newConvId;
  } catch (e) {
    console.error('[Chat] Failed to start group session:', e);
  }
}

async function deleteConversation(convId: string) {
  try {
    await chatStorage.deleteConversation(convId);
    resetContextUsage(convId);
    if (showHistory.value) {
      await refreshHistoryConversations();
    }

    // 如果删除的是当前会话，清空界面
    if (conversationId.value === convId) {
      await startNewConversation();
    }
  } catch (e) {
    console.error('[Chat] Failed to delete conversation:', e);
  }
}

function onProviderChange() {
  const config = llmManager.getConfig();
  currentApiKey.value = config.apiKeys[selectedProvider.value] || '';
  currentBaseUrl.value = config.baseUrls?.[selectedProvider.value] || '';
  currentModel.value =
    (config as { models?: Record<string, string> }).models?.[selectedProvider.value] ||
    DEFAULT_MODELS[selectedProvider.value];
  availableModels.value = llmManager.getAvailableModels(selectedProvider.value as any) || [];

  llmManager.saveConfig({ provider: selectedProvider.value });

  // 清空对话
  messages.value = [];
  conversationId.value = undefined;
}

function saveCurrentApiKey() {
  const config = llmManager.getConfig();
  // 清理 API Key（去除首尾空格）
  const cleanedKey = currentApiKey.value?.trim() || '';
  currentApiKey.value = cleanedKey;
  config.apiKeys[selectedProvider.value] = cleanedKey;
  llmManager.saveConfig({ apiKeys: config.apiKeys });
}

function saveCurrentBaseUrl() {
  const config = llmManager.getConfig();
  const cleanedUrl = currentBaseUrl.value?.trim() || '';
  currentBaseUrl.value = cleanedUrl;
  const baseUrls = config.baseUrls || {};
  baseUrls[selectedProvider.value] = cleanedUrl;
  llmManager.saveConfig({ baseUrls });
}

function saveCurrentModel() {
  const config = llmManager.getConfig();
  config.models[selectedProvider.value] = currentModel.value;
  llmManager.saveConfig({ models: config.models });
}

function getApiKeyPlaceholder(): string {
  switch (selectedProvider.value) {
    case 'gemini': return '输入 Google AI API Key';
    case 'claude': return '输入 Anthropic API Key';
    case 'qwen': return '输入阿里云 DashScope API Key';
    case 'kimi': return '输入 Moonshot AI API Key';
    case 'openai': return '输入 OpenAI API Key（sk-...）';
    default: return '输入 API Key';
  }
}

function resolveSiteHost(opts?: Pick<Send2Options, "siteUrl">): Promise<string> {
  if (opts?.siteUrl) {
    const host = extractHostnameFromUrl(opts.siteUrl);
    if (host) return Promise.resolve(host);
  }
  return resolveCurrentConversationHost();
}

function resolveSiteUrl(opts?: Pick<Send2Options, "siteUrl">): Promise<string> {
  if (opts?.siteUrl?.trim()) {
    return Promise.resolve(opts.siteUrl.trim());
  }
  return resolveCurrentConversationUrl();
}

async function addMessage(
  convId: string,
  role: "user" | "assistant",
  content: string,
  customUi?: CustomUI,
  toolInput?: Record<string, unknown>,
  msgId?: string,
  toolCall?: ChatMessageToolCall,
): Promise<string> {
  if (!convId) return "";

  if (!msgId) {
    msgId = newChatMessageId();
  }
  const msg: ChatMessage = {
    id: msgId,
    role,
    content,
    customUi,
    toolInput,
    toolCalls: toolCall ? [toolCall] : [],
  };
  
  // MCP 用户消息：即使会话 id 短暂不一致也强制切回并渲染
  const forceMcpUserBubble =
    role === "user" && hasInteractionBlockMcpCallTag(content);
  if (forceMcpUserBubble && conversationId.value !== convId) {
    console.log("[DOMA_BIND] addMessage:force-mcp-bind", {
      from: conversationId.value,
      to: convId,
    });
    conversationId.value = convId;
  }

  let renderMessage = convId === conversationId.value;
  if (renderMessage) {
    console.log("[DOMA_BIND] addMessage:render", {
      convId,
      panelCid: conversationId.value,
      role,
      preview: String(content).slice(0, 80),
    });
    messages.value.push(msg);
    await nextTick();
    scrollToBottom(false);
  } else {
    console.warn("[DOMA_BIND] addMessage:skip-ui", {
      convId,
      panelCid: conversationId.value,
      role,
      preview: String(content).slice(0, 120),
    });
  }

  try {
    await chatStorage.addMessage({
      id: msgId,
      conversationId: convId,
      role,
      content,
      customUi: customUi ? (customUi as unknown as Record<string, unknown>) : undefined,
      toolInput,
      toolCalls: toolCall ? [toolCall] : [],
    });
  } catch (e) {
    console.error('[Chat] Failed to save message:', e);
  }

  if (renderMessage) {
    await scrollToBottomAfterUpdate(false);
  }
  return msgId;
}

function getMessageById(msgId: string): ChatMessage | undefined {
  return messages.value.find((m) => m.id === msgId);
}

function upsertAssistantMessage(
  convId: string,
  msgId: string,
  content: string,
  toolCall?: ChatMessageToolCall,
  customUi?: CustomUI,
  activityTrace?: TurnActivityTrace,
) {
  // 非当前面板：不碰 messages，直接串行写 IDB
  if (convId !== conversationId.value) {
    if (toolCall) {
      console.log("[tool debug] upsertAssistantMessage", {
        msgId,
        convId,
        toolCallId: toolCall.id,
        toolName: toolCall.name,
        toolState: toolCall.state,
        panelBound: false,
      });
    }
    queueOffPanelAssistantUpsert(
      convId,
      msgId,
      content,
      toolCall,
      customUi,
      activityTrace,
    );
    // Safari 页内把手镜像（Open / 非 Safari 为 noop）
    if (content || toolCall) {
      safariShellOnAssistantUpsert(
        convId,
        msgId,
        content || "",
        toolCall
          ? toolCall.state === "doing"
            ? toolCall.name
            : ""
          : undefined,
      );
    }
    return;
  }

  let idx = messages.value.findIndex((m) => m.id === msgId);
  if (idx === -1) {
    const msg: ChatMessage = {
      id: msgId,
      role: "assistant",
      content: content ? sanitizeAssistantUserFacing(content) : "",
      customUi,
      toolCalls: toolCall ? [toolCall] : [],
      activityTrace,
    };
    messages.value.push(msg);
    void nextTick(() => scrollToBottom(false));
  } else {
    const msg = messages.value[idx]!;
    if (content) {
      msg.content = sanitizeAssistantUserFacing(String(msg.content ?? "") + content);
    }
    if (toolCall) {
      const toolCalls = msg.toolCalls ?? (msg.toolCalls = []);
      const toolCallIdx = toolCalls.findIndex((t) => t.id === toolCall.id);
      if (toolCallIdx === -1) toolCalls.push(toolCall);
      else toolCalls[toolCallIdx] = toolCall;
    }
    if (customUi) msg.customUi = customUi;
    if (activityTrace) msg.activityTrace = activityTrace;
  }

  if (toolCall) {
    console.log("[tool debug] upsertAssistantMessage", {
      msgId,
      convId,
      toolCallId: toolCall.id,
      toolName: toolCall.name,
      toolState: toolCall.state,
      panelBound: true,
    });
  }

  const mirrored = messages.value.find((m) => m.id === msgId);
  if (mirrored && (content || toolCall)) {
    safariShellOnAssistantUpsert(
      convId,
      msgId,
      String(mirrored.content ?? ""),
      toolCall
        ? toolCall.state === "doing"
          ? toolCall.name
          : ""
        : undefined,
    );
  }

  queueMessagePersist(msgId, convId);
}

async function copyToClipboard(text: string) {
  const t = text ?? "";
  if (!t) return;
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return;
    }
  } catch {
    // fallback below
  }
  const ta = document.createElement("textarea");
  ta.value = t;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
}

async function onToolBarItemClick(item: ChatMessageToolBarItem) {
  emit("toolbar", item);
  if (item.type === "copy") {
    const key = `copy:${(item.msgIds || []).join(",")}`;
    const text = (item.msgIds || [])
      .map((id) => getMessageById(id)?.content)
      .filter((c): c is string => typeof c === "string" && c.length > 0)
      .join("\n\n");
    await copyToClipboard(text);

    copiedToolBarKeys.value.add(key);
    copiedToolBarKeys.value = new Set(copiedToolBarKeys.value);
    window.setTimeout(() => {
      copiedToolBarKeys.value.delete(key);
      copiedToolBarKeys.value = new Set(copiedToolBarKeys.value);
    }, 1200);
  }
}

function isToolBarItemCopied(item: ChatMessageToolBarItem): boolean {
  if (item.type !== "copy") return false;
  const key = `copy:${(item.msgIds || []).join(",")}`;
  return copiedToolBarKeys.value.has(key);
}

function onCreateSkillFromPanel(markdown: string) {
  dockComposer.openAddSkillDialogWithBody(markdown);
}

const CREATE_EXTENSION_SKILL = "create-extension";
const showCreateExtensionDescDialog = ref(false);
type PendingCreateExtensionSend = {
  payload: ComposerSendPayload;
  opts?: Send2Options;
};
const pendingCreateExtensionSend = ref<PendingCreateExtensionSend | null>(null);

function payloadHasCreateExtensionSkill(payload: ComposerSendPayload): boolean {
  if (payload.skillIds.some((id) => id === CREATE_EXTENSION_SKILL)) return true;
  return payload.segments.some(
    (s) => s.type === "skill" && s.skillId === CREATE_EXTENSION_SKILL,
  );
}

async function flushCreateExtensionSend(opts?: {
  extraDescription?: string;
  usePopup?: boolean;
}) {
  const pending = pendingCreateExtensionSend.value;
  pendingCreateExtensionSend.value = null;
  showCreateExtensionDescDialog.value = false;
  if (!pending) return;

  let text = await buildComposerStructuredSendText(pending.payload);
  const note = opts?.extraDescription?.trim();
  if (note) {
    text = `${text}\n\n${note}`;
  }
  const usePopup = opts?.usePopup !== false;
  // 结构化标签（勿与 skill 正文里的说明文案混淆）；写在块顶优先被模型看到
  const uiTag = `<extensionUi usePopup="${usePopup ? "true" : "false"}"/>`;
  const uiHint = usePopup
    ? `${uiTag}\n触发方式已选定：usePopup=true → 必须提供 popup.html + popup.js，manifest 设置 action.default_popup；用 popup sendMessage + background onMessage。禁止改用 onClicked-only。`
    : `${uiTag}\n触发方式已选定：usePopup=false → 不要 popup.html/popup.js，不要 default_popup；用 chrome.action.onClicked 在 background 直接执行。`;

  if (/<interactionBlock>/i.test(text)) {
    text = text.replace(
      /<interactionBlock>([\s\S]*?)<\/interactionBlock>/i,
      (_full, inner: string) => {
        let body = String(inner ?? "")
          .replace(/<extensionUi\b[^>]*\/?>\s*/gi, "")
          .replace(/\[DomA extension UI\][^\n]*/gi, "")
          .replace(/\n{3,}/g, "\n\n")
          .trim();
        const priority = "# 最优先使用以下上下文";
        if (body.startsWith(priority)) {
          const after = body.slice(priority.length).replace(/^\n+/, "");
          body = `${priority}\n${uiHint}\n${after}`;
        } else {
          body = `${uiHint}\n${body}`;
        }
        return `<interactionBlock>\n${body.trim()}\n</interactionBlock>`;
      },
    );
  } else {
    text = `<interactionBlock>\n${uiHint}\n</interactionBlock>\n${text}`;
  }
  await send2(text, pending.opts);
  if (pending.opts?.fromInlineComposer) {
    inlineEditingUserMsgId.value = null;
    inlineComposer.resetAfterSend();
  } else {
    dockComposer.resetAfterSend();
  }
}

function onCreateExtensionDescConfirm(payload: CreateExtensionDescConfirmPayload) {
  void flushCreateExtensionSend({
    extraDescription: payload.description,
    usePopup: payload.usePopup,
  });
}

function onCreateExtensionDescCancel() {
  pendingCreateExtensionSend.value = null;
  showCreateExtensionDescDialog.value = false;
}

async function onDownloadExtensionFromPanel(payloadJson: string) {
  const payload = parseExtensionFencePayload(payloadJson);
  if (!payload?.assets?.length) {
    console.warn("[ChatPanel] extension download: invalid payload");
    return;
  }
  try {
    const files: Array<{ path: string; content: string | Uint8Array }> = [];
    for (const asset of payload.assets) {
      const row = await getExtensionAsset(asset.id);
      if (!row) {
        throw new Error(`missing asset ${asset.id} (${asset.path})`);
      }
      const buf = new Uint8Array(await row.blob.arrayBuffer());
      files.push({ path: asset.path || row.path, content: buf });
    }
    const zip = buildZipBlob(files);
    // 保留空格与标题原文，仅去掉文件系统非法字符
    const safeName = (payload.name || "doma-extension")
      .replace(/[\/\\:*?"<>|]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "doma-extension";
    triggerBlobDownload(zip, `${safeName}.zip`);
  } catch (e) {
    console.warn("[ChatPanel] extension download failed", e);
  }
}

const skillFileDropActive = ref(false);
let skillFileDropDepth = 0;

function isDragWithDomaSkillFile(e: DragEvent): boolean {
  const dt = e.dataTransfer;
  if (!dt?.types.includes("Files")) return false;
  const items = Array.from(dt.items);
  if (!items.length) return true;
  return items.some((item) => {
    if (item.kind !== "file") return false;
    const file = item.getAsFile();
    return file ? isDomaSkillFile(file) : true;
  });
}

function onMessagesAreaDragEnter(e: DragEvent) {
  if (!isDragWithDomaSkillFile(e)) return;
  skillFileDropDepth += 1;
  skillFileDropActive.value = true;
}

function onMessagesAreaDragOver(e: DragEvent) {
  if (!isDragWithDomaSkillFile(e)) return;
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
  skillFileDropActive.value = true;
}

function onMessagesAreaDragLeave() {
  skillFileDropDepth = Math.max(0, skillFileDropDepth - 1);
  if (skillFileDropDepth === 0) skillFileDropActive.value = false;
}

async function onMessagesAreaSkillFileDrop(e: DragEvent) {
  skillFileDropDepth = 0;
  skillFileDropActive.value = false;
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  const file = files[0]!;
  const text = await readDomaSkillFileText(file);
  if (!text) return;
  dockComposer.openAddSkillDialogWithBody(text);
}

/**
 * 工具栏「写入记忆」：组 interactionBlock 提示，引导模型调用 browser_memory_upsert。
 */
async function onSaveTurnMemoryClick(_currentMsg: ChatMessage) {
  let siteHost: string | undefined;
  try {
    siteHost = await resolveSiteHost();
  } catch {
    siteHost = undefined;
  }

  const scopeLines = siteHost
    ? [
        `- 若与当前站点相关：scope 用 site:${siteHost}；站点习惯 key 可用 site.${siteHost}.{slot}`,
        `- 与站点无关的全局偏好：scope 用 global`,
      ].join("\n")
    : `- scope 默认 global`;

  await send2(`<interactionBlock>
# 最优先使用以下上下文
- 请根据本轮的对话提炼可复用的短偏好/事实
- 必须调用 browser_memory_upsert
- source 固定为 explicit
- 必填：key、content、source、aliases；可选 category / scope
- key 用稳定槽位名（如 locale、reply_style、browser.open_tab_policy）
- content 短句偏好或事实，不要写多步流程
- aliases 必填：用户日后可能用来提起这条记忆的同义词/口语（中英文均可），供本地检索匹配；至少 2 个，勿与 key 重复
${scopeLines}
<doma/>
</interactionBlock>${t("chat.saveTurnMemorySending")}`);
}

function resolveQuotedUserMessageContent(quotedMsgId: string): string {
  const msg = messages.value.find((m) => m.id === quotedMsgId && m.role === "user");
  return msg?.content ? String(msg.content) : "";
}

/** 侧栏消息 → LLM history：展开引用全文（落盘仍只存 id） */
function syncLlmHistoryFromPanelMessages(convId: string) {
  const forLlm = messages.value.map((m) => {
    if (m.role !== "user") return m;
    const content = String(m.content ?? "");
    if (!/<quotedUserMessage\b/i.test(content)) return m;
    return {
      ...m,
      content: expandQuotedUserMessagesInSendText(content, resolveQuotedUserMessageContent),
    };
  });
  llmManager.syncConversationHistory(convId, forLlm);
}

async function onDeleteTurnFromToolbar(currentMsg: ChatMessage) {
  const convId = conversationId.value;
  if (!convId) return;

  const currentIdx = messages.value.findIndex((m) => m.id === currentMsg.id);
  if (currentIdx < 0) return;

  // 本轮从最近一条 user 消息起，到当前工具栏消息止（含中间 tool/assistant）
  const userIdx = findTurnUserMessageIndex(currentIdx);
  const startIdx = userIdx >= 0 ? userIdx : currentIdx;
  const endIdx = currentIdx;
  if (startIdx > endIdx) return;

  const toRemove = messages.value.slice(startIdx, endIdx + 1);
  if (!toRemove.length) return;

  // 只移除本轮，保留之后的轮次
  messages.value = [
    ...messages.value.slice(0, startIdx),
    ...messages.value.slice(endIdx + 1),
  ];
  for (const msg of toRemove) {
    messagePersistQueues.delete(msg.id);
    messagePersistConvById.delete(msg.id);
    try {
      await chatStorage.deleteMessage(msg.id);
    } catch (e) {
      console.warn("[Chat] Failed to delete turn message:", e);
    }
  }

  syncLlmHistoryFromPanelMessages(convId);

  const lastQuestion = resolveConversationLastUserQuestion(messages.value);
  upsertConversationContext({ conversationId: convId, lastUserQuestion: lastQuestion });

  scheduleUserBubbleMinimapLayout();
}

/** 停止任务后写入的 assistant 提示（无 toolBar，需单独露出删除） */
function isTaskStoppedMessage(msg: ChatMessage): boolean {
  if (msg.role !== "assistant") return false;
  const c = String(msg.content ?? "").trim();
  if (!c) return false;
  if (c === t("chat.taskStopped")) return true;
  // 历史落盘可能是另一语言
  return c === "Task stopped" || c === "任务已停止";
}

function findTurnUserMessageIndex(beforeOrAtIdx: number): number {
  for (let i = beforeOrAtIdx; i >= 0; i--) {
    if (messages.value[i]?.role === "user") return i;
  }
  return -1;
}

async function onRetryTurnFromToolbar(currentMsg: ChatMessage) {
  const convId = conversationId.value;
  if (!convId) return;

  if (loading.value) {
    await abortTask();
    await nextTick();
  }

  const currentIdx = messages.value.findIndex((m) => m.id === currentMsg.id);
  if (currentIdx < 0) return;

  const userIdx = findTurnUserMessageIndex(currentIdx);
  if (userIdx < 0) return;

  const userText = String(messages.value[userIdx].content ?? "").trim();
  if (!userText) return;

  const startIdx = userIdx + 1;
  const endIdx = currentIdx;
  if (startIdx > endIdx) return;

  const toRemove = messages.value.slice(startIdx, endIdx + 1);
  messages.value = messages.value.slice(0, startIdx);
  for (const msg of toRemove) {
    messagePersistQueues.delete(msg.id);
    messagePersistConvById.delete(msg.id);
    try {
      await chatStorage.deleteMessage(msg.id);
    } catch (e) {
      console.warn("[Chat] Failed to delete turn message for retry:", e);
    }
  }

  syncLlmHistoryFromPanelMessages(convId);
  upsertConversationContext({ conversationId: convId, lastUserQuestion: userText });
  scheduleUserBubbleMinimapLayout();

  await send2(userText, { resend: true });
}

/**
 * 通过 messageId 原地更新消息（用于进度条、状态流转等）
 * Vue 响应式会自动触发 UI 更新
 */
function updateMessage(messageId: string, patch: Partial<ChatMessage>) {
  const idx = messages.value.findIndex(m => m.id === messageId);
  if (idx === -1) return;
  const msg = messages.value[idx];
  messages.value[idx] = { ...msg, ...patch };
  queueMessagePersist(messageId);
}

function patchProgressByProcessId(processId: string, patch: Partial<ProgressPayload>) {
  const idx = messages.value.findIndex((m) => {
    const ui = m.customUi;
    if (ui?.type !== "PROGRESS") return false;
    return (ui.payload as ProgressPayload).processId === processId;
  });
  if (idx === -1) return;
  const msg = messages.value[idx];
  const ui = msg.customUi!;
  const prevPayload = ui.payload as ProgressPayload;
  const nextPayload: ProgressPayload = {
    ...prevPayload,
    ...(patch.message != null ? { message: patch.message } : {}),
    ...(patch.status != null ? { status: patch.status } : {}),
    ...(patch.errorMessage != null ? { errorMessage: patch.errorMessage } : {}),
  };
  const nextUiStatus =
    nextPayload.status === "completed"
      ? "completed"
      : nextPayload.status === "error"
        ? "error"
        : "active";
  messages.value[idx] = {
    ...msg,
    customUi: {
      ...ui,
      status: nextUiStatus,
      payload: nextPayload,
    },
  };
  queueMessagePersist(msg.id);
}

function patchUserscriptsCustomUi(
  messageId: string,
  patch: (payload: UserscriptsPayload) => UserscriptsPayload,
) {
  const idx = messages.value.findIndex((m) => m.id === messageId);
  if (idx === -1) return;
  const msg = messages.value[idx];
  const ui = msg.customUi;
  if (ui?.type !== "USERSCRIPTS") return;
  const prevPayload = ui.payload as UserscriptsPayload;
  messages.value[idx] = {
    ...msg,
    customUi: {
      ...ui,
      payload: patch(prevPayload),
    },
  };
  queueMessagePersist(messageId);
}

/**
 * 处理 CustomUI 组件发出的用户交互事件
 */
async function handleCustomUIAction(messageId: string, action: string, data: Record<string, unknown>) {
  console.log('[Chat] CustomUI action:', messageId, action, data);

  if (action === 'download_video') {
    const video = data.video as Record<string, unknown>;
    if (!video) return;

    const convId = conversationId.value;
    if (!convId) {
      console.warn("[Chat] download_video: no conversationId");
      return;
    }

    const title =
      typeof video.title === "string" && video.title.trim()
        ? video.title.trim()
        : t("chat.video.unknownTitle");
    const downloadVideo = {
      ...video,
      qualityList: undefined,
      faviconUrl: "",
      poster: "",
    };

    await addMessage(convId, "assistant", t("chat.video.startDownload", { title }));
    try {
      const res = await getContext().browser.runtime.sendMessage({
        origin: "sidepanel",
        operate: "chat/runBrowserTool",
        name: "browser_download_videos",
        toolArgs: {
          conversationId: convId,
          videoInfoList: [downloadVideo],
          timeoutMs: 3_600_000,
        },
      });
      if (!res || (res as { success?: boolean }).success !== true) {
        console.warn("[Chat] download_video tool failed", res);
      }
    } catch (e) {
      console.warn("[Chat] download_video error", e);
    }
    return;
  }

  if (action === 'install_userscript') {
    const downloadUrl = typeof data.downloadUrl === "string" ? data.downloadUrl.trim() : "";
    if (!downloadUrl) return;
    await handleUserscriptInstall(downloadUrl, {
      id: data.id,
      title: data.title,
      description: data.description,
    });
    return;
  }

  if (action === 'toggle_userscript') {
    await handleUserscriptToggle(messageId, data);
    return;
  }

  if (action === 'delete_userscript') {
    await handleUserscriptDelete(messageId, data);
    return;
  }
}

async function handleUserscriptToggle(messageId: string, data: Record<string, unknown>) {
  const uuid = typeof data.uuid === "string" ? data.uuid.trim() : "";
  const activated = data.activated === true;
  if (!uuid) return;

  await toggleUserscript(uuid, activated);

  patchUserscriptsCustomUi(messageId, (payload) => {
    const item =
      payload.activated.find((s) => s.uuid === uuid)
      ?? payload.stopped.find((s) => s.uuid === uuid);
    if (!item) return payload;

    const updated = { ...item, activated };
    const activatedList = payload.activated.filter((s) => s.uuid !== uuid);
    const stoppedList = payload.stopped.filter((s) => s.uuid !== uuid);
    if (activated) {
      activatedList.push(updated);
    } else {
      stoppedList.push(updated);
    }
    return { ...payload, activated: activatedList, stopped: stoppedList };
  });
}

async function handleUserscriptDelete(messageId: string, data: Record<string, unknown>) {
  const uuid = typeof data.uuid === "string" ? data.uuid.trim() : "";
  if (!uuid) return;

  await deleteUserscript(uuid);

  patchUserscriptsCustomUi(messageId, (payload) => ({
    ...payload,
    activated: payload.activated.filter((s) => s.uuid !== uuid),
    stopped: payload.stopped.filter((s) => s.uuid !== uuid),
  }));
}

async function handleUserscriptInstall(
  downloadUrl: string,
  meta: { id?: unknown; title?: unknown; description?: unknown },
) {
  console.log("[Chat] userscript install", { downloadUrl, meta });
  const title = typeof meta.title === "string" && meta.title.trim() ? meta.title.trim() : "用户脚本";
  await send2(
    formatUserMessageForModel({
      segments: [
        { type: "text", text: "安装用户脚本" },
        {
          type: "toolInput",
          block: {
            name: "browser_skill_userscript_install",
            args: {
              downloadUrl,
              title,
              description: typeof meta.description === "string" ? meta.description : "",
            },
            __text: title,
          },
        },
      ],
    }),
  );
}

/** 发送瞬间：浏览器当前激活标签页名片（写入 memoryHooks → interactionBlock） */
async function resolveActiveBrowserTabLite(): Promise<
  | { id?: number; title?: string; url?: string; favIconUrl?: string }
  | undefined
> {
  return resolveActiveBrowserTab();
}

async function resolveActiveTabSnapshot(): Promise<ActiveTabContext | undefined> {
  try {
    const currentTab = await resolveActiveBrowserTabLite();
    if (currentTab) {
      const tabId = typeof currentTab.id === "number" && currentTab.id > 0 ? currentTab.id : undefined;
      const title = typeof currentTab.title === "string" ? currentTab.title.trim() : "";
      const url = typeof currentTab.url === "string" ? currentTab.url.trim() : "";
      if (tabId != null) cachedUserTabId = String(tabId);
      if (url) cachedUserTabUrl = url;
      if (title) cachedUserTabTitle = title;
      if (title || tabId != null) {
        return { tabId, title: title || undefined };
      }
    }
  } catch {
    // fall through to cache
  }
  const cachedId = parseInt(cachedUserTabId, 10);
  const title = (cachedUserTabTitle || "").trim();
  if (!title && !(Number.isFinite(cachedId) && cachedId > 0)) return undefined;
  return {
    tabId: Number.isFinite(cachedId) && cachedId > 0 ? cachedId : undefined,
    title: title || undefined,
  };
}

async function resolveCurrentConversationUrl(): Promise<string> {
  try {
    const currentTab = await resolveActiveBrowserTabLite();
    const url = typeof currentTab?.url === "string" ? currentTab.url.trim() : "";
    if (url) return url;
  } catch {
    // fall through
  }
  return (cachedUserTabUrl || "").trim();
}

async function resolveCurrentConversationHost(): Promise<string> {
  const url = await resolveCurrentConversationUrl();
  return extractHostnameFromUrl(url) || getBestCurrentHost().replace(/^www\./i, "");
}

async function createSingleConversation(conversationId: string, question: string) {
  const currentTab = await resolveActiveBrowserTabLite();
  upsertConversationContext({
    conversationId,
    lastUserQuestion: question,
    ...(typeof currentTab?.id === "number" ? { tabId: currentTab.id } : {}),
    mode: "single",
    tabInfo: {
      url: typeof currentTab?.url === "string" ? currentTab.url : undefined,
      icon: typeof currentTab?.favIconUrl === "string" ? currentTab.favIconUrl : undefined,
    },
  });
}


async function drainEnqueueQueue() {
  const cid = conversationId.value;
  if (!cid || isConversationLoading(cid)) return;
  const next = shiftEnqueueForConversation(cid);
  if (!next) return;
  await send2(next.text);
}

async function onEnqueueSend(item: EnqueueItem) {
  await abortTask();
  await send2(item.text);
}

function onEnqueueRemove(item: EnqueueItem) {
  console.log("[Chat] enqueue remove:", item);
}

async function send2(userText?: string | Event, opts?: Send2Options) {
  const sendDiagT0 = Date.now();
  notePanelActivity("send2");
  logIdleDiag("panel", "send2 enter", {
    hasOptsCid: !!opts?.conversationId,
    resend: !!opts?.resend,
  });
  // 先 ping SW：空闲后无响应时看这里是超时还是 OK-but-slow（冷启动）
  const ping = await pingServiceWorker("send2");
  if (!ping.ok) {
    console.warn("[IDLE-DIAG][panel] send2: SW ping failed — message may hang or drop", ping);
  }

  const gate = await sendEdition.assertCanSend();
  if (!gate.ok) {
    if (gate.action === 'provider-setup') {
      openProviderSetupDialog();
    }
    logIdleDiag("panel", "send2 aborted (gate)", { gate, elapsedMs: Date.now() - sendDiagT0 });
    return;
  }
  const rawText =
    typeof userText === "string" ? userText : dockComposer.buildMessageText();
  if (!rawText) return;

  const activeConvId = opts?.conversationId ?? conversationId.value;
  const isHandoffText = /<doma\s*\/?>/i.test(rawText) || hasInteractionBlockDomaTag(rawText);

  if (activeConvId && isConversationLoading(activeConvId) && !opts?.resend) {
    console.warn("[handoff] send2:skip-loading", {
      cid: activeConvId,
      isHandoffText,
      resend: !!opts?.resend,
      textPreview: rawText.slice(0, 80),
    });
    // 回传被挡住时清掉 pending，避免后续误报 turn:end
    if (isHandoffText) takeHandoffPending(activeConvId);
    return;
  }

  if (typeof userText !== "string" && dockComposer.binding.value.hasPendingUploadFiles) return;
  cancelled.value = false;
  // MCP 外部任务：normalize 会保留 attachedFiles 等富上下文，只重建 mcpCall 块
  let text: string;
  if (hasInteractionBlockMcpCallTag(rawText)) {
    text = normalizeMcpExternalSendText(rawText);
  } else {
    // 发送前：注入当前激活 tab 名片 + 检索本地记忆（memoryHooks）
    let siteHost: string | undefined;
    try {
      siteHost = await resolveSiteHost(opts);
    } catch {
      siteHost = undefined;
    }
    let activeTab: ActiveTabContext | undefined;
    if (!isHandoffText) {
      try {
        activeTab = await resolveActiveTabSnapshot();
      } catch {
        activeTab = undefined;
      }
    }
    const withMemory = await enrichUserSendTextWithMemories(rawText, {
      conversationId: activeConvId,
      siteHost: siteHost || undefined,
      activeTab,
    });
    // 落盘/气泡：只保留 quotedUserMessage id，不展开全文（避免原文 chip 渗进新气泡）
    text = prepareUserSendText(withMemory);
  }
  const llmSendText = expandQuotedUserMessagesInSendText(text, resolveQuotedUserMessageContent);
  const isResend = opts?.resend === true;
  const shouldUpdateQuestionTitle = !shouldHideUserBubble(text);

  // 先确保会话存在，便于 addMessage 落盘
  if (!isResend) {
    const bindCid = opts?.conversationId ?? conversationId.value;
    if (!bindCid) {
      conversationId.value = generateConversationId();
      try {
        const initialQuestion = shouldUpdateQuestionTitle ? rawText : "";
        await createSingleConversation(conversationId.value, initialQuestion);
        await refreshConversationContextList();
        const url = await resolveCurrentConversationUrl();
        await chatStorage.createConversation(conversationId.value, selectedProvider.value, initialQuestion, url);
      } catch (e) {
        console.error("[Chat] Failed to create conversation:", e);
      }
    } else {
      if (shouldUpdateQuestionTitle) {
        upsertConversationContext({
          conversationId: bindCid,
          lastUserQuestion: rawText,
        });
        await refreshConversationContextList();
      }
      try {
        const existing = await chatStorage.getConversation(bindCid);
        if (!existing) {
          const url = await resolveSiteUrl(opts);
          const title = shouldUpdateQuestionTitle
            ? (rawText.length > 30 ? `${rawText.slice(0, 30)}...` : rawText)
            : "";
          await chatStorage.createConversation(bindCid, selectedProvider.value, title, url);
        }
      } catch (e) {
        console.error("[Chat] Failed to ensure conversation:", e);
      }
    }
  }

  // 显式会话时切到该会话（MCP / 定时 / 组会话）
  if (
    opts?.conversationId
    && conversationId.value !== opts.conversationId
  ) {
    conversationId.value = opts.conversationId;
  }

  const persistConvId = opts?.conversationId ?? conversationId.value!;
  if (!persistConvId) return;

  // 用量触顶：先隐藏总结回合，stash 用户原文，总结后再重放
  if (!opts?.skipSummarizeGate && !opts?.summarizeTurn && !opts?.resend) {
    if (shouldTriggerContextSummarize(persistConvId)) {
      pendingSummarizeReplayByConversation.set(persistConvId, rawText);
      summarizeCompactSucceeded.delete(persistConvId);
      return send2(CONTEXT_SUMMARIZE_INTERACTION_BLOCK, {
        ...opts,
        conversationId: persistConvId,
        summarizeTurn: true,
        skipSummarizeGate: true,
      });
    }
  }

  if (!opts?.fromInlineComposer && !isResend) {
    dockComposer.resetAfterSend();
  }

  setConversationLoading(persistConvId, true);

  if (isHandoffText) {
    markHandoffPending(persistConvId, "send2-doma");
  }
  console.log("[handoff] send2:start", {
    cid: persistConvId,
    isHandoffText,
    hasDoma: isHandoffText,
    loading: true,
    textPreview: rawText.slice(0, 80),
  });

  const mcpConversationId =
    typeof opts?.mcpConversationId === "string" ? opts.mcpConversationId.trim() : "";
  let mcpResultReported = false;
  const reportMcpOnce = (
    ok: boolean,
    text: string,
    status: "done" | "error",
  ) => {
    if (!mcpConversationId || mcpResultReported) return;
    mcpResultReported = true;
    reportMcpExternalResult({ conversationId: mcpConversationId, ok, text, status });
  };

  if (!isResend && !opts?.skipUserMessage) {
    // 落盘用 prepare 后的 text，才能带上 Ask 的 <ask/> 等标记供气泡样式检测
    await addMessage(persistConvId, "user", text);
  }

  if (!isResend && shouldUpdateQuestionTitle) {
    try {
      const titleSource =
        stripInteractionBlocksForHistoryUi(rawText).trim() || rawText.trim();
      const latestTitle =
        titleSource.length > 30 ? `${titleSource.slice(0, 30)}...` : titleSource;
      const url = await resolveSiteUrl(opts);
      await chatStorage.updateConversation(persistConvId, {
        title: latestTitle,
        url,
      });

      // group 会话：同步 Chrome 标签组标题为「DomA - 用户问题」
      const groupCtx = getConversationContext(persistConvId);
      if (
        groupCtx?.mode === "group" &&
        typeof groupCtx.groupId === "number" &&
        groupCtx.groupId >= 0 &&
        latestTitle
      ) {
        const groupTitle = formatDomATabGroupTitle(latestTitle);
        const browser = getContext().browser;
        if (browser.tabGroups?.update) {
          await browser.tabGroups.update(groupCtx.groupId, { title: groupTitle });
        }
        upsertConversationContext({
          conversationId: persistConvId,
          groupTitle,
        });
        await refreshConversationContextList();
      }
    } catch (e) {
      console.warn("[Chat] Failed to update conversation latest question title:", e);
    }
  }

  try {

    const abortController = new AbortController();
    const site = await resolveSiteHost(opts);
    abortControllersByConversation.set(persistConvId, abortController);
    // Clear any prior Stop pendingAbort so this turn's Jev/tools can run.
    notifySwResetToolAbort(persistConvId);
    // Pro+Safari：发送后收起页内壳、把手播报；Open / Chrome 侧栏 noop
    safariShellOnUserSend(
      persistConvId,
      stripInteractionBlocksForHistoryUi(rawText).trim() || rawText.trim(),
    );
    logIdleDiag("panel", "send2 → llmManager.sendMessage", {
      cid: persistConvId,
      textLen: llmSendText.length,
      elapsedMsBeforeLlm: Date.now() - sendDiagT0,
      swPingOk: ping.ok,
      swPingMs: ping.elapsedMs,
    });
    llmManager.sendMessage(
      persistConvId,
      llmSendText, {
      skipAppendUserMessage: isResend,
      onConversationStart: (convId) => {
        setConversationLoading(convId, true);
      },
      onTextMessage: (convId, msgId, content) => {
        setConversationThinking(convId, false);
        completeActivityBeforeAnswer(convId);
        if (convId === conversationId.value) {
          activeStreamMsgId.value = msgId;
        }
        upsertAssistantMessage(convId, msgId, content);
      },
      onReasoningMessage: (convId, msgId, content) => {
        appendActivityReasoning(convId, msgId, content);
      },
      onToolCallStart: (convId, msgId, toolCall) => {
        if (activeStreamMsgId.value === msgId) {
          activeStreamMsgId.value = null;
        }
        console.log("[tool debug] onToolCallStart (ChatPanel)", {
          convId,
          msgId,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
        });
        setConversationThinking(convId, false);
        startActivityTool(convId, msgId, toolCall);
        upsertAssistantMessage(convId, msgId, '', {
          id: toolCall.id,
          name: toolCall.function.name,
          state: 'doing',
        } as ChatMessageToolCall);
      },
      onToolCallOverride: async (convId, msgId, toolCall, result) => {
        completeActivityTool(convId, toolCall, result);
        // 只要返回里带了 doma_show_alert 字段，就优先走这个流程（不依赖 truthy）
        if (!!result && typeof result === "object" && "doma_show_alert" in (result as any)) {
          const alert = (result as any).doma_show_alert as { type?: string } | undefined;
          if (alert?.type === "userScripts") {
            openActionModal({
              title: t("chat.actionModal.userScripts.title"),
              buttonText: t("chat.actionModal.userScripts.buttonText"),
              onAction: () => {
                window.open("https://developer.chrome.com/docs/extensions/reference/api/userScripts#enable-user-scripts-api", "_blank");
              },
            });
          } else {
            openProUpgradeActionModal();
          }
          stopTask();
        }
        else{
          if (toolCall.function.name === 'browser_find_videos') {
            const customUI = buildCustomUI(toolCall.function.name, result);
            if (customUI) {
              upsertAssistantMessage(convId, msgId, '', undefined, customUI);
            }

            if ((result as any).ok && (result as any).count > 0) {
              stopTask(t("chat.video.selectToDownload", { count: (result as any).count }));
            }
            else{
                return result;
            }
          }
          else if (toolCall.function.name === 'browser_skill_userscript_fetch') {
            const customUI = buildCustomUI(toolCall.function.name, result);
            if (customUI) {
              upsertAssistantMessage(convId, msgId, '', undefined, customUI);
            }

            if ((result as any).ok && (result as any).userscriptList.length > 0) {
              stopTask(t("chat.userscript.selectToInstall", { count: (result as any).userscriptList.length }));
            }
            else{
              return result;
            }
          }
          else if (toolCall.function.name === 'browser_skill_userscript_list') {
            const customUI = buildCustomUI(toolCall.function.name, result);
            if (customUI) {
              upsertAssistantMessage(convId, msgId, '', undefined, customUI);
            }

            const activatedCount = Array.isArray((result as any).activated) ? (result as any).activated.length : 0;
            const stoppedCount = Array.isArray((result as any).stopped) ? (result as any).stopped.length : 0;
            if ((result as any).ok && activatedCount + stoppedCount > 0) {
              await stopTask(undefined, { skipAssistantMessage: true });
            } else {
              return result;
            }
          }
          else if (
            !!result
            && typeof result === "object"
            && (result as any).ok
            && typeof (result as any).processId === "string"
            && (result as any).processId.trim()
          ) {
            const customUI = buildCustomUI(toolCall.function.name, result);
            if (customUI) {
              upsertAssistantMessage(convId, msgId, '', undefined, customUI);
            }
            await stopTask(undefined, { skipAssistantMessage: true });
          }
        }
        
        return undefined;
      },
      onAfterToolResults: async (convId, results) => {
        const summarized = results.find((r) => r.name === CONTEXT_SUMMARIZE_TOOL_NAME);
        if (!summarized) return false;
        const extracted = extractSummarizedResult(summarized.result);
        if (!extracted.ok) {
          console.warn("[Chat] browser_conversation_summarized failed:", extracted.error);
          return false;
        }
        llmManager.replaceHistoryWithSummary(convId, extracted.summary);
        resetUsageAfterSummarize(convId);
        summarizeCompactSucceeded.add(convId);
        return true;
      },
      onToolCallDone: (convId, msgId, toolCall) => {
        console.log("[tool debug] onToolCallDone (ChatPanel)", {
          convId,
          msgId,
          toolCallId: toolCall.id,
          toolName: toolCall.function.name,
        });
        completeActivityTool(convId, toolCall);
        upsertAssistantMessage(convId, msgId, '', {
          id: toolCall.id,
          name: toolCall.function.name,
          state: 'gone',
        } as ChatMessageToolCall);

        if (toolCall.function.name === "browser_plan") {
          initBrowserPlanFromToolCall(convId, toolCall);
        }
        else if (toolCall.function.name === "browser_step_done") {
          applyBrowserStepDoneFromToolCall(convId, toolCall.function.arguments);
        }
      },
      onMessageStart: (convId, msgId) => {
        if (convId === conversationId.value) {
          activeStreamMsgId.value = msgId;
        }
        if (!isConversationLoading(convId)) return;
        startActivityTrace(convId, msgId);
        setConversationThinking(convId, true);
      },
      onMessageDone: (convId, msgId) => {
        console.log("[Chat] message done:", msgId);
        if (activeStreamMsgId.value === msgId) {
          activeStreamMsgId.value = null;
        }
        setConversationThinking(convId, false);
        if (convId === conversationId.value) {
          void persistMessageNow(msgId);
        }
      },
      onConversationDone: (convId, msgIds) => {
        console.log("[tool debug] onConversationDone", { convId, msgIds });
        activeStreamMsgId.value = null;
        const lastMsgId = msgIds[msgIds.length - 1];
        finishActivityTrace(convId, cancelled.value ? "stopped" : "completed");
        setConversationLoading(convId, false);
        setConversationThinking(convId, false);
        abortControllersByConversation.delete(convId);

        const chunks: string[] = [];
        for (const id of msgIds) {
          const c = getMessageById(id)?.content;
          if (typeof c === "string" && c.trim()) chunks.push(c.trim());
        }
        safariShellOnTurnDone(convId, chunks.join("\n\n"), lastMsgId);

        const onPanel = convId === conversationId.value;
        const wasHandoff = takeHandoffPending(convId);
        if (wasHandoff) {
          let toolCallCount = 0;
          const toolNames: string[] = [];
          for (const msgId of msgIds) {
            const msg = getMessageById(msgId);
            if (!msg?.toolCalls?.length) continue;
            for (const t of msg.toolCalls) {
              if (!t?.name) continue;
              toolCallCount += 1;
              toolNames.push(t.name);
            }
          }
          console.log("[handoff] turn:end", {
            cid: convId,
            toolCallCount,
            toolNames,
            textOnly: toolCallCount === 0,
            msgCount: msgIds.length,
            cancelled: cancelled.value,
          });
        }

        const replayAfterSummarize = pendingSummarizeReplayByConversation.get(convId);
        if (replayAfterSummarize !== undefined) {
          pendingSummarizeReplayByConversation.delete(convId);
          const compacted = summarizeCompactSucceeded.has(convId);
          summarizeCompactSucceeded.delete(convId);
          if (onPanel) {
            clearDoingToolCallsOnMessages(msgIds, convId);
            if (lastMsgId) void persistMessageNow(lastMsgId);
            void flushAllMessagePersists();
          } else {
            void flushAllMessagePersists().then(() => clearDoingToolCallsInIdb(msgIds));
          }
          if (cancelled.value) {
            reportMcpOnce(false, t("chat.taskStopped"), "error");
            void recordScheduledRunResult(convId, msgIds, "cancelled", t("chat.taskStopped"));
            return;
          }
          if (!compacted) {
            console.warn(
              "[Chat] context summarize ended without successful tool; replaying user message anyway",
            );
          }
          void Promise.resolve().then(() =>
            send2(replayAfterSummarize, {
              conversationId: convId,
              skipSummarizeGate: true,
              // 总结重放仍属同一 MCP 任务
              ...(mcpConversationId ? { mcpConversationId } : {}),
            }),
          );
          return;
        }

        if (cancelled.value) {
          reportMcpOnce(false, t("chat.taskStopped"), "error");
          void recordScheduledRunResult(convId, msgIds, "cancelled", t("chat.taskStopped"));
          if (onPanel) {
            clearDoingToolCallsOnMessages(msgIds, convId);
            void flushAllMessagePersists();
          } else {
            void flushAllMessagePersists().then(() => clearDoingToolCallsInIdb(msgIds));
          }
          return;
        }

        const finishTurn = async () => {
          if (onPanel) {
            clearDoingToolCallsOnMessages(msgIds, convId);
            const completedToolCalls: ChatMessageToolCall[] = [];
            for (const msgId of msgIds) {
              const msg = getMessageById(msgId);
              if (msg) {
                msg.toolCalls.forEach((t) => {
                  completedToolCalls.push({
                    id: t.id,
                    name: t.name,
                    state: "visible",
                  } as ChatMessageToolCall);
                });
              }
            }
            const lastMsg = getMessageById(lastMsgId);
            if (lastMsg) {
              lastMsg.toolCalls = completedToolCalls;
              lastMsg.toolBarItems = [
                {
                  type: "copy",
                  msgIds: msgIds,
                } as ChatMessageToolBarItem,
              ];
            }
            if (lastMsgId) await persistMessageNow(lastMsgId);
            await flushAllMessagePersists();
            void drainEnqueueQueue();
          } else {
            await finalizeOffPanelConversationDone(convId, msgIds);
          }

          const assistantText = await collectAssistantTextFromMsgIds(msgIds);

          reportMcpOnce(true, assistantText || "（无助手回复）", "done");
          void recordScheduledRunResult(
            convId,
            msgIds,
            "ok",
            assistantText || "（无助手回复）",
          );
        };
        void finishTurn();
      },
      onMessageError: async (conversationId, msgId, error) => {
        finishActivityTrace(conversationId, "error");
        if (isHttpError(error)) {
          await sendEdition.handleHttpError(
            {
              status: error.status,
              message: error.message,
              headers: error.headers,
            },
            {
              conversationId,
              msgId,
              t: (key) => t(key),
              reportError: (text) => {
                reportMcpOnce(false, text, "error");
                void recordScheduledRunResult(
                  conversationId,
                  msgId ? [msgId] : [],
                  "error",
                  text,
                );
              },
              stopTask,
              discardAssistantMessage: async (id) => {
                await discardAssistantMessageById(conversationId, id);
              },
            },
          );
          return;
        }
        reportMcpOnce(false, error.message, "error");
        void recordScheduledRunResult(conversationId, msgId ? [msgId] : [], "error", error.message);
        stopTask(error.message);
      }
    }, abortController.signal, { siteHost: site });
  } catch (e) {
    if (!cancelled.value) {
      await addMessage(
        persistConvId,
        "assistant",
        `错误: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
    reportMcpOnce(
      false,
      e instanceof Error ? e.message : String(e),
      "error",
    );
    void recordScheduledRunResult(
      persistConvId,
      [],
      "error",
      e instanceof Error ? e.message : String(e),
    );
  }
}


/**
 * 根据工具名和返回结果，判断是否可以生成 custom_ui 组件。
 * 返回 undefined 表示走普通 process 渲染。
 */
function mapInstalledUserScript(raw: Record<string, unknown>) {
  const uuid = typeof raw.uuid === "string" ? raw.uuid.trim() : "";
  if (!uuid) return null;

  const metadata = raw.metadata as Record<string, unknown> | undefined;
  const rawIcon = typeof metadata?.icon === "string" ? metadata.icon.trim() : "";
  const icon =
    rawIcon && rawIcon !== "none" && rawIcon !== "null" && rawIcon !== "undefined"
      ? rawIcon
      : undefined;

  return {
    uuid,
    activated: raw.activated === true,
    title: typeof metadata?.name === "string" && metadata.name.trim() ? metadata.name : "未知用户脚本",
    description: typeof metadata?.description === "string" ? metadata.description : "",
    version: typeof metadata?.version === "string" ? metadata.version : "",
    ...(icon ? { icon } : {}),
  };
}

function mapInstalledUserScriptList(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (item && typeof item === "object" ? mapInstalledUserScript(item as Record<string, unknown>) : null))
    .filter((item): item is NonNullable<ReturnType<typeof mapInstalledUserScript>> => item != null);
}

function buildCustomUI(toolName: string, result: unknown): CustomUI | undefined {
  if (!result || typeof result !== 'object') return undefined;

  const res = result as Record<string, unknown>;

  // browser_find_videos → VIDEO_SELECTOR
  if (toolName === 'browser_find_videos' && res.ok && Array.isArray(res.videos) && res.videos.length > 0) {
    return {
      type: 'VIDEO_SELECTOR',
      status: 'pending',
      payload: {
        videos: res.videos.map((v: Record<string, unknown>, i: number) => ({
          id: i,
          title: (v.title as string) || '未知视频',
          downloadUrl: (v.downloadUrl as string) || '',
          hostUrl: (v.hostUrl as string) || '',
          poster: v.poster as string,
          faviconUrl: v.faviconUrl as string,
          audioUrl: v.audioUrl as string,
          type: v.type as string,
          protect: v.protect as boolean,
          qualityList: v.qualityList as { downloadUrl: string, qualityLabel: string, audioUrl?: string }[],
          videoKey: v.videoKey as string,
          videoUuid: v.videoUuid as string,
          ...v,
        })),
      },
    } as CustomUI;
  }
  else if (toolName === 'browser_skill_userscript_fetch' && res.ok && Array.isArray(res.userscriptList) && res.userscriptList.length > 0) {
    return {
      type: 'USERSCRIPT_SELECTOR',
      status: 'pending',
      payload: {
        userscriptList: res.userscriptList.map((u: Record<string, unknown>, i: number) => ({
          id: i,
          title: (u.title as string) || '未知用户脚本',
          description: (u.desc as string) || '',
          downloadUrl: (u.link as string) || '',
          author: (u.author as string) || '',
          ...u,
        })),
      },
    } as CustomUI;
  }
  else if (res.ok && typeof res.processId === 'string' && res.processId.trim()) {
    return {
      type: 'PROGRESS',
      status: 'active',
      payload: {
        processId: res.processId,
        message: typeof res.message === 'string' && res.message.trim() ? res.message : '处理中…',
        status: 'running',
        ...(typeof res.title === 'string' && res.title.trim() ? { title: res.title } : {}),
      },
    } as CustomUI;
  }
  else if (toolName === 'browser_skill_userscript_list' && res.ok) {
    const activated = mapInstalledUserScriptList(res.activated);
    const stopped = mapInstalledUserScriptList(res.stopped);
    if (activated.length === 0 && stopped.length === 0) return undefined;

    return {
      type: 'USERSCRIPTS',
      status: 'pending',
      payload: {
        activated,
        stopped,
        ...(typeof res.url === "string" && res.url.trim() ? { url: res.url.trim() } : {}),
      },
    } as CustomUI;
  }

  return undefined;
}

defineExpose({
  patchBrowserPlanStepStatus,
  updateBrowserPlanStepStatus,
});
</script>

<style scoped lang="less">
@chat-header-panel-ease: cubic-bezier(0.4, 0, 0.2, 1);

.chat-header-panel-mount {
  display: grid;
  grid-template-rows: 1fr;
}

.chat-header-panel-inner {
  min-height: 0;
  overflow: hidden;
}

.chat-header-panel-enter-active,
.chat-header-panel-leave-active {
  transition:
    grid-template-rows 0.28s @chat-header-panel-ease,
    opacity 0.24s ease;
  overflow: hidden;
}

.chat-header-panel-enter-from,
.chat-header-panel-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.chat-header-panel-enter-to,
.chat-header-panel-leave-from {
  grid-template-rows: 1fr;
  opacity: 1;
}

.chat-header-panel-enter-active .chat-header-panel-inner,
.chat-header-panel-leave-active .chat-header-panel-inner {
  transition: transform 0.28s @chat-header-panel-ease;
}

.chat-header-panel-enter-from .chat-header-panel-inner,
.chat-header-panel-leave-to .chat-header-panel-inner {
  transform: translateY(-6px);
}

@chat-link-color: rgb(54, 116, 239);
@chat-doma-bubble-bg: rgb(200, 242, 255);
@chat-ask-bubble-bg: rgb(220, 242, 220);
@chat-mcp-bubble-bg: rgb(255, 236, 200);
@chat-scheduled-bubble-bg: rgb(255, 228, 235);

.chat-panel {
  display: flex;
  flex-direction: column;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100%;
  max-width: none;
  min-width: 0;
  box-sizing: border-box;
  align-self: stretch;
  background: var(--stay-background);
  color: var(--stay-black, var(--stay-border));
  border-radius: 10px;
  overflow: hidden;
  isolation: isolate;
}

/* Safari 页内壳：圆角由 host 负责，内层再圆会露出白边，且挤裁 header 右上角 */
.chat-panel.chat-panel--safari-shell {
  border-radius: 0;
}

.safari-shell-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 10px 12px 10px 14px;
  background: var(--stay-background, #fff);
  border-bottom: 1px solid var(--stay-border, #e0e0e0);
}

.safari-shell-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.safari-shell-icon.doma-icon {
  display: block;
  width: 18px;
  height: 18px;
  margin-right: 0;
  flex: 0 0 auto;
  background-color: var(--stay-logo, var(--stay-black));
  mask-size: contain;
  mask-repeat: no-repeat;
  mask-position: center;
  -webkit-mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  -webkit-mask-position: center;
}

.safari-shell-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--stay-black, #222);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.safari-panel-close-btn {
  flex: 0 0 auto;
  align-self: center;
  background: none;
  border: none;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  margin: 0;
  cursor: pointer;
  color: var(--stay-black);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  line-height: 0;
  transition:
    color 0.16s ease,
    background 0.16s ease;

  &:hover {
    background: var(--stay-border, #eee);
  }

  .safari-panel-close-icon {
    display: block;
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
  }
}

.chat-header {
  padding: 10px 10px 10px 15px;
  border-bottom: 1px solid var(--stay-border, #e0e0e0);
  background: var(--stay-background, #fff);
  flex-shrink: 0;

  .chat-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* lead 插槽容器：样式在 ChatPanelSlots.pro；此处只保 flex 不撑开 */
  .chat-header-lead {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    line-height: 0;
  }

  .chat-title {
    margin: 0;
    font-size: 1rem;
    flex: 0 0 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0;
  }

  .doma-icon {
    display: block;
    flex: 0 0 auto;
    background-color: var(--stay-logo, var(--stay-black));
    mask-size: contain;
    mask-repeat: no-repeat;
    mask-position: center;
    -webkit-mask-size: contain;
    -webkit-mask-repeat: no-repeat;
    -webkit-mask-position: center;
    height: 24px;
    width: 24px;
    margin-right: 0;
  }

  .chat-header-actions {
    flex: 0 0 auto;
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    padding: 3px;
    border-radius: 10px;
    background: var(--stay-background, #fff);
    border: 1px solid color-mix(in srgb, var(--stay-border, #e0e0e0) 80%, transparent);
  }

  .settings-btn,
  .history-btn,
  .scheduled-btn,
  .new-chat-btn,
  .group-session-btn,
  .dbplus-btn,
  .mcp-btn,
  .header-action-btn {
    flex: 0 0 auto;
    background: none;
    border: none;
    padding: 3px;
    cursor: pointer;
    color: var(--stay-black);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition:
      color 0.16s ease,
      background 0.16s ease;
    position: relative;

    &:hover {
      background: var(--stay-border, #eee);
    }

    &.active {
      background: var(--stay-border);
    }

    .mcp-agent-badge {
      position: absolute;
      min-width: 11px;
      height: 11px;
      padding: 0 2px;
      box-sizing: border-box;
      line-height: 11px;
      text-align: center;
      bottom: -1px;
      right: -1px;
      font-size: 8px;
      font-weight: 700;
      color: #fff;
      background: var(--stay-primary);
      border: none;
      border-radius: 6px;
    }
  }

  .new-chat-btn svg {
    width: 24px;
    height: 24px;
    display: block;
  }

  .group-session-btn {
    &.active {
      color: var(--stay-primary, #6c6ef7);
    }

    svg {
      width: 20px;
      height: 20px;
      display: block;
    }
  }

  .scheduled-btn svg {
    width: 22px;
    height: 22px;
    display: block;
  }

  .settings-btn {
    .brain-icon,
    svg {
      width: 20px;
      height: 20px;
      display: block;
    }
  }

  .dbplus-btn {
    .dbplus-icon,
    svg {
      width: 20px;
      height: 20px;
      display: block;
    }
  }

  .mcp-btn {
    svg {
      width: 16px;
      height: 16px;
      display: block;
    }
  }

  .history-panel {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: min(420px, 55vh);
    padding: 4px 0;
    background: var(--stay-background);
    border-radius: 12px;

    .history-search {
      position: relative;
      margin: 0 4px;
      box-sizing: border-box;
    }

    .history-search-icon {
      position: absolute;
      left: 12px;
      top: 50%;
      z-index: 1;
      display: flex;
      align-items: center;
      flex-shrink: 0;
      color: var(--stay-secondaryFont);
      pointer-events: none;
      transform: translateY(-50%);

      svg {
        width: 16px;
        height: 16px;
        fill: currentColor;
      }
    }

    .history-search-input {
      display: block;
      width: 100%;
      height: 36px;
      min-height: 36px;
      padding: 0 12px 0 36px;
      border-radius: 15px;
      border: 1px solid var(--stay-border);
      background: var(--stay-backgroundSecondary);
      box-sizing: border-box;
      outline: none;
      font-size: var(--stay-text-body);
      line-height: 1.4;
      color: var(--stay-black);
      -webkit-appearance: none;
      appearance: none;

      &::placeholder {
        color: var(--stay-placeholder);
      }

      &::-webkit-search-cancel-button {
        -webkit-appearance: none;
      }
    }

    .history-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 0 4px 4px;

      &::-webkit-scrollbar {
        width: 4px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: var(--stay-border);
        border-radius: 2px;
      }
    }

    .history-date-group {
      & + .history-date-group {
        margin-top: 16px;
      }
    }

    .history-date-label {
      margin: 0 0 10px;
      padding: 0 6px;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--stay-secondaryFont);
      line-height: 1.3;
    }

    .history-date-items {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .history-card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 12px 36px 12px 14px;
      border-radius: 12px;
      background: var(--stay-backgroundTertiary);
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover {
        background: var(--stay-border);
      }

      &.active {
        background: var(--stay-border);
        box-shadow: inset 0 0 0 1.5px var(--stay-primary);
      }
    }

    .history-card-host {
      font-size: 0.6875rem;
      line-height: 1.2;
      color: var(--stay-secondaryFont);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .history-card-question {
      font-size: 0.875rem;
      font-weight: 400;
      line-height: 1.4;
      color: var(--stay-black);
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      word-break: break-word;
    }

    .history-delete-btn {
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--stay-secondaryFont);
      display: flex;
      align-items: center;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.15s, color 0.15s, background 0.15s;

      &:hover {
        color: var(--stay-error);
        background: rgba(231, 76, 60, 0.12);
      }
    }

    .history-card:hover .history-delete-btn {
      opacity: 1;
    }

    .history-empty {
      padding: 28px 12px;
      text-align: center;
      font-size: var(--stay-text-body);
      color: var(--stay-secondaryFont);
    }
  }

  .scheduled-panel {
    padding: 8px 10px 12px;
    max-height: min(52vh, 420px);
    display: flex;
    flex-direction: column;

    .scheduled-scroll {
      display: flex;
      flex-direction: column;
      gap: 10px;
      overflow-y: auto;
      padding: 4px 2px 8px;
    }

    .scheduled-card {
      position: relative;
      align-self: stretch;
      max-width: none;
      margin: 0;
      padding: 10px 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;

      &:hover {
        border-color: transparent;
        cursor: pointer;

        .scheduled-card-chevron {
          color: var(--stay-black, #2f3134);
          opacity: 1;
        }

        .scheduled-card-actions {
          opacity: 1;
          pointer-events: auto;
        }
      }
    }

    .scheduled-card-main {
      flex: 1;
      min-width: 0;
    }

    .scheduled-card-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
      margin-bottom: 4px;
      font-size: 11px;
      color: var(--stay-secondaryFont);
      line-height: 1.3;
    }

    .scheduled-card-next {
      margin-bottom: 6px;
      font-size: 12px;
      font-weight: 500;
      color: var(--stay-black, #2f3134);
      line-height: 1.3;
    }

    .scheduled-card-text {
      margin: 0;
      font-family: inherit;
      font-size: 14px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* 编辑/删除/箭头同一行，与左侧文字垂直居中 */
    .scheduled-card-trailing {
      position: relative;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      align-self: center;
      min-height: 22px;
    }

    .scheduled-card-chevron {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 22px;
      pointer-events: none;
      color: var(--stay-secondaryFont);
      opacity: 0.65;
      transition: color 0.15s, opacity 0.15s;

      :deep(svg) {
        width: 14px;
        height: 14px;
        display: block;
      }
    }

    .scheduled-card-actions {
      position: absolute;
      right: calc(100% + 2px);
      top: 50%;
      transform: translateY(-50%);
      display: flex;
      align-items: center;
      gap: 2px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.15s;
    }

    .scheduled-action-btn {
      background: none;
      border: none;
      padding: 4px;
      cursor: pointer;
      color: var(--stay-secondaryFont);
      display: flex;
      align-items: center;
      border-radius: 4px;
      transition: color 0.15s, background 0.15s;

      :deep(svg) {
        width: 14px;
        height: 14px;
        display: block;
      }

      &:hover {
        color: var(--stay-black);
        background: rgba(0, 0, 0, 0.06);
      }

      &--danger:hover {
        color: var(--stay-error);
        background: rgba(231, 76, 60, 0.12);
      }
    }

    .scheduled-detail-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .scheduled-back-btn {
      background: none;
      border: none;
      padding: 2px 0;
      cursor: pointer;
      color: var(--stay-secondaryFont);
      font-size: 12px;

      &:hover {
        color: var(--stay-black);
      }
    }

    .scheduled-detail-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--stay-black);
    }

    .scheduled-detail-text {
      margin: 0 0 10px;
      padding: 8px 10px;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.4;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--stay-secondaryFont);
      background: rgba(0, 0, 0, 0.03);
      border-radius: 8px;
    }

    .scheduled-run-card {
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--stay-backgroundSecondary, rgba(0, 0, 0, 0.03));
      border: 1px solid var(--stay-border, transparent);
    }

    .scheduled-run-result {
      margin: 0;
      font-family: inherit;
      font-size: 13px;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 160px;
      overflow-y: auto;
    }

    .scheduled-empty {
      padding: 28px 12px;
      text-align: center;
      font-size: var(--stay-text-body);
      color: var(--stay-secondaryFont);
    }
  }
}

@keyframes record-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}

.dbplus-wrap {
  margin-top: 10px;
  padding: 8px 2px;
}

.dbplus-header {
  font-size: 16px;
  font-weight: 700;
  color: var(--stay-black);
}

.dbplus-desc {
  margin-top: 6px;
  font-size: 13px;
  color: #8a8a8a;
  line-height: 1.4;
}

.dbplus-add-btn {
  margin-top: 10px;
  background: var(--stay-primary);
  border: 1px solid var(--stay-primary);
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--stay-white);
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.15s ease;

  &:hover {
    filter: brightness(0.92);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
}

.dbplus-rows {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.dbplus-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dbplus-input {
  flex: 1 1 0;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border);
  background: var(--stay-backgroundSecondary);
  font-size: 13px;
  color: var(--stay-black);
  outline: none;

  &::placeholder {
    color: var(--stay-placeholder);
  }

  &:focus {
    border-color: var(--stay-border);
  }
}

.dbplus-sep {
  flex: 0 0 auto;
  color: #8a8a8a;
  font-size: 13px;
  line-height: 1;
}

.dbplus-del-btn {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid var(--stay-border);
  background: var(--stay-backgroundSecondary);
  color: var(--stay-black);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;

  .dbplus-del-icon,
  svg {
    width: 14px;
    height: 14px;
    display: block;
  }

  &:hover {
    background: var(--stay-backgroundTertiary);
    border-color: var(--stay-border);
    color: var(--stay-black);
  }
}

.settings-panel {
  margin-top: 10px;
  padding: 10px;
  background: var(--stay-backgroundSecondary, #252525);
  border-radius: 8px;
  border: 1px solid var(--stay-border, #333);
  max-height: 300px;
  overflow-y: auto;

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;

    &:last-child {
      margin-bottom: 0;
    }

    label {
      font-size: 0.75rem;
      color: var(--stay-secondaryFont, #999);
    }

    &.hint {
      font-size: 0.7rem;
      color: var(--stay-secondaryFont, #888);
      
      a {
        color: var(--s-main, #07c160);
        text-decoration: none;
        
        &:hover {
          text-decoration: underline;
        }
      }
    }
  }

  .setting-input,
  .setting-select {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--stay-border, #333);
    border-radius: 6px;
    background: var(--stay-background, #1a1a1a);
    color: var(--stay-black);
    font-size: 0.8rem;

    &:focus {
      outline: none;
      border-color: var(--s-main, #07c160);
    }
  }

  .setting-select {
    cursor: pointer;
  }
}

.chat-messages-area {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  position: relative;

  &--skill-drop {
    .chat-messages {
      border-radius: 10px;
    }
  }
}

.chat-messages-scroll-row {
  flex: 1 1 0;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  position: relative;
}

.chat-skill-drop-overlay {
  position: absolute;
  inset: 6px;
  z-index: 6;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: var(--stay-background, #f8f8f6);
  border: 1px dashed var(--stay-black, #2f3134);
  border-radius: 10px;
  box-sizing: border-box;
}

.chat-skill-drop-overlay-text {
  padding: 12px 20px;
  border-radius: 15px;
  background: var(--stay-primary, #3674ef);
  color: #fff;
  border: none;
  font-size: 13px;
  font-weight: 600;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}

.chat-messages {
  flex: 1 1 0;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  padding-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  .scroll-anchor {
    height: 1px;
    flex-shrink: 0;
  }
}

.user-bubble-minimap {
  flex: 0 0 16px;
  width: 16px;
  position: relative;
  margin: 12px 2px 20px 0;
  align-self: stretch;
  pointer-events: none;
}

.user-bubble-minimap-mark {
  position: absolute;
  right: 0;
  width: 8px;
  min-height: 3px;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: var(--stay-border);
  cursor: pointer;
  pointer-events: auto;
  opacity: 0.85;
  transition: opacity 0.15s ease;

  &--doma {
    background: @chat-doma-bubble-bg;
  }

  &--ask {
    background: @chat-ask-bubble-bg;
  }

  &--mcp {
    background: @chat-mcp-bubble-bg;
  }

  &--scheduled {
    background: @chat-scheduled-bubble-bg;
  }

  &:hover {
    opacity: 1;
  }
}

.user-bubble-minimap-tooltip {
  position: fixed;
  z-index: 10000;
  max-width: min(300px, calc(100vw - 24px));
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--stay-border, #c8c8c8);
  background: var(--stay-backgroundSecondary, #f2f2f2);
  color: var(--stay-black);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
  pointer-events: none;
}

.chat-msg {
  max-width: 90%;
  padding: 8px 12px;
  border-radius: 10px;
  align-self: flex-start;
  font-size: 15px;
  color: var(--stay-black);

  &.user {
    align-self: flex-end;
    background: var(--stay-border);
    color: var(--stay-black);
    border: 1px solid transparent;
    box-sizing: border-box;
    cursor: default;
    position: relative;

    &.chat-msg--doma-triggered {
      background: @chat-doma-bubble-bg;
    }

    &.chat-msg--ask-mode {
      background: @chat-ask-bubble-bg;
    }

    &.chat-msg--mcp-call {
      background: @chat-mcp-bubble-bg;
    }

    &.chat-msg--scheduled {
      background: @chat-scheduled-bubble-bg;
    }

    &:not(.chat-msg--inline-editing):hover {
      border-color: var(--stay-black);
      cursor: pointer;
    }

    &.chat-msg--quote-flash {
      animation: chat-msg-quote-flash 1.1s ease;
    }

    /* Hover bridge so the outside quote icon stays reachable */
    &::after {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 100%;
      height: 18px;
    }

    .user-msg-quote-row {
      position: absolute;
      right: 2px;
      top: calc(100% + 2px);
      z-index: 3;
      display: flex;
      justify-content: flex-end;
      margin: 0;
      opacity: 0;
      transition: opacity 0.12s ease;
      pointer-events: none;
    }

    .user-msg-quote-btn {
      flex: 0 0 12px;
      width: 12px;
      height: 12px;
      pointer-events: auto;
      color: var(--stay-secondaryFont, #8a8a8a);

      svg.toolbar-icon {
        width: 11px;
        height: 11px;
      }

      &:hover {
        color: var(--stay-black);
      }
    }

    &:hover .user-msg-quote-row,
    &:focus-within .user-msg-quote-row {
      opacity: 1;
      pointer-events: auto;
    }
  }

  .chat-msg-doma-badge,
  .chat-msg-mcp-badge,
  .chat-msg-scheduled-badge {
    position: absolute;
    top: -8px;
    right: 8px;
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid rgba(0, 0, 0, 0.12);
    color: var(--stay-black);
    font-size: 10px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: 0.02em;
    pointer-events: none;
    user-select: none;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chat-msg-doma-badge {
    background: @chat-doma-bubble-bg;
  }

  .chat-msg-mcp-badge {
    background: @chat-mcp-bubble-bg;
  }

  .chat-msg-scheduled-badge {
    background: @chat-scheduled-bubble-bg;
  }

  &.assistant {
    align-self: stretch;
    width: calc(100% - 20px);
    margin: 0 10px;
    max-width: none;
    padding: 0;
    border-radius: 0;
    background: transparent;
    border: 0;

    :deep(.custom-ui-wrapper) {
      margin-top: 12px;
    }

    &.plan-questions-msg {
      margin-top: 8px;
    }

    .msg-task-stopped-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      width: 100%;
      min-height: 16px;
    }

    .msg-task-stopped-text {
      flex: 1 1 auto;
      min-width: 0;
    }

    :deep(.tool-progress .tp-message),
    :deep(.tool-thinking .tt-body),
    :deep(.tool-thinking .tt-line),
    :deep(.tool-thinking .tt-title),
    :deep(.tool-thinking .tt-placeholder) {
      color: var(--stay-secondaryFont, #8a8a8a);
    }

    :deep(.tool-thinking .tt-body) {
      max-height: calc(1.4em * 5);
      max-height: 5lh;
    }
  }

  .msg-content {
    margin: 0;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;

    :deep(a.chat-bubble-link),
    :deep(a.chat-doma-link) {
      &,
      &:link,
      &:visited {
        color: @chat-link-color !important;
        -webkit-text-fill-color: @chat-link-color;
      }
    }

    :deep(a.chat-doma-link) {
      text-decoration: underline;
      text-decoration-color: var(--stay-border);
      cursor: pointer;
      transition: text-decoration-color 0.15s ease;
    }

    :deep(a.chat-doma-link:hover) {
      text-decoration-color: @chat-link-color;
    }

    :deep(a.chat-bubble-link:not(.chat-doma-link)) {
      font-weight: 400;
      text-decoration: none;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--stay-border);
      padding-bottom: 1px;
      cursor: pointer;
      word-break: break-word;
      transition: border-bottom-color 0.15s ease;
    }

    :deep(a.chat-bubble-link:not(.chat-doma-link)::after) {
      content: "↗";
      display: inline-block;
      margin-left: 6px;
      font-size: 0.95em;
      line-height: 1;
      color: @chat-link-color;
      transform: translateY(-1px);
    }

    :deep(a.chat-bubble-link:not(.chat-doma-link):hover) {
      border-bottom-color: @chat-link-color;
    }
  }

  &.user.chat-msg--inline-editing {
    padding: 0;
    box-sizing: border-box;
    border: 1px solid var(--stay-black);
  }

  .user-bubble-inline-composer {
    margin: 0;
    min-width: 200px;
    width: 100%;
  }

  /* 用户气泡内 primarySubject chip（v-html 子节点无 scoped 标记，需 :deep） */
  &.user .msg-content {
    &--click-edit {
      cursor: inherit;
    }

    :deep(.bubble-files) {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0 0 6px 0;
      user-select: none;
    }

    :deep(.bubble-file-pill) {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: min(420px, 100%);
      padding: 6px 8px;
      border-radius: 10px;
      border: 1px solid var(--stay-border);
      background: var(--stay-backgroundTertiary);
      color: var(--stay-black);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      box-sizing: border-box;
    }

    :deep(.bubble-file-pill.has-preview) {
      gap: 8px;
      padding: 6px 8px 6px 6px;
    }

    :deep(.bubble-file-thumb-wrap) {
      position: relative;
      flex: 0 0 auto;
      width: 40px;
      height: 40px;
      border-radius: 6px;
      overflow: hidden;
      background: rgba(47, 49, 52, 0.06);
    }

    :deep(.bubble-file-thumb) {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    :deep(.bubble-file-info) {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
      flex: 1 1 auto;
    }

    :deep(.bubble-file-name) {
      min-width: 0;
      max-width: 280px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 13px;
      font-weight: 500;
    }

    :deep(.bubble-file-meta) {
      flex: 0 0 auto;
      font-size: 12px;
      color: rgba(47, 49, 52, 0.62);
    }

    :deep(.copy-selection-chip.copy-selection-chip--bubble) {
      display: inline-flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      gap: 6px 8px;
      margin: 0 6px 4px 0;
      vertical-align: middle;
      width: max-content;
      max-width: min(380px, 100%);
      min-width: 0;
      padding: 0 8px 0 3px;
      border-radius: 5px;
      border: 1px solid var(--stay-border);
      background: var(--stay-backgroundTertiary);
      color: var(--stay-black);
      font-size: 13px;
      line-height: 1;
      min-height: 22px;
      font-family: inherit;
      box-sizing: border-box;
      overflow: hidden;
      cursor: pointer;
      transition:
        background 0.15s ease,
        border-color 0.15s ease,
        box-shadow 0.15s ease;

      &:hover {
        background: var(--stay-border);
        border-color: var(--stay-secondaryFont);
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
      }
    }

    :deep(.copy-selection-chip--bubble .copy-selection-chip-leading) {
      display: inline-flex;
      flex-direction: row;
      flex-wrap: nowrap;
      align-items: center;
      justify-content: center;
      gap: 2px;
      flex: 0 0 auto;
      line-height: 1;
    }

    :deep(.copy-selection-chip--bubble .copy-selection-chip-text) {
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      font-size: 13px;
      line-height: 1.3;
      font-weight: 400;
      color: var(--stay-black);
      white-space: normal;
      word-break: break-word;
    }

    :deep(.copy-selection-chip--bubble .copy-selection-chip-favicon) {
      width: 12px;
      height: 12px;
      max-width: 12px;
      max-height: 12px;
      border-radius: 3px;
      flex: 0 0 12px;
      object-fit: contain;
      display: block;
      margin: 0;
      box-sizing: border-box;
    }

    :deep(.copy-selection-chip.tab-mention-chip--bubble) {
      border-color: var(--stay-black);
      cursor: default;

      &:hover {
        border-color: var(--stay-black);
      }
    }

    :deep(.slash-command-chip--bubble) {
      display: inline-flex;
      vertical-align: baseline;
      align-items: center;
      max-width: 100%;
      margin: 1px 2px 1px 0;
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid var(--stay-commandChipBorder, #3674f0);
      background: var(--stay-commandChipBg, #ebf1fe);
      color: var(--stay-commandChipText, #3674f0);
      font-size: 13px;
      line-height: 1.3;
      box-sizing: border-box;
      overflow: hidden;
      min-width: 0;
    }

    :deep(.slash-command-chip--bubble .slash-command-chip-text) {
      color: var(--stay-commandChipText, #3674f0);
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      max-width: 100%;
    }

    :deep(.quote-msg-chip--bubble) {
      cursor: pointer;
      max-width: min(100%, 240px);
    }
  }

  .msg-actions {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .msg-actions-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    min-height: 16px;
  }

  .msg-actions-row-start {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .msg-actions-row-end {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .msg-action-icon-btn {
    flex: 0 0 16px;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    margin: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
    line-height: 0;
    transition: opacity 0.15s ease;

    svg {
      width: 15px;
      height: 15px;
      display: block;
    }

    svg.toolbar-icon {
      width: 14px;
      height: 14px;
    }

    svg.checkmark {
      width: 11px;
      height: 11px;
    }
  }

  .toolbar-btn {
    color: var(--stay-black);

    &:hover:not(:disabled) {
      opacity: 0.72;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  }

  .msg-turn-memory-btn,
  .msg-turn-delete-btn {
    flex: 0 0 16px;
    color: var(--stay-black);
    transition: opacity 0.15s ease, color 0.15s ease;

    &:hover:not(:disabled) {
      opacity: 0.72;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.35;
    }
  }

  .msg-turn-memory-btn {
    flex: 0 0 18px;
    width: 18px;
    height: 18px;

    svg {
      width: 18px;
      height: 18px;
    }
  }

  .msg-toolbar {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    min-width: 0;
    line-height: 0;
  }

  .toolcall-header {
    display: inline-flex;
    align-items: center;
    flex: 0 0 auto;
    min-width: 0;
    font-size: var(--stay-text-footnote);
    font-weight: 400;
    color: var(--stay-secondaryFont);
    line-height: 16px;
  }

  .toolcall-aggregate {
    border: 0;
    background: transparent;
    padding: 0;
    font: inherit;
    color: inherit;
    font-weight: 400;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
  }

  .toolcall-aggregate--static {
    cursor: default;
  }

  .toolcall-calling {
    font-weight: 600;
  }

  .toolcall-summary {
    font-size: var(--stay-text-body);
    font-weight: 600;
    color: var(--stay-black);
    line-height: 16px;
  }

  .toolcall-aggregate .chevron {
    width: 11px;
    height: 11px;
    transition: transform 0.18s ease;
    transform: rotate(0deg);
    opacity: 1;
  }

  .toolcall-aggregate .chevron.expanded {
    transform: rotate(90deg);
  }

  .toolcall-list {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .toolcall-item {
    font-size: 13px;
    font-weight: 600;
    color: var(--stay-black);

    &--doing {
      font-weight: 400;
      color: var(--stay-secondaryFont);
    }
  }

  .loading-dots {
    animation: blink 1s infinite;
  }
}

.process-group {
  align-self: flex-start;
  width: 100%;
  max-width: 90%;
  min-height: 44px;
  box-sizing: border-box;
  background: var(--stay-backgroundSecondary, #252525);
  border: 1px solid var(--stay-border, #333);
  border-radius: 10px;
  overflow: hidden;
  font-size: 16px;

  &.executing {
    border-color: var(--s-main, #07c160);
    box-shadow: 0 0 0 1px rgba(7, 193, 96, 0.2);
  }

  .process-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.03);
    
    &:hover {
      background: rgba(255, 255, 255, 0.06);
    }
  }

  .expand-icon {
    transition: transform 0.2s;
    opacity: 0.6;
    flex-shrink: 0;
    
    &.expanded {
      transform: rotate(90deg);
    }
  }

  .process-title {
    color: var(--stay-secondaryFont, #999);
    font-size: var(--stay-text-footnote, 12px);
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .executing-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    background: var(--s-main, #07c160);
    border-radius: 50%;
    animation: pulse 1.2s ease-in-out infinite;
  }

  .process-list {
    padding: 0 12px 8px;
    max-height: 400px;
    overflow-y: auto;
    
    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-track {
      background: transparent;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--stay-border, #444);
      border-radius: 2px;
    }
  }

  .process-item {
    margin: 4px 0;
    background: rgba(255, 255, 255, 0.02);
    border-radius: 6px;
    overflow: hidden;
    
    &:first-child {
      margin-top: 0;
    }
  }

  .process-step-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    cursor: pointer;
    transition: background 0.2s;
    
    &:hover {
      background: rgba(255, 255, 255, 0.04);
    }
  }

  .step-number {
    font-size: var(--stay-text-footnote, 12px);
    font-weight: 500;
    color: var(--s-main, #07c160);
    background: rgba(7, 193, 96, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .step-tool {
    flex: 1;
    font-size: var(--stay-text-footnote, 12px);
    color: var(--stay-secondaryFont, #8a8a8a);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .step-expand-icon {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.2s;
    
    &.expanded {
      transform: rotate(180deg);
    }
  }

  .process-content-wrapper {
    padding: 0 10px 8px;
    animation: slideDown 0.2s ease-out;
  }

  .process-content {
    margin: 0;
    font-size: var(--stay-text-footnote, 12px);
    font-family: inherit;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--stay-secondaryFont, #8a8a8a);
    background: rgba(0, 0, 0, 0.2);
    padding: 8px;
    border-radius: 4px;
    line-height: 1.5;
    max-height: none;
    overflow: visible;
  }

  .process-content-wrapper :deep(.tool-progress .tp-message),
  .process-content-wrapper :deep(.tool-thinking .tt-body),
  .process-content-wrapper :deep(.tool-thinking .tt-line),
  .process-content-wrapper :deep(.tool-thinking .tt-title),
  .process-content-wrapper :deep(.tool-thinking .tt-placeholder) {
    color: var(--stay-secondaryFont, #8a8a8a);
  }

  .process-content-wrapper :deep(.tool-thinking .tt-body) {
    max-height: 5lh;
  }
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.5;
    transform: scale(0.8);
  }
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

@keyframes chat-msg-quote-flash {
  0% {
    box-shadow: 0 0 0 0 rgba(54, 116, 240, 0.55);
    border-color: rgba(54, 116, 240, 0.85);
  }
  100% {
    box-shadow: 0 0 0 10px rgba(54, 116, 240, 0);
    border-color: transparent;
  }
}

.chat-input-row {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
  overflow: visible;

  .composer-modal-anchor {
    position: relative;
    overflow: visible;
  }

  .composer-stack {
    display: flex;
    flex-direction: column;
    gap: 0;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--stay-border, #333);
    border-radius: 14px;
    overflow: hidden;
    background: var(--stay-backgroundSecondary, #252525);

    :deep(.host-row) {
      width: 100%;
    }

    :deep(.picker-shell) {
      flex-shrink: 0;
    }

    :deep(.message-enqueue-panel) {
      flex-shrink: 0;
    }
  }

  .host-row {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0;
  }

  .conversation-select {
    width: 100%;
    height: 30px;
    padding: 0 8px;
    border-radius: 8px;
    border: 1px solid var(--stay-border, #333);
    background: var(--stay-backgroundSecondary, #252525);
    color: var(--stay-fontColor, #ddd);
    font-size: 12px;
    outline: none;
  }

  .conversation-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  // .stop-btn：旧类名占位（已废弃），避免空 ruleset 触发 less 警告
}

.composer-image-preview-overlay {
  position: absolute;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.72);
}

.composer-image-preview-dialog {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  max-width: min(96vw, 960px);
  max-height: 90vh;
}

.composer-image-preview-close {
  position: absolute;
  top: -12px;
  right: -12px;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #222;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);

  &:hover {
    background: #fff;
  }
}

.composer-image-preview-img {
  display: block;
  max-width: 100%;
  max-height: min(calc(100vh - 120px), calc(100% - 56px));
  object-fit: contain;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

.composer-image-preview-caption {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.88);
  text-align: center;
}

</style>
