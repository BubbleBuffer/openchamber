import React from 'react';

type DeferredMountProps = {
  active: boolean;
  children: React.ReactNode;
};

export const DeferredMount: React.FC<DeferredMountProps> = ({ active, children }) => {
  const [hasActivated, setHasActivated] = React.useState(active);

  React.useEffect(() => {
    if (active) setHasActivated(true);
  }, [active]);

  if (!active && !hasActivated) return null;
  return children;
};
