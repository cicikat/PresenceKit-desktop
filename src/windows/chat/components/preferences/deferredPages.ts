import { deferredComponent } from '../../../../shared/ui/deferredComponent';
import type { ChatPreferenceTab } from './preferencesInfoArchitecture';
const deferredCurrentCharacterAvatar = deferredComponent(() => import('./CurrentCharacterAvatar').then(m => ({ default: m.CurrentCharacterAvatar })));
const loadCurrentCharacterAvatar = deferredCurrentCharacterAvatar.preload;
export const CurrentCharacterAvatar = deferredCurrentCharacterAvatar.Component;
const deferredReasoningDisplaySettings = deferredComponent(() => import('./ReasoningDisplaySettings').then(m => ({ default: m.ReasoningDisplaySettings })));
const loadReasoningDisplaySettings = deferredReasoningDisplaySettings.preload;
export const ReasoningDisplaySettings = deferredReasoningDisplaySettings.Component;
const deferredCurrentCharacterStatus = deferredComponent(() => import('./CurrentCharacterStatus').then(m => ({ default: m.CurrentCharacterStatus })));
const loadCurrentCharacterStatus = deferredCurrentCharacterStatus.preload;
export const CurrentCharacterStatus = deferredCurrentCharacterStatus.Component;
const deferredActivityAppearanceSettings = deferredComponent(() => import('./ActivityAppearanceSettings').then(m => ({ default: m.ActivityAppearanceSettings })));
const loadActivityAppearanceSettings = deferredActivityAppearanceSettings.preload;
export const ActivityAppearanceSettings = deferredActivityAppearanceSettings.Component;
const deferredChatColorPage = deferredComponent(() => import('../ChatColorPage').then(m => ({ default: m.ChatColorPage })));
const loadChatColorPage = deferredChatColorPage.preload;
export const ChatColorPage = deferredChatColorPage.Component;
const deferredCallSettingsPage = deferredComponent(() => import('../CallSettingsPage').then(m => ({ default: m.CallSettingsPage })));
const loadCallSettingsPage = deferredCallSettingsPage.preload;
export const CallSettingsPage = deferredCallSettingsPage.Component;
const deferredLive2DSettingsSection = deferredComponent(() => import('../Live2DSettingsSection').then(m => ({ default: m.Live2DSettingsSection })));
const loadLive2DSettingsSection = deferredLive2DSettingsSection.preload;
export const Live2DSettingsSection = deferredLive2DSettingsSection.Component;
const deferredCoplaySettingsPage = deferredComponent(() => import('../CoplaySettingsPage').then(m => ({ default: m.CoplaySettingsPage })));
const loadCoplaySettingsPage = deferredCoplaySettingsPage.preload;
export const CoplaySettingsPage = deferredCoplaySettingsPage.Component;
const deferredConnectionSettingsPage = deferredComponent(() => import('../ConnectionSettingsPage').then(m => ({ default: m.ConnectionSettingsPage })));
const loadConnectionSettingsPage = deferredConnectionSettingsPage.preload;
export const ConnectionSettingsPage = deferredConnectionSettingsPage.Component;
const deferredDiarySyncSettingsPage = deferredComponent(() => import('../DiarySyncSettingsPage').then(m => ({ default: m.DiarySyncSettingsPage })));
const loadDiarySyncSettingsPage = deferredDiarySyncSettingsPage.preload;
export const DiarySyncSettingsPage = deferredDiarySyncSettingsPage.Component;
const deferredDesktopTtsSettingsPage = deferredComponent(() => import('../DesktopTtsSettingsPage').then(m => ({ default: m.DesktopTtsSettingsPage })));
const loadDesktopTtsSettingsPage = deferredDesktopTtsSettingsPage.preload;
export const DesktopTtsSettingsPage = deferredDesktopTtsSettingsPage.Component;
const deferredComputerUseSettingsPage = deferredComponent(() => import('../ComputerUseSettingsPage').then(m => ({ default: m.ComputerUseSettingsPage })));
const loadComputerUseSettingsPage = deferredComputerUseSettingsPage.preload;
export const ComputerUseSettingsPage = deferredComputerUseSettingsPage.Component;
const deferredDeviceFileAgentSettings = deferredComponent(() => import('../DeviceFileAgentSettings').then(m => ({ default: m.DeviceFileAgentSettings })));
const loadDeviceFileAgentSettings = deferredDeviceFileAgentSettings.preload;
export const DeviceFileAgentSettings = deferredDeviceFileAgentSettings.Component;
const deferredVisualPerceptionSettingsPage = deferredComponent(() => import('../VisualPerceptionSettingsPage').then(m => ({ default: m.VisualPerceptionSettingsPage })));
const loadVisualPerceptionSettingsPage = deferredVisualPerceptionSettingsPage.preload;
export const VisualPerceptionSettingsPage = deferredVisualPerceptionSettingsPage.Component;
const deferredPeriodDateSettings = deferredComponent(() => import('./PeriodDateSettings').then(m => ({ default: m.PeriodDateSettings })));
const loadPeriodDateSettings = deferredPeriodDateSettings.preload;
export const PeriodDateSettings = deferredPeriodDateSettings.Component;
const deferredDesignModSettings = deferredComponent(() => import('./DesignModSettings').then(m => ({ default: m.DesignModSettings })));
const loadDesignModSettings = deferredDesignModSettings.preload;
export const DesignModSettings = deferredDesignModSettings.Component;

const pages = {
  general: [loadConnectionSettingsPage, loadDiarySyncSettingsPage, loadVisualPerceptionSettingsPage, loadComputerUseSettingsPage, loadDeviceFileAgentSettings],
  interface: [loadChatColorPage, loadActivityAppearanceSettings, loadDesignModSettings],
  characterChat: [loadCurrentCharacterAvatar, loadCurrentCharacterStatus, loadReasoningDisplaySettings, loadPeriodDateSettings],
  petInteraction: [loadLive2DSettingsSection, loadDesktopTtsSettingsPage, loadCallSettingsPage, loadCoplaySettingsPage],
  advanced: [],
};

// Preload code only: never mount settings or start their backend effects on hover.
export function preloadPreferenceTab(tab: ChatPreferenceTab): void {
  for (const load of pages[tab]) void load().catch(() => {});
}
