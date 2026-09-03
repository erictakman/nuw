import * as React from "react"
import { IconCheck, IconCopy } from "@tabler/icons-react"

import {
  blockContains,
  describeBlock,
  formatIpv4,
  IPV4_BITS,
  parseCidr,
  parseIpv4,
  scopeOf,
  splitBlock,
  toBits,
  type Ipv4Block,
} from "@/lib/cidr"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"

const STORAGE_KEY = "subnet-calculator:cidr"
const DEFAULT_CIDR = "10.42.0.0/20"
const SPLIT_LIMIT = 16

const EXAMPLES = [
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.1.0/24",
  "100.64.0.0/10",
  "203.0.113.7/31",
]

const numberFormat = new Intl.NumberFormat("en-US")

/** Copies its value to the clipboard, with a short "copied" acknowledgement. */
function CopyableValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!copied) {
      return undefined
    }

    const timeout = window.setTimeout(() => setCopied(false), 1200)
    return () => window.clearTimeout(timeout)
  }, [copied])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
    } catch {
      // Clipboard access can be denied (insecure origin, permissions); the
      // value is on screen either way, so there is nothing to recover from.
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-mono text-sm tabular-nums">{value}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Copy ${label}`}
          onClick={handleCopy}
          className="shrink-0 text-muted-foreground opacity-50 hover:opacity-100 focus-visible:opacity-100"
        >
          {copied ? <IconCheck /> : <IconCopy />}
        </Button>
      </div>
    </div>
  )
}

/**
 * The 32 bits of the network address, split into octets. Network bits are
 * filled, host bits are hollow — clicking a bit moves the prefix boundary to
 * just after it, which is the fastest way to feel what a prefix length means.
 */
