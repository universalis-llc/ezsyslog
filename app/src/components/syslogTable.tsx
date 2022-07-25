import { createEffect, createMemo, For, Match, onCleanup, Resource, Show, Switch } from "solid-js";
import { useApi, useEvents } from "./useApi";
import { css, styled } from "solid-styled-components";
import { useLocalStorage } from "./useLocalStore";
import { DateTime } from "luxon";
import { Dropdown } from "./dropdown";

// TODO: Auto update should only query the latest from the last query timestamp on
// TODO: Server Side Events to provide new messages

export type QueryResponse = [
  {
    msg: {
      properties: {
        server_timestamp: Number,
        msg: String
      }
    },
    severity: {
      properties: {
        name: String
      }
    }
  }
];

const SEVERITY_CSS = {
  'debug': css`
    background-color: #4B2F58;
    color: white;
    &:hover {
      background-color: #382142;
    }
  `,
  'info': css`
  background-color: #e0e0e0;
    &:hover {
      background-color: #c9c9c9;
    }
  `,
  'alert': css`
    background-color: #f58220;
    color: white;
    &:hover {
      background-color: #df7111;
    }
  `,
  'emerg': css`
    background-color: black;
    color: white;
  `,
  'notice': css`
    background-color: #2a4f87;
    color: white;
    &:hover {
      background-color: #1e3a64;
    }
  `,
  'warning': css`
    background-color: #fde25d;
    color: #222;
    &:hover {
      background-color: #f0d342;
    }
  `,
  'err': css`
    background-color: #C73E1D;
    color: white;
    &:hover {
      background-color: #b33819;
    }
  `,
  'crit': css`
    background-color: #8a2c15;
    color: white;
    &:hover {
      background-color: #742511;
    }
  `,
}

const Table = styled('table')`
border-spacing: 0;
table-layout: fixed;
width: 100%;
tbody {
  width: 100%;
  display: block;
}
tr:nth-child(odd) {
  background-color: #d3d3d326;
}
tr:first-child {
  background-color: grey;
}
th, td {
  padding: 0.2rem;
}
th {
  font-weight: bold;
  input {
    width: 100%;
  }
}
`;

const Options = styled('ul')`
  list-style-type: none;
  padding: 0;
  margin: 0;
  text-align: left;
  li {
    padding: 0.2rem 0.8rem;
    font-weight: normal;
    cursor: pointer;
  }
`;
function SeverityDropDown({ value, onChange }) {
  const severities = ['debug', 'info', 'alert', 'warning', 'err', 'crit', 'emerg'];
  const options = severities.map(s => <li class={SEVERITY_CSS[s]} style={{ "text-transform": 'uppercase' }} onMouseDown={() => onChange(s)}>{s}</li>);
  return (
    <>
      <input value={value()} onChange={e => onChange(e.currentTarget.value)} placeholder="Severity" />
      <Dropdown >
        <Options>
          <li onMouseDown={() => onChange('')}>ALL</li>
          {options}
        </Options>
      </Dropdown>
    </>
  );
}

const TimebarContainer = styled('div')`
  display: flex;
  width: 100%;
  justify-content: space-between;
`;
function Timebar({ startTime, onChangeStartTime, endTime, onChangeEndTime }) {
  return (
    <TimebarContainer>
      <input type="datetime-local" value={startTime()?.toISO({ includeOffset: false }) ?? undefined} onChange={e => onChangeStartTime(DateTime.fromISO(e.currentTarget.value))} />
      <input type="datetime-local" value={endTime()?.toISO({ includeOffset: false }) ?? undefined} onChange={e => onChangeEndTime(DateTime.fromISO(e.currentTarget.value))} />
    </TimebarContainer>
  )
}

