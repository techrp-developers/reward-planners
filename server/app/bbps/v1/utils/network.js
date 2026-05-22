const axios = require("axios");

const LOCALHOST_FALLBACK_IP = "103.221.71.214";
const PUBLIC_IP_LOOKUP_URL =
  process.env.EKO_PUBLIC_IP_LOOKUP_URL || "https://api.ipify.org?format=json";
const PUBLIC_IP_CACHE_TTL_MS = Number(
  process.env.EKO_PUBLIC_IP_CACHE_TTL_MS || 10 * 60 * 1000,
);

let cachedPublicIp = null;
let cachedPublicIpAt = 0;

const normalizeIp = (value) => {
  if (!value || typeof value !== "string") {
    return "";
  }

  let ip = value.trim();

  if (ip.includes(",")) {
    ip = ip.split(",")[0].trim();
  }

  if (ip.startsWith("[") && ip.includes("]")) {
    ip = ip.slice(1, ip.indexOf("]"));
  }

  if (ip.startsWith("::ffff:")) {
    ip = ip.replace("::ffff:", "");
  }

  if (ip.includes("%")) {
    ip = ip.split("%")[0];
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) {
    ip = ip.split(":")[0];
  }

  return ip;
};

const isLocalIp = (ip) => {
  return !ip || ["127.0.0.1", "::1", "0.0.0.0", "::", "localhost"].includes(ip);
};

const isPrivateIpv4 = (ip) => {
  return (
    /^10\./.test(ip) ||
    /^127\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
  );
};

const isPrivateIpv6 = (ip) => {
  const normalized = ip.toLowerCase();

  return (
    normalized === "::1" ||
    normalized === "::" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  );
};

const isPrivateIp = (ip) => {
  if (!ip) {
    return true;
  }

  return ip.includes(":") ? isPrivateIpv6(ip) : isPrivateIpv4(ip);
};

const getClientIP = (req) => {
  const detectedIp = normalizeIp(
    req?.headers?.["x-forwarded-for"] ||
      req?.connection?.remoteAddress ||
      req?.socket?.remoteAddress ||
      req?.ip,
  );

  return detectedIp || "127.0.0.1";
};

const fetchPublicIp = async () => {
  const now = Date.now();

  if (cachedPublicIp && now - cachedPublicIpAt < PUBLIC_IP_CACHE_TTL_MS) {
    return cachedPublicIp;
  }

  try {
    const response = await axios.get(PUBLIC_IP_LOOKUP_URL, { timeout: 3000 });
    const resolvedIp = normalizeIp(
      typeof response.data === "string" ? response.data : response.data?.ip,
    );

    if (!resolvedIp) {
      return "";
    }

    cachedPublicIp = resolvedIp;
    cachedPublicIpAt = now;

    return resolvedIp;
  } catch (error) {
    console.error("[IP RESOLVER] public IP lookup failed", error.message);
    return "";
  }
};

const getBbpsSourceIPDetails = async (req) => {
  const configuredIp = normalizeIp(process.env.EKO_SOURCE_IP?.trim());
  const requestIp = getClientIP(req);
  const publicServerIp = await fetchPublicIp();

  // Source IP for BBPS requests must come from the configured, allowlisted server IP.
  const finalIp = configuredIp || null;
  const source = configuredIp ? "env" : null;

  const configuredMatchesServer =
    Boolean(configuredIp) && Boolean(publicServerIp) && configuredIp === publicServerIp;

  return {
    configuredIp: configuredIp || null,
    requestIp: requestIp || null,
    publicServerIp: publicServerIp || null,
    finalIp,
    source,
    configuredMatchesServer,
  };
};

const getBbpsSourceIP = async (req) => {
  const details = await getBbpsSourceIPDetails(req);

  if (!details.finalIp) {
    const err = new Error("EKO_SOURCE_IP is missing from environment configuration");
    err.statusCode = 500;
    throw err;
  }

  console.log("[IP RESOLVER]", {
    detected: details.requestIp,
    final: details.finalIp,
    source: details.source,
    publicServerIp: details.publicServerIp,
  });

  return details.finalIp;
};

module.exports = {
  getBbpsSourceIP,
  getBbpsSourceIPDetails,
  getClientIP,
};
