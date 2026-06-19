import { getUIPref, setUIPref, onUIPrefChange } from './uiPreferences';

const PREF_KEY = 'playMode.enabled';

/** 玩耍模式开关（本地 UI 偏好，默认关闭）。开启后才允许 toy_invite 自动开窗与显示 Ribbon 入口。 */
export function isPlayModeEnabled(): boolean {
  return getUIPref(PREF_KEY, false);
}

export function setPlayModeEnabled(enabled: boolean): void {
  setUIPref(PREF_KEY, enabled);
}

/** 订阅玩耍模式开关变化；返回取消订阅函数。 */
export function subscribePlayMode(handler: (enabled: boolean) => void): () => void {
  return onUIPrefChange(key => {
    if (key === PREF_KEY) handler(isPlayModeEnabled());
  });
}
