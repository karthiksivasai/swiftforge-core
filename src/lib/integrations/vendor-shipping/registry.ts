import { XpresionAdapter } from "./adapters/xpresion/adapter";
import { StubVendorAdapter } from "./adapters/stub";
import type { VendorShippingAdapter } from "./types";

const cache = new Map<string, VendorShippingAdapter>();

export function getVendorAdapter(providerCode: string): VendorShippingAdapter {
  const code = (providerCode || "").trim().toUpperCase();
  const cached = cache.get(code);
  if (cached) return cached;

  let adapter: VendorShippingAdapter;
  switch (code) {
    case "XPRESION":
    case "CW":
    case "COURIERWALA":
      adapter = new XpresionAdapter();
      break;
    case "DHL":
    case "DHL LSP":
    case "DHL EXPRESS":
    case "DHE":
      // Prefer gateway until native DHL HTTP ships; map DHL* vendors via XPRESION if configured.
      adapter = new StubVendorAdapter("DHL");
      break;
    case "FEDEX":
    case "FDX":
      adapter = new StubVendorAdapter("FEDEX");
      break;
    case "UPS":
      adapter = new StubVendorAdapter("UPS");
      break;
    case "DTDC":
      adapter = new StubVendorAdapter("DTDC");
      break;
    case "ARAMEX":
      adapter = new StubVendorAdapter("ARAMEX");
      break;
    default:
      adapter = new StubVendorAdapter(code || "UNKNOWN");
  }

  cache.set(code, adapter);
  return adapter;
}

/** When tenant integration provider is XPRESION, always use that adapter regardless of vendor brand. */
export function resolveAdapterForIntegration(providerCode: string): VendorShippingAdapter {
  const code = (providerCode || "").trim().toUpperCase();
  if (!code) return new StubVendorAdapter("UNKNOWN");
  if (code === "XPRESION" || code === "CW" || code === "COURIERWALA") {
    return getVendorAdapter("XPRESION");
  }
  return getVendorAdapter(code);
}