function BitRuler({
  block,
  onPrefixChange,
}: {
  block: Ipv4Block
  onPrefixChange: (prefix: number) => void
}) {
  const bits = toBits(block.network)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-x-3 gap-y-2">
        {[0, 1, 2, 3].map((octet) => (
          <div key={octet} className="flex gap-0.5">
            {bits.slice(octet * 8, octet * 8 + 8).map((bit, offset) => {
              const index = octet * 8 + offset
              const isNetworkBit = index < block.prefix

              return (
                <button
                  key={index}
                  type="button"
                  title={`bit ${index + 1} — click for /${index + 1}`}
                  aria-label={`Set prefix to /${index + 1}`}
                  onClick={() => onPrefixChange(index + 1)}
                  className={cn(
                    "size-5 rounded-sm border font-mono text-[10px] leading-none transition-colors sm:size-6 sm:text-xs",
                    isNetworkBit
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-muted text-muted-foreground hover:border-ring"
                  )}
                >
                  {bit}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{block.prefix}</span>{" "}
        network bits ·{" "}
        <span className="font-medium text-foreground">
          {IPV4_BITS - block.prefix}
        </span>{" "}
        host bits
      </p>
    </div>
  )
}

/** Live "is this address inside the block?" check. */
function ContainmentCheck({ block }: { block: Ipv4Block }) {
  const [text, setText] = React.useState("")
  const address = parseIpv4(text)
  const trimmed = text.trim()

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor="containment-input"
        className="text-xs text-muted-foreground"
      >
        Is an address inside this block?
      </label>
      <div className="flex items-center gap-2">
        <Input
          id="containment-input"
          value={text}
          inputMode="decimal"
          spellCheck={false}
          autoComplete="off"
          placeholder="10.42.7.9"
          aria-invalid={trimmed !== "" && address === null}
          onChange={(event) => setText(event.target.value)}
          className="max-w-48 font-mono"
        />
        {trimmed === "" ? null : address === null ? (
          <Badge variant="outline">not an address</Badge>
        ) : blockContains(block, address) ? (
          <Badge variant="secondary">inside</Badge>
        ) : (
          <Badge variant="destructive">outside</Badge>
        )}
      </div>
    </div>
  )
}

/** Carve the block into equal children and list the first few. */
function SplitPanel({ block }: { block: Ipv4Block }) {
  const [childPrefix, setChildPrefix] = React.useState(() =>
    Math.min(block.prefix + 2, IPV4_BITS)
  )

  // Re-anchor whenever the parent block gets larger or smaller than the
  // current child prefix can express.
  const effectivePrefix = Math.min(
    Math.max(childPrefix, block.prefix),
    IPV4_BITS
  )
  const { subnets, total } = splitBlock(block, effectivePrefix, SPLIT_LIMIT)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Split into</span>
        <div className="flex flex-wrap gap-1">
          {[1, 2, 3, 4, 8].map((step) => {
            const candidate = block.prefix + step
            if (candidate > IPV4_BITS) {
              return null
            }

            return (
              <Button
                key={step}
                size="xs"
                variant={candidate === effectivePrefix ? "default" : "outline"}
                onClick={() => setChildPrefix(candidate)}
              >
                /{candidate}
              </Button>
            )
          })}
        </div>
      </div>

      {subnets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          A /{block.prefix} cannot be split any further.
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            {numberFormat.format(total)} × /{effectivePrefix}
            {total > subnets.length
              ? ` — showing the first ${subnets.length}`
              : ""}
          </p>
          <ul className="grid gap-x-4 gap-y-1 font-mono text-xs tabular-nums sm:grid-cols-2">
            {subnets.map((subnet) => (
              <li key={subnet.network} className="flex justify-between gap-2">
                <span>
                  {formatIpv4(subnet.network)}/{subnet.prefix}
                </span>
                <span className="text-muted-foreground">
                  {numberFormat.format(subnet.usableHosts)} hosts
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

export function SubnetCalculator() {
  const [text, setText] = React.useState(
    () => localStorage.getItem(STORAGE_KEY) ?? DEFAULT_CIDR
  )

  const parsed = React.useMemo(() => parseCidr(text), [text])
  const block = React.useMemo(
    () =>
      parsed === null ? null : describeBlock(parsed.address, parsed.prefix),
    [parsed]
  )

  React.useEffect(() => {
    if (parsed !== null) {
      localStorage.setItem(STORAGE_KEY, text)
    }
  }, [parsed, text])

  // The text field stays the single source of truth: the slider and the bit
  // ruler write a new CIDR string rather than holding a prefix of their own.
  const setPrefix = (prefix: number) => {
    const address = parsed?.address ?? 0
    setText(`${formatIpv4(address)}/${prefix}`)
  }

  const scope = block === null ? null : scopeOf(block.network)
  const isEmpty = text.trim() === ""

  return (
    <div className="flex w-full max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-medium">Subnet calculator</h1>
        <p className="text-sm text-muted-foreground">
          Type a CIDR block to see what it actually covers.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>
            <label htmlFor="cidr-input">CIDR block</label>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            id="cidr-input"
            value={text}
            inputMode="text"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            placeholder={DEFAULT_CIDR}
            aria-invalid={!isEmpty && block === null}
            onChange={(event) => setText(event.target.value)}
            className="font-mono"
          />

          <div className="flex flex-wrap gap-1">
            {EXAMPLES.map((example) => (
              <Button
                key={example}
                size="xs"
                variant="outline"
                className="font-mono"
                onClick={() => setText(example)}
              >
                {example}
              </Button>
            ))}
          </div>

          {block === null ? (
            <p className="text-sm text-muted-foreground">
              {isEmpty
                ? "Waiting for something like 192.168.1.0/24."
                : "Not a valid IPv4 block — try 192.168.1.0/24 or 10.0.0.1/255.0.0.0."}
            </p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={IPV4_BITS}
                  value={block.prefix}
                  aria-label="Prefix length"
                  onChange={(event) => setPrefix(Number(event.target.value))}
                  className="h-1 w-full flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
                />
                <span className="w-10 shrink-0 text-right font-mono text-sm tabular-nums">
                  /{block.prefix}
                </span>
              </div>
              <BitRuler block={block} onPrefixChange={setPrefix} />
            </>
          )}
        </CardContent>
      </Card>

      {block === null || scope === null ? null : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle>
                <span className="font-mono">
                  {formatIpv4(block.network)}/{block.prefix}
                </span>
              </CardTitle>
              <Badge variant={scope.global ? "default" : "secondary"}>
                {scope.label}
              </Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="text-xs text-muted-foreground">{scope.detail}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <CopyableValue
                  label="Network"
                  value={formatIpv4(block.network)}
                />
                <CopyableValue
                  label="Broadcast"
                  value={formatIpv4(block.broadcast)}
                />
                <CopyableValue label="Netmask" value={formatIpv4(block.mask)} />
                <CopyableValue
                  label="Wildcard"
                  value={formatIpv4(block.wildcard)}
                />
                <CopyableValue
                  label="First host"
                  value={
                    block.firstUsable === null
                      ? "—"
                      : formatIpv4(block.firstUsable)
                  }
                />
                <CopyableValue
                  label="Last host"
                  value={
                    block.lastUsable === null
                      ? "—"
                      : formatIpv4(block.lastUsable)
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                <CopyableValue
                  label="Addresses"
                  value={numberFormat.format(block.totalAddresses)}
                />
                <CopyableValue
                  label="Usable hosts"
                  value={numberFormat.format(block.usableHosts)}
                />
              </div>
              {block.prefix === IPV4_BITS - 1 ? (
                <p className="text-xs text-muted-foreground">
                  A /31 has no network or broadcast address — RFC 3021 gives
                  both addresses to the ends of a point-to-point link.
                </p>
              ) : null}
              <ContainmentCheck block={block} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Subnets</CardTitle>
              <CardDescription>
                Borrow host bits to carve the block into equal children.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SplitPanel key={block.prefix} block={block} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
