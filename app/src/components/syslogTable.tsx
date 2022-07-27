import { batch, createEffect, createMemo, createSignal, For, Match, onCleanup, Resource, Show, Switch } from "solid-js";
import { getMessagesQuery, useApi, useEvents } from "./useApi";
import { css, styled } from "solid-styled-components";
import { useLocalStorage } from "./useLocalStore";
import { DateTime } from "luxon";
import { Dropdown } from "./dropdown";
import { url } from "inspector";

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
    background-color: #A230D7 !important;
    color: white;
    &:hover {
      background-color: #8517b8 !important;
    }
  `,
  'info': css`
  background-color: #e0e0e0 !important;
    &:hover {
      background-color: #c9c9c9 !important;
    }
  `,
  'alert': css`
    background-color: #f58220 !important;
    color: white;
    &:hover {
      background-color: #df7111 !important;
    }
  `,
  'emerg': css`
    background-color: black !important;
    color: white;
  `,
  'notice': css`
    background-color: #2a4f87 !important;
    color: white;
    &:hover {
      background-color: #1e3a64 !important;
    }
  `,
  'warning': css`
    background-color: #fde25d !important;
    color: #222;
    &:hover {
      background-color: #f0d342 !important;
    }
  `,
  'err': css`
    background-color: #C73E1D !important;
    color: white;
    &:hover {
      background-color: #b33819 !important;
    }
  `,
  'crit': css`
    background-color: #8a2c15 !important;
    color: white;
    &:hover {
      background-color: #742511 !important;
    }
  `,
}

const Table = styled('div')`
  display: grid;
  grid-template-columns: repeat(3, min-content) 1fr repeat(2, min-content);
  > :nth-child(odd) > * {
    background-color: #efefef;
  }
`;

const hint = css`
  color: #888;
  &:hover {
    color: #333;
  }
`;

const Options = styled('ul')`
  list-style-type: none;
  padding: 0;
  margin: 0;
  text-align: left;
  border: 1px solid #333;
  li {
    padding: 0.4rem 1.8rem;
    font-weight: normal;
    cursor: pointer;
  }
`;
function SeverityDropDown({ value, onChange }) {
  const [open, setOpen] = createSignal(false);
  const severities = ['debug', 'info', 'alert', 'warning', 'err', 'crit', 'emerg'];
  const options = severities.map(s => <li class={SEVERITY_CSS[s]} style={{ "text-transform": 'uppercase' }} onMouseDown={() => onChange(s)}>{s}</li>);
  return (
    <div style={{ position: 'relative' }}>
      <Input value={value()} onChange={e => onChange(e.currentTarget.value)} placeholder="Severity" onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      <Dropdown open={open}>
        <Options>
          <li onMouseDown={() => onChange('')}>ALL</li>
          {options}
        </Options>
      </Dropdown>
    </div>
  );
}

const Row = styled('div')`
  display: contents;
`;
const TimebarContainer = styled('div')`
  display: flex;
  width: 100%;
  justify-content: space-between;
`;
const InputField = styled('input')`
  border: 0;
  border-bottom: 1px solid grey;
  background-color: transparent;
`;
const InputWrapper = styled('div')`
  display: flex;
  background-color: white;
`;
const InputButton = styled('button')`
  background-color: transparent;
  border: 0;
  border-bottom: 1px solid grey;
  cursor: pointer;
