/**
 * IPv4 / CIDR math.
 *
 * Every address here is a plain unsigned 32-bit number. That is what an IPv4
 * address actually is — the dotted-quad notation is only a display format.
 * Working on the integer makes the whole module a handful of bit operations.
 *
 * One JS gotcha runs through the file: bitwise operators coerce to *signed*
 * 32-bit, so `0xffffffff << 0` is -1, not 4294967295. Every expression that
 * produces an address is therefore closed with `>>> 0`, the unsigned right
 * shift, which is the standard way to reinterpret the result as unsigned.
 */

export const IPV4_BITS = 32

export type Ipv4Block = {
  /** Lowest address in the block (all host bits zero). */
  network: number
  /** Highest address in the block (all host bits one). */
  broadcast: number
  prefix: number
  /** Contiguous leading 1s, e.g. /24 -> 255.255.255.0 */
  mask: number
  /** Inverted mask, as used by Cisco ACLs, e.g. /24 -> 0.0.0.255 */
  wildcard: number
  /** Every address in the block, including network + broadcast. */
  totalAddresses: number
  /** First address an interface may use, or null when the block has none. */
  firstUsable: number | null
  lastUsable: number | null
  /** Addresses assignable to interfaces. */
  usableHosts: number
}

/** Parse dotted-quad text into a uint32. Returns null on anything malformed. */
export function parseIpv4(text: string): number | null {
  const octets = text.trim().split(".")
  if (octets.length !== 4) {
    return null
  }

  let value = 0
  for (const octet of octets) {
    // Reject "1e2", "0x0a", " 8", "" and friends before Number() is lenient.
    if (!/^\d{1,3}$/.test(octet)) {
      return null
    }

    const byte = Number(octet)
    if (byte > 255) {
      return null
    }

    // Shift the accumulator up one byte and drop the new octet in the bottom.
    value = ((value << 8) | byte) >>> 0
  }

  return value
}

/** Render a uint32 back as dotted quad. */
export function formatIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".")
}

/** Netmask for a prefix length: `prefix` leading 1s, the rest 0s. */
export function maskFromPrefix(prefix: number): number {
  // `x << 32` is a no-op in JS (the shift count is taken mod 32), so /0 has to
  // be special-cased rather than falling out of the formula.
  if (prefix <= 0) {
    return 0
  }

  return (0xffffffff << (IPV4_BITS - prefix)) >>> 0
}

/** The number of leading 1 bits in a mask, or null if the mask is not contiguous. */
export function prefixFromMask(mask: number): number | null {
  for (let prefix = 0; prefix <= IPV4_BITS; prefix++) {
    if (maskFromPrefix(prefix) === mask) {
      return prefix
    }
  }

  return null
}

export type ParsedCidr = {
  /** The address exactly as typed, before it is aligned to the block. */
  address: number
  prefix: number
}

/**
 * Parse "10.0.0.0/24". A bare address is treated as /32, and the prefix may
 * also be written as a netmask ("10.0.0.0/255.255.255.0").
 */
export function parseCidr(text: string): ParsedCidr | null {
  const trimmed = text.trim()
  if (trimmed === "") {
    return null
  }

  const [addressPart, prefixPart, ...rest] = trimmed.split("/")
  if (rest.length > 0) {
    return null
  }

  const address = parseIpv4(addressPart)
  if (address === null) {
    return null
  }

  if (prefixPart === undefined) {
    return { address, prefix: IPV4_BITS }
  }

  if (/^\d{1,2}$/.test(prefixPart.trim())) {
    const prefix = Number(prefixPart.trim())
    if (prefix > IPV4_BITS) {
      return null
    }

    return { address, prefix }
  }

  const mask = parseIpv4(prefixPart)
  if (mask === null) {
    return null
  }

  const prefix = prefixFromMask(mask)
  if (prefix === null) {
    return null
  }

  return { address, prefix }
}

/**
 * Derive every interesting address in a block from any address inside it.
 *
 * network   = address AND mask        (clear the host bits)
 * broadcast = address OR wildcard     (set the host bits)
 */
