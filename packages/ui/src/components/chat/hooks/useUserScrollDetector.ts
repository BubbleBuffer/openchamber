import React from 'react';

export interface UseUserScrollDetectorResult {
  userScrolledUp: boolean;
  scrollToBottom: (options?: { instant?: boolean; force?: boolean }) => void;
  onScroll: (event: React.UIEvent<HTMLDivElement>) => void;
}

export function useUserScrollDetector(
  scrollRef: React.RefObject<HTMLDivElement | null>,
): UseUserScrollDetectorResult {
  const [userScrolledUp, setUserScrolledUp] = React.useState(false);

  const scrollToBottom = React.useCallback((options?: { instant?: boolean; force?: boolean }) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: 0, behavior: options?.instant ? 'auto' : 'smooth' });
  }, [scrollRef]);

  const onScroll = React.useCallback((event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget;
    const scrolledUp = container.scrollTop > 0;
    setUserScrolledUp((prev) => (prev === scrolledUp ? prev : scrolledUp));
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !('visualViewport' in window)) return;

    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      const container = scrollRef.current;
      if (!container) return;
      if (container.scrollTop === 0) {
        container.scrollTo({ top: 0 });
      }
    };

    vv.addEventListener('resize', handleResize);
    return () => {
      vv.removeEventListener('resize', handleResize);
    };
  }, [scrollRef]);

  return {
    userScrolledUp,
    scrollToBottom,
    onScroll,
  };
}
