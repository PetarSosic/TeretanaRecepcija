"use client";

import { setNonce } from "get-nonce";

let applied = false;

/**
 * N-27: Radix dialogs and menus lock the page scroll with a `<style>` element that
 * react-remove-scroll injects at run time. Doc 08 §9's production policy allows only
 * styles carrying the page's nonce, so without one every dialog logged a CSP error and
 * the scroll lock never applied. `get-nonce` is where that library reads its nonce.
 *
 * A document keeps the nonce it was served with, while a client navigation (the one
 * after signing in, for instance) renders the layout again for a request with a new
 * one. So the nonce is read once from the document's own scripts, not passed down.
 */
export function StyleNonce() {
  if (typeof window !== "undefined" && !applied) {
    const nonce =
      document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) {
      setNonce(nonce);
      applied = true;
    }
  }
  return null;
}
