import { Fragment } from 'react';
import { useI18n } from '../../../shared/i18n';
import type { ToolActivity } from '../../../shared/api/toolActivity';

export function ToolActivityChain({ items }: { items: ToolActivity[] }) {
  const { t } = useI18n();
  return <div aria-label={t('tools.chain')} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: '10px 0', fontSize: 12, color: 'var(--ink-3)' }}>
    {items.map((item, index) => <Fragment key={item.event_id}>
      {index > 0 && <span aria-hidden="true" style={{ width: 24, height: 1, background: 'var(--ink-4)' }} />}
      <span title={t(`tools.${item.status}`)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 9px', borderRadius: 8, background: 'var(--paper)', maxWidth: '100%' }}>
        <span style={{ overflowWrap: 'anywhere' }}>{item.tool_name}</span>
        <span role="img" aria-label={t(`tools.${item.status}`)} style={{ flexShrink: 0, width: 7, height: 7, borderRadius: '50%', background: item.status === 'success' ? '#459966' : item.status === 'error' ? '#ce5050' : item.status === 'running' ? '#8b8b95' : '#c4963e' }} />
      </span>
    </Fragment>)}
  </div>;
}
