import { Component } from 'react';
import type { ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallbackLabel: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** 局部渲染错误止血：单个 panel 崩了不再拖垮整棵 React 树。 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error(`[ErrorBoundary] ${this.props.fallbackLabel} 渲染崩溃:`, error, info.componentStack);
  }

  private retry = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 16, height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center',
        }}>
          <div className="mono" style={{ fontSize: 12, color: 'var(--on-forest-2)', letterSpacing: 1 }}>
            {this.props.fallbackLabel} 出错
          </div>
          <button
            onClick={this.retry}
            style={{
              fontSize: 11, padding: '4px 12px', borderRadius: 'var(--radius-xs)', cursor: 'pointer',
              background: 'transparent', border: '1px solid var(--forest-line)',
              color: 'var(--on-forest-2)', fontFamily: 'inherit',
            }}>
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