const DateTimeTransformers = { deserialize: (v: string) => DateTime.fromMillis(parseInt(v)), serialize: (v: DateTime) => v.toMillis().toString() };
export default function SyslogSearch() {
  // const sse = useEvents();
  // sse.onmessage = e => console.debug(e);
  const [msg, setMsg] = useLocalStorage<string | undefined>("search-msg");
  const [startTime, setStartTime] = useLocalStorage("search-startTime", DateTime.now().minus({ minutes: 15 }), DateTimeTransformers);
  const [endTime, setEndTime] = useLocalStorage("search-endTime", DateTime.now(), DateTimeTransformers);
  const [severity, setSeverity] = useLocalStorage("search-severity", "");
  const [hostname, setHostname] = useLocalStorage("search-hostname", "");
  const [ipAddress, setIpAddress] = useLocalStorage<string | undefined>("search-ipAddress");
  const [autoRefresh, setAutoRefresh] = useLocalStorage("search-autorefresh", true);
  const statements = createMemo(() => {
    const startTimeS = startTime();
    const endTimeS = endTime();

    // These are split because you cannot have a OPTIONAL MATCH after a MATCH 
    const manditory: { [k: string]: string } = {}
    const optional: { [k: string]: string } = {};
    manditory['node'] = msg() ?
      `CALL db.idx.fulltext.queryNodes('Message','${msg()}') YIELD node` :
      `MATCH (node:Message)`;
    if (startTimeS || endTimeS) {
      manditory['node'] += ' WHERE';
    }
    if (startTimeS) {
      manditory['node'] += ` node.server_timestamp>=${startTimeS.toMillis()}`;
    }
    if (startTimeS && endTimeS) {
      manditory['node'] += ` AND`;
    }
    if (endTimeS) {
      manditory['node'] += ` node.server_timestamp<=${endTimeS.toMillis()}`;
    }
    severity()?.length ?
      manditory['severity'] = `MATCH (node)-->(severity:Severity) WHERE severity.name CONTAINS '${severity()}'` :
      optional['severity'] = `OPTIONAL MATCH (node)-->(severity:Severity)`;
    hostname()?.length ?
      manditory['hostname'] = `MATCH (node)-->(hostname:Hostname) WHERE hostname.name CONTAINS '${hostname()}'` :
      optional['hostname'] = `OPTIONAL MATCH (node)-->(hostname:Hostname)`;
    if (ipAddress() !== undefined) ipAddress()?.length ?
      manditory['address'] = `MATCH (node)-->(address:Address) WHERE address.ip CONTAINS '${ipAddress()}'` :
      optional['address'] = `OPTIONAL MATCH (node)-->(address:Address)`;

    return { ...manditory, ...optional };
  });

  const [messages, { refetch }] = useApi(() => `/search?query=
    ${Object.values(statements()).join(' ')}
    RETURN DISTINCT ${Object.keys(statements()).join(',')},ID(node) as id
    ORDER BY node.server_timestamp DESC
    LIMIT 1000
  `);
  const lastNMinutes = (min: number) => {
    setStartTime(DateTime.now().minus({ minute: min }));
    setEndTime(DateTime.now());
  };

  let interval: string | number | NodeJS.Timeout | undefined;
  createEffect(() => {
    if (autoRefresh()) interval = setInterval(refetch, 5000);
    else clearInterval(interval);
  });

  onCleanup(() => clearInterval(interval));

  return (
    <div>
      <Timebar startTime={startTime} onChangeStartTime={setStartTime} endTime={endTime} onChangeEndTime={setEndTime} />
      <div>
        Last
        <button onClick={() => lastNMinutes(5)}>5m</button>
        <button onClick={() => lastNMinutes(15)}>15m</button>
        <button onClick={() => lastNMinutes(1400)}>1d</button>
        <button onClick={() => lastNMinutes(5_259_600)}>10y</button>
      </div>
      <div>
        <h4>Settings:</h4>
        <label>IP Address: <input type="checkbox" checked={ipAddress() !== undefined} onChange={(e) => setIpAddress(e.currentTarget.checked ? "" : undefined)} /></label>
        <label>Auto Refresh: <input type="checkbox" checked={autoRefresh()} onChange={(e) => setAutoRefresh(e.currentTarget.checked)} /></label>
      </div>
      <Table>
        <tbody>
          <tr>
            <th>ID</th>
            <th>Timestamp</th>
            <th style={{ "min-width": '6rem' }}><SeverityDropDown value={severity} onChange={setSeverity} /></th>
            <th><input value={msg() || ''} onChange={e => setMsg(e.currentTarget.value)} placeholder="Message Text" /></th>
            <th><input value={hostname()} onChange={e => setHostname(e.currentTarget.value)} placeholder="Hostname" /></th>
            <Show when={ipAddress() !== undefined}>
              <th><input value={ipAddress() || ''} onChange={e => setIpAddress(e.currentTarget.value)} placeholder="Address" /></th>
            </Show>
          </tr>
          <SyslogTableResults messages={messages} />
        </tbody>
      </Table>
    </div>
  );
}

const MessageCell = styled('td')`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 0;
`;
export function SyslogTableResults({ messages }: { messages: Resource<Object[]> }) {
  return (
    <Switch fallback={<div>Unexpected Error</div>}>

      <Match when={messages.loading}>
        Loading...
      </Match>

      <Match when={messages.error}>
        {messages.error}
      </Match>

      <Match when={messages()}>
        <For each={messages()} fallback={<td colSpan={5}>Empty...</td>}>
          {({ node, severity, hostname, address }) => {
            const timestamp = DateTime.fromMillis(node?.properties.server_timestamp);
            const severityCss = SEVERITY_CSS[severity?.properties.name];
            return (
              <tr>
                <td>{node?.id}</td>
                <td key={node?.id} title={node?.properties.server_timestamp}>
                  <div style={{ "font-size": '0.8rem' }}>{timestamp.toMillis()}</div>
                  <div style={{ "font-size": "0.8rem" }}>{timestamp.toRelative()}</div>
                </td>
                <td style={{ "text-align": 'center'}} class={severityCss} key={severity?.id}>{severity?.properties.name}</td>
                <MessageCell key={node?.id}>{node?.properties.msg}</MessageCell>
                <td key={hostname?.id}><a href="#">{hostname?.properties.name}</a></td>
                <Show when={address}>
                  <td key={address?.id}>{address?.properties.ip}</td>
                </Show>
              </tr>
            )
          }}
        </For>
      </Match>

    </Switch>

  );
}