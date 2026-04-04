import browser from 'webextension-polyfill';

import { buildSuccessNotice } from '@/lib/ui/feedback';
import { buildSettingsFormState, readSettingsFromForm } from '@/domain/options/settings-form-state';
import { PreviewAudioSession } from '@/infra/options/preview-audio-session';
import { OptionsMessageGateway } from '@/infra/runtime/options-message-gateway';
import { DEFAULT_SETTINGS } from '@/shared/default-settings';
import type { AppSettings, ProviderTestResult, UserNotice } from '@/shared/types';
import { OptionsView } from '@/ui/options/options-view';
import { ProviderConfigController } from '@/app/options/provider-config-controller';

function noticeFromProviderResult(result: ProviderTestResult): UserNotice {
  return {
    category: result.category,
    title: result.title,
    message: result.message,
    recommendedAction: result.recommendedAction,
    debugDetails: result.debugDetails,
    canRetry: result.canRetry
  };
}

class OptionsApp {
  private readonly view = new OptionsView(document);
  private readonly gateway = new OptionsMessageGateway((message) => browser.runtime.sendMessage(message));
  private readonly previewAudio = new PreviewAudioSession();
  private readonly providerController = new ProviderConfigController(this.gateway);

  private currentSettings: AppSettings = DEFAULT_SETTINGS;
  private apiKeyVisibility: Record<'llm' | 'tts', boolean> = {
    llm: false,
    tts: false
  };
  private providerResults: Partial<Record<'llm' | 'tts', ProviderTestResult>> = {};
  private previewReady = false;

  constructor() {
    this.view.bind({
      onSave: () => void this.saveCurrentSettings(),
      onReset: () => this.resetToDefaults(),
      onFormChange: (event) => this.handleFormChange(event),
      onFormClick: (event) => this.handleFormClick(event)
    });
    window.addEventListener('beforeunload', () => {
      this.previewAudio.release();
    });
    void this.load();
  }

  private render(): void {
    this.view.render({
      settings: this.currentSettings,
      formState: buildSettingsFormState(this.currentSettings),
      apiKeyVisibility: this.apiKeyVisibility,
      providerResults: this.providerResults,
      previewReady: this.previewReady
    });
  }

  private async load(): Promise<void> {
    this.currentSettings = await this.gateway.loadSettings();
    this.render();
    this.view.renderNotice({
      category: 'info',
      title: '先测试声音服务',
      message: '',
      recommendedAction: ''
    });
  }

  private readCurrentForm(): AppSettings {
    return readSettingsFromForm(this.view.getForm(), this.currentSettings.ui);
  }

  private async saveCurrentSettings(): Promise<void> {
    try {
      const saved = await this.providerController.saveSettings(this.readCurrentForm());
      this.currentSettings = saved;
      this.render();
      this.view.renderNotice(this.providerController.buildSaveSuccessNotice());
    } catch (error) {
      this.view.renderNotice(this.providerController.mapError(error, 'save-settings'));
    }
  }

  private resetToDefaults(): void {
    this.providerResults.llm = undefined;
    this.providerResults.tts = undefined;
    this.previewReady = false;
    this.previewAudio.release();
    this.currentSettings = DEFAULT_SETTINGS;
    this.render();
    this.view.renderNotice({
      category: 'info',
      title: '已恢复默认值',
      message: '表单已经回到初始状态，但还没有写入本地存储。',
      recommendedAction: '确认没问题后点“保存设置”，或重新填写后再测试。'
    });
  }

  private handleFormChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (target instanceof HTMLInputElement) {
      const providerKind = target.dataset.toggleApiKey;
      if (providerKind === 'llm' || providerKind === 'tts') {
        this.apiKeyVisibility[providerKind] = target.checked;
        this.currentSettings = this.readCurrentForm();
        this.render();
        return;
      }
    }
    if (target instanceof HTMLSelectElement && target.name === 'tts.providerId') {
      this.currentSettings = this.providerController.applyTtsPreset(this.readCurrentForm(), target.value);
      this.previewReady = false;
      this.providerResults.tts = undefined;
      this.render();
      return;
    }
    this.currentSettings = this.readCurrentForm();
  }

  private handleFormClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const testButton = target.closest<HTMLButtonElement>('.test-provider-button');
    if (testButton) {
      const providerKind = testButton.dataset.providerKind;
      if (providerKind === 'llm' || providerKind === 'tts') {
        void this.testProvider(providerKind);
      }
      return;
    }

    if (target.closest<HTMLButtonElement>('#preview-tts-sample')) {
      void this.previewTtsSample();
    }
  }

  private async testProvider(providerKind: 'llm' | 'tts'): Promise<void> {
    try {
      this.view.renderNotice({
        category: 'info',
        title: providerKind === 'tts' ? '正在测试声音服务' : '正在测试智能整理',
        message: 'CatchyRead 正在验证服务地址、鉴权和返回格式。',
        recommendedAction: '请稍等，测试完成后我会告诉你下一步该做什么。'
      });
      const result = await this.providerController.testProvider(providerKind, this.readCurrentForm());
      this.providerResults[providerKind] = result;
      this.previewReady = providerKind === 'tts' ? result.ok : this.previewReady;
      this.currentSettings = this.readCurrentForm();
      this.render();
      this.view.renderNotice(noticeFromProviderResult(result));
    } catch (error) {
      this.view.renderNotice(this.providerController.mapError(error, 'test-provider'));
    }
  }

  private async previewTtsSample(): Promise<void> {
    try {
      this.view.renderNotice({
        category: 'info',
        title: '正在准备试听',
        message: '我会生成一小段样音，帮你确认现在的声音风格和音色。',
        recommendedAction: '如果这次试听满意，就可以回到播放器正式开始收听。'
      });
      const saved = await this.providerController.saveSettings(this.readCurrentForm());
      this.currentSettings = saved;
      const payload = await this.gateway.previewSample('你好，这里是 CatchyRead。现在开始为你朗读这一页的重点。');
      await this.previewAudio.play(payload);
      this.view.renderNotice(buildSuccessNotice('试听已开始', '如果这段声音听起来对了，播放器里也会使用同一套配置。', '满意的话，现在就可以回到页面开始收听。'));
    } catch (error) {
      this.view.renderNotice(this.providerController.mapError(error, 'preview-sample'));
    }
  }
}

new OptionsApp();
