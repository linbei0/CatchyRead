import browser from 'webextension-polyfill';

import { ensureTabReadyAndToggle } from '@/background/activation';
import { createRuntimeMessageRouter } from '@/background/runtime-message-router';
import {
  fetchRemoteTtsAudio,
  fetchRewriteSegments,
  testProviderConnectivity
} from '@/lib/providers/openaiCompatible';
import { TaskQueue } from '@/lib/request/task-queue';
import type { RuntimeMessage } from '@/shared/messages';
import { loadSettings, saveSettings } from '@/lib/storage/settings';
import { updateUiPreferences } from '@/lib/storage/ui-preferences';

const llmQueue = new TaskQueue({ timeoutMs: 30000, maxRetries: 1 });
const ttsQueue = new TaskQueue({ timeoutMs: 45000, maxRetries: 1 });
const connectivityQueue = new TaskQueue({ timeoutMs: 15000, maxRetries: 0 });

function isInjectableUrl(url?: string): boolean {
  if (!url) {
    return false;
  }
  return /^(https?:|file:)/i.test(url);
}

async function sendToggleToActiveTab(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id || !isInjectableUrl(activeTab.url)) {
    return;
  }
  await ensureTabReadyAndToggle(activeTab.id, {
    sendMessage: async (tabId, message) => {
      await browser.tabs.sendMessage(tabId, message);
    },
    executeScript: async (tabId) => {
      await browser.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
    }
  });
}

const router = createRuntimeMessageRouter({
  openOptionsPage: () => browser.runtime.openOptionsPage(),
  settingsRepository: {
    load: loadSettings,
    save: saveSettings
  },
  uiPreferencesRepository: {
    update: updateUiPreferences
  },
  providerGateway: {
    rewrite: (provider, payload) =>
      llmQueue.enqueue(`rewrite:${JSON.stringify(payload.blocks)}:${JSON.stringify(payload.policy)}`, () =>
        fetchRewriteSegments(provider, payload.blocks, payload.policy)
      ),
    synthesizeRemote: (provider, payload) =>
      ttsQueue.enqueue(`tts:${payload.text}:${payload.voiceId || ''}:${payload.rate}`, () =>
        fetchRemoteTtsAudio(provider, payload.text, { voiceId: payload.voiceId, rate: payload.rate })
      ),
    previewTtsSample: (provider, text) =>
      ttsQueue.enqueue(`preview:${text}:${provider.voiceId || ''}`, () =>
        fetchRemoteTtsAudio(provider, text, { voiceId: provider.voiceId, rate: 1 })
      ),
    testConnectivity: (providerKind) =>
      connectivityQueue.enqueue(`connectivity:${providerKind}`, () => testProviderConnectivity(providerKind))
  }
});

browser.action.onClicked.addListener(async () => {
  await sendToggleToActiveTab();
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_player') {
    await sendToggleToActiveTab();
  }
});

browser.runtime.onMessage.addListener(async (message: unknown) => {
  return router(message as RuntimeMessage);
});
