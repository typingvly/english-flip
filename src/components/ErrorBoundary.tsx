import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || '알 수 없는 오류가 발생했습니다.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Application ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center p-6 bg-[#16181e] text-[#e4e8f0]">
          <div className="max-w-md w-full rounded-2xl p-6 bg-[#1d2028] shadow-2xl text-center space-y-4">
            <h2 className="text-lg font-semibold">오류가 발생했습니다</h2>
            <p className="text-sm text-[#737b8c]">
              데이터 처리 중 문제가 발생했습니다. 새로고침 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#68a4f7] text-[#16181e] cursor-pointer"
            >
              새로고침
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