`;
function Input({ value, onChange, ...rest }) {
  let input;
  createEffect(() => {
    input.value = value;
  })
  const clear = () => {
    input.value = '';
    onChange({ currentTarget: { value: '' } });
  }
  return (
    <InputWrapper>
      <InputField ref={input} onChange={onChange} {...rest} />
      <InputButton onClick={clear}>X</InputButton>
    </InputWrapper>
  );
}
function Timebar({ startTime, onChangeStartTime, endTime, onChangeEndTime }) {
  return (
    <TimebarContainer>
      <Input type="datetime-local" value={startTime()?.toISO({ includeOffset: false }) ?? undefined} onChange={e => onChangeStartTime(DateTime.fromISO(e.currentTarget.value))} />
      <Input type="datetime-local" value={endTime()?.toISO({ includeOffset: false }) ?? undefined} onChange={e => onChangeEndTime(DateTime.fromISO(e.currentTarget.value))} />
    </TimebarContainer>
  )
}

function Header({ msg, severity, hostname, ipAddress }) {
  return (
    <Row>
      <Cell>ID</Cell>
      <Cell>Timestamp</Cell>
      <Cell style={{ padding: 0 }}>
        <SeverityDropDown value={severity[0]} onChange={severity[1]} />
      </Cell>
      <Cell style={{ padding: 0 }}>
        <Input style={{ width: '100%' }} value={msg[0]() || ''} onChange={e => msg[1](e.currentTarget.value)} placeholder="Message Text" />
      </Cell>
      <Cell style={{ padding: 0 }}>
        <Input value={hostname[0]()} onChange={e => hostname[1](e.currentTarget.value)} placeholder="Hostname" />
      </Cell>
      <Show when={ipAddress[0]() !== undefined}>
        <Cell style={{ padding: 0 }}>
          <Input value={ipAddress[0]() || ''} onChange={e => ipAddress[1](e.currentTarget.value)} placeholder="Address" />
        </Cell>
      </Show>
    </Row>
  );
}

const DateTimeTransformers = { deserialize: (v: string) => DateTime.fromMillis(parseInt(v)), serialize: (v: DateTime) => v.toMillis().toString() };
export default function SyslogSearch() {
  // const sse = useEvents();
  // sse.onmessage = e => console.debug(e);
  const [msg, setMsg] = useLocalStorage<string>("search-msg");
  const [startTime, setStartTime] = useLocalStorage("search-startTime", DateTime.now().minus({ minutes: 15 }), DateTimeTransformers);
  const [endTime, setEndTime] = useLocalStorage("search-endTime", DateTime.now(), DateTimeTransformers);
  const [severity, setSeverity] = useLocalStorage("search-severity", "");
  const [hostname, setHostname] = useLocalStorage("search-hostname", "");
  const [ipAddress, setIpAddress] = useLocalStorage<string>("search-ipAddress");
  const [autoRefresh, setAutoRefresh] = useLocalStorage("search-autorefresh", true);

  const lastNMinutes = (min: number) => {
    batch(() => {
      setStartTime(DateTime.now().minus({ minute: min }));
      setEndTime(DateTime.now());
    });
  };

  const query = createMemo(() => getMessagesQuery({ startTime: startTime(), endTime: endTime(), msg: msg(), hostname: hostname(), ipAddress: ipAddress(), severity: severity() }));

  const [messages] = useApi(() => `/search?query=${query()}`);

  let interval: string | number | NodeJS.Timeout | undefined;
  createEffect(() => {
    if (autoRefresh()) interval = setInterval(() => setEndTime(DateTime.now()), 5000);
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
        <Header msg={[msg, setMsg]} hostname={[hostname, setHostname]} ipAddress={[ipAddress, setIpAddress]} severity={[severity, setSeverity]} />
        <SyslogTableResults messages={messages} setHostname={setHostname} setIpAddress={setIpAddress} />
      </Table>
    </div>
  );
}

const Cell = styled('div')`
  height: 100%;
  width: 100%;
  padding: 0.1rem 0.5rem;
  display: flex;
  align-items: center;
`;
const MessageCell = styled(Cell)(({ open }) => `
  overflow: hidden;
  display: block;
  text-overflow: "... \u25BC";
  white-space: ${open ? 'inherit' : 'nowrap'};
`);
export function SyslogTableResults({ messages, setHostname, setIpAddress }: { messages: Resource<Object[]> }) {
  return (
    <Switch fallback={<div>Unexpected Error</div>}>

      {/* <Match when={messages.loading}>
        Loading...
      </Match> */}

      <Match when={messages.error}>
        {messages.error}
      </Match>

      <Match when={messages()}>
        <For each={messages().reverse()} fallback={<div>Empty...</div>}>
          {({ node, severity, hostname, address }) => {
            const timestamp = DateTime.fromMillis(node?.properties.server_timestamp);
            const severityCss = SEVERITY_CSS[severity?.properties.name];
            const [open, setOpen] = createSignal(false);
            const expand = () => {
              if (globalThis.getSelection()?.type !== 'Range')
                setOpen(!open());
            };
            return (
              <Row>
                <Cell class={hint}>{node?.id}</Cell>
                <Cell key={node?.id} title={timestamp.toFormat('FF')}>
                  <div>
                    <div style={{ "font-size": "0.8rem" }}>{timestamp.toRelative()}</div>
                    <div style={{ "font-size": '0.8rem' }} class={hint}>{timestamp.toMillis()}</div>
                  </div>
                </Cell>
                <Cell style={{ "justify-content": 'center', "text-transform": 'uppercase' }} class={severityCss} key={severity?.id}>{severity?.properties.name}</Cell>
                <MessageCell key={node?.id} open={open()} onClick={expand}>{node?.properties.msg}</MessageCell>
                <Cell key={hostname?.id}><a onClick={() => setHostname(hostname?.properties.name)}>{hostname?.properties.name}</a></Cell>
                <Show when={address}>
                  <Cell key={address?.id}><a onClick={() => setIpAddress(address?.properties.ip)}>{address?.properties.ip}</a></Cell>
                </Show>
              </Row>
            )
          }}
        </For>
      </Match>

    </Switch>

  );
}