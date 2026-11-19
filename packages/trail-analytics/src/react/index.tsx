import { useEffect } from 'react';
import { inject, type InjectProps } from '../index';

export type { InjectProps };

/** Injects the Trail tracker once on mount. Renders nothing. */
export function Analytics(props: InjectProps): null {
  useEffect(() => {
    inject(props);
    // inject is idempotent; options are read once, at first mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
