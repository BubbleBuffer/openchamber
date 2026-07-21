import React from 'react';

type Args = {
  isDesktopLayout: boolean;
  projectSections: unknown[];
  projectHeaderSentinelRefs: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
};

export const useStickyProjectHeaders = (args: Args): Set<string> => {
  const { isDesktopLayout, projectSections, projectHeaderSentinelRefs } = args;
  const [stuckProjectHeaders, setStuckProjectHeaders] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    if (!isDesktopLayout) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const projectId = (entry.target as HTMLElement).dataset.projectId;
          if (!projectId) {
            return;
          }

          setStuckProjectHeaders((prev) => {
            const next = new Set(prev);
            if (!entry.isIntersecting) {
              next.add(projectId);
            } else {
              next.delete(projectId);
            }
            return next;
          });
        });
      },
      { threshold: 0 },
    );

    projectHeaderSentinelRefs.current.forEach((el) => {
      if (el) {
        observer.observe(el);
      }
    });

    return () => observer.disconnect();
  }, [isDesktopLayout, projectHeaderSentinelRefs, projectSections]);

  return stuckProjectHeaders;
};
