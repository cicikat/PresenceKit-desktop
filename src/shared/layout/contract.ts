export const SLOT_IDS = ['ribbon', 'sidebar', 'main'] as const;

export type SlotId = typeof SLOT_IDS[number];

/**
 * 受控的 Chat 主区模板。每种模板只重排客户端已经登记的 header / transcript /
 * composer 区域，不能插入第三方组件或执行代码。
 */
export const MAIN_LAYOUT_IDS = ['stack', 'workbench', 'hud'] as const;

export type MainLayoutId = typeof MAIN_LAYOUT_IDS[number];
