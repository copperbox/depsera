# 8. SSRF Protection

**[Implemented]**

Health endpoint URLs are validated at two points to prevent Server-Side Request Forgery.

## 8.1 Blocked IP Ranges

**IPv4:**

| CIDR | Purpose |
|---|---|
| `0.0.0.0/8` | Current network |
| `10.0.0.0/8` | RFC 1918 private |
| `100.64.0.0/10` | Carrier-grade NAT |
| `127.0.0.0/8` | Loopback |
| `169.254.0.0/16` | Link-local |
| `172.16.0.0/12` | RFC 1918 private |
| `192.0.0.0/24` | IETF protocol assignments |
| `192.0.2.0/24` | TEST-NET-1 |
| `192.168.0.0/16` | RFC 1918 private |
| `198.51.100.0/24` | TEST-NET-2 |
| `203.0.113.0/24` | TEST-NET-3 |
| `224.0.0.0/4` | Multicast |
| `240.0.0.0/4` | Reserved |
| `255.255.255.255/32` | Broadcast |

**IPv6:** `::1` (loopback), `::` (unspecified), `fe80::/10` (link-local), `fc00::/7` (unique local), `::ffff:0:0/96` (IPv4-mapped — validates embedded IPv4)

**Blocked hostnames:** `localhost`, `*.local`, `*.internal`, `*.localhost`

## 8.2 Two-Step Validation

**Step 1: Service creation/update** (`validateUrlHostname`) — synchronous:
- Checks hostname against blocked hostnames
- Validates literal IPs against blocked ranges
- Does NOT perform DNS resolution
- Checks allowlist for bypass

**Step 2: Poll time** (`validateUrlNotPrivate`) — async:
- Repeats all hostname checks from Step 1
- **Performs DNS resolution** to detect DNS rebinding attacks
- Validates resolved IP against blocked ranges
- Checks allowlist for bypass

## 8.3 Allowlist

Configured via `SSRF_ALLOWLIST` env var (comma-separated).

**Supported formats:**
| Format | Example | Matching |
|---|---|---|
| Exact hostname | `localhost` | Case-insensitive exact match |
| Wildcard pattern | `*.internal` | Suffix match (e.g., `service.internal`, `a.b.internal`) |
| CIDR range | `10.0.0.0/8` | Bitwise mask comparison for resolved IPs |

The allowlist is parsed once and cached. Cloud metadata IPs (169.254.169.254) are only allowed if explicitly included.
