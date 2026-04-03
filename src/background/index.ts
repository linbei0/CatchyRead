import browser from 'webextension-polyfill';

import { handleRuntimeMessage } from '@/background/handlers';
import {
  fetchRemoteTtsAudio,
  fetchRewriteSegments,
  testProviderConnectivity
} from '@/lib/providers/openaiCompatible';
import type { RuntimeMessage } from '@/lib/shared/messages';
import { loadSettings, saveSettings } from '@/lib/storage/settings';

const runtimeMessageDependencies = {
  openOptionsPage: () => browser.runtime.openOptionsPage(),
  loadSettings,
  saveSettings,
  fetchRewriteSegments,
  fetchRemoteTtsAudio,
  testProviderConnectivity
};

async function sendToggleToActiveTab(): Promise<void> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs[0];
  if (!activeTab?.id) {
    return;
  }
  await browser.tabs.sendMessage(activeTab.id, { type: 'catchyread/toggle-player' } satisfies RuntimeMessage);
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
