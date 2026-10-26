"use client";

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from "react";
import { CheckCircle2, Download, MonitorDown, Smartphone } from "lucide-react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

type PWAContextValue = {
  canPrompt: boolean;
  installed: boolean;
  isIOS: boolean;
  supported: boolean;
  install: () => Promise<void>;
};
const PWAContext = createContext<PWAContextValue | null>(null);

export function PWAProvider({ children }: { children: ReactNode }) {
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [isIOS, setIOS] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const detectInstalled = () => setInstalled(displayMode.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);
    detectInstalled();
    displayMode.addEventListener("change", detectInstalled);
    setIOS(/iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
    setSupported(window.isSecureContext && "serviceWorker" in navigator);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallPrompt);
    };
    const onInstalled = () => { setInstalled(true); setDeferred(null); };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    const register = () => {
      if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // The workspace remains online-only if service workers are unavailable.
      });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => {
      displayMode.removeEventListener("change", detectInstalled);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("load", register);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // A browser may refuse a prompt or reject it. Show manual help instead.
    } finally {
      setDeferred(null);
    }
  }, [deferred]);

  return <PWAContext.Provider value={{
    canPrompt: deferred !== null, installed, isIOS, supported, install,
  }}>{children}</PWAContext.Provider>;
}

function usePWA() {
  const value = useContext(PWAContext);
  if (!value) throw new Error("PWAProvider is missing");
  return value;
}

export function PWAInstallCard() {
  const { canPrompt, installed, isIOS, supported, install } = usePWA();
  const [showHelp, setShowHelp] = useState(false);

  return <section className="aw-pwa-card" aria-label="Install AmplifyWorld Workspace" data-testid="pwa-install-card">
    <div className="aw-pwa-logo"><img src="/pwa-icon/192?v=white-a-2" alt="" width={66} height={66}/></div>
    <div className="aw-pwa-copy">
      <p className="aw-pwa-eyebrow"><Smartphone size={14} aria-hidden="true"/> YOUR WORKSPACE, ONE TAP AWAY</p>
      <h2>AmplifyWorld Workspace app</h2>
      <p>{installed
        ? "Installed and running as an app on this device."
        : "Install directly from your browser for an app-like, full-screen experience on mobile or desktop. Your data stays online and protected."}</p>
      {!installed && showHelp && <div id="aw-pwa-help" className="aw-pwa-help">
        {isIOS
          ? <p>On iPhone or iPad, open this page in <strong>Safari</strong>. Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> → <strong>Add</strong>.</p>
          : <p><strong>Android:</strong> Open your browser menu (⋮) and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>. <strong>Desktop:</strong> Use the install icon in Chrome/Edge's address bar, or the browser menu → <strong>Install page as app</strong>.</p>}
        {!supported && <p>Your browser may not support PWA installation here. Try Chrome or Edge on desktop or Chrome/Safari on your phone.</p>}
      </div>}
    </div>
    <div className="aw-pwa-actions">
      {installed
        ? <span className="aw-pwa-installed"><CheckCircle2 size={18} aria-hidden="true"/> App installed</span>
        : <>
          <button type="button" className="aw-pwa-install" onClick={() => {
            if (canPrompt) void install();
            else setShowHelp(true);
          }}><Download size={17} aria-hidden="true"/> {canPrompt ? "Install app" : "How to install"}</button>
          <button type="button" className="aw-pwa-help-toggle" aria-expanded={showHelp} aria-controls="aw-pwa-help"
            onClick={() => setShowHelp(value => !value)}>
            <MonitorDown size={15} aria-hidden="true"/> {showHelp ? "Hide steps" : "Install guide"}
          </button>
        </>}
    </div>
  </section>;
}
