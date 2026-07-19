/* ============================================================
 * SpecPanel → 帮助 / 公告面板
 * Phase 2d.0: 原设计规范面板，改造为帮助 / 公告占位页
 * ============================================================ */

export function SpecPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'oklch(0.20 0.04 60 / 0.55)',
        backdropFilter: 'blur(10px)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(560px, 92vw)',
        background: 'var(--paper)', border: '1px solid var(--paper-edge)', borderRadius: 14,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 30px 80px oklch(0.20 0.04 60 / 0.30)',
      }}>
        <div style={{
          padding: '14px 22px', borderBottom: '1px solid var(--paper-edge)',
          display: 'flex', alignItems: 'center', gap: 12, background: 'var(--paper-2)',
        }}>
          <div className="serif" style={{ fontWeight: 700, fontSize: 16 }}>帮助 / 公告</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-3)', letterSpacing: 1 }}>HELP & ANNOUNCEMENTS</div>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', color: 'var(--ink-3)',
            cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ padding: '22px 28px 32px', display: 'grid', gap: 20, overflowY: 'auto' }}>
          <HelpSection title="关于">
          <p>
            PresenceKit 是一个开源 AI 角色陪伴系统。
            <br />
            支持角色长期记忆、多世界交互、梦境场景与跨端体验。
            <br />
            本项目仍处于早期内测版本，功能会持续迭代。
          </p>
        </HelpSection>
        <HelpSection title="链接">
          <p>
          https://github.com/cicikat/PresenceKit
         </p></HelpSection>
          <HelpSection title="免责声明">
            <p>
              本项目为个人开发的 AI 交互实验与开源工具。
              <br />
              AI 输出内容由模型生成，可能存在不准确或不符合预期的情况。
            </p>
          </HelpSection>
          <HelpSection title="公告">
          <p>
            PresenceKit v0.1 已发布。
            <br />
            感谢参与测试。如日后更新需要迁移记忆数据，只需备份根目录下data/即可
          </p>
        </HelpSection>
        </div>
      </div>
    </div>
  );
}

function HelpSection({ title, children }: any) {
  return (
    <div>
      <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>{title}</div>
      <div style={{ height: 1, background: 'var(--paper-edge)', marginBottom: 10 }} />
      {children}
    </div>
  );
}
