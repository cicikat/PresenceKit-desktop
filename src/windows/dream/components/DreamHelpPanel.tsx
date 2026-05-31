import { Icon } from '../../chat/components/UIKit';

interface DreamHelpPanelProps {
  open: boolean;
  onClose: () => void;
}

export function DreamHelpPanel({ open, onClose }: DreamHelpPanelProps) {
  if (!open) return null;

  return (
    <div
      className="dream-modal__backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="dream-modal dream-modal--help"
        aria-label="梦境帮助"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <header className="dream-modal__header">
          <Icon name="spec" size={17} />
          <div className="dream-modal__title">帮助</div>
          <div className="dream-modal__kicker">DREAM GUIDE</div>
          <div className="dream-modal__header-spacer" />
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭帮助"
            className="dream-modal__close"
          >
            ×
          </button>
        </header>

        <div className="dream-modal__body dream-help">
          <HelpSection title="关于梦境" kicker="ABOUT">
            梦境是独立于现实聊天的慢速对话空间。进入后，梦境会使用单独的场景状态、记忆读取范围和叙事设定。
          </HelpSection>
          <HelpSection title="偏好何时生效" kicker="SETTINGS">
            未进入梦境时，偏好会用于下一次入梦；梦境进行中修改的项目也会保存，但不会打断当前场景。
          </HelpSection>
          <HelpSection title="如何醒来" kicker="WAKE">
            点击右上角 <span className="mono">WAKE</span>，或按下 <span className="mono">Esc</span>，即可结束梦境并返回现实聊天。
          </HelpSection>
          <HelpSection title="侧栏说明" kicker="SIDEBAR">
            动向展示当前梦境状态；状态与潜意识页会继续补充更细的指标和象征线索。
          </HelpSection>
        </div>
      </section>
    </div>
  );
}

function HelpSection({ title, kicker, children }: {
  title: string;
  kicker: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dream-help__section">
      <div className="dream-help__heading">
        <div className="dream-help__title">{title}</div>
        <div className="dream-help__kicker">{kicker}</div>
      </div>
      <div className="dream-help__text">{children}</div>
    </section>
  );
}