export function describeBlock(address: number, prefix: number): Ipv4Block {
  const mask = maskFromPrefix(prefix)
  const wildcard = ~mask >>> 0
  const network = (address & mask) >>> 0
  const broadcast = (network | wildcard) >>> 0
  // 2 ** 32 overflows the bit operators but not a JS double, so count with **.
  const totalAddresses = 2 ** (IPV4_BITS - prefix)

  // /32 is a single host route: one address, and it is the host.
  if (prefix === IPV4_BITS) {
    return {
      network,
      broadcast,
      prefix,
      mask,
      wildcard,
      totalAddresses,
      firstUsable: network,
      lastUsable: network,
      usableHosts: 1,
    }
  }

  // /31 carries no network or broadcast address: RFC 3021 hands both addresses
  // to the two ends of a point-to-point link.
  if (prefix === IPV4_BITS - 1) {
    return {
      network,
      broadcast,
      prefix,
      mask,
      wildcard,
      totalAddresses,
      firstUsable: network,
      lastUsable: broadcast,
      usableHosts: 2,
    }
  }

  return {
    network,
    broadcast,
    prefix,
    mask,
    wildcard,
    totalAddresses,
    firstUsable: (network + 1) >>> 0,
    lastUsable: (broadcast - 1) >>> 0,
    usableHosts: totalAddresses - 2,
  }
}

/** Is `address` inside the block? Only the network bits have to match. */
export function blockContains(block: Ipv4Block, address: number): boolean {
  return (address & block.mask) >>> 0 === block.network
}

export type Ipv4Scope = {
  label: string
  detail: string
  /** Routable across the public internet. */
  global: boolean
}

const SCOPES: Array<{
  cidr: string
  label: string
  detail: string
  global: boolean
}> = [
  {
    cidr: "0.0.0.0/8",
    label: "This network",
    detail: "RFC 1122 — source-only",
    global: false,
  },
  { cidr: "10.0.0.0/8", label: "Private", detail: "RFC 1918", global: false },
  {
    cidr: "100.64.0.0/10",
    label: "CGNAT",
    detail: "RFC 6598 — carrier-grade NAT",
    global: false,
  },
  { cidr: "127.0.0.0/8", label: "Loopback", detail: "RFC 1122", global: false },
  {
    cidr: "169.254.0.0/16",
    label: "Link-local",
    detail: "RFC 3927 — APIPA",
    global: false,
  },
  {
    cidr: "172.16.0.0/12",
    label: "Private",
    detail: "RFC 1918",
    global: false,
  },
  {
    cidr: "192.0.2.0/24",
    label: "Documentation",
    detail: "RFC 5737 — TEST-NET-1",
    global: false,
  },
  {
    cidr: "192.168.0.0/16",
    label: "Private",
    detail: "RFC 1918",
    global: false,
  },
  {
    cidr: "198.18.0.0/15",
    label: "Benchmarking",
    detail: "RFC 2544",
    global: false,
  },
  {
    cidr: "198.51.100.0/24",
    label: "Documentation",
    detail: "RFC 5737 — TEST-NET-2",
    global: false,
  },
  {
    cidr: "203.0.113.0/24",
    label: "Documentation",
    detail: "RFC 5737 — TEST-NET-3",
    global: false,
  },
  {
    cidr: "224.0.0.0/4",
    label: "Multicast",
    detail: "RFC 5771 — class D",
    global: false,
  },
  {
    cidr: "240.0.0.0/4",
    label: "Reserved",
    detail: "RFC 1112 — class E",
    global: false,
  },
]

/** Classify an address against the IANA special-purpose registry. */
export function scopeOf(address: number): Ipv4Scope {
  for (const entry of SCOPES) {
    const parsed = parseCidr(entry.cidr)
    if (parsed === null) {
      continue
    }

    if (blockContains(describeBlock(parsed.address, parsed.prefix), address)) {
      return { label: entry.label, detail: entry.detail, global: entry.global }
    }
  }

  return { label: "Public", detail: "Globally routable", global: true }
}

/**
 * Split a block into equal children of `childPrefix`.
 *
 * Each child is `2 ** (32 - childPrefix)` addresses wide, so walking the
 * children is just repeatedly adding that stride to the network address.
 * A /8 split into /24s is 65,536 children, so callers pass a `limit`.
 */
export function splitBlock(
  block: Ipv4Block,
  childPrefix: number,
  limit: number
): { subnets: Ipv4Block[]; total: number } {
  if (childPrefix < block.prefix || childPrefix > IPV4_BITS) {
    return { subnets: [], total: 0 }
  }

  const total = 2 ** (childPrefix - block.prefix)
  const stride = 2 ** (IPV4_BITS - childPrefix)
  const subnets: Ipv4Block[] = []

  for (let index = 0; index < Math.min(total, limit); index++) {
    // Plain addition, not `|`: past /1 the offset exceeds the signed range the
    // bitwise operators work in.
    subnets.push(describeBlock(block.network + index * stride, childPrefix))
  }

  return { subnets, total }
}

/** The 32 bits of an address, most significant first. */
export function toBits(address: number): number[] {
  return Array.from(
    { length: IPV4_BITS },
    (_, index) => (address >>> (IPV4_BITS - 1 - index)) & 1
  )
}
