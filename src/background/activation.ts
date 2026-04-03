import type { RuntimeMessage } from '@/lib/shared/messages';

const TOGGLE_MESSAGE: RuntimeMessage = { type: 'catchyread/toggle-player' };

export interface TabActivationDependencies {
  sendMessage: (tabId: number, message: RuntimeMessage) => Promise<void>;
  executeScript: (tabId: number) => Promise<void>;
}

function isMissingReceiverError(error: unknown): boolean {
  return error instanceof Error
    && /(Receiving end does not exist|Could not establish connection|message port closed)/i.test(error.message);
}

export async function ensureTabReadyAndToggle(tabId: number, deps: TabActivationDependencies): Promise<void> {
  try {
    await deps.sendMessage(tabId, TOGGLE_MESSAGE);
  } catch (error) {
    if (!isMissingReceiverError(error)) {
      throw error;
    }
    await deps.executeScript(tabId);
    await deps.sendMessage(tabId, TOGGLE_MESSAGE);
  }
}
