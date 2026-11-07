import type { ProductProfile } from "@keywork-app/product";
import { render } from "solid-js/web";
import { App } from "./app.tsx";
import { ProductProvider } from "./chrome/product.ts";
import {
  CompanionPage,
  companionPageRequested,
  companionPortFromWindow,
} from "./companion/index.ts";
import { companionRenderer } from "./companion/skinned-renderer.ts";
import { DevPage } from "./dev/dev-page.tsx";
import { browserHost } from "./host/browser.ts";
import { type HostPort, hostFromWindow } from "./host/port.ts";
import "./app.css";

export interface DesktopRendererOptions {
  readonly profile: ProductProfile;
  readonly host?: HostPort;
}

export function mountDesktopRenderer(
  root: HTMLElement,
  options: DesktopRendererOptions,
): () => void {
  const { profile, host } = options;
  const companion = companionPageRequested() ? companionPortFromWindow() : undefined;
  return render(() => {
    if (companion !== undefined) {
      return <CompanionPage port={companion} renderer={companionRenderer()} />;
    }
    if (devPageRequested()) {
      return (
        <ProductProvider value={profile}>
          <DevPage />
        </ProductProvider>
      );
    }
    return <App profile={profile} host={host ?? hostFromWindow() ?? browserHost({ profile })} />;
  }, root);
}

function devPageRequested(): boolean {
  const { pathname, search } = window.location;
  return pathname.endsWith("/dev") || new URLSearchParams(search).has("dev");
}
