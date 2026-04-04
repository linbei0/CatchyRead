import type { ProviderTestResult, UserNotice, UserNoticeCategory } from '@/lib/shared/types';

interface NoticeContext {
  surface: 'player' | 'options';
  action: 'playback' | 'test-provider' | 'save-settings' | 'preview-sample';
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || String(error);
  }
  return String(error || '未知错误');
}

function buildNotice(
  category: UserNoticeCategory,
  title: string,
  message: string,
  recommendedAction: string,
  debugDetails: string,
  canRetry = false
): UserNotice {
  return {
    category,
    title,
    message,
    recommendedAction,
    debugDetails,
    canRetry
  };
}

export function mapErrorToNotice(error: unknown, context: NoticeContext): UserNotice {
  const raw = normalizeErrorMessage(error);
  const lowered = raw.toLowerCase();

  if (lowered.includes('未授予') || lowered.includes('permission')) {
    return buildNotice(
      'permission-denied',
      '需要访问权限',
      '还没有拿到目标服务域名的访问授权，所以现在无法继续。',
      '请重新授权对应域名权限后再试一次。',
      raw,
      true
    );
  }

  if (
    lowered.includes('请先完整配置') ||
    lowered.includes('未配置') ||
    lowered.includes('需要先配置') ||
    lowered.includes('没有可播放')
  ) {
    return buildNotice(
      'incomplete-config',
      '还差一点配置',
      context.surface === 'player' ? '播放器还不知道该用哪种声音或服务来继续。' : '当前配置还不完整，暂时无法完成测试。',
      context.surface === 'player' ? '先去设置页补全必填项，再回来开始收听。' : '先补全必填项，再重新测试连接。',
      raw,
      true
    );
  }

  if (
    lowered.includes('failed to fetch') ||
    lowered.includes('networkerror') ||
    lowered.includes('网络') ||
    lowered.includes('timeout') ||
    lowered.includes('timed out')
  ) {
    return buildNotice(
      'network',
      '网络连接失败',
      '请求已经发出，但服务没有顺利返回结果。',
      '检查网络、代理或服务地址是否可达，然后重试。',
      raw,
      true
    );
  }

  if (/\b(400|401|403|404|409|422|429|500|502|503|504)\b/.test(lowered) || lowered.includes('连通性测试失败')) {
    return buildNotice(
      'provider-rejected',
      '服务拒绝了请求',
      '目标 Provider 收到了请求，但没有接受这次调用。',
      '优先检查 API Key、模型名、Base URL 和账户权限是否正确。',
      raw,
      true
    );
  }

  if (
    lowered.includes('没有 mediaurl') ||
    lowered.includes('没有 base64audio') ||
    lowered.includes('返回了空音频') ||
    lowered.includes('响应为空') ||
    lowered.includes('缺少音频') ||
    lowered.includes('响应中缺少')
  ) {
    return buildNotice(
      'invalid-response',
      '返回内容不完整',
      '服务有响应，但返回的数据不足以继续播放或验证音频。',
      '确认所选模型支持当前接口，并检查返回格式是否符合预期。',
      raw,
      false
    );
  }

  if (lowered.includes('音频播放失败') || lowered.includes('not supported source') || lowered.includes('play() failed')) {
    return buildNotice(
      'audio-playback',
      '音频无法播放',
      '已经拿到音频，但浏览器没能顺利播放它。',
      '先测试 TTS 连通性；如果仍失败，换一个支持的音频格式或 Provider。',
      raw,
      true
    );
  }

  if (lowered.includes('浏览器语音') || lowered.includes('当前不可用') || lowered.includes('不支持')) {
    return buildNotice(
      'browser-unsupported',
      '当前浏览器不支持',
      '你正在使用的浏览器能力不足，无法完成这一步。',
      '改用远端 TTS，或切换到支持浏览器语音的环境。',
      raw,
      false
    );
  }

  return buildNotice(
    'unknown',
    '暂时没能完成',
    '这次操作没有成功，但还可以继续排查。',
    '先重试一次；如果仍失败，再查看调试详情。',
    raw,
    true
  );
}

export function buildSuccessNotice(title: string, message: string, recommendedAction: string): UserNotice {
  return {
    category: 'success',
    title,
    message,
    recommendedAction,
    canRetry: false
  };
}

export function noticeToProviderTestResult(providerKind: 'llm' | 'tts', notice: UserNotice, ok: boolean): ProviderTestResult {
  return {
    ok,
    providerKind,
    category: notice.category,
    title: notice.title,
    message: notice.message,
    recommendedAction: notice.recommendedAction,
    debugDetails: notice.debugDetails,
    canRetry: notice.canRetry
  };
}
