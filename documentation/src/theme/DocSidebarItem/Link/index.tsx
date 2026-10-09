import React from "react";
import DocSidebarItemLink from "@theme-original/DocSidebarItem/Link";
import type { Props } from "@theme/DocSidebarItem/Link";

/** A domain's guide and demo share one sidebar entry. */
export default function DomainSidebarLink(props: Props): React.JSX.Element {
  const { item, activePath } = props;
  // href and activePath both include the deployment's base URL.
  const isDomainDemo = /^domains\/[^/]+$/.test(item.docId ?? "")
    && activePath.replace(/\/$/, "") === `${item.href.replace(/\/$/, "")}/demo`;

  if (isDomainDemo) {
    return <DocSidebarItemLink {...props} activePath={item.href} aria-current="location" />;
  }
  return <DocSidebarItemLink {...props} />;
}
