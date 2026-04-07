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
import type { ProviderConfig, RewriteRequestPayload } from '@/shared/types';
import { loadSitePlaybackPreferences, saveSitePlaybackPreferences } from '@/lib/storage/site-playback-preferences';
import { loadSettings, saveSettings } from '@/lib/storage/settings';
import { updateUiPreferences } from '@/lib/storage/ui-preferences';

const llmQueue = new TaskQueue({ timeoutMs: 120000, maxRetries: 0 });
const ttsQueue = new TaskQueue({ timeoutMs: 45000, maxRetries: 1 });
const connectivityQueue = new TaskQueue({ timeoutMs: 15000, maxRetries: 0 });

function buildRewriteQueueKey(provider: ProviderConfig, payload: RewriteRequestPayload): string {
  const policyFingerprint = [
    payload.policy.codeStrategy || 'summary',
    payload.policy.outputLanguage,
    payload.policy.outputLocale || '',
    payload.policy.maxSegmentChars || 220,
    payload.policy.tone
  ].join(':');

  return [
    'rewrite',
    payload.requestId,
    provider.providerId,
    provider.baseUrl,
    provider.modelOrVoice,
    payload.snapshotRevision,
    policyFingerprint
  ].join(':');
}

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
  sitePlaybackPreferencesRepository: {
    load: loadSitePlaybackPreferences,
    save: saveSitePlaybackPreferences
  },
  providerGateway: {
    rewrite: (provider, payload) =>
      llmQueue.enqueue(buildRewriteQueueKey(provider, payload), (signal) =>
        fetchRewriteSegments(provider, payload, fetch, signal)
      ),
    cancelRewrite: async (requestId) => {
      llmQueue.cancelByPrefix(`rewrite:${requestId}:`, new Error('Rewrite cancelled by newer request.'));
    },
    synthesizeRemote: (provider, payload) =>
      ttsQueue.enqueue(`tts:${payload.text}:${payload.voiceId || ''}:${payload.rate}`, (signal) =>
        fetchRemoteTtsAudio(provider, payload.text, { voiceId: payload.voiceId, rate: payload.rate }, fetch, signal)
      ),
    previewTtsSample: (provider, text) =>
      ttsQueue.enqueue(`preview:${text}:${provider.voiceId || ''}`, (signal) =>
        fetchRemoteTtsAudio(provider, text, { voiceId: provider.voiceId, rate: 1 }, fetch, signal)
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
