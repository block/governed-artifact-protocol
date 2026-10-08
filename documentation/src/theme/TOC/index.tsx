import React, {useEffect, useRef, type ReactNode} from 'react';
import TOCItems from '@theme/TOCItems';
import type {Props} from '@theme/TOC';
import {visibilityAdjustment} from './visibility';
import styles from './styles.module.css';

const activeClass = 'table-of-contents__link--active';

export default function TOC({className, ...props}: Props): ReactNode {
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    let previousActive: Element | null = null;

    function revealActive(changedOnly: boolean) {
      const active = rail!.querySelector(`.${activeClass}`);
      if (changedOnly && active === previousActive) return;
      previousActive = active;
      // A hidden mobile rail has no visible area to scroll.
      if (!active || rail!.clientHeight === 0) return;
      const bounds = rail!.getBoundingClientRect();
      const padding = 12;
      const adjustment = visibilityAdjustment(
        {top: bounds.top + rail!.clientTop + padding,
          bottom: bounds.top + rail!.clientTop + rail!.clientHeight - padding},
        active.getBoundingClientRect(),
      );
      // Scroll only this rail. scrollIntoView can also move the article.
      rail!.scrollTop += adjustment;
    }

    const observer = new MutationObserver(() => revealActive(true));
    observer.observe(rail, {subtree: true, attributes: true, attributeFilter: ['class'], childList: true});
    const resizeObserver = new ResizeObserver(() => revealActive(false));
    resizeObserver.observe(rail);
    revealActive(false);
    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
    };
  }, [props.toc]);

  return (
    <div ref={railRef} className={[styles.tableOfContents, 'thin-scrollbar', className].filter(Boolean).join(' ')}>
      <TOCItems
        {...props}
        linkClassName="table-of-contents__link toc-highlight"
        linkActiveClassName={activeClass}
      />
    </div>
  );
}
