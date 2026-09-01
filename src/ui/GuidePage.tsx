export function GuidePage() {
  return (
    <article className="guide">
      <header className="guide-hero">
        <p className="brand">Learn</p>
        <h1>How Chromium netlogs are structured</h1>
        <p className="lede">
          Netlog Lens does not invent session IDs. It reads the same source IDs Chrome writes, groups
          events into sessions, and reads <code>stream_id</code> from frame params to build streams.
        </p>
      </header>

      <nav className="guide-toc" aria-label="Guide sections">
        <a href="#file-shape">File shape</a>
        <a href="#source-id">Source / session ID</a>
        <a href="#stream-id">Streams</a>
        <a href="#guide-http2-streams">HTTP/2 stream IDs</a>
        <a href="#guide-http3-streams">HTTP/3 local/peer</a>
        <a href="#guide-transport-model">H2 vs H3 transport</a>
        <a href="#dependencies">Dependencies</a>
        <a href="#guide-errors">Errors &amp; filters</a>
        <a href="#how-lens">What this app does</a>
        <a href="#references">References</a>
      </nav>

      <section id="file-shape" className="guide-section panel">
        <h2>1. File shape: constants + events</h2>
        <p>
          A <code>chrome://net-export</code> dump is JSON with two important parts:
        </p>
        <ul>
          <li>
            <strong>constants</strong> — dictionaries that map integer codes to names for this Chrome
            build (<code>logEventTypes</code>, <code>logSourceType</code>, <code>logEventPhase</code>,{' '}
            <code>netError</code>, …). Event records only store numbers; you must resolve them via
            these maps (they change between Chrome versions).
          </li>
          <li>
            <strong>events</strong> — a time-ordered list of network-stack log records.
          </li>
        </ul>
        <pre className="guide-code">{`{
  "constants": {
    "logEventTypes": { "HTTP2_SESSION": 1, "HTTP2_SESSION_SEND_HEADERS": 4, ... },
    "logSourceType": { "HTTP2_SESSION": 1, "URL_REQUEST": 2, "QUIC_SESSION": 3, ... },
    "logEventPhase": { "PHASE_BEGIN": 0, "PHASE_END": 1, "PHASE_NONE": 2 }
  },
  "events": [ /* many records */ ]
}`}</pre>
        <p>
          Each event looks roughly like:
        </p>
        <pre className="guide-code">{`{
  "time": "168",
  "type": 5,                    // → HTTP2_SESSION_RECV_INVALID_HEADER (via constants)
  "source": { "id": 218, "type": 1 },  // source id 218, type HTTP2_SESSION
  "phase": 2,                   // PHASE_NONE
  "params": { "stream_id": 9, "header_name": "…", ... }
}`}</pre>
      </section>

      <section id="source-id" className="guide-section panel">
        <h2>2. What is the session ID?</h2>
        <p>
          In Chrome&apos;s netlog, the important identifier is the <strong>source id</strong> (
          <code>event.source.id</code>). A <em>source</em> is an object the network stack is tracking:
          a socket, a URL request, an HTTP/2 session, a QUIC session, a DNS job, and so on.
        </p>
        <p>
          <strong>In Netlog Lens, Session ID = that source id</strong> for sources whose type is{' '}
          <code>HTTP2_SESSION</code> or <code>QUIC_SESSION</code>. Example: every event with{' '}
          <code>source.id === 218</code> and source type <code>HTTP2_SESSION</code> belongs to
          session <strong>218</strong>.
        </p>
        <div className="guide-callout">
          <strong>Not the same as HTTP/2 stream id.</strong> Session <code>218</code> is Chrome&apos;s
          internal object id for the whole multiplexed connection. Stream <code>9</code> is the
          HTTP/2 (or HTTP/3) stream number <em>inside</em> that connection (from the protocol).
        </div>
        <h3>How Lens identifies sessions</h3>
        <ol>
          <li>Resolve each event&apos;s numeric <code>source.type</code> to a name via constants.</li>
          <li>Group all events by <code>source.id</code>.</li>
          <li>
            Keep groups whose source type is <code>HTTP2_SESSION</code> or <code>QUIC_SESSION</code>.
          </li>
          <li>
            That group&apos;s <code>source.id</code> becomes the session row ID you see in the UI.
          </li>
        </ol>
        <pre className="guide-code">{`// Conceptual
sources = group events by source.id
sessions = sources where type in { HTTP2_SESSION, QUIC_SESSION }
session.id = source.id   // e.g. 218`}</pre>
        <p className="muted small">
          Negative source ids can appear for browser-process sources; network-process ids are usually
          positive. Lens treats them the same way: still just <code>source.id</code>.
        </p>
      </section>

      <section id="stream-id" className="guide-section panel">
        <h2>3. How a session is associated with streams</h2>
        <p>
          HTTP/2 and HTTP/3 multiplex many requests on one connection. Chrome logs most frame-level
          activity as events <em>on the session source</em>, and puts the protocol stream number in{' '}
          <strong>params</strong>:
        </p>
        <pre className="guide-code">{`HTTP2_SESSION_SEND_HEADERS
  source.id = 218          ← session
  params.stream_id = 9     ← HTTP/2 stream
  params.headers = [":method: GET", ":path: /login", ...]
  params.source_dependency = { id: 487, ... }  ← often the URL_REQUEST`}</pre>
        <p>
          Lens walks every event on the session and, when <code>params.stream_id</code> is present,
          upserts a stream record keyed by that number:
        </p>
        <ul>
          <li>
            <code>*_HEADERS</code> → method, path, status, header maps
          </li>
          <li>
            <code>*_DATA</code> → byte counts / FIN
          </li>
          <li>
            <code>*_RST_STREAM</code> / QUIC reset → error on that stream
          </li>
          <li>
            <code>RECV_INVALID_HEADER</code> → mark stream + session as errored
          </li>
        </ul>
        <figure className="guide-diagram" aria-label="Session to stream relationship">
          <pre>{`Session source.id = 218 (HTTP2_SESSION)
├── stream_id 1   GET /favicon.ico
├── stream_id 3   GET /app.js
└── stream_id 9   GET /login   ← INVALID_HEADER / RST here
        │
        └── often linked via source_dependency → URL_REQUEST 487`}</pre>
        </figure>
        <p>
          So association is: <strong>same session source id</strong> + <strong>params.stream_id</strong>
          . There is no separate “stream source” for ordinary H2 frames; the stream lives as a field
          on session events.
        </p>
      </section>

      <section id="guide-http2-streams" className="guide-section panel">
        <h2>4. HTTP/2 stream IDs (local vs peer)</h2>
        <p>
          HTTP/2 also distinguishes who opened a stream, but the rule is simpler than QUIC (RFC 9113):
        </p>
        <table className="guide-table">
          <thead>
            <tr>
              <th>Stream ID</th>
              <th>Lens label</th>
              <th>Meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>0</code>
              </td>
              <td>Connection · control</td>
              <td>Reserved for connection control — not a request</td>
            </tr>
            <tr>
              <td>Odd (1, 3, 5, …)</td>
              <td>Local · request</td>
              <td>Client-initiated — normal browser requests</td>
            </tr>
            <tr>
              <td>Even (2, 4, 6, …)</td>
              <td>Peer · push/server</td>
              <td>Server-initiated — historically HTTP/2 push</td>
            </tr>
          </tbody>
        </table>
        <p>
          Unlike HTTP/3, HTTP/2 stream IDs do <strong>not</strong> encode unidirectional vs
          bidirectional. Almost all application streams are request/response style; connection frames
          use stream 0.
        </p>
        <p>
          On <code>h2</code> sessions, Lens shows Kind badges, request/local/peer counts, and
          inspector blurbs from this odd/even rule.
        </p>
      </section>

      <section id="guide-http3-streams" className="guide-section panel">
        <h2>5. HTTP/3 local vs peer streams</h2>
        <p>
          On QUIC / HTTP/3 sessions, <strong>local</strong> and <strong>peer</strong> mean who{' '}
          <em>opened</em> the stream — not request vs response. In a Chromium net-export you are the
          client, so <strong>local = Chrome</strong> and <strong>peer = server</strong>.
        </p>
        <p>
          QUIC encodes that in the stream ID itself (<code>stream_id % 4</code>, RFC 9000):
        </p>
        <table className="guide-table">
          <thead>
            <tr>
              <th>id % 4</th>
              <th>Lens label</th>
              <th>Typical use</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>0</code>
              </td>
              <td>Local · bidi · request</td>
              <td>Normal HTTP/3 request/response (0, 4, 8, …)</td>
            </tr>
            <tr>
              <td>
                <code>1</code>
              </td>
              <td>Peer · bidi</td>
              <td>Server-opened bidirectional — uncommon for page loads</td>
            </tr>
            <tr>
              <td>
                <code>2</code>
              </td>
              <td>Local · uni · control</td>
              <td>Chrome→server control / QPACK</td>
            </tr>
            <tr>
              <td>
                <code>3</code>
              </td>
              <td>Peer · uni · control</td>
              <td>Server→Chrome control / QPACK / push-related</td>
            </tr>
          </tbody>
        </table>
        <figure className="guide-diagram" aria-label="HTTP/3 stream kinds">
          <pre>{`QUIC_SESSION (one connection)
├── local bidi  0   GET /index.html  ⇄  response
├── local bidi  4   GET /app.js      ⇄  response
├── local uni   2   client control / QPACK  →
└── peer  uni   3   server control / QPACK  ←`}</pre>
        </figure>
        <p>
          On <code>h3</code> sessions, Lens shows Kind badges, summary chips (request vs control counts), and
          inspector “Stream type” blurbs so you can tell page traffic from the control plane at a glance.
        </p>
      </section>

      <section id="guide-transport-model" className="guide-section panel">
        <h2>6. H2 vs H3: shared pipe vs independent streams</h2>
        <p>
          Both protocols multiplex many requests on one connection — but the <strong>loss model</strong>{' '}
          differs:
        </p>
        <div className="guide-compare">
          <div>
            <h3>HTTP/2 — shared TCP fate</h3>
            <pre className="guide-code">{`One TCP + TLS connection
├── stream 1  ──┐
├── stream 3  ──┼── same byte pipe
└── stream 5  ──┘
         ▲
   packet loss / stall
         │
   all streams wait (head-of-line)`}</pre>
            <p>
              Streams are logical only. Bytes still share one ordered TCP stream, so a lost segment can
              delay data for every HTTP/2 stream until TCP recovers.
            </p>
          </div>
          <div>
            <h3>HTTP/3 — per-stream independence</h3>
            <pre className="guide-code">{`One QUIC connection
├── stream 0  ── loss? → recover this stream
├── stream 4  ── continues
└── stream 8  ── continues`}</pre>
            <p>
              QUIC delivers streams independently. Loss or a reset on one stream should not freeze the
              others. A <code>CONNECTION_CLOSE</code> is different — that still ends the whole
              connection.
            </p>
          </div>
        </div>
        <p>
          On each session, the <strong>Transport model</strong> panel illustrates this with the
          session&apos;s own stream IDs and a short fate note (e.g. clustered H2 errors vs a single H3
          stream error).
        </p>
      </section>

      <section id="dependencies" className="guide-section panel">
        <h2>7. Linking sessions to URL requests</h2>
        <p>
          A page load is usually a different source: <code>URL_REQUEST</code> (its own{' '}
          <code>source.id</code>). Chrome connects the graph with{' '}
          <code>params.source_dependency</code>, which points at another source id.
        </p>
        <ul>
          <li>
            On HEADERS: session event may depend on the <code>URL_REQUEST</code> (or an intermediate
            like <code>HTTP_STREAM_JOB</code>).
          </li>
          <li>
            On session init: may depend on the underlying <code>SOCKET</code>.
          </li>
        </ul>
        <p>
          That is how Lens can say: stream 9 on session 218 failed, and URL_REQUEST 487 for{' '}
          <code>https://example.com/login</code> ended with <code>ERR_HTTP2_PROTOCOL_ERROR</code>.
        </p>
        <pre className="guide-code">{`URL_REQUEST source.id = 487
  BEGIN  params.url = "https://example.com/login"
  END    params.net_error = -337  → ERR_HTTP2_PROTOCOL_ERROR

HTTP2_SESSION source.id = 218
  SEND_HEADERS  stream_id=9  source_dependency.id=487
  RECV_INVALID_HEADER  stream_id=9
  SEND_RST_STREAM  stream_id=9  error_code="1 (PROTOCOL_ERROR)"`}</pre>
      </section>

      <section id="guide-errors" className="guide-section panel">
        <h2>8. What counts as an error?</h2>
        <p>
          Not every RST or connection close is a bug. Netlog Lens separates{' '}
          <strong>actionable</strong> issues (worth filtering on) from <strong>benign</strong>{' '}
          protocol control flow (normal close, navigation cancel).
        </p>
        <table className="guide-table">
          <thead>
            <tr>
              <th>UI</th>
              <th>What it includes</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Errors only</strong> (Overview swimlanes, Sessions list)
              </td>
              <td>
                Critical or error <strong>findings</strong>, or <strong>actionable</strong> protocol
                events on the session
              </td>
            </tr>
            <tr>
              <td>
                <strong>Sessions w/ errors</strong> (Overview stat)
              </td>
              <td>Same actionable count — not <code>summary.hasError</code> alone</td>
            </tr>
            <tr>
              <td>Status <span className="err-tag">error</span></td>
              <td>Qualifies for Errors only</td>
            </tr>
            <tr>
              <td>Status <span className="warn-tag">warning</span></td>
              <td>
                Softer signals (e.g. flow-control or PING findings, or internal flags) — visible in
                the list but <em>not</em> in Errors only
              </td>
            </tr>
            <tr>
              <td>Timeline density <strong>Errors</strong></td>
              <td>
                Actionable error-like events from the catalog + finding evidence; benign closes and
                CANCEL resets are excluded
              </td>
            </tr>
          </tbody>
        </table>
        <h3>Benign — excluded from Errors only</h3>
        <ul>
          <li>
            <code>QUIC_SESSION_CLOSED</code> — normal QUIC connection end
          </li>
          <li>
            RST / reset with <code>NO_ERROR</code> or <code>CANCEL</code> (HTTP/2 error codes{' '}
            <code>0</code> and <code>8</code>)
          </li>
          <li>HTTP/2 session close with ok net error</li>
        </ul>
        <div className="guide-callout">
          <strong>Why a session might look “clean” on the timeline.</strong> Default density is{' '}
          <strong>Hide noise</strong>, which hides routine WINDOW_UPDATE and ping traffic. Warning
          findings also do not appear under Errors only. Use density <strong>All</strong> or{' '}
          <strong>Search all</strong> to inspect everything. After the actionable-error rules, a
          session in Errors only should show at least one critical/error finding or a visible Errors
          row.
        </div>
      </section>

      <section id="how-lens" className="guide-section panel">
        <h2>9. What Netlog Lens shows you</h2>
        <table className="guide-table">
          <thead>
            <tr>
              <th>UI label</th>
              <th>Comes from</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Session ID</td>
              <td>
                <code>event.source.id</code> for <code>HTTP2_SESSION</code> / <code>QUIC_SESSION</code>
              </td>
            </tr>
            <tr>
              <td>Stream ID</td>
              <td>
                <code>params.stream_id</code> (or QUIC equivalents) on events belonging to that session
              </td>
            </tr>
            <tr>
              <td>Host</td>
              <td>
                Session BEGIN params (<code>host</code>) or <code>:authority</code> from headers
              </td>
            </tr>
            <tr>
              <td>Timeline row</td>
              <td>One netlog event on that session source, time-ordered</td>
            </tr>
            <tr>
              <td>Overview swimlane</td>
              <td>Session lifetime bar; markers at finding evidence times</td>
            </tr>
            <tr>
              <td>Errors only filter</td>
              <td>Actionable findings + protocol events (see section 8)</td>
            </tr>
            <tr>
              <td>Finding highlight</td>
              <td>Rule matched an event index; click jumps to that timeline row</td>
            </tr>
          </tbody>
        </table>
        <p>
          Official viewer reference:{' '}
          <a href="https://netlog-viewer.appspot.com/" target="_blank" rel="noreferrer">
            netlog-viewer.appspot.com
          </a>
          . Capture UI: <code>chrome://net-export</code>.
        </p>
      </section>

      <section id="references" className="guide-section panel">
        <h2>10. References</h2>
        <p>
          Concepts on this page follow Chromium&apos;s netlog design and public write-ups. Use these
          when you want the canonical definitions or deeper debugging examples.
        </p>

        <h3>Primary (Chromium / Catapult)</h3>
        <ul className="guide-refs">
          <li>
            <a
              href="https://www.chromium.org/developers/design-documents/network-stack/netlog/"
              target="_blank"
              rel="noreferrer"
            >
              NetLog: Chrome’s network logging system
            </a>
            <span className="ref-meta"> — design overview of NetLog, file export, and the viewer split from chrome://net-internals</span>
          </li>
          <li>
            <a
              href="https://chromium.googlesource.com/catapult/+/main/netlog_viewer/"
              target="_blank"
              rel="noreferrer"
            >
              Catapult netlog_viewer
            </a>
            <span className="ref-meta"> — official client-side viewer source; HTTP/2 session views live here</span>
          </li>
          <li>
            <a href="https://netlog-viewer.appspot.com/" target="_blank" rel="noreferrer">
              NetLog Viewer (hosted)
            </a>
            <span className="ref-meta"> — https://netlog-viewer.appspot.com/ — import the same JSON this app reads</span>
          </li>
          <li>
            <a
              href="https://chromium.googlesource.com/chromium/src/+/HEAD/net/log/net_log_event_type_list.h"
              target="_blank"
              rel="noreferrer"
            >
              net_log_event_type_list.h
            </a>
            <span className="ref-meta"> — event type names and documented params (e.g. HTTP2_SESSION_*, QUIC_SESSION_*, stream_id, source_dependency)</span>
          </li>
          <li>
            <a
              href="https://chromium.googlesource.com/chromium/src/+/HEAD/net/log/net_log_source_type_list.h"
              target="_blank"
              rel="noreferrer"
            >
              net_log_source_type_list.h
            </a>
            <span className="ref-meta"> — source types including HTTP2_SESSION, QUIC_SESSION, URL_REQUEST, SOCKET</span>
          </li>
          <li>
            <a
              href="https://chromium.googlesource.com/chromium/src/+/HEAD/net/log/net_log_util.cc"
              target="_blank"
              rel="noreferrer"
            >
              net_log_util.cc (GetNetConstants)
            </a>
            <span className="ref-meta"> — how exported files embed logEventTypes / logSourceType / logEventPhase dictionaries</span>
          </li>
          <li>
            <span className="ref-title">chrome://net-export</span>
            <span className="ref-meta"> — built-in capture UI in Chromium-based browsers (Start / Stop / save JSON)</span>
          </li>
        </ul>

        <h3>Format & tooling notes</h3>
        <ul className="guide-refs">
          <li>
            <a
              href="https://textslashplain.com/2020/04/08/analyzing-network-traffic-logs-netlog-json/"
              target="_blank"
              rel="noreferrer"
            >
              Analyzing Network Traffic Logs (NetLog JSON)
            </a>
            <span className="ref-meta"> — Eric Lawrence — constants + events layout, Catapult vs Fiddler importer</span>
          </li>
          <li>
            <a href="https://docs.rs/netlog/latest/netlog/" target="_blank" rel="noreferrer">
              Cloudflare quiche <code>netlog</code> crate docs
            </a>
            <span className="ref-meta"> — typed HTTP/2 and QUIC event shapes useful as a parsing reference</span>
          </li>
          <li>
            <a
              href="https://github.com/cloudflare/quiche/blob/master/netlog/README.md"
              target="_blank"
              rel="noreferrer"
            >
              quiche/netlog README
            </a>
            <span className="ref-meta"> — line-oriented / constants-first encoding notes</span>
          </li>
        </ul>

        <h3>HTTP/2 diagnosis examples</h3>
        <ul className="guide-refs">
          <li>
            <a href="https://blog.nuvotex.de/http2-protoerr-net-log/" target="_blank" rel="noreferrer">
              The case of HTTP2 protocol error and chromium net-log
            </a>
            <span className="ref-meta"> — INVALID_HEADER → PROTOCOL_ERROR walkthrough matching the Guide examples</span>
          </li>
          <li>
            <a
              href="https://groups.google.com/a/chromium.org/g/chromium-dev/c/VSzBnCgvQgc"
              target="_blank"
              rel="noreferrer"
            >
              chromium-dev: ERR_HTTP2_PROTOCOL_ERROR
            </a>
            <span className="ref-meta"> — Chromium engineers pointing people to NetLog for the textual cause</span>
          </li>
          <li>
            <a
              href="https://learn.microsoft.com/en-us/troubleshoot/entra/entra-id/app-integration/use-netlog-capture-network-traffic"
              target="_blank"
              rel="noreferrer"
            >
              Use NetLog to Capture Network Activity (Microsoft Learn)
            </a>
            <span className="ref-meta"> — capture steps and viewer tabs (Events, HTTP/2, etc.)</span>
          </li>
        </ul>

        <h3>Protocol specs (stream IDs &amp; error codes)</h3>
        <ul className="guide-refs">
          <li>
            <a href="https://www.rfc-editor.org/rfc/rfc9113.html" target="_blank" rel="noreferrer">
              RFC 9113 — HTTP/2
            </a>
            <span className="ref-meta"> — stream identifiers, RST_STREAM, GOAWAY, error codes</span>
          </li>
          <li>
            <a href="https://www.rfc-editor.org/rfc/rfc9114.html" target="_blank" rel="noreferrer">
              RFC 9114 — HTTP/3
            </a>
            <span className="ref-meta"> — HTTP semantics over QUIC streams</span>
          </li>
          <li>
            <a href="https://www.rfc-editor.org/rfc/rfc9000.html" target="_blank" rel="noreferrer">
              RFC 9000 — QUIC
            </a>
            <span className="ref-meta"> — connection/stream lifecycle and CONNECTION_CLOSE</span>
          </li>
        </ul>

        <p className="muted small guide-ref-note">
          Netlog Lens is an independent teaching/diagnosis UI. It is not affiliated with the Chromium
          project; event and source names above are defined by Chromium&apos;s NetLog headers and
          resolved from each file&apos;s embedded <code>constants</code>.
        </p>
      </section>
    </article>
  )
}
