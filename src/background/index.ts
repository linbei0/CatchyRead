import browser from 'webextension-polyfill';

import { ensureTabReadyAndToggle } from '@/background/activation';
import { handleRuntimeMessage } from '@/background/handlers';
import {
  fetchRemoteTtsAudio,
  fetchRewriteSegments,
  testProviderConnectivity
} from '@/lib/providers/openaiCompatible';
import { TaskQueue } from '@/lib/request/task-queue';
import type { RuntimeMessage } from '@/lib/shared/messages';
import { loadSettings, saveSettings } from '@/lib/storage/settings';
import { updateUiPreferences } from '@/lib/storage/ui-preferences';

const llmQueue = new TaskQueue({ timeoutMs: 30000, maxRetries: 1 });
const ttsQueue = new TaskQueue({ timeoutMs: 45000, maxRetries: 1 });
const connectivityQueue = new TaskQueue({ timeoutMs: 15000, maxRetries: 0 });

const runtimeMessageDependencies = {
  openOptionsPage: () => browser.runtime.openOptionsPage(),
  loadSettings,
  saveSettings,
  fetchRewriteSegments: (...args: Parameters<typeof fetchRewriteSegments>) =>
    llmQueue.enqueue(`rewrite:${JSON.stringify(args[1])}:${JSON.stringify(args[2])}`, () => fetchRewriteSegments(...args)),
  fetchRemoteTtsAudio: (...args: Parameters<typeof fetchRemoteTtsAudio>) =>
    ttsQueue.enqueue(`tts:${args[1]}:${args[2].voiceId || ''}:${args[2].rate}`, () => fetchRemoteTtsAudio(...args)),
  testProviderConnectivity: (providerKind: 'llm' | 'tts') =>
    connectivityQueue.enqueue(`connectivity:${providerKind}`, () => testProviderConnectivity(providerKind)),
  updateUiPreferences
};

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

browser.action.onClicked.addListener(async () => {
  await sendToggleToActiveTab();
});

browser.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle_player') {
    await sendToggleToActiveTab();
  }
});

browser.runtime.onMessage.addListener(async (message: unknown) => {
  return handleRuntimeMessage(message as RuntimeMessage, runtimeMessageDependencies);
});
